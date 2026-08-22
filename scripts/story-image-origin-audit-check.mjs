import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const EXPECTED = Object.freeze({
  schemaVersion: 1,
  originCommit: "88c2080c715a1c37e64916970cbbc4af2ed7727a",
  decoder: "jpeg-js@0.4.4",
  releaseImages: 192,
  imagineArtifacts: 194,
  uniqueImagineMatches: 192,
  collisions: 0,
  unusedImagineArtifacts: 2,
  maxMae: 5,
  minMargin: 7,
  mappingDigestSha256: "ca3f410fe320ddb4b443d8089b84a4483de0e13d5731c806c894e865ad1c2cac",
});

const path = process.argv[2];
if (!path) throw new Error("usage: node scripts/story-image-origin-audit-check.mjs <audit.json>");
const audit = JSON.parse(readFileSync(path, "utf8"));

assert.equal(audit.schemaVersion, EXPECTED.schemaVersion);
assert.equal(audit.originCommit, EXPECTED.originCommit);
assert.equal(audit.method?.decoder, EXPECTED.decoder);
assert.equal(audit.counts?.releaseImages, EXPECTED.releaseImages);
assert.equal(audit.counts?.imagineArtifacts, EXPECTED.imagineArtifacts);
assert.equal(audit.counts?.uniqueImagineMatches, EXPECTED.uniqueImagineMatches);
assert.equal(audit.counts?.collisions, EXPECTED.collisions);
assert.equal(audit.counts?.unusedImagineArtifacts, EXPECTED.unusedImagineArtifacts);
assert.deepEqual(audit.collisions, []);
assert.ok(audit.summary?.maxMae <= EXPECTED.maxMae, `max MAE ${audit.summary?.maxMae} exceeds ${EXPECTED.maxMae}`);
assert.ok(audit.summary?.minMargin >= EXPECTED.minMargin, `min margin ${audit.summary?.minMargin} is below ${EXPECTED.minMargin}`);
assert.equal(audit.summary?.mappingDigestSha256, EXPECTED.mappingDigestSha256);

assert.equal(audit.matches?.length, EXPECTED.releaseImages);
const releasePaths = audit.matches.map((item) => item.releasePath);
const imaginePaths = audit.matches.map((item) => item.imaginePath);
assert.equal(new Set(releasePaths).size, EXPECTED.releaseImages, "release paths must be unique");
assert.equal(new Set(imaginePaths).size, EXPECTED.uniqueImagineMatches, "Imagine matches must remain one-to-one");
for (const item of audit.matches) {
  assert.match(item.releasePath, /^public\/stories\/[a-z0-9-]+\/(?:cover|p[1-7])\.jpg$/);
  assert.match(item.releaseGitBlob, /^[a-f0-9]{40}$/);
  assert.match(item.releaseSha256, /^[a-f0-9]{64}$/);
  assert.match(item.imaginePath, /^artifacts\/imagine_images\/[a-f0-9-]{36}\.jpg$/);
  assert.match(item.imagineGitBlob, /^[a-f0-9]{40}$/);
  assert.match(item.imagineSha256, /^[a-f0-9]{64}$/);
  assert.ok(item.mae <= EXPECTED.maxMae, `${item.releasePath}: MAE ${item.mae} exceeds ${EXPECTED.maxMae}`);
  assert.ok(item.margin >= EXPECTED.minMargin, `${item.releasePath}: margin ${item.margin} is below ${EXPECTED.minMargin}`);
}

console.log(JSON.stringify({
  ok: true,
  originCommit: audit.originCommit,
  releaseImages: audit.counts.releaseImages,
  imagineArtifacts: audit.counts.imagineArtifacts,
  collisions: audit.counts.collisions,
  maxMae: audit.summary.maxMae,
  minMargin: audit.summary.minMargin,
  mappingDigestSha256: audit.summary.mappingDigestSha256,
}, null, 2));
