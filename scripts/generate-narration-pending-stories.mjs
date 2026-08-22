#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { assertNarrationExpansionAllowed } from "./narration-pilot-approval.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

const RECEIPT_DIR = join(repoRoot, "content/evidence/narration/receipts");
const GENERATOR = join(repoRoot, "scripts/generate-narration-guarded.mjs");
const IMPORTER = join(repoRoot, "scripts/import-narration-receipt.mjs");
const PENDING_STATUSES = new Set(["missing", "stale", "unverified"]);
const VALUE_ARGS = ["--assets-dir", "--kokoro-src-dir", "--misaki-src-dir", "--python", "--ffmpeg", "--device"];
const FLAG_ARGS = ["--keep-work"];

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by signal ${result.signal}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

function receiptNames() {
  return new Set(readdirSync(RECEIPT_DIR).filter((name) => name.endsWith(".json")));
}

function collectGeneratorArgs(argv = process.argv.slice(2)) {
  for (const forbidden of ["--replace", "--all", "--story", "--pending"]) {
    if (argv.includes(forbidden)) throw new Error(`${forbidden} is forbidden in pending-story expansion; scope and replacement policy are controlled by the orchestrator`);
  }

  const passthrough = [];
  for (const name of VALUE_ARGS) {
    const index = argv.indexOf(name);
    if (index < 0) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    passthrough.push(name, value);
  }
  for (const name of FLAG_ARGS) {
    if (argv.includes(name)) passthrough.push(name);
  }
  return passthrough;
}

export function buildPendingStoryBatchPlan(options = {}) {
  const plan = options.plan ?? buildNarrationPlan();
  if (!Array.isArray(plan?.items) || plan.items.length === 0) throw new Error("Narration plan is empty");

  const byStory = new Map();
  for (const item of plan.items) {
    const bucket = byStory.get(item.storyId) ?? [];
    bucket.push(item);
    byStory.set(item.storyId, bucket);
  }

  const currentStories = [];
  const pendingStories = [];
  const problems = [];

  for (const [storyId, items] of [...byStory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...items].sort((a, b) => a.key.localeCompare(b.key));
    if (sorted.length !== 9) {
      problems.push(`${storyId}: expected exactly 9 narration items, found ${sorted.length}`);
      continue;
    }

    const statuses = new Set(sorted.map((item) => item.status));
    const unknown = [...statuses].filter((status) => status !== "current" && !PENDING_STATUSES.has(status));
    if (unknown.length > 0) {
      problems.push(`${storyId}: unsupported narration statuses: ${unknown.sort().join(", ")}`);
      continue;
    }

    if (statuses.size === 1 && statuses.has("current")) {
      currentStories.push({ storyId, itemCount: sorted.length, keys: sorted.map((item) => item.key) });
      continue;
    }

    if (!statuses.has("current") && [...statuses].every((status) => PENDING_STATUSES.has(status))) {
      pendingStories.push({
        storyId,
        itemCount: sorted.length,
        statuses: [...statuses].sort(),
        keys: sorted.map((item) => item.key),
      });
      continue;
    }

    problems.push(`${storyId}: mixed current/non-current story is unsafe for whole-story regeneration`);
  }

  if (problems.length > 0) throw new Error(`Pending narration story-batch plan is unsafe:\n${problems.sort().join("\n")}`);

  return {
    schemaVersion: 1,
    scope: "pending-story-batches",
    totalStories: byStory.size,
    currentStoryCount: currentStories.length,
    currentItemCount: currentStories.reduce((sum, story) => sum + story.itemCount, 0),
    pendingStoryCount: pendingStories.length,
    pendingItemCount: pendingStories.reduce((sum, story) => sum + story.itemCount, 0),
    currentStories,
    pendingStories,
  };
}

export function snapshotCurrentNarration(plan = buildNarrationPlan()) {
  return plan.items
    .filter((item) => item.status === "current")
    .map((item) => ({ key: item.key, textSha256: item.textSha256, audioSha256: item.audioSha256 }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function assertProtectedCurrentNarration(snapshot, plan = buildNarrationPlan()) {
  const byKey = new Map(plan.items.map((item) => [item.key, item]));
  const problems = [];
  for (const protectedItem of snapshot) {
    const current = byKey.get(protectedItem.key);
    if (!current) {
      problems.push(`${protectedItem.key}: protected narration disappeared from canonical plan`);
      continue;
    }
    if (current.status !== "current") problems.push(`${protectedItem.key}: protected narration is no longer current`);
    if (current.textSha256 !== protectedItem.textSha256) problems.push(`${protectedItem.key}: protected narration text SHA changed`);
    if (current.audioSha256 !== protectedItem.audioSha256) problems.push(`${protectedItem.key}: protected narration audio SHA changed`);
  }
  if (problems.length > 0) throw new Error(`Protected current narration changed during expansion:\n${problems.sort().join("\n")}`);
  return true;
}

export function executePendingStoryBatches(options = {}) {
  assertNarrationExpansionAllowed({ pendingStories: true });
  const plan = buildPendingStoryBatchPlan(options);
  if (plan.pendingStoryCount === 0) throw new Error("No pending narration stories remain to generate");

  const protectedCurrent = snapshotCurrentNarration(options.plan ?? buildNarrationPlan());
  if (protectedCurrent.length === 0) throw new Error("Refusing expansion without at least one protected current narration item");
  const generatorArgs = options.generatorArgs ?? [];
  const completed = [];

  for (const batch of plan.pendingStories) {
    const beforeReceipts = receiptNames();
    runNode([GENERATOR, "--story", batch.storyId, ...generatorArgs], `narration generation for ${batch.storyId}`);
    const afterReceipts = receiptNames();
    const created = [...afterReceipts].filter((name) => !beforeReceipts.has(name)).sort();
    if (created.length !== 1) {
      throw new Error(`${batch.storyId}: expected exactly one new narration receipt, found ${created.length}`);
    }

    const receiptPath = `content/evidence/narration/receipts/${created[0]}`;
    runNode([IMPORTER, "--receipt", receiptPath], `narration import dry-run for ${batch.storyId}`);
    runNode([IMPORTER, "--receipt", receiptPath, "--write"], `narration import write for ${batch.storyId}`);
    assertProtectedCurrentNarration(protectedCurrent);
    completed.push({ storyId: batch.storyId, itemCount: batch.itemCount, receiptPath });
  }

  const finalPlan = buildNarrationPlan();
  const nonCurrent = finalPlan.items.filter((item) => item.status !== "current");
  if (nonCurrent.length !== 0) {
    throw new Error(`Narration expansion finished with ${nonCurrent.length} non-current items`);
  }
  assertProtectedCurrentNarration(protectedCurrent, finalPlan);

  return {
    schemaVersion: 1,
    generatedStoryCount: completed.length,
    generatedItemCount: completed.reduce((sum, item) => sum + item.itemCount, 0),
    protectedCurrentItemCount: protectedCurrent.length,
    finalCurrentItemCount: finalPlan.items.length,
    completed,
  };
}

function main() {
  const summary = process.argv.includes("--summary");
  const execute = process.argv.includes("--execute");
  if (Number(summary) + Number(execute) !== 1) {
    throw new Error("Choose exactly one mode: --summary or --execute");
  }

  const plan = buildPendingStoryBatchPlan();
  if (summary) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const generatorArgs = collectGeneratorArgs();
  const result = executePendingStoryBatches({ generatorArgs });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("generate-narration-pending-stories.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
