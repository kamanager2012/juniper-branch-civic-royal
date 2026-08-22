import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStoryImageProvenanceEntries,
  evaluateStoryImageRightsEvidence,
  loadStoryImageOriginEvidence,
  loadStoryImageRightsEvidence,
} from "./story-image-rights.mjs";
import { buildStoryImageReleaseSet } from "./story-image-release-set.mjs";

const releaseSet = buildStoryImageReleaseSet();
const rights = loadStoryImageRightsEvidence();
const origin = loadStoryImageOriginEvidence();
const evaluation = evaluateStoryImageRightsEvidence({ rights, origin, releaseSet });
const assets = releaseSet.entries.map((entry) => ({
  id: `image:${entry.path}`,
  category: "story-image",
  label: entry.path,
  path: entry.path,
  fingerprintSha256: entry.sha256,
}));

test("story image rights evidence pins technical origin and current release bytes", () => {
  assert.equal(rights.claim, "owned");
  assert.equal(rights.releaseSet.count, 192);
  assert.equal(rights.releaseSet.digestSha256, "812914f2a5d7b5d2e16a0039b5c74a06b302d1bf51e4d455b9d58985cbfa6aa6");
  assert.equal(rights.technicalOrigin.mappingDigestSha256, "ca3f410fe320ddb4b443d8089b84a4483de0e13d5731c806c894e865ad1c2cac");
  assert.equal(origin.audit.mappingDigestSha256, rights.technicalOrigin.mappingDigestSha256);
  assert.equal(rights.providerRights.consumerTerms.effectiveDate, "2026-06-26");
  assert.equal(rights.providerRights.brandGuidelines.attribution, "Created with Grok");
  assert.deepEqual(evaluation.issues, []);
});

test("all 192 pinned story images receive fingerprint-backed owned provenance", () => {
  const generated = buildStoryImageProvenanceEntries(assets, evaluation);
  assert.deepEqual(generated.issues, []);
  assert.equal(Object.keys(generated.entries).length, 192);
  for (const asset of assets) {
    const entry = generated.entries[asset.id];
    assert.ok(entry);
    assert.equal(entry.fingerprintSha256, asset.fingerprintSha256);
    assert.equal(entry.claim, "owned");
    assert.ok(entry.evidence.includes("content/evidence/story-images/grok-imagine-rights.json"));
    assert.ok(entry.evidence.includes("content/evidence/story-images/grok-imagine-origin-audit.json"));
    assert.ok(entry.evidence.includes("https://x.ai/legal/terms-of-service"));
    assert.ok(entry.evidence.includes("https://x.ai/legal/faq"));
    assert.ok(entry.evidence.includes("https://x.ai/legal/brand-guidelines"));
  }
});

test("release-set digest drift revokes all generated image claims", () => {
  const driftedSet = { ...releaseSet, digestSha256: "0".repeat(64) };
  const driftedEvaluation = evaluateStoryImageRightsEvidence({ rights, origin, releaseSet: driftedSet });
  assert.ok(driftedEvaluation.issues.some((issue) => issue.includes("release digest drift")));
  const generated = buildStoryImageProvenanceEntries(assets, driftedEvaluation);
  assert.equal(Object.keys(generated.entries).length, 0);
  assert.ok(generated.issues.length > 0);
});

test("a single current image fingerprint drift revokes the whole generated set", () => {
  const driftedAssets = assets.map((asset, index) => index === 0 ? { ...asset, fingerprintSha256: "f".repeat(64) } : asset);
  const generated = buildStoryImageProvenanceEntries(driftedAssets, evaluation);
  assert.equal(Object.keys(generated.entries).length, 0);
  assert.ok(generated.issues.some((issue) => issue.includes("story image fingerprint drift")));
});
