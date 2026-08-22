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
  computeNarrationInputDigest,
} from "./narration-generation-set.mjs";
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
    const approvedByKey = new Map(fullSet.entries.map((entry) => [entry.key, entry]));
    for (const entry of generationSet.entries) {
      const approved = approvedByKey.get(entry.key);
      if (!approved) {
        problems.push(`${entry.key}: story-scope item is not present in the approved full set`);
        continue;
      }
      if (approved.file !== entry.file || approved.textSha256 !== entry.textSha256) {
        problems.push(`${entry.key}: story-scope path/text hash no longer matches approved full set`);
      }
    }
  } else {
    problems.push("generation scope must be all or story");
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
  const scopePart = scope?.type === "story" ? `-${scope.storyId}` : "-all";
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

function approvedEncoderExecution(encoder) {
  const binding = readApprovedNarrationEncoderBinding();
  const localSnapshot = inspectLocalNarrationEncoder();
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

  const outputByKey = new Map(outputs.map((output) => [output.key, output]));
  if (outputByKey.size !== generationSet.entries.length || outputs.length !== generationSet.entries.length) {
    throw new Error("Generated output set does not exactly cover the requested narration input set");
  }

  const items = generationSet.entries.map((entry) => {
    const output = outputByKey.get(entry.key);
    if (!output) throw new Error(`${entry.key}: generated output is missing`);
    if (output.file !== entry.file) throw new Error(`${entry.key}: generated output path does not match canonical narration path`);
    if (typeof output.audioSha256 !== "string" || !/^[a-f0-9]{64}$/.test(output.audioSha256)) throw new Error(`${entry.key}: generated output audio SHA-256 is invalid`);
    if (!Number.isInteger(output.bytes) || output.bytes < 1000 || output.bytes > KOKORO_MP3_MAX_BYTES) throw new Error(`${entry.key}: generated output byte size is outside release bounds`);
    validateStagedOutput(output, entry);
    return {
      key: entry.key,
      file: entry.file,
      textSha256: entry.textSha256,
      audioSha256: output.audioSha256,
    };
  });

  const batchId = buildNarrationBatchId(createdAt, generationSet.inputDigestSha256, generationSet.scope);
  const receipt = {
    schemaVersion: 1,
    batchId,
    canonicalSource: generationSet.canonicalSource,
    createdAt: createdAt.toISOString(),
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    provider: {
      name: KOKORO_PROVIDER_NAME,
      voice: APPROVED_KOKORO.voiceId,
      language: "zh",
      generator: KOKORO_GENERATOR_ID,
      profile: {
        id: providerBinding.profile.profileId,
        evidence: providerBinding.path,
        sha256: providerBinding.sha256,
      },
    },
    rights: {
      claim: providerBinding.profile.rights.claimForGeneratedNarration,
      evidence: [providerBinding.path],
    },
    execution: {
      model: {
        repository: APPROVED_KOKORO.modelRepository,
        revision: APPROVED_KOKORO.modelRevision,
        configSha256: APPROVED_KOKORO.configSha256,
        weightsSha256: APPROVED_KOKORO.weightsSha256,
        voiceSha256: APPROVED_KOKORO.voiceSha256,
      },
      runtime: {
        inferenceRepository: APPROVED_KOKORO.inferenceRepository,
        inferenceCommit: APPROVED_KOKORO.inferenceCommit,
        g2pRepository: APPROVED_KOKORO.g2pRepository,
        g2pCommit: APPROVED_KOKORO.g2pCommit,
        platform: runtime.platform,
        arch: runtime.arch,
        pythonVersion: runtime.pythonVersion,
        torchVersion: runtime.torchVersion,
        device: runtime.device,
        environment: runtimeEnvironment,
      },
      encoder: approvedEncoderExecution(encoder),
    },
    items,
  };

  const validation = validateNarrationReceipt(receipt);
  if (!validation.valid) throw new Error(`Generated narration receipt is invalid:\n${validation.problems.join("\n")}`);
  return receipt;
}

export function sha256AudioBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
