import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftLineageEntries,
  buildDraftProvenanceEntries,
  evaluateDraftRightsEvidence,
  loadDraftRightsEvidence,
} from "./draft-story-rights.mjs";
import { loadDraftStoryCatalog } from "./draft-story-catalog.mjs";

const catalog = loadDraftStoryCatalog();
const evidence = loadDraftRightsEvidence();
const evaluation = evaluateDraftRightsEvidence({ catalog, evidence });

test("project-authored draft evidence pins all four source bundles", () => {
  assert.equal(catalog.totalCount, 100);
  assert.equal(catalog.publishedCount, 24);
  assert.equal(catalog.draftCount, 76);
  assert.equal(evidence.sourceBundles.length, 4);
  assert.deepEqual(evaluation.issues, []);
});

test("all 76 draft texts receive exact fingerprint-backed provenance and lineage", () => {
  const provenance = buildDraftProvenanceEntries(evaluation);
  const lineage = buildDraftLineageEntries(evaluation, "a".repeat(40));
  assert.equal(Object.keys(provenance.entries).length, 76);
  assert.equal(Object.keys(lineage.entries).length, 76);

  for (const story of catalog.stories) {
    const id = `text:story:${story.id}`;
    const p = provenance.entries[id];
    const l = lineage.entries[id];
    assert.equal(p.fingerprintSha256, story.fingerprintSha256);
    assert.equal(p.claim, "owned");
    assert.ok(p.evidence.includes(story.sourcePath));
    assert.equal(l.fingerprintSha256, story.fingerprintSha256);
    assert.equal(l.origin.commit, "a".repeat(40));
    assert.equal(l.origin.path, story.sourcePath);
    assert.equal(l.origin.method, "git-blob-identity");
    assert.match(l.origin.gitBlob, /^[a-f0-9]{40}$/);
  }
});

test("bundle byte drift fails closed instead of inheriting the owned claim", () => {
  const drifted = structuredClone(evidence);
  drifted.sourceBundles[0].gitBlob = "0".repeat(40);
  const report = evaluateDraftRightsEvidence({ catalog, evidence: drifted });
  assert.equal(report.issues.length, 1);
  assert.match(report.issues[0], /draft rights evidence drift/);
  assert.equal(Object.keys(buildDraftProvenanceEntries(report).entries).length, 0);
  assert.equal(Object.keys(buildDraftLineageEntries(report, "b".repeat(40)).entries).length, 0);
});
