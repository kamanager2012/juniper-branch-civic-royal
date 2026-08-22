import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
export const KOKORO_PROFILE_PATH = join(repoRoot, "content/evidence/narration/providers/kokoro-v1.1-zh-zf001.json");

export const APPROVED_KOKORO = Object.freeze({
  profileId: "kokoro-v1.1-zh-zf001",
  modelRepository: "hexgrad/Kokoro-82M-v1.1-zh",
  modelRevision: "a51e9e2a069a198cbda1f021f3805af3603ba92d",
  configSha256: "bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890",
  configBytes: 3228,
  weightsSha256: "b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b",
  weightsBytes: 327247856,
  voiceId: "zf_001",
  voiceSha256: "9bdc9a87e13e9bb1ea3e7803259c2ecbfebaeeb2ff80b5d0c76df1a464c1c962",
  inferenceRepository: "hexgrad/kokoro",
  inferenceCommit: "dfb907a02bba8152ca444717ca5d78747ccb4bec",
  g2pRepository: "hexgrad/misaki",
  g2pCommit: "fba1236595f2d2bf21d414ba6e57d25256afada3",
  rightsEvidence: Object.freeze([
    "https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh",
    "https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/a51e9e2a069a198cbda1f021f3805af3603ba92d/kokoro-v1_1-zh.pth",
    "https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/a51e9e2a069a198cbda1f021f3805af3603ba92d/voices/zf_001.pt",
    "https://github.com/hexgrad/kokoro/blob/dfb907a02bba8152ca444717ca5d78747ccb4bec/LICENSE",
    "https://github.com/hexgrad/misaki/blob/fba1236595f2d2bf21d414ba6e57d25256afada3/LICENSE",
  ]),
});

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeAssetPath(root, value) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return null;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").some((part) => part === ".." || part === "")) return null;
  const absolute = resolve(root, normalized);
  const rel = relative(root, absolute).replaceAll("\\", "/");
  return rel === ".." || rel.startsWith("../") ? null : absolute;
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

export function readKokoroProviderProfile(path = KOKORO_PROFILE_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateKokoroProviderProfile(profile) {
  const issues = [];
  const expect = (actual, expected, label) => {
    if (actual !== expected) issues.push(`${label} must equal ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
  };

  expect(profile?.schemaVersion, 1, "schemaVersion");
  expect(profile?.profileId, APPROVED_KOKORO.profileId, "profileId");
  expect(profile?.status, "approved", "status");
  expect(profile?.providerType, "local-open-weight", "providerType");
  expect(profile?.language, "zh", "language");
  expect(profile?.sampleRateHz, 24000, "sampleRateHz");

  expect(profile?.generationPolicy?.voiceMode, "bundled-profile", "generationPolicy.voiceMode");
  expect(profile?.generationPolicy?.referenceSpeakerAudio, false, "generationPolicy.referenceSpeakerAudio");
  expect(profile?.generationPolicy?.voiceCloning, false, "generationPolicy.voiceCloning");
  expect(profile?.generationPolicy?.networkRequiredAtSynthesis, false, "generationPolicy.networkRequiredAtSynthesis");

  expect(profile?.model?.repository, APPROVED_KOKORO.modelRepository, "model.repository");
  expect(profile?.model?.revision, APPROVED_KOKORO.modelRevision, "model.revision");
  if (!isCommitSha(profile?.model?.revision)) issues.push("model.revision must be a full 40-character commit SHA");
  expect(profile?.model?.license, "Apache-2.0", "model.license");
  expect(profile?.model?.config?.file, "config.json", "model.config.file");
  expect(profile?.model?.config?.sha256, APPROVED_KOKORO.configSha256, "model.config.sha256");
  expect(profile?.model?.config?.bytes, APPROVED_KOKORO.configBytes, "model.config.bytes");
  expect(profile?.model?.weights?.file, "kokoro-v1_1-zh.pth", "model.weights.file");
  expect(profile?.model?.weights?.sha256, APPROVED_KOKORO.weightsSha256, "model.weights.sha256");
  expect(profile?.model?.weights?.bytes, APPROVED_KOKORO.weightsBytes, "model.weights.bytes");
  expect(profile?.model?.voice?.id, APPROVED_KOKORO.voiceId, "model.voice.id");
  expect(profile?.model?.voice?.file, "voices/zf_001.pt", "model.voice.file");
  expect(profile?.model?.voice?.sha256, APPROVED_KOKORO.voiceSha256, "model.voice.sha256");

  for (const [label, value] of [
    ["model.config.sha256", profile?.model?.config?.sha256],
    ["model.weights.sha256", profile?.model?.weights?.sha256],
    ["model.voice.sha256", profile?.model?.voice?.sha256],
  ]) {
    if (!isSha256(value)) issues.push(`${label} must be lowercase SHA-256`);
  }

  expect(profile?.runtime?.inference?.repository, APPROVED_KOKORO.inferenceRepository, "runtime.inference.repository");
  expect(profile?.runtime?.inference?.commit, APPROVED_KOKORO.inferenceCommit, "runtime.inference.commit");
  if (!isCommitSha(profile?.runtime?.inference?.commit)) issues.push("runtime.inference.commit must be a full 40-character commit SHA");
  expect(profile?.runtime?.inference?.declaredVersion, "0.9.4", "runtime.inference.declaredVersion");
  expect(profile?.runtime?.inference?.license, "Apache-2.0", "runtime.inference.license");
  expect(profile?.runtime?.inference?.localAssetLoading?.modelConfigPath, true, "runtime.inference.localAssetLoading.modelConfigPath");
  expect(profile?.runtime?.inference?.localAssetLoading?.modelWeightsPath, true, "runtime.inference.localAssetLoading.modelWeightsPath");
  expect(profile?.runtime?.inference?.localAssetLoading?.voicePackPath, true, "runtime.inference.localAssetLoading.voicePackPath");
  expect(profile?.runtime?.inference?.localAssetLoading?.implicitNetworkRequired, false, "runtime.inference.localAssetLoading.implicitNetworkRequired");

  expect(profile?.runtime?.g2p?.repository, APPROVED_KOKORO.g2pRepository, "runtime.g2p.repository");
  expect(profile?.runtime?.g2p?.commit, APPROVED_KOKORO.g2pCommit, "runtime.g2p.commit");
  if (!isCommitSha(profile?.runtime?.g2p?.commit)) issues.push("runtime.g2p.commit must be a full 40-character commit SHA");
  expect(profile?.runtime?.g2p?.declaredVersion, "0.9.4", "runtime.g2p.declaredVersion");
  expect(profile?.runtime?.g2p?.languageExtra, "zh", "runtime.g2p.languageExtra");
  expect(profile?.runtime?.g2p?.license, "Apache-2.0", "runtime.g2p.license");

  expect(profile?.rights?.claimForGeneratedNarration, "permission", "rights.claimForGeneratedNarration");
  if (!Array.isArray(profile?.rights?.basis) || profile.rights.basis.length < 4 || profile.rights.basis.some((value) => typeof value !== "string" || value.trim() === "")) {
    issues.push("rights.basis must contain at least four non-empty evidence statements");
  }
  if (typeof profile?.rights?.boundary !== "string" || profile.rights.boundary.trim() === "") issues.push("rights.boundary must be non-empty");
  if (!sameStringArray(profile?.rights?.evidence, APPROVED_KOKORO.rightsEvidence)) {
    issues.push("rights.evidence must exactly match the approved pinned model/runtime evidence URLs");
  }

  expect(profile?.approval?.approved, true, "approval.approved");
  const approval = profile?.approval?.approvedByEvidence;
  if (!Array.isArray(approval) || approval.length !== 3 || approval.some((value) => typeof value !== "string" || value.trim() === "")) {
    issues.push("approval.approvedByEvidence must contain exactly three non-empty pinned asset audit records");
  } else {
    if (!approval[0].includes(APPROVED_KOKORO.configSha256) || !approval[0].includes(String(APPROVED_KOKORO.configBytes))) {
      issues.push("approval config audit must contain the exact config SHA-256 and byte size");
    }
    if (!approval[1].includes(APPROVED_KOKORO.weightsSha256) || !approval[1].includes(String(APPROVED_KOKORO.weightsBytes))) {
      issues.push("approval weights audit must contain the exact weights SHA-256 and byte size");
    }
    if (!approval[2].includes(APPROVED_KOKORO.voiceSha256)) {
      issues.push("approval voice audit must contain the exact voice SHA-256");
    }
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)].sort() };
}

export function validateKokoroLocalAssets(profile, assetsDir) {
  const issues = [];
  const checked = [];
  const specs = [
    ["config", profile.model.config],
    ["weights", profile.model.weights],
    ["voice", profile.model.voice],
  ];

  for (const [label, spec] of specs) {
    const path = safeAssetPath(assetsDir, spec.file);
    if (!path) {
      issues.push(`${label} asset path is unsafe: ${String(spec.file)}`);
      continue;
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      issues.push(`${label} asset missing: ${spec.file}`);
      continue;
    }
    const stat = statSync(path);
    const actualSha256 = sha256File(path);
    checked.push({ label, file: spec.file, bytes: stat.size, sha256: actualSha256 });
    if (actualSha256 !== spec.sha256) issues.push(`${label} SHA-256 mismatch: expected ${spec.sha256}, got ${actualSha256}`);
    if (Number.isInteger(spec.bytes) && stat.size !== spec.bytes) issues.push(`${label} byte-size mismatch: expected ${spec.bytes}, got ${stat.size}`);
  }

  const configPath = safeAssetPath(assetsDir, profile.model.config.file);
  if (configPath && existsSync(configPath) && statSync(configPath).isFile()) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.n_token !== 178) issues.push(`config n_token must be 178; got ${JSON.stringify(config.n_token)}`);
      if (config.multispeaker !== true) issues.push("config multispeaker must be true");
      if (config.style_dim !== 128) issues.push(`config style_dim must be 128; got ${JSON.stringify(config.style_dim)}`);
      if (config?.plbert?.max_position_embeddings !== 512) issues.push(`config plbert.max_position_embeddings must be 512; got ${JSON.stringify(config?.plbert?.max_position_embeddings)}`);
    } catch (error) {
      issues.push(`config.json cannot be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)].sort(), checked };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1]?.endsWith("kokoro-provider-profile.mjs")) {
  const profile = readKokoroProviderProfile();
  const profileValidation = validateKokoroProviderProfile(profile);
  const assetsDir = argValue("--assets-dir");
  const localValidation = assetsDir ? validateKokoroLocalAssets(profile, resolve(assetsDir)) : null;
  const report = {
    schemaVersion: 1,
    profileId: profile.profileId,
    approved: profile.approval?.approved === true,
    profileValid: profileValidation.valid,
    profileIssues: profileValidation.issues,
    localAssets: localValidation ? {
      checked: true,
      valid: localValidation.valid,
      issues: localValidation.issues,
      assets: localValidation.checked,
    } : { checked: false },
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--check") && (!profileValidation.valid || (localValidation && !localValidation.valid))) process.exitCode = 1;
}
