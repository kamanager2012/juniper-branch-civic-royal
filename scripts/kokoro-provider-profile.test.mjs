import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APPROVED_KOKORO,
  readKokoroProviderProfile,
  validateKokoroLocalAssets,
  validateKokoroProviderProfile,
} from "./kokoro-provider-profile.mjs";

const approved = readKokoroProviderProfile();

test("approved Kokoro Chinese narration profile is exactly pinned", () => {
  const result = validateKokoroProviderProfile(approved);
  assert.equal(result.valid, true, result.issues.join("; "));
  assert.deepEqual(result.issues, []);
  assert.equal(approved.model.config.sha256, APPROVED_KOKORO.configSha256);
  assert.equal(approved.model.weights.sha256, APPROVED_KOKORO.weightsSha256);
  assert.equal(approved.model.voice.sha256, APPROVED_KOKORO.voiceSha256);
  assert.deepEqual(approved.rights.evidence, [...APPROVED_KOKORO.rightsEvidence]);
  assert.equal(approved.approval.approved, true);
  assert.equal(approved.rights.claimForGeneratedNarration, "permission");
});

test("provider identity, rights evidence, audit record, or voice policy drift fails closed", () => {
  for (const mutate of [
    (profile) => { profile.model.revision = "main"; },
    (profile) => { profile.model.config.sha256 = "0".repeat(64); },
    (profile) => { profile.model.weights.sha256 = "0".repeat(64); },
    (profile) => { profile.model.voice.sha256 = "0".repeat(64); },
    (profile) => { profile.runtime.inference.commit = "0".repeat(40); },
    (profile) => { profile.runtime.g2p.commit = "0".repeat(40); },
    (profile) => { profile.generationPolicy.referenceSpeakerAudio = true; },
    (profile) => { profile.generationPolicy.voiceCloning = true; },
    (profile) => { profile.generationPolicy.networkRequiredAtSynthesis = true; },
    (profile) => { profile.rights.claimForGeneratedNarration = "owned"; },
    (profile) => { profile.rights.evidence[0] = "https://example.com/unrelated"; },
    (profile) => { profile.approval.approvedByEvidence[0] = "config checked"; },
    (profile) => { profile.approval.approved = false; },
  ]) {
    const changed = structuredClone(approved);
    mutate(changed);
    const result = validateKokoroProviderProfile(changed);
    assert.equal(result.valid, false, "mutated approved profile must not remain valid");
    assert.ok(result.issues.length > 0);
  }
});

test("local generation cannot start from a directory missing pinned assets", () => {
  const root = mkdtempSync(join(tmpdir(), "kokoro-provider-"));
  try {
    const result = validateKokoroLocalAssets(approved, root);
    assert.equal(result.valid, false);
    assert.equal(result.checked.length, 0);
    assert.ok(result.issues.some((issue) => issue.includes("config asset missing")));
    assert.ok(result.issues.some((issue) => issue.includes("weights asset missing")));
    assert.ok(result.issues.some((issue) => issue.includes("voice asset missing")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
