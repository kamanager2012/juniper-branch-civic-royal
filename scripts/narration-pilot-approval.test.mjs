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

function pendingEvidence() {
  const evidence = readNarrationPilotEvidence();
  evidence.qualityReview = {
    listeningStatus: "pending",
    expansionApproved: false,
    reviewedAt: null,
    reviewerRole: null,
    decisionNote: "Technical QC passed. Human quality-gate decision is still pending before narration expansion.",
  };
  return evidence;
}

function approvedEvidence() {
  const evidence = pendingEvidence();
  evidence.qualityReview = {
    listeningStatus: "approved",
    expansionApproved: true,
    reviewedAt: "2026-08-22T12:00:00.000Z",
    reviewerRole: "project-owner",
    decisionNote: "Human listening review approved pronunciation, pacing, intelligibility, and overall story narration quality for controlled expansion.",
  };
  return evidence;
}

function waivedEvidence() {
  const evidence = pendingEvidence();
  evidence.qualityReview = {
    listeningStatus: "waived",
    expansionApproved: true,
    reviewedAt: "2026-08-22T14:39:00.000Z",
    reviewerRole: "project-owner",
    decisionNote: "Project owner explicitly waived human listening and authorized controlled narration expansion without representing that listening occurred.",
  };
  return evidence;
}

test("current installed narration pilot evidence remains structurally valid", () => {
  const evidence = readNarrationPilotEvidence();
  const result = validateNarrationPilotEvidence(evidence);
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(evidence.storyId, NARRATION_PILOT_STORY_ID);
});

test("pending pilot permits only disposable regeneration of the exact pilot story", () => {
  const evidence = pendingEvidence();
  const pilot = assertNarrationExpansionAllowed(
    { story: NARRATION_PILOT_STORY_ID, all: false },
    { evidence },
  );
  assert.equal(pilot.allowed, true);
  assert.equal(pilot.pilotOnly, true);
  assert.equal(pilot.expansionApproved, false);

  assert.throws(
    () => assertNarrationExpansionAllowed({ story: "wang-yang-bu-lao", all: false }, { evidence }),
    /Narration expansion is blocked/,
  );
  assert.throws(
    () => assertNarrationExpansionAllowed({ story: null, all: true }, { evidence }),
    /Narration expansion is blocked/,
  );
});

test("listening approval requires complete metadata and intact pilot evidence", () => {
  const approved = approvedEvidence();
  const result = validateNarrationPilotEvidence(approved);
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(result.expansionApproved, true);
  assert.doesNotThrow(() => assertNarrationExpansionAllowed(
    { story: "wang-yang-bu-lao", all: false },
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

test("explicit owner waiver unlocks expansion without claiming listening occurred", () => {
  const waived = waivedEvidence();
  const result = validateNarrationPilotEvidence(waived);
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(result.listeningStatus, "waived");
  assert.equal(result.expansionApproved, true);
  assert.doesNotThrow(() => assertNarrationExpansionAllowed(
    { story: "wang-yang-bu-lao", all: false },
    { evidence: waived },
  ));
  assert.doesNotThrow(() => assertNarrationExpansionAllowed(
    { story: null, all: true },
    { evidence: waived },
  ));

  for (const mutate of [
    (value) => { value.qualityReview.expansionApproved = false; },
    (value) => { value.qualityReview.reviewedAt = null; },
    (value) => { value.qualityReview.reviewerRole = null; },
    (value) => { value.qualityReview.decisionNote = "skip"; },
  ]) {
    const changed = waivedEvidence();
    mutate(changed);
    const changedResult = validateNarrationPilotEvidence(changed);
    assert.equal(changedResult.valid, false);
    assert.equal(changedResult.expansionApproved, false);
  }
});

test("official and raw narration entrypoints are guarded while the internal core retains receipt separation", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts["narration:generate"], "node scripts/generate-narration-guarded.mjs");

  const official = readFileSync(join(repoRoot, "scripts/generate-narration-guarded.mjs"), "utf8");
  assert.match(official, /assertNarrationExpansionAllowed/);
  assert.match(official, /scripts\/generate-narration\.mjs/);

  const raw = readFileSync(join(repoRoot, "scripts/generate-narration.mjs"), "utf8");
  assert.match(raw, /assertNarrationExpansionAllowed/);
  assert.match(raw, /generate-narration-core\.mjs/);

  const core = readFileSync(join(repoRoot, "scripts/generate-narration-core.mjs"), "utf8");
  for (const forbidden of ["api.x.ai", "XAI_API_KEY", "XAI_TTS_VOICE_ID", "narrationStatePath", "readNarrationState"]) {
    assert.equal(core.includes(forbidden), false, `internal generator token must be absent: ${forbidden}`);
  }
  assert.match(core, /buildKokoroNarrationReceipt/);
  assert.match(core, /readKokoroRuntimeEnvironmentBinding/);
  assert.match(core, /narrationStateUpdated:\s*false/);
  assert.match(core, /narration:import/);

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
