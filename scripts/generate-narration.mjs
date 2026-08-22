#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  KOKORO_CHANNELS,
  KOKORO_MP3_BITRATE_KBPS,
  KOKORO_SAMPLE_RATE_HZ,
  buildKokoroNarrationReceipt,
  buildNarrationBatchId,
  readApprovedProviderBinding,
  readRuntimeCheckoutSnapshot,
  receiptPathForBatch,
  sha256AudioBuffer,
  validateApprovedGenerationSet,
  validateGeneratedMp3,
  validateKokoroRuntimeCheckouts,
} from "./kokoro-generation-contract.mjs";
import {
  readKokoroProviderProfile,
  validateKokoroLocalAssets,
  validateKokoroProviderProfile,
} from "./kokoro-provider-profile.mjs";
import {
  KOKORO_RUNTIME_TORCH_VERSION,
  readKokoroRuntimeEnvironmentBinding,
  validateKokoroRuntimeHost,
} from "./kokoro-runtime-environment.mjs";
import { buildNarrationGenerationSet } from "./narration-generation-set.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { validateNarrationReceipt } from "./narration-receipt.mjs";
import { repoRoot } from "./story-model.mjs";

const ENGINE_SCRIPT = join(repoRoot, "scripts/kokoro-synthesize.py");
const RUNTIME_SMOKE_SCRIPT = join(repoRoot, "scripts/kokoro-runtime-smoke.py");
const WORK_ROOT = join(repoRoot, ".narration-work");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredArg(name) {
  const value = argValue(name);
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

function safeRepositoryPath(root, value) {
  const absolute = resolve(root, value);
  const rel = relative(root, absolute).replaceAll("\\", "/");
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("/")) {
    throw new Error(`Path escapes repository root: ${value}`);
  }
  return absolute;
}

function commandReport(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${label} is unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function commandJsonReport(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.error) throw new Error(`${label} is unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  try {
    return JSON.parse((result.stdout ?? "").trim());
  } catch (error) {
    throw new Error(`${label} did not return machine-readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function inspectFfmpeg(ffmpeg) {
  const versionOutput = commandReport(ffmpeg, ["-version"], "ffmpeg");
  const encoderOutput = commandReport(ffmpeg, ["-hide_banner", "-encoders"], "ffmpeg encoder inventory");
  if (!/\blibmp3lame\b/.test(encoderOutput)) {
    throw new Error("ffmpeg must expose the libmp3lame encoder");
  }
  return {
    version: versionOutput.split(/\r?\n/, 1)[0],
  };
}

function inspectPython(python) {
  const output = commandReport(python, ["--version"], "Python");
  const match = output.match(/Python\s+([^\s]+)/);
  if (!match) throw new Error(`Unable to parse Python version from: ${output}`);
  return { version: match[1] };
}

function validateRuntimeSmoke(report, kokoroDir, misakiDir) {
  const problems = [];
  if (report?.schemaVersion !== 1) problems.push("runtime smoke schemaVersion must be 1");
  if (report?.runtime !== "kokoro-mandarin-minimal-v1") problems.push("runtime smoke identity drifted");
  const host = validateKokoroRuntimeHost({
    platform: report?.platform,
    arch: report?.arch,
    pythonVersion: report?.pythonVersion,
    torchVersion: report?.versions?.torch,
    device: report?.device,
  });
  problems.push(...host.issues);
  if (report?.versions?.torch !== KOKORO_RUNTIME_TORCH_VERSION) problems.push(`runtime smoke torch must be ${KOKORO_RUNTIME_TORCH_VERSION}`);
  if (!Array.isArray(report?.bannedModulesLoaded) || report.bannedModulesLoaded.length !== 0) problems.push("runtime smoke loaded banned modules");
  if (!Number.isInteger(report?.longSampleChunks) || report.longSampleChunks < 2) problems.push("runtime smoke did not exercise lossless long-text splitting");

  for (const [label, modulePath, checkout] of [
    ["kokoro", report?.kokoroModulePath, kokoroDir],
    ["misaki", report?.misakiModulePath, misakiDir],
  ]) {
    if (typeof modulePath !== "string") {
      problems.push(`${label} smoke module path is missing`);
      continue;
    }
    const rel = relative(resolve(checkout), resolve(modulePath)).replaceAll("\\", "/");
    if (rel === ".." || rel.startsWith("../") || rel.startsWith("/")) problems.push(`${label} smoke module resolved outside pinned checkout`);
  }

  return { valid: problems.length === 0, problems: [...new Set(problems)].sort() };
}

function validateEngineReport(report, generationSet, expectedDevice, kokoroDir, misakiDir) {
  const problems = [];
  if (report?.schemaVersion !== 1) problems.push("engine report schemaVersion must be 1");
  if (report?.engine !== "kokoro-local-waveform-v2") problems.push("engine report identity is not kokoro-local-waveform-v2");
  if (report?.g2p !== "misaki.ZHG2P/1.1") problems.push("engine G2P identity is not misaki.ZHG2P/1.1");
  if (report?.sampleRateHz !== KOKORO_SAMPLE_RATE_HZ) problems.push(`engine sample rate must be ${KOKORO_SAMPLE_RATE_HZ}`);
  if (report?.device !== expectedDevice) problems.push(`engine device must equal ${expectedDevice}`);
  if (report?.count !== generationSet.count) problems.push("engine output count does not match narration input set");
  if (!Array.isArray(report?.items) || report.items.length !== generationSet.count) problems.push("engine report items do not exactly cover narration input set");

  const host = validateKokoroRuntimeHost({
    platform: report?.platform,
    arch: report?.arch,
    pythonVersion: report?.pythonVersion,
    torchVersion: report?.torchVersion,
    device: report?.device,
  });
  problems.push(...host.issues);

  for (const [label, modulePath, checkout] of [
    ["kokoro", report?.kokoroModulePath, kokoroDir],
    ["misaki", report?.misakiModulePath, misakiDir],
  ]) {
    if (typeof modulePath !== "string") {
      problems.push(`${label} module path is missing from engine report`);
      continue;
    }
    const rel = relative(resolve(checkout), resolve(modulePath)).replaceAll("\\", "/");
    if (rel === ".." || rel.startsWith("../") || rel.startsWith("/")) problems.push(`${label} module resolved outside pinned checkout`);
  }

  if (Array.isArray(report?.items)) {
    const expectedKeys = generationSet.entries.map((entry) => entry.key).sort();
    const actualKeys = report.items.map((item) => item?.key).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) problems.push("engine report keys do not exactly match narration input keys");
    for (const item of report.items) {
      if (!Number.isInteger(item?.samples) || item.samples <= 0) problems.push(`${String(item?.key)}: engine sample count is invalid`);
      if (typeof item?.durationSeconds !== "number" || !(item.durationSeconds > 0)) problems.push(`${String(item?.key)}: engine duration is invalid`);
      if (!Number.isInteger(item?.phonemeChunks) || item.phonemeChunks < 1) problems.push(`${String(item?.key)}: engine phoneme chunk count is invalid`);
      if (!Number.isInteger(item?.maxPhonemeChunkLength) || item.maxPhonemeChunkLength < 1 || item.maxPhonemeChunkLength > 510) {
        problems.push(`${String(item?.key)}: engine phoneme chunk length escaped the 1..510 bound`);
      }
      if (typeof item?.wavPath !== "string" || !existsSync(item.wavPath)) problems.push(`${String(item?.key)}: staged WAV is missing`);
    }
  }

  return { valid: problems.length === 0, problems: [...new Set(problems)].sort() };
}

function encodeMp3(ffmpeg, wavPath, mp3Path) {
  mkdirSync(dirname(mp3Path), { recursive: true });
  const result = spawnSync(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", wavPath,
    "-vn",
    "-ac", String(KOKORO_CHANNELS),
    "-ar", String(KOKORO_SAMPLE_RATE_HZ),
    "-c:a", "libmp3lame",
    "-b:a", `${KOKORO_MP3_BITRATE_KBPS}k`,
    mp3Path,
  ], { encoding: "utf8" });
  if (result.error) throw new Error(`ffmpeg encode failed to start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg encode failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
}

export function commitGeneratedBatch({ outputs, receipt, receiptPath, workDir, root = repoRoot }) {
  const receiptValidation = validateNarrationReceipt(receipt);
  if (!receiptValidation.valid) throw new Error(`Refusing to commit invalid receipt:\n${receiptValidation.problems.join("\n")}`);

  const receiptTarget = safeRepositoryPath(root, receiptPath);
  if (existsSync(receiptTarget)) throw new Error(`Receipt already exists: ${receiptPath}`);

  const backupRoot = join(workDir, "backup");
  const movedBackups = [];
  const installed = [];
  let receiptInstalled = false;
  const receiptTemp = `${receiptTarget}.tmp-${process.pid}`;

  for (const output of outputs) {
    if (!existsSync(output.stagedPath)) throw new Error(`${output.key}: staged MP3 is missing before release commit`);
    safeRepositoryPath(root, output.file);
  }

  try {
    for (const output of outputs) {
      const target = safeRepositoryPath(root, output.file);
      mkdirSync(dirname(target), { recursive: true });
      if (existsSync(target)) {
        const backup = join(backupRoot, output.file);
        mkdirSync(dirname(backup), { recursive: true });
        renameSync(target, backup);
        movedBackups.push({ target, backup });
      }
    }

    for (const output of outputs) {
      const target = safeRepositoryPath(root, output.file);
      renameSync(output.stagedPath, target);
      installed.push(target);
    }

    mkdirSync(dirname(receiptTarget), { recursive: true });
    writeFileSync(receiptTemp, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
    renameSync(receiptTemp, receiptTarget);
    receiptInstalled = true;
  } catch (error) {
    const rollbackProblems = [];
    try {
      if (existsSync(receiptTemp)) rmSync(receiptTemp, { force: true });
      if (receiptInstalled && existsSync(receiptTarget)) rmSync(receiptTarget, { force: true });
    } catch (rollbackError) {
      rollbackProblems.push(`receipt rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }

    for (const target of [...installed].reverse()) {
      try {
        if (existsSync(target)) rmSync(target, { force: true });
      } catch (rollbackError) {
        rollbackProblems.push(`new audio rollback failed for ${target}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    for (const { target, backup } of [...movedBackups].reverse()) {
      try {
        if (existsSync(backup)) renameSync(backup, target);
      } catch (rollbackError) {
        rollbackProblems.push(`old audio restore failed for ${target}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }

    const original = error instanceof Error ? error.message : String(error);
    const suffix = rollbackProblems.length > 0 ? `\nRollback problems:\n${rollbackProblems.join("\n")}` : "";
    throw new Error(`Narration release commit failed: ${original}${suffix}`);
  }

  rmSync(backupRoot, { recursive: true, force: true });
  return { receiptPath, installed: outputs.length };
}

function parseOptions() {
  const story = argValue("--story");
  const all = process.argv.includes("--all");
  if (Boolean(story) === Boolean(all)) throw new Error("Choose exactly one narration scope: --story <id> or --all");

  const device = argValue("--device") ?? "cpu";
  if (device !== "cpu") throw new Error("The approved locked narration runtime is CPU-only; --device must be cpu");

  return {
    story,
    all,
    assetsDir: resolve(requiredArg("--assets-dir")),
    kokoroSrcDir: resolve(requiredArg("--kokoro-src-dir")),
    misakiSrcDir: resolve(requiredArg("--misaki-src-dir")),
    python: argValue("--python") ?? (process.platform === "win32" ? "python" : "python3"),
    ffmpeg: argValue("--ffmpeg") ?? "ffmpeg",
    device,
    dryRun: process.argv.includes("--dry-run"),
    replace: process.argv.includes("--replace"),
    keepWork: process.argv.includes("--keep-work"),
  };
}

async function main() {
  const options = parseOptions();
  const profile = readKokoroProviderProfile();
  const profileValidation = validateKokoroProviderProfile(profile);
  if (!profileValidation.valid) throw new Error(`Kokoro provider profile is not approved:\n${profileValidation.issues.join("\n")}`);

  const runtimeEnvironment = readKokoroRuntimeEnvironmentBinding();
  const localAssets = validateKokoroLocalAssets(profile, options.assetsDir);
  if (!localAssets.valid) throw new Error(`Pinned Kokoro local assets are invalid:\n${localAssets.issues.join("\n")}`);

  const runtimeCheckouts = {
    kokoro: readRuntimeCheckoutSnapshot(options.kokoroSrcDir),
    misaki: readRuntimeCheckoutSnapshot(options.misakiSrcDir),
  };
  const runtimeValidation = validateKokoroRuntimeCheckouts(runtimeCheckouts);
  if (!runtimeValidation.valid) throw new Error(`Pinned Kokoro runtime checkout is invalid:\n${runtimeValidation.problems.join("\n")}`);

  const generationSet = buildNarrationGenerationSet({ story: options.story });
  const generationValidation = validateApprovedGenerationSet(generationSet);
  if (!generationValidation.valid) throw new Error(`Narration generation input set is not approved:\n${generationValidation.problems.join("\n")}`);

  const plan = buildNarrationPlan({ story: options.story });
  const currentItems = plan.items.filter((item) => item.status === "current");
  if (currentItems.length > 0 && !options.replace) {
    throw new Error(`Scope contains ${currentItems.length} current narration assets. Pass --replace only after intentional review to regenerate the whole scope.`);
  }

  const providerBinding = readApprovedProviderBinding();
  const createdAt = new Date();
  const batchId = buildNarrationBatchId(createdAt, generationSet.inputDigestSha256, generationSet.scope);
  const receiptPath = receiptPathForBatch(batchId);
  const summary = {
    schemaVersion: 1,
    mode: options.dryRun ? "dry-run" : "generate",
    scope: generationSet.scope,
    inputItemCount: generationSet.count,
    inputDigestSha256: generationSet.inputDigestSha256,
    providerProfileId: providerBinding.profile.profileId,
    providerProfileSha256: providerBinding.sha256,
    runtimeEnvironment,
    modelRevision: profile.model.revision,
    voice: profile.model.voice.id,
    currentInScope: currentItems.length,
    replace: options.replace,
    batchId,
    receiptPath,
    localAssets: localAssets.checked,
    runtimeCheckouts,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (options.dryRun) return;

  const python = inspectPython(options.python);
  const hostPreflight = validateKokoroRuntimeHost({
    platform: process.platform,
    arch: process.arch,
    pythonVersion: python.version,
    device: options.device,
  });
  if (!hostPreflight.valid) throw new Error(`Narration host preflight failed:\n${hostPreflight.issues.join("\n")}`);

  const offlineEnv = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
  };
  const runtimeSmoke = commandJsonReport(options.python, [
    RUNTIME_SMOKE_SCRIPT,
    "--kokoro-src-dir", options.kokoroSrcDir,
    "--misaki-src-dir", options.misakiSrcDir,
  ], "Kokoro locked runtime smoke", { env: offlineEnv });
  const smokeValidation = validateRuntimeSmoke(runtimeSmoke, options.kokoroSrcDir, options.misakiSrcDir);
  if (!smokeValidation.valid) throw new Error(`Kokoro locked runtime smoke is invalid:\n${smokeValidation.problems.join("\n")}`);

  const ffmpeg = inspectFfmpeg(options.ffmpeg);
  const workDir = join(WORK_ROOT, batchId);
  if (existsSync(workDir)) throw new Error(`Narration work directory already exists: ${relative(repoRoot, workDir)}`);
  mkdirSync(workDir, { recursive: true });

  try {
    const wavRoot = join(workDir, "wav");
    const mp3Root = join(workDir, "mp3");
    const manifestPath = join(workDir, "manifest.json");
    const manifest = {
      schemaVersion: 1,
      batchId,
      inputItemCount: generationSet.count,
      inputDigestSha256: generationSet.inputDigestSha256,
      entries: generationSet.entries.map((entry) => ({
        key: entry.key,
        text: entry.text,
        textSha256: entry.textSha256,
        file: entry.file,
        wavPath: join(wavRoot, `${entry.key}.wav`),
      })),
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

    const engineStdout = execFileSync(options.python, [
      ENGINE_SCRIPT,
      "--manifest", manifestPath,
      "--assets-dir", options.assetsDir,
      "--kokoro-src-dir", options.kokoroSrcDir,
      "--misaki-src-dir", options.misakiSrcDir,
      "--device", options.device,
    ], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      env: offlineEnv,
      stdio: ["ignore", "pipe", "inherit"],
    }).trim();
    const engineReport = JSON.parse(engineStdout);
    const engineValidation = validateEngineReport(engineReport, generationSet, options.device, options.kokoroSrcDir, options.misakiSrcDir);
    if (!engineValidation.valid) throw new Error(`Kokoro waveform engine report is invalid:\n${engineValidation.problems.join("\n")}`);
    writeFileSync(join(workDir, "engine-report.json"), `${JSON.stringify(engineReport, null, 2)}\n`, { flag: "wx" });
    writeFileSync(join(workDir, "runtime-smoke.json"), `${JSON.stringify(runtimeSmoke, null, 2)}\n`, { flag: "wx" });

    const engineByKey = new Map(engineReport.items.map((item) => [item.key, item]));
    const outputs = [];
    for (const entry of generationSet.entries) {
      const engineItem = engineByKey.get(entry.key);
      if (!engineItem) throw new Error(`${entry.key}: engine output disappeared after validation`);
      const stagedPath = join(mp3Root, `${entry.key}.mp3`);
      encodeMp3(options.ffmpeg, engineItem.wavPath, stagedPath);
      const audio = readFileSync(stagedPath);
      const mp3Validation = validateGeneratedMp3(audio);
      if (!mp3Validation.valid) throw new Error(`${entry.key}: generated MP3 is invalid:\n${mp3Validation.problems.join("\n")}`);
      outputs.push({
        key: entry.key,
        file: entry.file,
        stagedPath,
        bytes: audio.length,
        audioSha256: sha256AudioBuffer(audio),
      });
    }

    const receipt = buildKokoroNarrationReceipt({
      generationSet,
      outputs,
      createdAt,
      runtime: {
        platform: engineReport.platform,
        arch: engineReport.arch,
        pythonVersion: engineReport.pythonVersion ?? python.version,
        torchVersion: engineReport.torchVersion,
        device: engineReport.device,
      },
      runtimeEnvironment,
      encoder: ffmpeg,
      providerBinding,
    });
    writeFileSync(join(workDir, "receipt-preview.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });

    const committed = commitGeneratedBatch({ outputs, receipt, receiptPath, workDir });
    console.log(JSON.stringify({
      schemaVersion: 1,
      generated: committed.installed,
      receiptPath: committed.receiptPath,
      runtimeEnvironmentId: runtimeEnvironment.id,
      runtimeLockSha256: runtimeEnvironment.lock.sha256,
      narrationStateUpdated: false,
      nextDryRun: `npm run narration:import -- --receipt ${committed.receiptPath}`,
      nextWrite: `npm run narration:import -- --receipt ${committed.receiptPath} --write${options.replace ? " --replace" : ""}`,
    }, null, 2));
  } finally {
    const backupRoot = join(workDir, "backup");
    rmSync(backupRoot, { recursive: true, force: true });
    if (!options.keepWork) rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
