import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateKokoroProviderProfile } from "./kokoro-provider-profile.mjs";
import {
  KOKORO_PROVIDER_PROFILE_PATH,
  readNarrationReceipt,
  safeRelativePath,
  sha256Buffer,
} from "./narration-receipt.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

const ALLOWED_CLAIMS = new Set(["owned", "licensed", "public-domain", "permission"]);

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

function readDurableProviderProfile(path, root = repoRoot) {
  if (!safeRelativePath(path)) throw new Error("provider profile path must be repository-relative");
  const bytes = readFileSync(join(root, path));
  return {
    path,
    sha256: sha256Buffer(bytes),
    profile: JSON.parse(bytes.toString("utf8")),
  };
}

export function buildNarrationProvenanceEntries(narrationAssets, plan = buildNarrationPlan(), options = {}) {
  const entries = {};
  const issues = [];
  const byOutput = new Map(plan.items.map((item) => [item.output, item]));
  const readReceipt = options.readReceipt ?? readNarrationReceipt;
  const readProviderProfile = options.readProviderProfile ?? readDurableProviderProfile;
  const providerProfileCache = new Map();

  function durableProviderProfile(path) {
    if (!providerProfileCache.has(path)) {
      providerProfileCache.set(path, readProviderProfile(path));
    }
    return providerProfileCache.get(path);
  }

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

    if (item.status !== "current") continue;
    const state = item.provenance;
    if (!state || !state.rightsClaim) continue;

    const problems = [];
    if (!ALLOWED_CLAIMS.has(state.rightsClaim)) problems.push("rightsClaim must be owned/licensed/public-domain/permission");
    if (!Array.isArray(state.rightsEvidence) || state.rightsEvidence.length === 0 || state.rightsEvidence.some((value) => typeof value !== "string" || value.trim() === "")) {
      problems.push("rightsEvidence must be a non-empty string array");
    }
    if (!Number.isInteger(state.inputItemCount) || state.inputItemCount < 1 || state.inputItemCount > 216) problems.push("inputItemCount must be an integer between 1 and 216");
    if (typeof state.inputDigestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(state.inputDigestSha256)) problems.push("inputDigestSha256 must be lowercase SHA-256");
    if (typeof state.receiptPath !== "string" || state.receiptPath.trim() === "") problems.push("receiptPath must be non-empty");
    if (typeof state.receiptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(state.receiptSha256)) problems.push("receiptSha256 must be lowercase SHA-256");
    if (state.textSha256 !== item.textSha256) problems.push("receipt-backed text hash no longer matches canonical narration text");
    if (state.audioSha256 !== item.audioSha256 || state.audioSha256 !== asset.fingerprintSha256) {
      problems.push("receipt-backed audio hash no longer matches the release MP3");
    }

    let durable = null;
    if (problems.length === 0) {
      try {
        durable = readReceipt(state.receiptPath);
      } catch (error) {
        problems.push(`receipt cannot be revalidated: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (durable) {
      const { receipt, receiptSha256, receiptPath } = durable;
      if (receiptSha256 !== state.receiptSha256) problems.push("receipt SHA-256 no longer matches narration state");
      if (receiptPath !== state.receiptPath) problems.push("receipt path normalization changed");
      if (receipt.batchId !== state.batchId) problems.push("receipt batchId no longer matches narration state");
      if (receipt.inputItemCount !== state.inputItemCount) problems.push("receipt input item count no longer matches narration state");
      if (receipt.inputDigestSha256 !== state.inputDigestSha256) problems.push("receipt input digest no longer matches narration state");
      if (receipt.provider.name !== state.provider) problems.push("receipt provider no longer matches narration state");
      if (receipt.provider.voice !== state.voice) problems.push("receipt voice no longer matches narration state");
      if (receipt.provider.language !== state.language) problems.push("receipt language no longer matches narration state");
      if (receipt.provider.generator !== state.generator) problems.push("receipt generator no longer matches narration state");
      if (receipt.rights.claim !== state.rightsClaim) problems.push("receipt rights claim no longer matches narration state");
      if (!sameStringArray(receipt.rights.evidence, state.rightsEvidence)) problems.push("receipt rights evidence no longer matches narration state");

      const profile = receipt.provider.profile ?? null;
      if ((profile?.id ?? null) !== (state.providerProfileId ?? null)) problems.push("receipt provider profile id no longer matches narration state");
      if ((profile?.evidence ?? null) !== (state.providerProfilePath ?? null)) problems.push("receipt provider profile path no longer matches narration state");
      if ((profile?.sha256 ?? null) !== (state.providerProfileSha256 ?? null)) problems.push("receipt provider profile SHA-256 no longer matches narration state");

      if (receipt.provider.name === "kokoro-local") {
        if (!profile) {
          problems.push("kokoro-local receipt lost its provider profile binding");
        } else {
          if (profile.id !== "kokoro-v1.1-zh-zf001") problems.push("kokoro-local provider profile id is not approved");
          if (profile.evidence !== KOKORO_PROVIDER_PROFILE_PATH) problems.push("kokoro-local provider profile path is not approved");
          if (receipt.rights.claim !== "permission") problems.push("kokoro-local narration rights claim must remain permission");
          if (!receipt.rights.evidence.includes(KOKORO_PROVIDER_PROFILE_PATH)) problems.push("kokoro-local rights evidence lost the approved provider profile");
          try {
            const currentProfile = durableProviderProfile(profile.evidence);
            if (currentProfile.path !== profile.evidence) problems.push("provider profile path normalization changed");
            if (currentProfile.sha256 !== profile.sha256) problems.push("provider profile SHA-256 no longer matches receipt");
            if (currentProfile.sha256 !== state.providerProfileSha256) problems.push("provider profile SHA-256 no longer matches narration state");
            const validation = validateKokoroProviderProfile(currentProfile.profile);
            for (const issue of validation.issues) problems.push(`provider profile is no longer approved: ${issue}`);
          } catch (error) {
            problems.push(`provider profile cannot be revalidated: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

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
