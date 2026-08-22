import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadDraftStoryCatalog } from "./draft-story-catalog.mjs";
import { buildReleaseReadiness, validateEvidenceReference } from "./release-readiness.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const model = loadStoryModel();
const draftCatalog = loadDraftStoryCatalog();
const report = buildReleaseReadiness();

test("release inventory covers 100 story texts while media remains scoped to 24 stories", () => {
  assert.equal(report.categories["story-text"]?.total, model.stories.length + draftCatalog.stories.length);
  assert.equal(report.categories["story-text"]?.total, 100);
  assert.equal(report.categories.narration?.total, model.pages.length);
  assert.ok((report.categories["story-image"]?.total ?? 0) > 0);
  assert.ok((report.categories.font?.total ?? 0) > 0);
  assert.ok((report.categories["product-artwork"]?.total ?? 0) > 0);

  const draftAssets = report.assets.filter((asset) => asset.category === "story-text" && asset.textStatus === "text-ready-media-pending");
  assert.equal(draftAssets.length, 76);
  assert.ok(draftAssets.every((asset) => asset.provenanceStatus === "verified"));
  assert.ok(draftAssets.every((asset) => asset.claim === "owned"));

  const ids = report.assets.map((asset) => asset.id);
  assert.equal(new Set(ids).size, ids.length, "release asset ids must be unique");
  for (const asset of report.assets) assert.match(asset.fingerprintSha256, /^[a-f0-9]{64}$/);
});

test("provenance accounting is complete and fail-closed", () => {
  const p = report.provenance;
  assert.equal(p.verified + p.unverified + p.stale + p.invalid, p.total);
  assert.equal(p.total, report.assets.length);
  assert.ok(p.coverage >= 0 && p.coverage <= 1);
  assert.deepEqual(report.issues, [], `release registry issues: ${report.issues.join("; ")}`);

  const expectedReady =
    p.verified === p.total &&
    p.stale === 0 &&
    p.invalid === 0 &&
    report.narration.current === report.narration.total;
  assert.equal(report.releaseReady, expectedReady);
  assert.equal(report.releaseReady, false, "100-story catalog must not bypass unresolved media rights/narration gates");
});

test("narration synchronization remains a separate release condition", () => {
  const n = report.narration;
  assert.equal(n.current + n.stale + n.unverified + n.missing, n.total);
  assert.equal(n.total, model.pages.length);
});

test("provenance evidence references must be durable and resolvable", () => {
  assert.deepEqual(validateEvidenceReference("licenses/fonts/MaShanZheng/OFL.txt"), {
    valid: true,
    kind: "local",
    problem: null,
  });
  assert.deepEqual(validateEvidenceReference("https://github.com/googlefonts/mashanzheng/blob/master/OFL.txt"), {
    valid: true,
    kind: "https",
    problem: null,
  });
  assert.deepEqual(validateEvidenceReference("content/evidence/story-text/project-authored-drafts.json"), {
    valid: true,
    kind: "local",
    problem: null,
  });
  assert.equal(validateEvidenceReference("http://example.com/license").valid, false);
  assert.equal(validateEvidenceReference("../outside-repo.txt").valid, false);
  assert.equal(validateEvidenceReference("content/evidence/does-not-exist.json").valid, false);
});

test("Ma Shan Zheng remains fingerprint-backed and licensed", () => {
  const asset = report.assets.find((item) => item.id === "font:public/fonts/MaShanZheng.woff2");
  assert.ok(asset, "Ma Shan Zheng release asset missing");
  assert.equal(asset.fingerprintSha256, "11e2c8cbcd09ac08fa38066a2e9699e57fda40a8e2880fbf7cbf101f5926a595");
  assert.equal(asset.provenanceStatus, "verified");
  assert.equal(asset.claim, "licensed");

  const evidence = JSON.parse(readFileSync(join(repoRoot, "content/evidence/fonts/MaShanZheng.json"), "utf8"));
  assert.equal(evidence.sha256, asset.fingerprintSha256);
  assert.equal(evidence.identity.tool, "fonttools 4.63.0");
  assert.equal(evidence.identity.localCodepoints, 802);
  assert.equal(evidence.identity.allLocalCodepointsMatched, true);
  assert.equal(evidence.identity.matchedUpstreamCommit, "72c50ec001cea63d223d35562eeb2ba42f0fe67a");
  assert.equal(evidence.identity.matchedUpstreamGitBlob, "11bbfb9867d70612158229d037e7a5f622bd0e38");
  assert.ok(evidence.comparisons.every((comparison) => comparison.matched === true));
  assert.equal(evidence.license.type, "SIL Open Font License 1.1");
});
