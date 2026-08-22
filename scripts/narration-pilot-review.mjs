#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import {
  NARRATION_PILOT_EVIDENCE_PATH,
  readNarrationPilotEvidence,
  validateNarrationPilotEvidence,
} from "./narration-pilot-approval.mjs";
import { repoRoot } from "./story-model.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return value.trim();
}

export function buildNarrationPilotReviewDecision({ decision, reviewerRole, decisionNote, reviewedAt }) {
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Review decision must be exactly approve or reject");
  }
  const role = requiredText(reviewerRole, "reviewerRole");
  const note = requiredText(decisionNote, "decisionNote");
  if (note.length < 20) throw new Error("decisionNote must contain at least 20 characters");

  const timestamp = reviewedAt ?? new Date().toISOString();
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("reviewedAt must be a valid timestamp");
  }

  return {
    listeningStatus: decision === "approve" ? "approved" : "rejected",
    expansionApproved: decision === "approve",
    reviewedAt: new Date(timestamp).toISOString(),
    reviewerRole: role,
    decisionNote: note,
  };
}

export function prepareNarrationPilotReview({
  evidence,
  decision,
  reviewerRole,
  decisionNote,
  reviewedAt,
  validationOptions = {},
}) {
  const before = structuredClone(evidence);
  const beforeValidation = validateNarrationPilotEvidence(before, validationOptions);
  if (!beforeValidation.valid) {
    throw new Error(`Refusing pilot review because current evidence is invalid:\n${beforeValidation.problems.join("\n")}`);
  }
  if (before.qualityReview?.listeningStatus !== "pending") {
    throw new Error(`Pilot review is already finalized as ${before.qualityReview?.listeningStatus ?? "unknown"}; create a new pilot evidence version instead of overwriting the decision`);
  }

  const after = structuredClone(before);
  after.qualityReview = buildNarrationPilotReviewDecision({ decision, reviewerRole, decisionNote, reviewedAt });
  const afterValidation = validateNarrationPilotEvidence(after, validationOptions);
  if (!afterValidation.valid) {
    throw new Error(`Refusing pilot review because proposed evidence is invalid:\n${afterValidation.problems.join("\n")}`);
  }

  return { before, after, validation: afterValidation };
}

export function writeJsonAtomically(path, value) {
  const tempPath = join(dirname(path), `.${path.split(/[\\/]/).at(-1)}.tmp-${process.pid}-${randomUUID()}`);
  const backupPath = `${path}.bak-${process.pid}-${randomUUID()}`;
  let backedUp = false;
  let installed = false;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    if (existsSync(path)) {
      renameSync(path, backupPath);
      backedUp = true;
    }
    renameSync(tempPath, path);
    installed = true;
    if (backedUp) rmSync(backupPath, { force: true });
  } catch (error) {
    try {
      if (existsSync(tempPath)) rmSync(tempPath, { force: true });
      if (installed && existsSync(path)) rmSync(path, { force: true });
      if (backedUp && existsSync(backupPath)) renameSync(backupPath, path);
    } catch (rollbackError) {
      throw new Error(`Pilot review write failed and rollback also failed: ${error instanceof Error ? error.message : String(error)}; rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    throw error;
  }
}

export function reviewNarrationPilot(options = {}) {
  const evidencePath = options.evidencePath ?? join(repoRoot, NARRATION_PILOT_EVIDENCE_PATH);
  const evidence = options.evidence ?? JSON.parse(readFileSync(evidencePath, "utf8"));
  const prepared = prepareNarrationPilotReview({
    evidence,
    decision: options.decision,
    reviewerRole: options.reviewerRole,
    decisionNote: options.decisionNote,
    reviewedAt: options.reviewedAt,
    validationOptions: options.validationOptions,
  });

  if (options.write === true) {
    writeJsonAtomically(evidencePath, prepared.after);
    const reread = readNarrationPilotEvidence({ path: evidencePath });
    const persisted = validateNarrationPilotEvidence(reread, options.validationOptions);
    if (!persisted.valid || persisted.listeningStatus !== prepared.validation.listeningStatus || persisted.expansionApproved !== prepared.validation.expansionApproved) {
      throw new Error(`Persisted pilot review failed post-write validation:\n${persisted.problems.join("\n")}`);
    }
  }

  return {
    schemaVersion: 1,
    mode: options.write === true ? "write" : "dry-run",
    pilotId: prepared.after.pilotId,
    storyId: prepared.after.storyId,
    listeningStatus: prepared.validation.listeningStatus,
    expansionApproved: prepared.validation.expansionApproved,
    reviewedAt: prepared.after.qualityReview.reviewedAt,
    reviewerRole: prepared.after.qualityReview.reviewerRole,
    evidencePath: NARRATION_PILOT_EVIDENCE_PATH,
  };
}

if (process.argv[1]?.endsWith("narration-pilot-review.mjs")) {
  const decision = argValue("--decision");
  const reviewerRole = argValue("--reviewer-role");
  const decisionNote = argValue("--note");
  const write = process.argv.includes("--write");
  if (process.argv.includes("--reviewed-at")) {
    throw new Error("--reviewed-at is not supported; review time is generated when the human decision is recorded");
  }

  const result = reviewNarrationPilot({ decision, reviewerRole, decisionNote, write });
  console.log(JSON.stringify(result, null, 2));
  if (!write) console.error("Dry-run only. Re-run with --write after confirming the human listening/editorial decision.");
}
