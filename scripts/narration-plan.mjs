import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

export const narrationStatePath = join(repoRoot, "content/narration-state.json");

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readNarrationState() {
  if (!existsSync(narrationStatePath)) return { schemaVersion: 1, entries: {} };
  const parsed = JSON.parse(readFileSync(narrationStatePath, "utf8"));
  if (parsed?.schemaVersion !== 1 || typeof parsed.entries !== "object" || parsed.entries == null) {
    throw new Error("content/narration-state.json must use schemaVersion 1 with an entries object");
  }
  return parsed;
}

export function buildNarrationPlan(options = {}) {
  const model = loadStoryModel();
  const state = readNarrationState();
  const storyFilter = options.story ?? null;
  const items = [];

  for (const story of model.stories) {
    if (storyFilter && story.id !== storyFilter) continue;
    for (const page of story.pages) {
      const key = `${story.id}/${page.id}`;
      const outputPath = join(repoRoot, "public/audio", story.id, `${page.id}.mp3`);
      const textSha256 = sha256Text(page.text);
      const entry = state.entries[key] ?? null;
      const exists = existsSync(outputPath);
      const audioSha256 = exists ? sha256File(outputPath) : null;

      let status = "missing";
      if (exists && !entry) status = "unverified";
      if (exists && entry) {
        status = entry.textSha256 === textSha256 && (!entry.audioSha256 || entry.audioSha256 === audioSha256)
          ? "current"
          : "stale";
      }
      if (!exists && entry) status = "missing";

      items.push({
        key,
        storyId: story.id,
        storyTitle: story.title,
        pageId: page.id,
        kind: page.kind,
        text: page.text,
        textSha256,
        output: `public/audio/${story.id}/${page.id}.mp3`,
        audioSha256,
        status,
        provenance: entry,
      });
    }
  }

  if (storyFilter && items.length === 0) throw new Error(`Unknown story id: ${storyFilter}`);
  return { schemaVersion: 1, canonicalSource: "content/published-stories.json", items };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1]?.endsWith("narration-plan.mjs")) {
  const story = argValue("--story");
  const plan = buildNarrationPlan({ story });
  const counts = Object.fromEntries(["current", "stale", "unverified", "missing"].map((status) => [status, plan.items.filter((item) => item.status === status).length]));
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify({ schemaVersion: plan.schemaVersion, canonicalSource: plan.canonicalSource, total: plan.items.length, counts }, null, 2));
  } else if (process.argv.includes("--jsonl")) {
    for (const item of plan.items) console.log(JSON.stringify(item));
  } else {
    console.log(JSON.stringify({ ...plan, counts }, null, 2));
  }
}
