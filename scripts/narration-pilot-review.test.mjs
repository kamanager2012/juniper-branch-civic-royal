import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readNarrationPilotEvidence, validateNarrationPilotEvidence } from "./narration-pilot-approval.mjs";
import {
  buildNarrationPilotReviewDecision,
  prepareNarrationPilotReview,
  reviewNarrationPilot,
} from "./narration-pilot-review.mjs";
import { repoRoot } from "./story-model.mjs";

const REVIEWED_AT = "2026-08-22T12:30:00.000Z";
const APPROVE_NOTE = "Human listening review confirmed pronunciation, pacing, intelligibility, and overall narration quality for controlled expansion.";
const REJECT_NOTE = "Human listening review found pronunciation or pacing issues that must be corrected before narration generation is expanded.";

function withEvidenceFile(run) {
  const dir = mkdtempSync(join(tmpdir(), "narration-pilot-review-"));
  const path = join(dir, "pilot.json");
  const evidence = readNarrationPilotEvidence();
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  try {
    return run({ dir, path, evidence });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("review decision builder requires explicit human decision metadata", () => {
  assert.throws(() => buildNarrationPilotReviewDecision({ decision: "pending", reviewerRole: "project-owner", decisionNote: APPROVE_NOTE, reviewedAt: REVIEWED_AT }), /approve or reject/);
  assert.throws(() => buildNarrationPilotReviewDecision({ decision: "approve", reviewerRole: "", decisionNote: APPROVE_NOTE, reviewedAt: REVIEWED_AT }), /reviewerRole/);
  assert.throws(() => buildNarrationPilotReviewDecision({ decision: "reject", reviewerRole: "project-owner", decisionNote: "too short", reviewedAt: REVIEWED_AT }), /at least 20/);
});

test("dry-run approval validates proposed evidence without mutating the evidence file", () => withEvidenceFile(({ path }) => {
  const before = readFileSync(path, "utf8");
  const result = reviewNarrationPilot({
    evidencePath: path,
    decision: "approve",
    reviewerRole: "project-owner",
    decisionNote: APPROVE_NOTE,
    reviewedAt: REVIEWED_AT,
    write: false,
  });
  assert.equal(result.mode, "dry-run");
  assert.equal(result.listeningStatus, "approved");
  assert.equal(result.expansionApproved, true);
  assert.equal(readFileSync(path, "utf8"), before);
}));

test("approved write changes only qualityReview and persists a fully valid decision", () => withEvidenceFile(({ path, evidence }) => {
  const result = reviewNarrationPilot({
    evidencePath: path,
    decision: "approve",
    reviewerRole: "project-owner",
    decisionNote: APPROVE_NOTE,
    reviewedAt: REVIEWED_AT,
    write: true,
  });
  assert.equal(result.mode, "write");

  const persisted = JSON.parse(readFileSync(path, "utf8"));
  const originalWithoutReview = structuredClone(evidence);
  const persistedWithoutReview = structuredClone(persisted);
  delete originalWithoutReview.qualityReview;
  delete persistedWithoutReview.qualityReview;
  assert.deepEqual(persistedWithoutReview, originalWithoutReview);
  assert.deepEqual(persisted.qualityReview, {
    listeningStatus: "approved",
    expansionApproved: true,
    reviewedAt: REVIEWED_AT,
    reviewerRole: "project-owner",
    decisionNote: APPROVE_NOTE,
  });
  const validation = validateNarrationPilotEvidence(persisted);
  assert.equal(validation.valid, true, validation.problems.join("; "));
  assert.equal(validation.expansionApproved, true);
}));

test("rejected write is durable, non-expanding, and cannot be overwritten in place", () => withEvidenceFile(({ path }) => {
  reviewNarrationPilot({
    evidencePath: path,
    decision: "reject",
    reviewerRole: "project-owner",
    decisionNote: REJECT_NOTE,
    reviewedAt: REVIEWED_AT,
    write: true,
  });
  const rejected = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(rejected.qualityReview.listeningStatus, "rejected");
  assert.equal(rejected.qualityReview.expansionApproved, false);
  assert.equal(validateNarrationPilotEvidence(rejected).valid, true);

  assert.throws(() => reviewNarrationPilot({
    evidencePath: path,
    decision: "approve",
    reviewerRole: "project-owner",
    decisionNote: APPROVE_NOTE,
    reviewedAt: "2026-08-22T13:00:00.000Z",
    write: true,
  }), /already finalized as rejected/);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).qualityReview.listeningStatus, "rejected");
}));

test("review timestamp cannot predate the installed pilot receipt", () => {
  const evidence = readNarrationPilotEvidence();
  assert.throws(() => prepareNarrationPilotReview({
    evidence,
    decision: "approve",
    reviewerRole: "project-owner",
    decisionNote: APPROVE_NOTE,
    reviewedAt: "2026-08-22T11:00:00.000Z",
  }), /cannot predate the installed pilot receipt/);
});

test("durable evidence drift blocks review writes and leaves bytes untouched", () => withEvidenceFile(({ path }) => {
  const drifted = JSON.parse(readFileSync(path, "utf8"));
  drifted.audioSha256["shou-zhu/p0"] = "0".repeat(64);
  writeFileSync(path, `${JSON.stringify(drifted, null, 2)}\n`);
  const before = readFileSync(path, "utf8");

  assert.throws(() => reviewNarrationPilot({
    evidencePath: path,
    decision: "approve",
    reviewerRole: "project-owner",
    decisionNote: APPROVE_NOTE,
    reviewedAt: REVIEWED_AT,
    write: true,
  }), /current evidence is invalid/);
  assert.equal(readFileSync(path, "utf8"), before);
}));

test("GitHub workflows cannot execute the human pilot review command", () => {
  const workflowsDir = join(repoRoot, ".github/workflows");
  const executionPattern = /\b(?:npm\s+run\s+narration:pilot:review|node\s+scripts\/narration-pilot-review\.mjs)\b/;
  for (const name of readdirSync(workflowsDir).filter((value) => value.endsWith(".yml") || value.endsWith(".yaml"))) {
    const source = readFileSync(join(workflowsDir, name), "utf8");
    assert.equal(executionPattern.test(source), false, `${name} must not execute the human pilot review command`);
  }
});
