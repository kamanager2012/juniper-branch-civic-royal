import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  assertProtectedCurrentNarration,
  buildPendingStoryBatchPlan,
  snapshotCurrentNarration,
} from "./generate-narration-pending-stories.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

function realPlan() {
  return buildNarrationPlan();
}

test("current release expands as exactly 23 whole-story batches / 207 items while protecting shou-zhu", () => {
  const plan = buildPendingStoryBatchPlan({ plan: realPlan() });
  assert.equal(plan.totalStories, 24);
  assert.equal(plan.currentStoryCount, 1);
  assert.equal(plan.currentItemCount, 9);
  assert.equal(plan.pendingStoryCount, 23);
  assert.equal(plan.pendingItemCount, 207);
  assert.deepEqual(plan.currentStories.map((story) => story.storyId), ["shou-zhu"]);
  assert.equal(plan.pendingStories.some((story) => story.storyId === "shou-zhu"), false);
  assert.ok(plan.pendingStories.every((story) => story.itemCount === 9));
  assert.ok(plan.pendingStories.every((story) => story.statuses.every((status) => ["missing", "stale", "unverified"].includes(status))));
});

test("mixed current/non-current story fails closed instead of replacing a partial story", () => {
  const plan = structuredClone(realPlan());
  const targetStory = buildPendingStoryBatchPlan({ plan }).pendingStories[0].storyId;
  const item = plan.items.find((candidate) => candidate.storyId === targetStory);
  item.status = "current";
  assert.throws(
    () => buildPendingStoryBatchPlan({ plan }),
    /mixed current\/non-current story is unsafe/,
  );
});

test("unknown narration status fails closed", () => {
  const plan = structuredClone(realPlan());
  const target = plan.items.find((item) => item.status !== "current");
  target.status = "mystery";
  assert.throws(
    () => buildPendingStoryBatchPlan({ plan }),
    /unsupported narration statuses: mystery/,
  );
});

test("protected-current guard pins existing release text/audio pairs", () => {
  const plan = realPlan();
  const snapshot = snapshotCurrentNarration(plan);
  assert.equal(snapshot.length, 9);
  assert.ok(snapshot.every((item) => item.key.startsWith("shou-zhu/")));
  assert.equal(assertProtectedCurrentNarration(snapshot, plan), true);

  const drifted = structuredClone(plan);
  const protectedKey = snapshot[0].key;
  const item = drifted.items.find((candidate) => candidate.key === protectedKey);
  item.audioSha256 = "0".repeat(64);
  assert.throws(
    () => assertProtectedCurrentNarration(snapshot, drifted),
    /protected narration audio SHA changed/,
  );
});

test("orchestrator forbids broad replacement and imports every generated story receipt before continuing", () => {
  const source = readFileSync(join(repoRoot, "scripts/generate-narration-pending-stories.mjs"), "utf8");
  assert.match(source, /\["--replace", "--all", "--story", "--pending"\]/);
  assert.match(source, /GENERATOR, "--story", batch\.storyId/);
  assert.match(source, /IMPORTER, "--receipt", receiptPath\]/);
  assert.match(source, /IMPORTER, "--receipt", receiptPath, "--write"\]/);
  assert.match(source, /expected exactly one new narration receipt/);
  assert.match(source, /assertProtectedCurrentNarration\(protectedCurrent\)/);
  assert.match(source, /nonCurrent\.length !== 0/);
  assert.equal(source.includes("--replace only"), false);
});
