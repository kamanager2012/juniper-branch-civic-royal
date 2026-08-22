import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  APPROVED_KOKORO,
  KOKORO_PROFILE_PATH,
  readKokoroProviderProfile,
  validateKokoroProviderProfile,
} from "./kokoro-provider-profile.mjs";
import {
  readKokoroRuntimeEnvironmentBinding,
  validateKokoroRuntimeHost,
} from "./kokoro-runtime-environment.mjs";
import {
  NARRATION_ENCODER_PROFILE_ID,
  NARRATION_ENCODER_PROFILE_PATH,
  inspectLocalNarrationEncoder,
  readApprovedNarrationEncoderBinding,
  validateLocalNarrationEncoder,
} from "./narration-encoder-profile.mjs";
import {
  buildNarrationGenerationSet,
  canonicalNarrationInputEntries,
  computeNarrationInputDigest,
} from "./narration-generation-set.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import {
  KOKORO_GENERATOR_ID,
  KOKORO_PROVIDER_PROFILE_PATH,
  sha256Buffer,
  validateNarrationReceipt,
} from "./narration-receipt.mjs";
import { repoRoot } from "./story-model.mjs";

export const KOKORO_PROVIDER_NAME = "kokoro-local";
export { KOKORO_GENERATOR_ID };
export const KOKORO_MP3_BITRATE_KBPS = 40;
export const KOKORO_MP3_MAX_BYTES = 180000;
export const KOKORO_SAMPLE_RATE_HZ = 24000;
export const KOKORO_CHANNELS = 1;
export const GENERATION_SET_EVIDENCE_PATH = "content/evidence/narration/generation-set-v1.json";

export function readApprovedGenerationSetEvidence(path = resolve(repoRoot, GENERATION_SET_EVIDENCE_PATH)) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateSetSelfConsistency(set, label, problems) {
  if (!set || typeof set !== "object" || !Array.isArray(set.entries)) {
    problems.push(`${label} must contain an entries array`);
    return;
  }
  if (set.count !== set.entries.length) problems.push(`${label} count must exactly match entries.length`);
  const computed = computeNarrationInputDigest(set.entries);
  if (set.inputDigestSha256 !== computed) problems.push(`${label} input digest does not match its entries`);
}

function sameCanonicalInputs(left, right) {
  return JSON.stringify(canonicalNarrationInputEntries(left)) === JSON.stringify(canonicalNarrationInputEntries(right));
}

function validateApprovedSubset(generationSet, fullSet, label, problems) {
  const approvedByKey = new Map(fullSet.entries.map((entry) => [entry.key, entry]));
  for (const entry of generationSet.entries) {
    const approved = approvedByKey.get(entry.key);
    if (!approved) {
      problems.push(`${entry.key}: ${label} item is not present in the approved full set`);
      continue;
    }
    if (approved.file !== entry.file || approved.textSha256 !== entry.textSha256) {
      problems.push(`${entry.key}: ${label} path/text hash no longer matches approved full set`);
    }
  }
}

export function validateApprovedGenerationSet(generationSet, options = {}) {
  const problems = [];
  const evidence = options.evidence ?? readApprovedGenerationSetEvidence();
  const fullSet = options.fullSet ?? buildNarrationGenerationSet();

  if (evidence?.schemaVersion !== 1) problems.push("generation-set evidence schemaVersion must be 1");
  if (evidence?.canonicalSource !== "content/published-stories.json") problems.push("generation-set evidence canonicalSource drifted");
  if (evidence?.inputItemCount !== 216) problems.push("approved full narration generation set must contain 216 items");
  if (typeof evidence?.inputDigestSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidence.inputDigestSha256)) {
    problems.push("generation-set evidence digest must be lowercase SHA-256");
  }

  validateSetSelfConsistency(fullSet, "current full narration set", problems);
  validateSetSelfConsistency(generationSet, "requested narration set", problems);

  if (fullSet.count !== evidence?.inputItemCount) problems.push("current full narration input count no longer matches approved generation-set evidence");
  if (fullSet.inputDigestSha256 !== evidence?.inputDigestSha256) problems.push("current full narration input digest no longer matches approved generation-set evidence");

  if (generationSet.scope?.type === "all") {
    if (generationSet.count !== evidence?.inputItemCount) problems.push("all-scope generation count must match approved full set");
    if (generationSet.inputDigestSha256 !== evidence?.inputDigestSha256) problems.push("all-scope generation digest must match approved full set");
  } else if (generationSet.scope?.type === "story") {
    if (generationSet.count !== 9) problems.push("story-scope narration generation must contain exactly 9 items");
    validateApprovedSubset(generationSet, fullSet, "story-scope", problems);
  } else if (generationSet.scope?.type === "pending") {
    let expectedPending = options.pendingSet ?? null;
    try {
      expectedPending ??= buildNarrationGenerationSet({ pending: true, plan: options.plan ?? buildNarrationPlan() });
    } catch (error) {
      problems.push(`current pending narration set cannot be constructed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (expectedPending) {
      validateSetSelfConsistency(expectedPending, "current pending narration set", problems);
      if (generationSet.count !== expectedPending.count) problems.push("pending-scope generation count must exactly match the current non-current narration set");
      if (generationSet.inputDigestSha256 !== expectedPending.inputDigestSha256) problems.push("pending-scope generation digest must exactly match the current non-current narration set");
      if (!sameCanonicalInputs(generationSet.entries, expectedPending.entries)) problems.push("pending-scope generation entries must exactly match the current non-current narration set");
    }

    validateApprovedSubset(generationSet, fullSet, "pending-scope", problems);
    const plan = options.plan ?? buildNarrationPlan();
    const statusByKey = new Map(plan.items.map((item) => [item.key, item.status]));
    for (const entry of generationSet.entries) {
      if (statusByKey.get(entry.key) === "current") problems.push(`${entry.key}: pending-scope must never include current narration`);
    }
  } else {
    problems.push("generation scope must be all, story, or pending");
  }

  return { valid: problems.length === 0, problems: [...new Set(problems)].sort(), evidence };
}

function canonicalRepositoryFromOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let origin = value.trim().replace(/\.git$/, "");
  if (origin.startsWith("git@github.com:")) return origin.slice("git@github.com:".length);
  if (origin.startsWith("ssh://git@github.com/")) return origin.slice("ssh://git@github.com/".length);
  try {
    const url = new URL(origin);
    if (url.hostname !== "github.com") return null;
    return url.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

function gitOutput(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function readRuntimeCheckoutSnapshot(directory) {
  const absolute = resolve(directory);
  const origin = gitOutput(absolute, ["remote", "get-url", "origin"]);
  return {
    directory: absolute,
    head: gitOutput(absolute, ["rev-parse", "HEAD"]),
    origin,
    repository: canonicalRepositoryFromOrigin(origin),
    clean: gitOutput(absolute, ["status", "--porcelain", "--untracked-files=all"]) === "",
  };
}

export function validateRuntimeCheckoutIdentity(snapshot, expected) {
  const problems = [];
  if (snapshot?.repository !== expected.repository) problems.push(`runtime repository must be ${expected.repository}`);
  if (snapshot?.head !== expected.commit) problems.push(`runtime checkout must be pinned to ${expected.commit}`);
  if (snapshot?.clean !== true) problems.push("runtime checkout must be clean, including untracked files");
  return { valid: problems.length === 0, problems };
}

export function validateKokoroRuntimeCheckouts({ kokoro, misaki }) {
  const problems = [];
  const kokoroResult = validateRuntimeCheckoutIdentity(kokoro, {
    repository: APPROVED_KOKORO.inferenceRepository,
    commit: APPROVED_KOKORO.inferenceCommit,
  });
  const misakiResult = validateRuntimeCheckoutIdentity(misaki, {
    repository: APPROVED_KOKORO.g2pRepository,
    commit: APPROVED_KOKORO.g2pCommit,
  });
  for (const problem of kokoroResult.problems) problems.push(`kokoro: ${problem}`);
  for (const problem of misakiResult.problems) problems.push(`misaki: ${problem}`);
  return { valid: problems.length === 0, problems };
}

export function validateGeneratedMp3(buffer, maxBytes = KOKORO_MP3_MAX_BYTES) {
  const problems = [];
  if (!Buffer.isBuffer(buffer)) return { valid: false, problems: ["generated MP3 must be a Buffer"] };
  if (buffer.length < 1000) problems.push(`generated MP3 is too small (${buffer.length} bytes)`);
  if (buffer.length > maxBytes) problems.push(`generated MP3 exceeds release budget (${buffer.length} > ${maxBytes} bytes)`);
  const id3 = buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3";
  const frame = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) problems.push("generated payload is not an MP3 stream");
  return { valid: problems.length === 0, problems };
}

export function buildNarrationBatchId(createdAt, inputDigestSha256, scope) {
  const stamp = createdAt.toISOString().replace(/[-:.]/g, "").toLowerCase();
  const scopePart = scope?.type === "story" ? `-${scope.storyId}` : scope?.type === "pending" ? "-pending" : "-all";
  return `kokoro-${stamp}${scopePart}-${inputDigestSha256.slice(0, 12)}`;
}

export function receiptPathForBatch(batchId) {
  return `content/evidence/narration/receipts/${batchId}.json`;
}

export function readApprovedProviderBinding() {
  const profile = readKokoroProviderProfile();
  const validation = validateKokoroProviderProfile(profile);
  if (!validation.valid) throw new Error(`Kokoro provider profile is not approved:\n${validation.issues.join("\n")}`);
  const profileBytes = readFileSync(KOKORO_PROFILE_PATH);
  const profileRelative = relative(repoRoot, KOKORO_PROFILE_PATH).replaceAll("\\", "/");
  if (profileRelative !== KOKORO_PROVIDER_PROFILE_PATH) throw new Error("Kokoro provider profile path drifted");
  return {
    profile,
    path: profileRelative,
    sha256: sha256Buffer(profileBytes),
  };
}

function validateStagedOutput(output, entry) {
  if (!output.stagedPath) return;
  let audio;
  try {
    audio = readFileSync(output.stagedPath);
  } catch (error) {
    throw new Error(`${entry.key}: staged MP3 cannot be reread while constructing receipt: ${error instanceof Error ? error.message : String(error)}`);
  }
  const payload = validateGeneratedMp3(audio);
  if (!payload.valid) throw new Error(`${entry.key}: staged MP3 failed final payload validation: ${payload.problems.join("; ")}`);
  if (audio.length !== output.bytes) throw new Error(`${entry.key}: staged MP3 byte size changed after encoding`);
  if (sha256AudioBuffer(audio) !== output.audioSha256) throw new Error(`${entry.key}: staged MP3 SHA-256 changed after encoding`);
}

function sameRuntimeEnvironment(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function approvedEncoderExecution(encoder, options = {}) {
  const binding = options.binding ?? readApprovedNarrationEncoderBinding();
  const localSnapshot = options.snapshot ?? inspectLocalNarrationEncoder();
  const localValidation = validateLocalNarrationEncoder(localSnapshot);
  if (!localValidation.valid) {
    throw new Error(`Narration MP3 encoder is not the approved byte-pinned toolchain:\n${localValidation.issues.join("\n")}`);
  }
  const ffmpeg = localSnapshot.binaries.find((item) => item.name === "ffmpeg");
  const lame = localSnapshot.libraries.find((item) => item.soname === "libmp3lame.so.0");
  if (!ffmpeg || !lame) throw new Error("Approved narration encoder snapshot is incomplete");
  if (encoder?.version !== ffmpeg.versionLine) {
    throw new Error("Narration encoder version line does not match the approved ffmpeg binary");
  }
  return {
    name: "ffmpeg",
    version: ffmpeg.versionLine,
    codec: "libmp3lame",
    bitrateKbps: KOKORO_MP3_BITRATE_KBPS,
    sampleRateHz: KOKORO_SAMPLE_RATE_HZ,
    channels: KOKORO_CHANNELS,
    binarySha256: ffmpeg.sha256,
    libmp3lameSha256: lame.sha256,
    profile: {
      id: NARRATION_ENCODER_PROFILE_ID,
      evidence: NARRATION_ENCODER_PROFILE_PATH,
      sha256: binding.sha256,
    },
  };
}

export function buildKokoroNarrationReceipt({
  generationSet,
  outputs,
  createdAt = new Date(),
  runtime,
  encoder,
  encoderBinding,
  encoderSnapshot,
  providerBinding = readApprovedProviderBinding(),
  runtimeEnvironment = readKokoroRuntimeEnvironmentBinding(),
}) {
  const approvedSet = validateApprovedGenerationSet(generationSet);
  if (!approvedSet.valid) throw new Error(`Narration generation set is not approved:\n${approvedSet.problems.join("\n")}`);

  const currentRuntimeEnvironment = readKokoroRuntimeEnvironmentBinding();
  if (!sameRuntimeEnvironment(runtimeEnvironment, currentRuntimeEnvironment)) {
    throw new Error("Narration runtime environment binding does not match the currently approved project/lock bytes");
  }
  const hostValidation = validateKokoroRuntimeHost({
    platform: runtime.platform,
    arch: runtime.arch,
    pythonVersion: runtime.pythonVersion,
    torchVersion: runtime.torchVersion,
    device: runtime.device,
  });
  if (!hostValidation.valid) {
    throw new Error(`Narration runtime host is not approved:\n${hostValidation.issues.join("\n")}`);
  }
  const providerValidation = validateKokoroProviderProfile(providerBinding.profile);
  if (!providerValidation.valid) {
    throw new Error(`Narration provider profile is not approved:\n${providerValidation.issues.join("\n")}`);
  }
  if (providerBinding.path !== KOKORO_PROVIDER_PROFILE_PATH) {
    throw new Error(`Narration provider profile path must remain ${KOKORO_PROVIDER_PROFILE_PATH}`);
  }
  if (providerBinding.sha256 !== sha256Buffer(readFileSync(resolve(repoRoot, providerBinding.path)))) {
    throw new Error("Narration provider profile SHA-256 no longer matches its committed bytes");
  }

  if (!Array.isArray(outputs) || outputs.length !== generationSet.count) {
    throw new Error("Narration outputs must exactly cover the approved generation set");
  }
  const entryByKey = new Map(generationSet.entries.map((entry) => [entry.key, entry]));
  const outputKeys = new Set();
  for (const output of outputs) {
    if (outputKeys.has(output.key)) throw new Error(`Duplicate narration output key: ${output.key}`);
    outputKeys.add(output.key);
    const entry = entryByKey.get(output.key);
    if (!entry) throw new Error(`Narration output is outside the approved generation set: ${output.key}`);
    if (output.file !== entry.file) throw new Error(`${output.key}: narration output path drifted from approved generation set`);
    if (typeof output.audioSha256 !== "string" || !/^[a-f0-9]{64}$/.test(output.audioSha256)) throw new Error(`${output.key}: narration output SHA-256 is invalid`);
    if (!Number.isInteger(output.bytes) || output.bytes < 1000) throw new Error(`${output.key}: narration output byte size is invalid`);
    validateStagedOutput(output, entry);
  }

  const executionEncoder = approvedEncoderExecution(encoder, { binding: encoderBinding, snapshot: encoderSnapshot });
  return {
    schemaVersion: 1,
    batchId: buildNarrationBatchId(createdAt, generationSet.inputDigestSha256, generationSet.scope),
    canonicalSource: generationSet.canonicalSource,
    createdAt: createdAt.toISOString(),
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    provider: {
      name: KOKORO_PROVIDER_NAME,
      voice: providerBinding.profile.model.voice.id,
      language: providerBinding.profile.language,
      generator: KOKORO_GENERATOR_ID,
      profile: {
        id: providerBinding.profile.profileId,
        evidence: providerBinding.path,
        sha256: providerBinding.sha256,
      },
    },
    execution: {
      runtime: {
        platform: runtime.platform,
        arch: runtime.arch,
        pythonVersion: runtime.pythonVersion,
        torchVersion: runtime.torchVersion,
        device: runtime.device,
        environment: currentRuntimeEnvironment,
      },
      encoder: executionEncoder,
    },
    rights: {
      claim: providerBinding.profile.rights.claim,
      evidence: [...providerBinding.profile.rights.evidence],
    },
    items: generationSet.entries.map((entry) => {
      const output = outputs.find((candidate) => candidate.key === entry.key);
      return {
        key: entry.key,
        file: entry.file,
        textSha256: entry.textSha256,
        audioSha256: output.audioSha256,
      };
    }),
  };
}

export function sha256AudioBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
