import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_TONES = new Set(["wheat", "bamboo", "bell", "pasture", "well", "temple"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function loadStoryModel(options = {}) {
  const root = options.root ? resolve(options.root) : repoRoot;
  const sourcePath = join(root, "content/published-stories.json");
  const errors = [];
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch (error) {
    errors.push({ line: null, message: `Could not parse canonical published story source: ${error.message}` });
    parsed = { stories: [] };
  }

  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.stories)) {
    errors.push({ line: null, message: "content/published-stories.json must use schemaVersion 1 with a stories array" });
  }
  if (Array.isArray(parsed?.stories) && parsed.stories.length !== 24) {
    errors.push({ line: null, message: `canonical published story source must contain exactly 24 stories, got ${parsed.stories.length}` });
  }

  const stories = [];
  const ids = new Set();
  const titles = new Set();
  for (const [index, raw] of (Array.isArray(parsed?.stories) ? parsed.stories : []).entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({ line: null, message: `story entry ${index + 1} must be an object` });
      continue;
    }

    for (const field of ["id", "title", "pinyin", "tagline", "meaning", "moral"]) {
      if (!nonEmpty(raw[field])) errors.push({ line: null, message: `story ${index + 1} ${field} must be a non-empty string` });
    }
    if (!nonEmpty(raw.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id)) {
      errors.push({ line: null, message: `invalid story id at entry ${index + 1}: ${String(raw.id)}` });
    }
    if (!ALLOWED_TONES.has(raw.tone)) errors.push({ line: null, message: `invalid tone for story ${String(raw.id)}` });
    if (!Array.isArray(raw.sections) || raw.sections.length !== 7 || raw.sections.some((text) => !nonEmpty(text))) {
      errors.push({ line: null, message: `story ${String(raw.id)} must contain exactly seven non-empty sections` });
    }
    if (nonEmpty(raw.id) && ids.has(raw.id)) errors.push({ line: null, message: `duplicate story id: ${raw.id}` });
    if (nonEmpty(raw.title) && titles.has(raw.title)) errors.push({ line: null, message: `duplicate story title: ${raw.title}` });
    if (nonEmpty(raw.id)) ids.add(raw.id);
    if (nonEmpty(raw.title)) titles.add(raw.title);

    if (
      !nonEmpty(raw.id) || !nonEmpty(raw.title) || !nonEmpty(raw.pinyin) || !nonEmpty(raw.tagline) ||
      !nonEmpty(raw.meaning) || !nonEmpty(raw.moral) || !ALLOWED_TONES.has(raw.tone) ||
      !Array.isArray(raw.sections) || raw.sections.length !== 7 || raw.sections.some((text) => !nonEmpty(text))
    ) continue;

    const page = (id, kind, text, imageFile) => ({
      storyId: raw.id,
      id,
      kind,
      text,
      imageFile,
      line: null,
      image: `/stories/${raw.id}/${imageFile}`,
      audio: `/audio/${raw.id}/${id}.mp3`,
    });

    stories.push({
      id: raw.id,
      title: raw.title,
      pinyin: raw.pinyin,
      tagline: raw.tagline,
      meaning: raw.meaning,
      moral: raw.moral,
      tone: raw.tone,
      cover: `/stories/${raw.id}/cover.jpg`,
      pages: [
        page("p0", "cover", `今天我们读《${raw.title}》。先记住这个成语，再一起看看故事里发生了什么。`, "cover.jpg"),
        ...raw.sections.map((text, sectionIndex) => page(`p${sectionIndex + 1}`, "story", text, `p${sectionIndex + 1}.jpg`)),
        page("moral", "moral", `${raw.title}提醒我们：${raw.moral}`, "p7.jpg"),
      ],
      line: null,
    });
  }

  if (errors.length > 0 && options.allowErrors !== true) {
    const detail = errors.map((error) => `${error.line ?? "?"}: ${error.message}`).join("\n");
    throw new Error(`Invalid canonical story model:\n${detail}`);
  }

  return {
    schemaVersion: 1,
    sourcePath,
    errors,
    stories,
    pages: stories.flatMap((story) => story.pages),
  };
}
