import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { computeNarrationInputDigest } from "./narration-generation-set.mjs";
import { repoRoot } from "./story-model.mjs";

const ALLOWED_CLAIMS = new Set(["owned", "licensed", "public-domain", "permission"]);
const RECEIPT_PREFIX = "content/evidence/narration/receipts/";
export const KOKORO_PROVIDER_PROFILE_PATH = "content/evidence/narration/providers/kokoro-v1.1-zh-zf001.json";

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function safeRelativePath(value) {
  if (!nonEmpty(value)) return false;
  const normalized = value.replaceAll("\\", "/");
  return !(
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.includes("\u0000") ||
    normalized.split("/").some((segment) => segment === ".." || segment === "")
  );
}

export function resolveRepositoryNarrationReceiptPath(value, root = repoRoot) {
  if (!safeRelativePath(value)) throw new Error("receipt path must be a safe repository-relative path");
  const normalized = value.replaceAll("\\", "/");
  if (!normalized.startsWith(RECEIPT_PREFIX) || !normalized.endsWith(".json")) {
    throw new Error(`receipt path must be a JSON file under ${RECEIPT_PREFIX}`);
  }
  const absolute = resolve(root, normalized);
  const rel = relative(root, absolute).replaceAll("\\", "/");
  if (rel.startsWith("../") || rel === "..") throw new Error("receipt path escapes repository root");
  return { absolute, relative: rel };
}

export function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateProviderProfile(provider, problems) {
  const profile = provider.profile;
  if (profile == null) {
    if (provider.name === "kokoro-local") problems.push("kokoro-local provider requires an exact provider.profile binding");
    return;
  }
  if (typeof profile !== "object" || Array.isArray(profile)) {
    problems.push("provider.profile must be an object when present");
    return;
  }
  if (!nonEmpty(profile.id)) problems.push("provider.profile.id must be non-empty");
  if (!safeRelativePath(profile.evidence)) problems.push("provider.profile.evidence must be a safe repository-relative path");
  if (typeof profile.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(profile.sha256)) {
    problems.push("provider.profile.sha256 must be lowercase SHA-256");
  }
  if (provider.name === "kokoro-local") {
    if (profile.id !== "kokoro-v1.1-zh-zf001") problems.push("kokoro-local provider.profile.id must be kokoro-v1.1-zh-zf001");
    if (profile.evidence !== KOKORO_PROVIDER_PROFILE_PATH) problems.push(`kokoro-local provider.profile.evidence must be ${KOKORO_PROVIDER_PROFILE_PATH}`);
  }
}

export function validateNarrationReceipt(receipt) {
  const problems = [];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return { valid: false, problems: ["receipt must be an object"] };
  }
  if (receipt.schemaVersion !== 1) problems.push("receipt schemaVersion must be 1");
  if (!nonEmpty(receipt.batchId) || !/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(receipt.batchId)) {
    problems.push("batchId must be a stable 3-80 character identifier");
  }
  if (receipt.canonicalSource !== "content/published-stories.json") {
    problems.push("canonicalSource must be content/published-stories.json");
  }
  if (!nonEmpty(receipt.createdAt) || Number.isNaN(Date.parse(receipt.createdAt))) {
    problems.push("createdAt must be an ISO-compatible timestamp");
  }
  if (!Number.isInteger(receipt.inputItemCount) || receipt.inputItemCount < 1 || receipt.inputItemCount > 216) {
    problems.push("inputItemCount must be an integer between 1 and 216");
  }
  if (typeof receipt.inputDigestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(receipt.inputDigestSha256)) {
    problems.push("inputDigestSha256 must be lowercase SHA-256");
  }

  const provider = receipt.provider;
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    problems.push("provider must be an object");
  } else {
    if (!nonEmpty(provider.name)) problems.push("provider.name must be non-empty");
    if (!nonEmpty(provider.voice)) problems.push("provider.voice must be non-empty");
    if (!nonEmpty(provider.language)) problems.push("provider.language must be non-empty");
    if (!nonEmpty(provider.generator)) problems.push("provider.generator must identify the generation implementation");
    validateProviderProfile(provider, problems);
  }

  const rights = receipt.rights;
  if (!rights || typeof rights !== "object" || Array.isArray(rights)) {
    problems.push("rights must be an object");
  } else {
    if (!ALLOWED_CLAIMS.has(rights.claim)) problems.push("rights.claim must be owned/licensed/public-domain/permission");
    if (!Array.isArray(rights.evidence) || rights.evidence.length === 0 || rights.evidence.some((item) => !nonEmpty(item))) {
      problems.push("rights.evidence must contain at least one non-empty reference");
    } else if (provider?.name === "kokoro-local" && !rights.evidence.includes(KOKORO_PROVIDER_PROFILE_PATH)) {
      problems.push("kokoro-local rights.evidence must include the approved provider profile");
    }
  }

  if (!Array.isArray(receipt.items) || receipt.items.length < 1 || receipt.items.length > 216) {
    problems.push("items must contain between 1 and 216 narration entries");
  } else {
    const keys = new Set();
    const files = new Set();
    for (const [index, item] of receipt.items.entries()) {
      const prefix = `items[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        problems.push(`${prefix} must be an object`);
        continue;
      }
      if (!nonEmpty(item.key) || !/^[a-z0-9-]+\/(?:p[0-7]|moral)$/.test(item.key)) {
        problems.push(`${prefix}.key is invalid`);
      } else if (keys.has(item.key)) {
        problems.push(`${prefix}.key duplicates ${item.key}`);
      } else {
        keys.add(item.key);
      }
      if (!safeRelativePath(item.file) || !/^public\/audio\/[a-z0-9-]+\/(?:p[0-7]|moral)\.mp3$/.test(item.file)) {
        problems.push(`${prefix}.file must be a canonical public/audio narration MP3 path`);
      } else if (files.has(item.file)) {
        problems.push(`${prefix}.file duplicates ${item.file}`);
      } else {
        files.add(item.file);
      }
      if (typeof item.textSha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.textSha256)) {
        problems.push(`${prefix}.textSha256 must be lowercase SHA-256`);
      }
      if (typeof item.audioSha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.audioSha256)) {
        problems.push(`${prefix}.audioSha256 must be lowercase SHA-256`);
      }
    }

    if (receipt.inputItemCount !== receipt.items.length) {
      problems.push("inputItemCount must exactly match items.length");
    }
    const computedInputDigest = computeNarrationInputDigest(receipt.items);
    if (receipt.inputDigestSha256 !== computedInputDigest) {
      problems.push("inputDigestSha256 does not match the receipt narration input set");
    }
  }

  return { valid: problems.length === 0, problems: [...new Set(problems)].sort() };
}

export function readNarrationReceipt(path, options = {}) {
  const root = options.root ?? repoRoot;
  const resolved = resolveRepositoryNarrationReceiptPath(path, root);
  const bytes = readFileSync(resolved.absolute);
  const parsed = JSON.parse(bytes.toString("utf8"));
  const validation = validateNarrationReceipt(parsed);
  if (!validation.valid) throw new Error(`Invalid narration receipt:\n${validation.problems.join("\n")}`);
  return { receipt: parsed, receiptSha256: sha256Buffer(bytes), receiptPath: resolved.relative };
}
