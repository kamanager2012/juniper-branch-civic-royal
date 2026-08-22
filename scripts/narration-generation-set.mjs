import { createHash } from "node:crypto";
import { buildNarrationPlan } from "./narration-plan.mjs";

export const PENDING_NARRATION_STATUSES = Object.freeze(["missing", "stale", "unverified"]);
const PENDING_STATUS_SET = new Set(PENDING_NARRATION_STATUSES);

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
  const pending = options.pending === true;
  if (story && pending) throw new Error("Narration generation set cannot combine story and pending scopes");

  const plan = options.plan ?? buildNarrationPlan({ story: story || null });
  const sourceItems = pending
    ? plan.items.filter((item) => {
        if (item.status === "current") return false;
        if (!PENDING_STATUS_SET.has(item.status)) {
          throw new Error(`${item.key}: unsupported narration status for pending scope: ${String(item.status)}`);
        }
        return true;
      })
    : plan.items;

  if (pending && sourceItems.length === 0) {
    throw new Error("Pending narration generation set is empty; all narration assets are already current");
  }

  const entries = sourceItems
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
    scope: story ? { type: "story", storyId: story } : pending ? { type: "pending" } : { type: "all" },
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
  const pending = process.argv.includes("--pending");
  const jsonl = process.argv.includes("--jsonl");
  const summary = process.argv.includes("--summary");

  const scopeCount = Number(Boolean(story)) + Number(all) + Number(pending);
  if (scopeCount !== 1) throw new Error("Choose exactly one narration batch scope: --story <id>, --all, or --pending.");

  const set = buildNarrationGenerationSet({ story, pending });
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
