import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  NARRATION_PILOT_STORY_ID,
  assertNarrationExpansionAllowed,
  readNarrationPilotEvidence,
  validateNarrationPilotEvidence,
} from "./narration-pilot-approval.mjs";
import { repoRoot } from "./story-model.mjs";

function approvedEvidence() {
  const evidence = readNarrationPilotEvidence();
  evidence.qualityReview = {
    listeningStatus: "approved",
    expansionApproved: true,
    reviewedAt: "2026-08-22T12:00:00.000Z",
    reviewerRole: "project-owner",
    decisionNote: "Human listening review approved pronunciation, pacing, intelligibility, and overall story narration quality for controlled expansion.",
  };
  return evidence;
}

test("installed narration pilot evidence is technically valid but expansion remains pending", () => {
  const evidence = readNarrationPilotEvidence();
  const result = validateNarrationPilotEvidence(evidence);
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(result.listeningStatus, "pending");
  assert.equal(result.expansionApproved, false);
  assert.equal(evidence.storyId, NARRATION_PILOT_STORY_ID);
});

test("pending pilot permits only disposable regeneration of the exact pilot story", () => {
  const pilot = assertNarrationExpansionAllowed({ story: NARRATION_PILOT_STORY_ID, all: false });
  assert.equal(pilot.allowed, true);
  assert.equal(pilot.pilotOnly, true);
  assert.equal(pilot.expansionApproved, false);

  assert.throws(
    () => assertNarrationExpansionAllowed({ story: "wang-yang-bu-lao", all: false }),
    /Narration expansion is blocked/,
  );
  assert.throws(
    () => assertNarrationExpansionAllowed({ story: null, all: true }),
    /Narration expansion is blocked/,
  );
});

test("expansion approval requires complete listening review metadata and intact pilot evidence", () => {
  const approved = approvedEvidence();
  const result = validateNarrationPilotEvidence(approved);
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(result.expansionApproved, true);
  assert.doesNotThrow(() => assertNarrationExpansionAllowed(
    { story: "wang-yang-bu-lao", all: false },
    { evidence: approved },
  ));
  assert.doesNotThrow(() => assertNarrationExpansionAllowed(
    { story: null, all: true },
    { evidence: approved },
  ));

  for (const mutate of [
    (value) => { value.qualityReview.listeningStatus = "pending"; },
    (value) => { value.qualityReview.reviewedAt = null; },
    (value) => { value.qualityReview.reviewerRole = null; },
    (value) => { value.qualityReview.decisionNote = "ok"; },
    (value) => { value.installedBatch.receiptSha256 = "0".repeat(64); },
    (value) => { value.audioSha256["shou-zhu/p0"] = "0".repeat(64); },
  ]) {
    const changed = approvedEvidence();
    mutate(changed);
    const changedResult = validateNarrationPilotEvidence(changed);
    assert.equal(changedResult.valid, false);
    assert.equal(changedResult.expansionApproved, false);
  }
});

test("official generation entrypoint is guarded and raw workflow execution is restricted to the read-only pilot canary", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts["narration:generate"], "node scripts/generate-narration-guarded.mjs");

  const wrapper = readFileSync(join(repoRoot, "scripts/generate-narration-guarded.mjs"), "utf8");
  assert.match(wrapper, /assertNarrationExpansionAllowed/);
  assert.match(wrapper, /scripts\/generate-narration\.mjs/);

  const generator = readFileSync(join(repoRoot, "scripts/generate-narration.mjs"), "utf8");
  assert.match(generator, /assertNarrationExpansionAllowed/);

  const workflowsDir = join(repoRoot, ".github/workflows");
  const rawExecutions = readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .filter((name) => /\bnode\s+scripts\/generate-narration\.mjs\b/.test(readFileSync(join(workflowsDir, name), "utf8")));
  assert.deepEqual(rawExecutions, ["kokoro-canary.yml"]);

  const canary = readFileSync(join(workflowsDir, "kokoro-canary.yml"), "utf8");
  assert.match(canary, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(canary, /--story shou-zhu/);
  assert.match(canary, /--replace/);
  assert.equal(canary.includes("--all"), false);
  assert.equal(canary.includes("--write"), false);
  assert.equal(canary.includes("git push"), false);
});
