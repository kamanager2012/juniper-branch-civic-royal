import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const model = loadStoryModel();

function assertNonEmptyFile(path, label) {
  assert.equal(existsSync(path), true, `${label} is missing: ${path}`);
  assert.ok(statSync(path).size > 0, `${label} is empty: ${path}`);
}

function imageKind(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

function looksLikeMp3(buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

test("canonical story model is structurally stable", () => {
  assert.ok(model.stories.length > 0, "canonical story model contains no stories");
  const storyIds = new Set();
  const titles = new Set();
  for (const story of model.stories) {
    assert.match(story.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `invalid story id: ${story.id}`);
    assert.equal(storyIds.has(story.id), false, `duplicate story id: ${story.id}`);
    assert.equal(titles.has(story.title), false, `duplicate story title: ${story.title}`);
    storyIds.add(story.id);
    titles.add(story.title);
    assert.ok(story.pages.length >= 3, `${story.id} must contain cover, story content, and moral pages`);
  }
});

test("every story has deterministic cover/story/moral ordering", () => {
  for (const story of model.stories) {
    const covers = story.pages.filter((page) => page.kind === "cover");
    const morals = story.pages.filter((page) => page.kind === "moral");
    assert.equal(covers.length, 1, `${story.id} must contain exactly one cover page`);
    assert.equal(morals.length, 1, `${story.id} must contain exactly one moral page`);
    assert.equal(story.pages[0]?.kind, "cover", `${story.id} first page must be cover`);
    assert.equal(story.pages[0]?.id, "p0", `${story.id} cover page id must be p0`);
    assert.equal(story.pages.at(-1)?.kind, "moral", `${story.id} last page must be moral`);
    assert.equal(story.pages.at(-1)?.id, "moral", `${story.id} moral page id must be moral`);
    assert.equal(story.cover, story.pages[0]?.image, `${story.id} cover field must match the cover page image`);

    const body = story.pages.filter((page) => page.kind === "story");
    body.forEach((page, index) => {
      assert.equal(page.id, `p${index + 1}`, `${story.id} story pages must be contiguous p1..pN`);
    });
  }
});

test("every story page resolves to valid image and MP3 payloads", () => {
  const seen = new Set();
  for (const page of model.pages) {
    const key = `${page.storyId}/${page.id}`;
    assert.equal(seen.has(key), false, `duplicate story/page id: ${key}`);
    seen.add(key);

    const imagePath = join(repoRoot, "public/stories", page.storyId, page.imageFile);
    const audioPath = join(repoRoot, "public/audio", page.storyId, `${page.id}.mp3`);
    assertNonEmptyFile(imagePath, `image for ${key}`);
    assertNonEmptyFile(audioPath, `audio for ${key}`);

    assert.ok(imageKind(readFileSync(imagePath).subarray(0, 16)), `image signature is invalid: ${imagePath}`);
    assert.equal(looksLikeMp3(readFileSync(audioPath).subarray(0, 16)), true, `MP3 signature is invalid: ${audioPath}`);
  }
});
