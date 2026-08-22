import { readNarrationReceipt } from "./narration-receipt.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";

export function buildNarrationLineageEntries(narrationAssets, plan = buildNarrationPlan(), options = {}) {
  const entries = {};
  const issues = [];
  const byOutput = new Map(plan.items.map((item) => [item.output, item]));
  const readReceipt = options.readReceipt ?? readNarrationReceipt;

  for (const asset of narrationAssets) {
    if (asset.category !== "narration") continue;
    const item = byOutput.get(asset.path);
    if (!item) {
      issues.push(`narration lineage asset is not present in canonical narration plan: ${asset.path}`);
      continue;
    }

    if (item.status !== "current") continue;
    const state = item.provenance;
    if (!state?.receiptPath || !state?.receiptSha256 || !state?.batchId || !state?.provider) {
      issues.push(`${asset.id}: current narration lacks receipt-backed source metadata`);
      continue;
    }

    let durable;
    try {
      durable = readReceipt(state.receiptPath);
    } catch (error) {
      issues.push(`${asset.id}: narration source receipt cannot be read: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const problems = [];
    if (durable.receiptSha256 !== state.receiptSha256) problems.push("receipt SHA-256 no longer matches narration state");
    if (durable.receiptPath !== state.receiptPath) problems.push("receipt path normalization changed");
    if (durable.receipt.batchId !== state.batchId) problems.push("receipt batchId no longer matches narration state");
    if (durable.receipt.provider.name !== state.provider) problems.push("receipt provider no longer matches narration state");

    const receiptItem = durable.receipt.items.find((candidate) => candidate.key === item.key);
    if (!receiptItem) {
      problems.push("receipt no longer contains narration item");
    } else {
      if (receiptItem.file !== item.output || receiptItem.file !== asset.path) problems.push("receipt item path no longer matches release narration path");
      if (receiptItem.textSha256 !== item.textSha256 || receiptItem.textSha256 !== state.textSha256) problems.push("receipt item text SHA-256 no longer matches canonical/state text");
      if (receiptItem.audioSha256 !== item.audioSha256 || receiptItem.audioSha256 !== state.audioSha256 || receiptItem.audioSha256 !== asset.fingerprintSha256) {
        problems.push("receipt item audio SHA-256 no longer matches release/state audio");
      }
    }

    if (problems.length > 0) {
      for (const problem of problems) issues.push(`${asset.id}: ${problem}`);
      continue;
    }

    entries[asset.id] = {
      fingerprintSha256: asset.fingerprintSha256,
      origin: {
        method: "generation-receipt",
        path: state.receiptPath,
        receiptSha256: state.receiptSha256,
        batchId: state.batchId,
        provider: state.provider,
      },
    };
  }

  return { entries, issues: [...new Set(issues)].sort() };
}
