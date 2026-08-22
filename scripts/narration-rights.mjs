import { buildNarrationPlan } from "./narration-plan.mjs";

const ALLOWED_CLAIMS = new Set(["owned", "licensed", "public-domain", "permission"]);

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

    // Existing or newly generated audio remains rights-unverified until the
    // exact text/audio pair is current AND receipt-backed rights metadata exists.
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
