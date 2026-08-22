import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

export const KOKORO_RUNTIME_ENVIRONMENT_ID = "kokoro-mandarin-python312-linux-x64-cpu-v1";
export const KOKORO_RUNTIME_PROJECT_PATH = "scripts/narration-runtime/pyproject.toml";
export const KOKORO_RUNTIME_LOCK_PATH = "scripts/narration-runtime/uv.lock";
export const KOKORO_RUNTIME_PROJECT_SHA256 = "b5ae9f93bb07807e73cf497a5815d8526fedefb1cab4c5804d687e6b9ab1d6d0";
export const KOKORO_RUNTIME_LOCK_SHA256 = "75dac0288870fd549098dc2ae7a7e3433cbf681433e81a00e15689661accdd9f";
export const KOKORO_RUNTIME_UV_VERSION = "0.10.0";
export const KOKORO_RUNTIME_PYTHON_SERIES = "3.12";
export const KOKORO_RUNTIME_TORCH_VERSION = "2.6.0+cpu";
export const KOKORO_RUNTIME_PLATFORM = "linux";
export const KOKORO_RUNTIME_ARCH = "x64";

const REQUIRED_LOCKED_PACKAGES = Object.freeze({
  addict: "2.4.0",
  attrs: "25.1.0",
  cn2an: "0.5.24",
  "huggingface-hub": "0.28.1",
  jieba: "0.42.1",
  loguru: "0.7.3",
  numpy: "1.26.4",
  "ordered-set": "4.1.0",
  pypinyin: "0.55.0",
  "pypinyin-dict": "0.9.0",
  regex: "2024.11.6",
  transformers: "4.48.3",
});

const BANNED_LOCKED_PACKAGES = Object.freeze([
  "spacy",
  "spacy-curated-transformers",
  "espeakng-loader",
  "phonemizer-fork",
  "num2words",
  "nvidia-cublas-cu12",
  "nvidia-cuda-runtime-cu12",
  "nvidia-cudnn-cu12",
  "nvidia-nccl-cu12",
  "triton",
]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function packageBlocks(lockText) {
  return lockText.split("[[package]]").slice(1);
}

function lockedVersions(lockText, name) {
  const versions = [];
  for (const block of packageBlocks(lockText)) {
    const packageName = block.match(/\n?name = "([^"]+)"/m)?.[1];
    if (packageName !== name) continue;
    const version = block.match(/\nversion = "([^"]+)"/m)?.[1];
    if (version) versions.push(version);
  }
  return versions;
}

function hasLockedPackage(lockText, name) {
  return lockedVersions(lockText, name).length > 0;
}

export function validateKokoroRuntimeEnvironmentBytes(projectBytes, lockBytes) {
  const issues = [];
  if (!Buffer.isBuffer(projectBytes)) issues.push("runtime project must be read as bytes");
  if (!Buffer.isBuffer(lockBytes)) issues.push("runtime lock must be read as bytes");
  if (issues.length > 0) return { valid: false, issues };

  const projectSha256 = sha256(projectBytes);
  const lockSha256 = sha256(lockBytes);
  if (projectSha256 !== KOKORO_RUNTIME_PROJECT_SHA256) {
    issues.push(`runtime project SHA-256 drifted: ${projectSha256}`);
  }
  if (lockSha256 !== KOKORO_RUNTIME_LOCK_SHA256) {
    issues.push(`runtime lock SHA-256 drifted: ${lockSha256}`);
  }

  const projectText = projectBytes.toString("utf8");
  const lockText = lockBytes.toString("utf8");
  if (!projectText.includes('requires-python = ">=3.12,<3.13"')) issues.push("runtime project no longer pins Python 3.12");
  if (!projectText.includes('url = "https://download.pytorch.org/whl/cpu"')) issues.push("runtime project lost the explicit PyTorch CPU index");
  if (!lockText.includes('requires-python = "==3.12.*"')) issues.push("runtime lock no longer resolves only Python 3.12");
  if (!lockText.includes('registry = "https://download.pytorch.org/whl/cpu"')) issues.push("runtime lock lost the PyTorch CPU registry");
  if (!lockedVersions(lockText, "torch").includes(KOKORO_RUNTIME_TORCH_VERSION)) {
    issues.push(`runtime lock must contain torch ${KOKORO_RUNTIME_TORCH_VERSION}`);
  }

  for (const [name, version] of Object.entries(REQUIRED_LOCKED_PACKAGES)) {
    if (!lockedVersions(lockText, name).includes(version)) {
      issues.push(`runtime lock must contain ${name} ${version}`);
    }
  }
  for (const name of BANNED_LOCKED_PACKAGES) {
    if (hasLockedPackage(lockText, name)) issues.push(`runtime lock contains banned dependency ${name}`);
  }

  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)].sort(),
    projectSha256,
    lockSha256,
  };
}

export function readKokoroRuntimeEnvironmentBinding(options = {}) {
  const root = options.root ?? repoRoot;
  const projectPath = resolve(root, KOKORO_RUNTIME_PROJECT_PATH);
  const lockPath = resolve(root, KOKORO_RUNTIME_LOCK_PATH);
  const projectBytes = readFileSync(projectPath);
  const lockBytes = readFileSync(lockPath);
  const validation = validateKokoroRuntimeEnvironmentBytes(projectBytes, lockBytes);
  if (!validation.valid) {
    throw new Error(`Kokoro runtime environment is not approved:\n${validation.issues.join("\n")}`);
  }
  return {
    id: KOKORO_RUNTIME_ENVIRONMENT_ID,
    target: {
      platform: KOKORO_RUNTIME_PLATFORM,
      arch: KOKORO_RUNTIME_ARCH,
      python: KOKORO_RUNTIME_PYTHON_SERIES,
      device: "cpu",
    },
    resolver: { name: "uv", version: KOKORO_RUNTIME_UV_VERSION },
    project: { path: KOKORO_RUNTIME_PROJECT_PATH, sha256: validation.projectSha256 },
    lock: { path: KOKORO_RUNTIME_LOCK_PATH, sha256: validation.lockSha256 },
  };
}

export function validateKokoroRuntimeHost({ platform, arch, pythonVersion, device, torchVersion = null }) {
  const issues = [];
  if (platform !== KOKORO_RUNTIME_PLATFORM) issues.push(`runtime host platform must be ${KOKORO_RUNTIME_PLATFORM}`);
  if (arch !== KOKORO_RUNTIME_ARCH) issues.push(`runtime host architecture must be ${KOKORO_RUNTIME_ARCH}`);
  if (typeof pythonVersion !== "string" || !pythonVersion.startsWith(`${KOKORO_RUNTIME_PYTHON_SERIES}.`)) {
    issues.push(`runtime Python must be ${KOKORO_RUNTIME_PYTHON_SERIES}.x`);
  }
  if (device !== "cpu") issues.push("approved narration runtime device must be cpu");
  if (torchVersion !== null && torchVersion !== KOKORO_RUNTIME_TORCH_VERSION) {
    issues.push(`runtime torch must be ${KOKORO_RUNTIME_TORCH_VERSION}`);
  }
  return { valid: issues.length === 0, issues };
}

if (process.argv[1]?.endsWith("kokoro-runtime-environment.mjs")) {
  try {
    const binding = readKokoroRuntimeEnvironmentBinding();
    console.log(JSON.stringify({ schemaVersion: 1, valid: true, binding }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
