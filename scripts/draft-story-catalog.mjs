import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const DRAFT_DIR = join(repoRoot, "content/story-drafts");
const ALLOWED_TONES = new Set(["wheat", "bamboo", "bell", "pasture", "well", "temple"]);
const EXPECTED_DRAFT_COUNT = 76;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function draftStoryFingerprint(story) {
  const content = {
    id: story.id,
    title: story.title,
    pinyin: story.pinyin,
    tagline: story.tagline,
    meaning: story.meaning,
    moral: story.moral,
    sections: story.sections,
  };
  return sha256(Buffer.from(JSON.stringify(content), "utf8"));
}

function assertString(story, field, sourcePath) {
  if (typeof story[field] !== "string" || story[field].trim() === "") {
    throw new Error(`${sourcePath}: ${story.id ?? "<unknown>"}.${field} must be a non-empty string`);
  }
}

export function loadDraftStoryCatalog() {
  const published = loadStoryModel().stories;
  const publishedIds = new Set(published.map((story) => story.id));
  const publishedTitles = new Set(published.map((story) => story.title));
  const files = readdirSync(DRAFT_DIR)
    .filter((name) => /^\d{2}\.json$/.test(name))
    .sort();

  if (files.length !== 4) throw new Error(`expected 4 story draft bundles, found ${files.length}`);

  const stories = [];
  const sourceFiles = [];
  for (const name of files) {
    const absolute = join(DRAFT_DIR, name);
    const sourcePath = relative(repoRoot, absolute).replaceAll("\\", "/");
    const bytes = readFileSync(absolute);
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (parsed?.schemaVersion !== 1 || parsed.status !== "text-ready-media-pending" || !Array.isArray(parsed.stories)) {
      throw new Error(`${sourcePath}: invalid draft bundle schema/status`);
    }
    if (parsed.stories.length !== 19) throw new Error(`${sourcePath}: expected exactly 19 stories`);
    sourceFiles.push({ path: sourcePath, sha256: sha256(bytes), count: parsed.stories.length });

    for (const raw of parsed.stories) {
      for (const field of ["id", "title", "pinyin", "tagline", "meaning", "moral", "tone"]) assertString(raw, field, sourcePath);
      if (!/^[a-z0-9-]+$/.test(raw.id)) throw new Error(`${sourcePath}: invalid story id ${raw.id}`);
      if (!ALLOWED_TONES.has(raw.tone)) throw new Error(`${sourcePath}: invalid tone for ${raw.id}`);
      if (!Array.isArray(raw.sections) || raw.sections.length !== 4 || raw.sections.some((section) => typeof section !== "string" || section.trim() === "")) {
        throw new Error(`${sourcePath}: ${raw.id}.sections must contain exactly 4 non-empty strings`);
      }
      if ("cover" in raw || "pages" in raw || "audio" in raw || "image" in raw) {
        throw new Error(`${sourcePath}: ${raw.id} must remain text-only until real media exists`);
      }
      stories.push({ ...raw, sourcePath, fingerprintSha256: draftStoryFingerprint(raw) });
    }
  }

  if (stories.length !== EXPECTED_DRAFT_COUNT) throw new Error(`expected ${EXPECTED_DRAFT_COUNT} draft stories, found ${stories.length}`);
  const ids = new Set();
  const titles = new Set();
  for (const story of stories) {
    if (publishedIds.has(story.id)) throw new Error(`draft id collides with published story: ${story.id}`);
    if (publishedTitles.has(story.title)) throw new Error(`draft title collides with published story: ${story.title}`);
    if (ids.has(story.id)) throw new Error(`duplicate draft story id: ${story.id}`);
    if (titles.has(story.title)) throw new Error(`duplicate draft story title: ${story.title}`);
    ids.add(story.id);
    titles.add(story.title);
  }

  const bundleInput = stories
    .map((story) => [`text:story:${story.id}`, story.fingerprintSha256])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, fingerprint]) => `${id}:${fingerprint}`)
    .join("\n");

  return {
    schemaVersion: 1,
    publishedCount: published.length,
    draftCount: stories.length,
    totalCount: published.length + stories.length,
    stories,
    sourceFiles,
    bundleFingerprintSha256: sha256(Buffer.from(bundleInput, "utf8")),
  };
}

if (process.argv[1]?.endsWith("draft-story-catalog.mjs")) {
  const report = loadDraftStoryCatalog();
  const summary = process.argv.includes("--summary");
  console.log(JSON.stringify(summary ? {
    schemaVersion: report.schemaVersion,
    totalCount: report.totalCount,
    publishedCount: report.publishedCount,
    draftCount: report.draftCount,
    sourceFiles: report.sourceFiles,
    bundleFingerprintSha256: report.bundleFingerprintSha256,
  } : report, null, 2));
}
