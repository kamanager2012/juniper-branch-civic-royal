import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKokoroNarrationReceipt,
  readApprovedProviderBinding,
} from "./kokoro-generation-contract.mjs";
import {
  KOKORO_RUNTIME_TORCH_VERSION,
  readKokoroRuntimeEnvironmentBinding,
} from "./kokoro-runtime-environment.mjs";
import { readNarrationEncoderProfile } from "./narration-encoder-profile.mjs";
import { buildNarrationGenerationSet } from "./narration-generation-set.mjs";
import { buildNarrationProvenanceEntries } from "./narration-rights.mjs";

const AUDIO_SHA = "d".repeat(64);
const RECEIPT_SHA = "e".repeat(64);
const APPROVED_RUNTIME = Object.freeze({
  platform: "linux",
  arch: "x64",
  pythonVersion: "3.12.0",
  torchVersion: KOKORO_RUNTIME_TORCH_VERSION,
  device: "cpu",
});

function encoderFixture() {
  const binding = readNarrationEncoderProfile();
  const profile = binding.profile;
  return {
    binding,
    snapshot: {
      schemaVersion: 1,
      architecture: profile.target.architecture,
      binaries: structuredClone(profile.binaries),
      libraries: structuredClone(profile.libraries),
      encoderInventoryLine: profile.encoderInventoryLine,
    },
  };
}

function currentNarrationFixture() {
  const fullSet = buildNarrationGenerationSet();
  const generationSet = buildNarrationGenerationSet({ story: fullSet.entries[0].storyId });
  const providerBinding = readApprovedProviderBinding();
  const runtimeEnvironment = readKokoroRuntimeEnvironmentBinding();
  const encoder = encoderFixture();
  const outputs = generationSet.entries.map((entry) => ({
    key: entry.key,
    file: entry.file,
    audioSha256: AUDIO_SHA,
    bytes: 4096,
  }));
  const receipt = buildKokoroNarrationReceipt({
    generationSet,
    outputs,
    createdAt: new Date("2026-08-22T08:45:00.000Z"),
    runtime: APPROVED_RUNTIME,
    runtimeEnvironment,
    encoder: {
      version: encoder.snapshot.binaries.find((item) => item.name === "ffmpeg").versionLine,
    },
    encoderBinding: encoder.binding,
    encoderSnapshot: encoder.snapshot,
    providerBinding,
  });

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
    encoderProfileId: receipt.execution.encoder.profile.id,
    encoderProfilePath: receipt.execution.encoder.profile.evidence,
    encoderProfileSha256: receipt.execution.encoder.profile.sha256,
    encoderBinarySha256: receipt.execution.encoder.binarySha256,
    encoderLibmp3lameSha256: receipt.execution.encoder.libmp3lameSha256,
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

  return {
    asset,
    plan,
    encoderBinding: encoder.binding,
    readReceipt: () => ({ receipt, receiptSha256: RECEIPT_SHA, receiptPath }),
    readProviderProfile: () => ({
      path: providerBinding.path,
      sha256: providerBinding.sha256,
      profile: providerBinding.profile,
    }),
    readRuntimeEnvironment: () => structuredClone(runtimeEnvironment),
  };
}

test("durable encoder profile byte drift revokes current Kokoro narration rights provenance", () => {
  const fixture = currentNarrationFixture();
  const good = buildNarrationProvenanceEntries([fixture.asset], fixture.plan, {
    readReceipt: fixture.readReceipt,
    readProviderProfile: fixture.readProviderProfile,
    readRuntimeEnvironment: fixture.readRuntimeEnvironment,
    readEncoderProfile: () => fixture.encoderBinding,
  });
  assert.deepEqual(Object.keys(good.entries), [fixture.asset.id]);
  assert.deepEqual(good.issues, []);

  const drifted = buildNarrationProvenanceEntries([fixture.asset], fixture.plan, {
    readReceipt: fixture.readReceipt,
    readProviderProfile: fixture.readProviderProfile,
    readRuntimeEnvironment: fixture.readRuntimeEnvironment,
    readEncoderProfile: () => ({
      ...fixture.encoderBinding,
      sha256: "0".repeat(64),
    }),
  });
  assert.deepEqual(drifted.entries, {});
  assert.ok(drifted.issues.some((issue) => issue.includes("encoder profile SHA-256")));
});
