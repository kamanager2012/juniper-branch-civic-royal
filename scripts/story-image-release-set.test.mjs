import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryImageReleaseSet } from "./story-image-release-set.mjs";

const EXPECTED_DIGEST = "812914f2a5d7b5d2e16a0039b5c74a06b302d1bf51e4d455b9d58985cbfa6aa6";
const releaseSet = buildStoryImageReleaseSet();

test("story image release set is complete and byte-pinned", () => {
  assert.equal(releaseSet.schemaVersion, 1);
  assert.equal(releaseSet.count, 192);
  assert.equal(releaseSet.entries.length, 192);
  assert.equal(new Set(releaseSet.entries.map((entry) => entry.path)).size, 192);
  for (const entry of releaseSet.entries) {
    assert.match(entry.path, /^public\/stories\/[a-z0-9-]+\/(?:cover|p[1-7])\.jpg$/);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.bytes > 0);
  }
  assert.equal(releaseSet.digestSha256, EXPECTED_DIGEST);
});
