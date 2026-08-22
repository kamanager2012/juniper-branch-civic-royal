import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryImageReleaseSet } from "./story-image-release-set.mjs";

const releaseSet = buildStoryImageReleaseSet();

test("story image release set is complete and fingerprinted", () => {
  assert.equal(releaseSet.schemaVersion, 1);
  assert.equal(releaseSet.count, 192);
  assert.equal(releaseSet.entries.length, 192);
  assert.equal(new Set(releaseSet.entries.map((entry) => entry.path)).size, 192);
  for (const entry of releaseSet.entries) {
    assert.match(entry.path, /^public\/stories\/[a-z0-9-]+\/(?:cover|p[1-7])\.jpg$/);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.bytes > 0);
  }
  assert.match(releaseSet.digestSha256, /^[a-f0-9]{64}$/);
  console.log(`[story-image-release-set] count=${releaseSet.count} digest=${releaseSet.digestSha256}`);
});
