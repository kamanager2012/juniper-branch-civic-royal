import { readNarrationReceipt } from "./narration-receipt.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";

const ALLOWED_CLAIMS = new Set(["owned", "licensed", "public-domain", "permission"]);

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

export function buildNarrationProvenanceEntries(narrationAssets, plan = buildNarrationPlan()) {
  const entries = {};
  const issues = [];
  const byOutput = new Map(plan.items.map((item) => [item.output, item]));

  for (const asset of narrationAssets) {
    if (asset.category !== "narration") {
      issues.push(`non-narration asset passed to narration rights generator: ${asset.id}`);
      continue;
    }

    const item = byOutput.get(asset.path);
    if (!item) {
      issues.push(`narration asset is not present in canonical narration plan: ${asset.path}`);
      continue;
    }

    // Current is necessary but not sufficient: the exact text/audio pair must
    // also be backed by a durable repository receipt carrying rights metadata.
    if (item.status !== "current") continue;
    const state = item.provenance;
    if (!state || !state.rightsClaim) continue;

    const problems = [];
    if (!ALLOWED_CLAIMS.has(state.rightsClaim)) problems.push("rightsClaim must be owned/licensed/public-domain/permission");
    if (!Array.isArray(state.rightsEvidence) || state.rightsEvidence.length === 0 || state.rightsEvidence.some((value) => typeof value !== "string" || value.trim() === "")) {
      problems.push("rightsEvidence must be a non-empty string array");
    }
    if (typeof state.receiptPath !== "string" || state.receiptPath.trim() === "") problems.push("receiptPath must be non-empty");
    if (typeof state.receiptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(state.receiptSha256)) problems.push("receiptSha256 must be lowercase SHA-256");
    if (state.textSha256 !== item.textSha256) problems.push("receipt-backed text hash no longer matches canonical narration text");
    if (state.audioSha256 !== item.audioSha256 || state.audioSha256 !== asset.fingerprintSha256) {
      problems.push("receipt-backed audio hash no longer matches the release MP3");
    }

    let durable = null;
    if (problems.length === 0) {
      try {
        durable = readNarrationReceipt(state.receiptPath);
      } catch (error) {
        problems.push(`receipt cannot be revalidated: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (durable) {
      const { receipt, receiptSha256, receiptPath } = durable;
      if (receiptSha256 !== state.receiptSha256) problems.push("receipt SHA-256 no longer matches narration state");
      if (receiptPath !== state.receiptPath) problems.push("receipt path normalization changed");
      if (receipt.batchId !== state.batchId) problems.push("receipt batchId no longer matches narration state");
      if (receipt.provider.name !== state.provider) problems.push("receipt provider no longer matches narration state");
      if (receipt.provider.voice !== state.voice) problems.push("receipt voice no longer matches narration state");
      if (receipt.provider.language !== state.language) problems.push("receipt language no longer matches narration state");
      if (receipt.provider.generator !== state.generator) problems.push("receipt generator no longer matches narration state");
      if (receipt.rights.claim !== state.rightsClaim) problems.push("receipt rights claim no longer matches narration state");
      if (!sameStringArray(receipt.rights.evidence, state.rightsEvidence)) problems.push("receipt rights evidence no longer matches narration state");

      const receiptItem = receipt.items.find((candidate) => candidate.key === item.key);
      if (!receiptItem) {
        problems.push("receipt no longer contains this narration item");
      } else {
        if (receiptItem.file !== item.output || receiptItem.file !== asset.path) problems.push("receipt item path no longer matches release narration path");
        if (receiptItem.textSha256 !== item.textSha256) problems.push("receipt item text hash no longer matches canonical narration text");
        if (receiptItem.audioSha256 !== item.audioSha256 || receiptItem.audioSha256 !== asset.fingerprintSha256) {
          problems.push("receipt item audio hash no longer matches release MP3");
        }
      }
    }

    if (problems.length > 0) {
      for (const problem of problems) issues.push(`${asset.id}: ${problem}`);
      continue;
    }

    const evidence = [...new Set([state.receiptPath, ...state.rightsEvidence])];
    entries[asset.id] = {
      fingerprintSha256: asset.fingerprintSha256,
      claim: state.rightsClaim,
      evidence,
    };
  }

  return { entries, issues: [...new Set(issues)].sort() };
}
