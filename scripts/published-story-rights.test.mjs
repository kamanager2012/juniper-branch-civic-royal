import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublishedLineageEntries,
  buildPublishedProvenanceEntries,
  evaluatePublishedRightsEvidence,
  loadPublishedRightsEvidence,
} from "./published-story-rights.mjs";
import { buildReleaseReadiness } from "./release-readiness.mjs";
import { loadStoryModel } from "./story-model.mjs";

const model = loadStoryModel();
const evidence = loadPublishedRightsEvidence();
const evaluation = evaluatePublishedRightsEvidence({ model, evidence });

test("rewritten published story source is exactly pinned and complete", () => {
  assert.equal(model.stories.length, 24);
  assert.equal(model.pages.length, 216);
  assert.equal(evidence.source.stories, 24);
  assert.equal(evidence.source.path, "content/published-stories.json");
  assert.deepEqual(evaluation.issues, []);
});

test("all 24 media-ready story texts receive exact project-controlled provenance and lineage", () => {
  const release = buildReleaseReadiness();
  const assets = release.assets.filter((asset) => asset.category === "story-text" && asset.textStatus === "media-ready");
  const provenance = buildPublishedProvenanceEntries(assets, evaluation);
  const lineage = buildPublishedLineageEntries(assets, evaluation, "c".repeat(40));
  assert.equal(assets.length, 24);
  assert.equal(Object.keys(provenance.entries).length, 24);
  assert.equal(Object.keys(lineage.entries).length, 24);

  for (const asset of assets) {
    const p = provenance.entries[asset.id];
    const l = lineage.entries[asset.id];
    assert.equal(p.fingerprintSha256, asset.fingerprintSha256);
    assert.equal(p.claim, "owned");
    assert.deepEqual(p.evidence, [
      "content/evidence/story-text/project-authored-published.json",
      "content/published-stories.json",
    ]);
    assert.equal(l.fingerprintSha256, asset.fingerprintSha256);
    assert.equal(l.origin.commit, "c".repeat(40));
    assert.equal(l.origin.path, "content/published-stories.json");
    assert.equal(l.origin.method, "git-blob-identity");
    assert.equal(l.origin.gitBlob, evidence.source.gitBlob);
  }
});

test("published source byte drift fails closed", () => {
  const drifted = structuredClone(evidence);
  drifted.source.gitBlob = "0".repeat(40);
  const report = evaluatePublishedRightsEvidence({ model, evidence: drifted });
  assert.equal(report.issues.length, 1);
  assert.match(report.issues[0], /published story rights evidence drift/);
  const fakeAssets = model.stories.map((story) => ({ id: `text:story:${story.id}`, fingerprintSha256: "a".repeat(64) }));
  assert.equal(Object.keys(buildPublishedProvenanceEntries(fakeAssets, report).entries).length, 0);
  assert.equal(Object.keys(buildPublishedLineageEntries(fakeAssets, report, "d".repeat(40)).entries).length, 0);
});
