import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourcePath = join(root, "src/data/stories.ts");
const source = readFileSync(sourcePath, "utf8");

// Count only actual calls. The helper declaration is `function page(` and is
// intentionally excluded by requiring the first argument to be a string.
const pageCallCount = (source.match(/\bpage\(\s*"/g) ?? []).length;

// Content text is editorial data and may contain escaped quotes, commas or span
// multiple lines. The integrity gate cares only about the stable structural
// fields surrounding it: story id, page id, kind and final image filename.
const pagePattern =
  /\bpage\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"(cover|story|moral)"\s*,[\s\S]*?,\s*"([^"]+)"\s*\)/g;

const pages = [...source.matchAll(pagePattern)].map((match) => ({
  storyId: match[1],
  pageId: match[2],
  kind: match[3],
  imageFile: match[4],
}));

function assertNonEmptyFile(path, label) {
  assert.equal(existsSync(path), true, `${label} is missing: ${path}`);
  assert.ok(statSync(path).size > 0, `${label} is empty: ${path}`);
}

test("every story page resolves to a non-empty image and narration file", () => {
  assert.ok(pageCallCount > 0, "stories.ts contains no page() calls");
  assert.equal(
    pages.length,
    pageCallCount,
    "content-integrity parser did not understand every page() call; update the gate before changing story syntax",
  );

  const seen = new Set();
  for (const page of pages) {
    const key = `${page.storyId}/${page.pageId}`;
    assert.equal(seen.has(key), false, `duplicate story/page id: ${key}`);
    seen.add(key);

    assertNonEmptyFile(
      join(root, "public/stories", page.storyId, page.imageFile),
      `image for ${key}`,
    );
    assertNonEmptyFile(
      join(root, "public/audio", page.storyId, `${page.pageId}.mp3`),
      `audio for ${key}`,
    );
  }
});

test("each story has exactly one cover page and one moral page", () => {
  const grouped = new Map();
  for (const page of pages) {
    const list = grouped.get(page.storyId) ?? [];
    list.push(page);
    grouped.set(page.storyId, list);
  }

  assert.ok(grouped.size > 0, "no stories discovered");
  for (const [storyId, storyPages] of grouped) {
    const covers = storyPages.filter((page) => page.kind === "cover");
    const morals = storyPages.filter((page) => page.kind === "moral");
    assert.equal(covers.length, 1, `${storyId} must contain exactly one cover page`);
    assert.equal(morals.length, 1, `${storyId} must contain exactly one moral page`);
  }
});
