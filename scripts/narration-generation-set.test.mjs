import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildNarrationGenerationSet, computeNarrationInputDigest } from "./narration-generation-set.mjs";
import { repoRoot } from "./story-model.mjs";

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("full narration generation set is complete and exactly pinned", () => {
  const set = buildNarrationGenerationSet();
  const evidence = JSON.parse(readFileSync(join(repoRoot, "content/evidence/narration/generation-set-v1.json"), "utf8"));

  assert.equal(set.schemaVersion, 1);
  assert.equal(set.canonicalSource, "content/published-stories.json");
  assert.deepEqual(set.scope, { type: "all" });
  assert.equal(set.count, 216);
  assert.equal(set.entries.length, 216);
  assert.equal(new Set(set.entries.map((entry) => entry.key)).size, 216);
  assert.equal(new Set(set.entries.map((entry) => entry.file)).size, 216);
  assert.deepEqual(set.entries, [...set.entries].sort((a, b) => a.key.localeCompare(b.key)));

  for (const entry of set.entries) {
    assert.match(entry.key, /^[a-z0-9-]+\/(?:p[0-7]|moral)$/);
    assert.match(entry.file, /^public\/audio\/[a-z0-9-]+\/(?:p[0-7]|moral)\.mp3$/);
    assert.ok(entry.text.length > 0);
    assert.equal(entry.textSha256, sha256Text(entry.text));
  }

  assert.equal(set.inputDigestSha256, computeNarrationInputDigest(set.entries));
  assert.equal(set.inputDigestSha256, "a17d000ac3d82fa53576fc83f0e4653e00aba6573c1209557d3f9c2925262828");
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.evidenceType, "narration-generation-input-set");
  assert.equal(evidence.canonicalSource, set.canonicalSource);
  assert.equal(evidence.inputItemCount, set.count);
  assert.equal(evidence.inputDigestSha256, set.inputDigestSha256);
  assert.deepEqual(evidence.digestProjection, ["key", "file", "textSha256"]);
});

test("single-story generation set is a nine-item deterministic subset", () => {
  const full = buildNarrationGenerationSet();
  const storyId = full.entries[0].storyId;
  const set = buildNarrationGenerationSet({ story: storyId });
  assert.deepEqual(set.scope, { type: "story", storyId });
  assert.equal(set.count, 9);
  assert.ok(set.entries.every((entry) => entry.storyId === storyId));
  assert.equal(set.inputDigestSha256, computeNarrationInputDigest(set.entries));
  assert.notEqual(set.inputDigestSha256, full.inputDigestSha256);
});

test("generation input digest ignores audio results and changes with canonical text hashes", () => {
  const set = buildNarrationGenerationSet();
  const base = set.entries.slice(0, 2).map((entry) => ({ ...entry, audioSha256: "a".repeat(64) }));
  const sameInputsDifferentAudio = base.map((entry) => ({ ...entry, audioSha256: "b".repeat(64) }));
  assert.equal(computeNarrationInputDigest(base), computeNarrationInputDigest(sameInputsDifferentAudio));

  const changed = structuredClone(base);
  changed[0].textSha256 = "f".repeat(64);
  assert.notEqual(computeNarrationInputDigest(base), computeNarrationInputDigest(changed));
});
