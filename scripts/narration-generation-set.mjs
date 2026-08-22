import { createHash } from "node:crypto";
import { buildNarrationPlan } from "./narration-plan.mjs";

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function canonicalNarrationInputEntries(items) {
  return [...items]
    .map((item) => ({
      key: item.key,
      file: item.file ?? item.output,
      textSha256: item.textSha256,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function computeNarrationInputDigest(items) {
  return sha256Json(canonicalNarrationInputEntries(items));
}

export function buildNarrationGenerationSet(options = {}) {
  const story = options.story ?? null;
  const plan = options.plan ?? buildNarrationPlan({ story });
  const entries = plan.items
    .map((item) => ({
      key: item.key,
      storyId: item.storyId,
      pageId: item.pageId,
      kind: item.kind,
      text: item.text,
      textSha256: item.textSha256,
      file: item.output,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    schemaVersion: 1,
    canonicalSource: "content/published-stories.json",
    scope: story ? { type: "story", storyId: story } : { type: "all" },
    count: entries.length,
    inputDigestSha256: computeNarrationInputDigest(entries),
    entries,
  };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1]?.endsWith("narration-generation-set.mjs")) {
  const story = argValue("--story");
  const all = process.argv.includes("--all");
  const jsonl = process.argv.includes("--jsonl");
  const summary = process.argv.includes("--summary");

  if (!story && !all) throw new Error("Refusing narration batch export without explicit scope. Pass --story <id> or --all.");
  if (story && all) throw new Error("Choose exactly one narration batch scope: --story <id> or --all.");

  const set = buildNarrationGenerationSet({ story });
  if (jsonl) {
    console.log(JSON.stringify({
      type: "narration-generation-set",
      schemaVersion: set.schemaVersion,
      canonicalSource: set.canonicalSource,
      scope: set.scope,
      count: set.count,
      inputDigestSha256: set.inputDigestSha256,
    }));
    for (const entry of set.entries) console.log(JSON.stringify({ type: "narration-input", ...entry }));
  } else if (summary) {
    console.log(JSON.stringify({
      schemaVersion: set.schemaVersion,
      canonicalSource: set.canonicalSource,
      scope: set.scope,
      count: set.count,
      inputDigestSha256: set.inputDigestSha256,
    }, null, 2));
  } else {
    console.log(JSON.stringify(set, null, 2));
  }
}
