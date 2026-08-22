import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APPROVED_KOKORO,
} from "./kokoro-provider-profile.mjs";
import {
  KOKORO_MP3_MAX_BYTES,
  buildKokoroNarrationReceipt,
  readApprovedProviderBinding,
  sha256AudioBuffer,
  validateApprovedGenerationSet,
  validateGeneratedMp3,
  validateKokoroRuntimeCheckouts,
} from "./kokoro-generation-contract.mjs";
import {
  KOKORO_RUNTIME_ENVIRONMENT_ID,
  KOKORO_RUNTIME_LOCK_SHA256,
  KOKORO_RUNTIME_PROJECT_SHA256,
  KOKORO_RUNTIME_TORCH_VERSION,
  readKokoroRuntimeEnvironmentBinding,
} from "./kokoro-runtime-environment.mjs";
import { buildNarrationGenerationSet } from "./narration-generation-set.mjs";
import { buildNarrationLineageEntries } from "./narration-lineage.mjs";
import { buildNarrationProvenanceEntries } from "./narration-rights.mjs";
import { validateNarrationReceipt } from "./narration-receipt.mjs";
import { repoRoot } from "./story-model.mjs";

const AUDIO_SHA = "d".repeat(64);
const RECEIPT_SHA = "e".repeat(64);
const APPROVED_RUNTIME = Object.freeze({
  platform: "linux",
  arch: "x64",
  pythonVersion: "3.12.0",
  torchVersion: KOKORO_RUNTIME_TORCH_VERSION,
  device: "cpu",
});

function buildStoryReceiptFixture() {
  const full = buildNarrationGenerationSet();
  const storyId = full.entries[0].storyId;
  const generationSet = buildNarrationGenerationSet({ story: storyId });
  const outputs = generationSet.entries.map((entry) => ({
    key: entry.key,
    file: entry.file,
    audioSha256: AUDIO_SHA,
    bytes: 4096,
  }));
  const providerBinding = readApprovedProviderBinding();
  const runtimeEnvironment = readKokoroRuntimeEnvironmentBinding();
  const receipt = buildKokoroNarrationReceipt({
    generationSet,
    outputs,
    createdAt: new Date("2026-08-22T08:30:00.000Z"),
    runtime: APPROVED_RUNTIME,
    runtimeEnvironment,
    encoder: { version: "ffmpeg version test" },
    providerBinding,
  });
  return { generationSet, providerBinding, receipt, runtimeEnvironment };
}

function currentNarrationFixture() {
  const { generationSet, providerBinding, receipt, runtimeEnvironment } = buildStoryReceiptFixture();
  const entry = generationSet.entries[0];
  const receiptPath = `content/evidence/narration/receipts/${receipt.batchId}.json`;
  const state = {
    provider: receipt.provider.name,
    voice: receipt.provider.voice,
    language: receipt.provider.language,
    generator: receipt.provider.generator,
    providerProfileId: receipt.provider.profile.id,
    providerProfilePath: receipt.provider.profile.evidence,
    providerProfileSha256: receipt.provider.profile.sha256,
    runtimeEnvironment: structuredClone(receipt.execution.runtime.environment),
    textSha256: entry.textSha256,
    audioSha256: AUDIO_SHA,
    generatedAt: receipt.createdAt,
    batchId: receipt.batchId,
    inputItemCount: receipt.inputItemCount,
    inputDigestSha256: receipt.inputDigestSha256,
    receiptPath,
    receiptSha256: RECEIPT_SHA,
    rightsClaim: receipt.rights.claim,
    rightsEvidence: [...receipt.rights.evidence],
  };
  const plan = {
    items: [{
      key: entry.key,
      output: entry.file,
      textSha256: entry.textSha256,
      audioSha256: AUDIO_SHA,
      status: "current",
      provenance: state,
    }],
  };
  const asset = {
    id: `audio:${entry.file}`,
    category: "narration",
    path: entry.file,
    fingerprintSha256: AUDIO_SHA,
  };
  const readReceipt = () => ({ receipt, receiptSha256: RECEIPT_SHA, receiptPath });
  const readProviderProfile = () => ({
    path: providerBinding.path,
    sha256: providerBinding.sha256,
    profile: providerBinding.profile,
  });
  const readRuntimeEnvironment = () => structuredClone(runtimeEnvironment);
  return { asset, plan, providerBinding, readProviderProfile, readReceipt, readRuntimeEnvironment, receipt, runtimeEnvironment };
}

test("approved full narration input set is runtime-recomputed and fail-closed", () => {
  const set = buildNarrationGenerationSet();
  const good = validateApprovedGenerationSet(set);
  assert.equal(good.valid, true, good.problems.join("; "));
  assert.equal(set.count, 216);
  assert.equal(set.inputDigestSha256, "a17d000ac3d82fa53576fc83f0e4653e00aba6573c1209557d3f9c2925262828");

  const changed = structuredClone(set);
  changed.entries[0].textSha256 = "0".repeat(64);
  const bad = validateApprovedGenerationSet(changed);
  assert.equal(bad.valid, false);
  assert.ok(bad.problems.some((problem) => problem.includes("digest does not match its entries")));
});

test("approved story generation is exactly a nine-item subset of the pinned full set", () => {
  const full = buildNarrationGenerationSet();
  const set = buildNarrationGenerationSet({ story: full.entries[0].storyId });
  const result = validateApprovedGenerationSet(set);
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(set.count, 9);

  const changed = structuredClone(set);
  changed.entries[0].file = "public/audio/not-approved/p0.mp3";
  changed.inputDigestSha256 = "0".repeat(64);
  const bad = validateApprovedGenerationSet(changed);
  assert.equal(bad.valid, false);
});

test("runtime source checkout identity rejects commit, repository, or dirty-tree drift", () => {
  const good = validateKokoroRuntimeCheckouts({
    kokoro: { repository: APPROVED_KOKORO.inferenceRepository, head: APPROVED_KOKORO.inferenceCommit, clean: true },
    misaki: { repository: APPROVED_KOKORO.g2pRepository, head: APPROVED_KOKORO.g2pCommit, clean: true },
  });
  assert.equal(good.valid, true, good.problems.join("; "));

  for (const mutate of [
    (value) => { value.kokoro.head = "0".repeat(40); },
    (value) => { value.kokoro.repository = "other/kokoro"; },
    (value) => { value.misaki.clean = false; },
  ]) {
    const value = {
      kokoro: { repository: APPROVED_KOKORO.inferenceRepository, head: APPROVED_KOKORO.inferenceCommit, clean: true },
      misaki: { repository: APPROVED_KOKORO.g2pRepository, head: APPROVED_KOKORO.g2pCommit, clean: true },
    };
    mutate(value);
    assert.equal(validateKokoroRuntimeCheckouts(value).valid, false);
  }
});

test("approved Python runtime binding is exact and dependency-lock backed", () => {
  const binding = readKokoroRuntimeEnvironmentBinding();
  assert.equal(binding.id, KOKORO_RUNTIME_ENVIRONMENT_ID);
  assert.equal(binding.target.platform, "linux");
  assert.equal(binding.target.arch, "x64");
  assert.equal(binding.target.python, "3.12");
  assert.equal(binding.target.device, "cpu");
  assert.equal(binding.project.sha256, KOKORO_RUNTIME_PROJECT_SHA256);
  assert.equal(binding.lock.sha256, KOKORO_RUNTIME_LOCK_SHA256);
});

test("generated MP3 gate enforces payload identity and release byte budget", () => {
  const valid = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(4096, 1)]);
  assert.deepEqual(validateGeneratedMp3(valid), { valid: true, problems: [] });
  assert.equal(validateGeneratedMp3(Buffer.from("ID3", "ascii")).valid, false);
  assert.equal(validateGeneratedMp3(Buffer.alloc(4096, 1)).valid, false);
  const oversized = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(KOKORO_MP3_MAX_BYTES + 1, 1)]);
  assert.equal(validateGeneratedMp3(oversized).valid, false);
});

test("Kokoro receipt binds exact approved provider, runtime lock, and generation set", () => {
  const { generationSet, providerBinding, receipt, runtimeEnvironment } = buildStoryReceiptFixture();
  const validation = validateNarrationReceipt(receipt);
  assert.equal(validation.valid, true, validation.problems.join("; "));
  assert.equal(receipt.inputItemCount, 9);
  assert.equal(receipt.inputDigestSha256, generationSet.inputDigestSha256);
  assert.equal(receipt.provider.name, "kokoro-local");
  assert.equal(receipt.provider.generator, "kokoro-local-adapter-v2");
  assert.equal(receipt.provider.voice, "zf_001");
  assert.equal(receipt.provider.profile.id, "kokoro-v1.1-zh-zf001");
  assert.equal(receipt.provider.profile.evidence, providerBinding.path);
  assert.equal(receipt.provider.profile.sha256, providerBinding.sha256);
  assert.equal(receipt.execution.runtime.environment.id, runtimeEnvironment.id);
  assert.equal(receipt.execution.runtime.environment.lock.sha256, KOKORO_RUNTIME_LOCK_SHA256);
  assert.equal(receipt.execution.runtime.torchVersion, KOKORO_RUNTIME_TORCH_VERSION);
  assert.equal(receipt.rights.claim, "permission");
  assert.deepEqual(receipt.rights.evidence, [providerBinding.path]);

  const changed = structuredClone(receipt);
  changed.execution.runtime.environment.lock.sha256 = "0".repeat(64);
  const changedValidation = validateNarrationReceipt(changed);
  assert.equal(changedValidation.valid, false);
  assert.ok(changedValidation.problems.some((problem) => problem.includes("runtime lock binding drifted")));
});

test("staged MP3 mutation after initial hashing prevents receipt construction", () => {
  const root = mkdtempSync(join(tmpdir(), "kokoro-staged-mutation-"));
  try {
    const full = buildNarrationGenerationSet();
    const generationSet = buildNarrationGenerationSet({ story: full.entries[0].storyId });
    const initial = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(4096, 1)]);
    const changed = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(4096, 2)]);
    const stagedPath = join(root, "p0.mp3");
    writeFileSync(stagedPath, initial);

    const outputs = generationSet.entries.map((entry, index) => index === 0 ? {
      key: entry.key,
      file: entry.file,
      audioSha256: sha256AudioBuffer(initial),
      bytes: initial.length,
      stagedPath,
    } : {
      key: entry.key,
      file: entry.file,
      audioSha256: AUDIO_SHA,
      bytes: 4096,
    });

    writeFileSync(stagedPath, changed);
    assert.throws(() => buildKokoroNarrationReceipt({
      generationSet,
      outputs,
      createdAt: new Date("2026-08-22T08:31:00.000Z"),
      runtime: APPROVED_RUNTIME,
      encoder: { version: "ffmpeg version test" },
      providerBinding: readApprovedProviderBinding(),
    }), /staged MP3 SHA-256 changed after encoding/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provider profile byte drift revokes Kokoro narration rights provenance", () => {
  const fixture = currentNarrationFixture();
  const good = buildNarrationProvenanceEntries([fixture.asset], fixture.plan, {
    readReceipt: fixture.readReceipt,
    readProviderProfile: fixture.readProviderProfile,
    readRuntimeEnvironment: fixture.readRuntimeEnvironment,
  });
  assert.deepEqual(Object.keys(good.entries), [fixture.asset.id]);
  assert.deepEqual(good.issues, []);

  const drifted = buildNarrationProvenanceEntries([fixture.asset], fixture.plan, {
    readReceipt: fixture.readReceipt,
    readProviderProfile: () => ({
      path: fixture.providerBinding.path,
      sha256: "0".repeat(64),
      profile: fixture.providerBinding.profile,
    }),
    readRuntimeEnvironment: fixture.readRuntimeEnvironment,
  });
  assert.deepEqual(drifted.entries, {});
  assert.ok(drifted.issues.some((issue) => issue.includes("provider profile SHA-256")));
});

test("runtime lock drift revokes Kokoro narration rights provenance", () => {
  const fixture = currentNarrationFixture();
  const changedEnvironment = structuredClone(fixture.runtimeEnvironment);
  changedEnvironment.lock.sha256 = "0".repeat(64);
  const drifted = buildNarrationProvenanceEntries([fixture.asset], fixture.plan, {
    readReceipt: fixture.readReceipt,
    readProviderProfile: fixture.readProviderProfile,
    readRuntimeEnvironment: () => changedEnvironment,
  });
  assert.deepEqual(drifted.entries, {});
  assert.ok(drifted.issues.some((issue) => issue.includes("runtime project/lock bytes")));
});

test("current generated narration gets receipt-backed technical source lineage", () => {
  const fixture = currentNarrationFixture();
  const result = buildNarrationLineageEntries([fixture.asset], fixture.plan, { readReceipt: fixture.readReceipt });
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries[fixture.asset.id].fingerprintSha256, AUDIO_SHA);
  assert.deepEqual(result.entries[fixture.asset.id].origin, {
    method: "generation-receipt",
    path: fixture.plan.items[0].provenance.receiptPath,
    receiptSha256: RECEIPT_SHA,
    batchId: fixture.receipt.batchId,
    provider: "kokoro-local",
  });
});

test("legacy xAI and KPipeline narration paths cannot return", () => {
  const generator = readFileSync(join(repoRoot, "scripts/generate-narration.mjs"), "utf8");
  for (const forbidden of ["api.x.ai", "XAI_API_KEY", "XAI_TTS_VOICE_ID", "narrationStatePath", "readNarrationState"]) {
    assert.equal(generator.includes(forbidden), false, `legacy generator token must be absent: ${forbidden}`);
  }
  assert.match(generator, /buildKokoroNarrationReceipt/);
  assert.match(generator, /readKokoroRuntimeEnvironmentBinding/);
  assert.match(generator, /narrationStateUpdated:\s*false/);
  assert.match(generator, /narration:import/);

  const engine = readFileSync(join(repoRoot, "scripts/kokoro-synthesize.py"), "utf8");
  assert.equal(engine.includes("KPipeline"), true, "engine documentation should explicitly state that KPipeline is not used");
  assert.equal(engine.includes("from kokoro import KModel, KPipeline"), false);
  assert.equal(engine.includes("import kokoro"), false);
});
