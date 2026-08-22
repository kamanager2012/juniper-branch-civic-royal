import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { readNarrationReceipt } from "./narration-receipt.mjs";
import { repoRoot } from "./story-model.mjs";

export const NARRATION_PILOT_STORY_ID = "shou-zhu";
export const NARRATION_PILOT_ID = "shou-zhu-kokoro-v1";
export const NARRATION_PILOT_EVIDENCE_PATH = "content/evidence/narration/pilots/shou-zhu-v1.json";

const EXPECTED_TECHNICAL_QC = Object.freeze({
  status: "passed",
  itemCount: 9,
  sampleRateHz: 24000,
  channels: 1,
  bitrateKbps: 40,
  totalDurationSeconds: 71.496,
  averageDurationSeconds: 7.944,
  minimumDurationSeconds: 7.104,
  maximumDurationSeconds: 9.24,
  totalBytes: 359613,
  averageBytes: 39957,
  minimumBytes: 35757,
  maximumBytes: 46437,
  nonSilenceCheck: "passed",
  productionBundleModelLeakCheck: "passed",
});

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function loadEvidence(path = join(repoRoot, NARRATION_PILOT_EVIDENCE_PATH)) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readNarrationPilotEvidence(options = {}) {
  return structuredClone(options.evidence ?? loadEvidence(options.path));
}

export function validateNarrationPilotEvidence(evidence, options = {}) {
  const problems = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, expansionApproved: false, problems: ["pilot evidence must be an object"] };
  }

  if (evidence.schemaVersion !== 1) problems.push("pilot evidence schemaVersion must be 1");
  if (evidence.pilotId !== NARRATION_PILOT_ID) problems.push(`pilotId must be ${NARRATION_PILOT_ID}`);
  if (evidence.storyId !== NARRATION_PILOT_STORY_ID) problems.push(`storyId must be ${NARRATION_PILOT_STORY_ID}`);

  const installed = evidence.installedBatch;
  if (!installed || typeof installed !== "object" || Array.isArray(installed)) {
    problems.push("installedBatch must be an object");
  } else {
    if (!nonEmpty(installed.batchId)) problems.push("installedBatch.batchId must be non-empty");
    if (!nonEmpty(installed.receiptPath)) problems.push("installedBatch.receiptPath must be non-empty");
    if (typeof installed.receiptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(installed.receiptSha256)) {
      problems.push("installedBatch.receiptSha256 must be lowercase SHA-256");
    }
    if (installed.inputItemCount !== 9) problems.push("installedBatch.inputItemCount must be 9");
    if (typeof installed.inputDigestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(installed.inputDigestSha256)) {
      problems.push("installedBatch.inputDigestSha256 must be lowercase SHA-256");
    }
  }

  if (!sameJson(evidence.technicalQc, EXPECTED_TECHNICAL_QC)) {
    problems.push("technicalQc no longer matches the approved pilot QC observation");
  }

  const audioSha = evidence.audioSha256;
  if (!audioSha || typeof audioSha !== "object" || Array.isArray(audioSha)) {
    problems.push("audioSha256 must be an object");
  }

  let durable = null;
  if (installed?.receiptPath) {
    try {
      const readReceipt = options.readReceipt ?? ((path) => readNarrationReceipt(path, { root: options.root ?? repoRoot }));
      durable = readReceipt(installed.receiptPath);
    } catch (error) {
      problems.push(`pilot receipt cannot be revalidated: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (durable) {
    const { receipt, receiptSha256, receiptPath } = durable;
    if (receiptPath !== installed.receiptPath) problems.push("pilot receipt path normalization changed");
    if (receiptSha256 !== installed.receiptSha256) problems.push("pilot receipt SHA-256 no longer matches evidence");
    if (receipt.batchId !== installed.batchId) problems.push("pilot receipt batchId no longer matches evidence");
    if (receipt.inputItemCount !== installed.inputItemCount) problems.push("pilot receipt item count no longer matches evidence");
    if (receipt.inputDigestSha256 !== installed.inputDigestSha256) problems.push("pilot receipt input digest no longer matches evidence");
    if (receipt.provider?.name !== "kokoro-local") problems.push("pilot receipt provider must remain kokoro-local");
    if (receipt.provider?.voice !== "zf_001") problems.push("pilot receipt voice must remain zf_001");
    if (receipt.rights?.claim !== "permission") problems.push("pilot receipt rights claim must remain permission");
    if (!Array.isArray(receipt.items) || receipt.items.length !== 9) {
      problems.push("pilot receipt must contain exactly 9 items");
    } else {
      const expectedKeys = Object.keys(audioSha ?? {}).sort();
      const receiptKeys = receipt.items.map((item) => item.key).sort();
      if (expectedKeys.length !== 9 || !expectedKeys.every((key) => key.startsWith(`${NARRATION_PILOT_STORY_ID}/`))) {
        problems.push("pilot audioSha256 must contain exactly the 9 shou-zhu keys");
      }
      if (!sameJson(expectedKeys, receiptKeys)) problems.push("pilot audio SHA keys no longer match receipt items");
      for (const item of receipt.items) {
        if (audioSha?.[item.key] !== item.audioSha256) problems.push(`${item.key}: pilot audio SHA no longer matches receipt`);
      }
    }
  }

  const plan = options.plan ?? buildNarrationPlan({ story: NARRATION_PILOT_STORY_ID });
  if (!Array.isArray(plan?.items) || plan.items.length !== 9) {
    problems.push("current pilot narration plan must contain exactly 9 items");
  } else {
    for (const item of plan.items) {
      if (item.status !== "current") problems.push(`${item.key}: pilot narration is no longer current`);
      if (audioSha?.[item.key] !== item.audioSha256) problems.push(`${item.key}: pilot evidence audio SHA no longer matches release MP3`);
      const state = item.provenance;
      if (!state) {
        problems.push(`${item.key}: pilot narration lost provenance state`);
        continue;
      }
      if (state.batchId !== installed?.batchId) problems.push(`${item.key}: pilot state batchId no longer matches evidence`);
      if (state.receiptPath !== installed?.receiptPath) problems.push(`${item.key}: pilot state receipt path no longer matches evidence`);
      if (state.receiptSha256 !== installed?.receiptSha256) problems.push(`${item.key}: pilot state receipt SHA-256 no longer matches evidence`);
      if (state.inputDigestSha256 !== installed?.inputDigestSha256) problems.push(`${item.key}: pilot state input digest no longer matches evidence`);
      if (state.audioSha256 !== audioSha?.[item.key]) problems.push(`${item.key}: pilot state audio SHA no longer matches evidence`);
    }
  }

  const review = evidence.qualityReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    problems.push("qualityReview must be an object");
  } else {
    const allowedStatus = new Set(["pending", "approved", "rejected"]);
    if (!allowedStatus.has(review.listeningStatus)) problems.push("qualityReview.listeningStatus must be pending/approved/rejected");
    if (typeof review.expansionApproved !== "boolean") problems.push("qualityReview.expansionApproved must be boolean");
    if (review.expansionApproved === true) {
      if (review.listeningStatus !== "approved") problems.push("expansionApproved requires listeningStatus=approved");
      if (!nonEmpty(review.reviewedAt) || Number.isNaN(Date.parse(review.reviewedAt))) problems.push("approved expansion requires a valid reviewedAt timestamp");
      if (!nonEmpty(review.reviewerRole)) problems.push("approved expansion requires reviewerRole");
      if (!nonEmpty(review.decisionNote) || review.decisionNote.trim().length < 20) problems.push("approved expansion requires a substantive decisionNote");
    }
    if (review.listeningStatus === "pending") {
      if (review.expansionApproved !== false) problems.push("pending listening review cannot approve expansion");
      if (review.reviewedAt !== null) problems.push("pending listening review must keep reviewedAt null");
      if (review.reviewerRole !== null) problems.push("pending listening review must keep reviewerRole null");
    }
    if (review.listeningStatus === "rejected" && review.expansionApproved !== false) {
      problems.push("rejected listening review cannot approve expansion");
    }
  }

  const valid = problems.length === 0;
  return {
    valid,
    expansionApproved: valid && evidence.qualityReview?.expansionApproved === true,
    listeningStatus: evidence.qualityReview?.listeningStatus ?? null,
    problems: [...new Set(problems)].sort(),
  };
}

export function validateCurrentNarrationPilot(options = {}) {
  const evidence = readNarrationPilotEvidence(options);
  return { evidence, ...validateNarrationPilotEvidence(evidence, options) };
}

export function assertNarrationExpansionAllowed(scope, options = {}) {
  if (scope?.story === NARRATION_PILOT_STORY_ID && scope?.all !== true) {
    const result = validateCurrentNarrationPilot(options);
    if (!result.valid) throw new Error(`Narration pilot evidence is invalid:\n${result.problems.join("\n")}`);
    return { allowed: true, pilotOnly: true, expansionApproved: result.expansionApproved };
  }

  const result = validateCurrentNarrationPilot(options);
  if (!result.valid) throw new Error(`Narration expansion is blocked because pilot evidence is invalid:\n${result.problems.join("\n")}`);
  if (!result.expansionApproved) {
    throw new Error(`Narration expansion is blocked: ${NARRATION_PILOT_ID} listening/editorial quality review is ${result.listeningStatus ?? "unknown"}. Approve the durable pilot evidence before generating other stories or --all.`);
  }
  return { allowed: true, pilotOnly: false, expansionApproved: true };
}

if (process.argv[1]?.endsWith("narration-pilot-approval.mjs")) {
  const result = validateCurrentNarrationPilot();
  console.log(JSON.stringify({
    schemaVersion: 1,
    pilotId: result.evidence.pilotId,
    storyId: result.evidence.storyId,
    valid: result.valid,
    technicalQc: result.evidence.technicalQc.status,
    listeningStatus: result.listeningStatus,
    expansionApproved: result.expansionApproved,
    problems: result.problems,
  }, null, 2));
  if (!result.valid) process.exitCode = 1;
}
