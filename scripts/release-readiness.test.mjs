import assert from "node:assert/strict";
import test from "node:test";
import { buildReleaseReadiness } from "./release-readiness.mjs";
import { loadStoryModel } from "./story-model.mjs";

const model = loadStoryModel();
const report = buildReleaseReadiness();

test("release inventory covers canonical text, imagery and narration", () => {
  assert.equal(report.categories["story-text"]?.total, model.stories.length);
  assert.equal(report.categories.narration?.total, model.pages.length);
  assert.ok((report.categories["story-image"]?.total ?? 0) > 0);
  assert.ok((report.categories.font?.total ?? 0) > 0);
  assert.ok((report.categories["product-artwork"]?.total ?? 0) > 0);

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
});

test("narration synchronization remains a separate release condition", () => {
  const n = report.narration;
  assert.equal(n.current + n.stale + n.unverified + n.missing, n.total);
  assert.equal(n.total, model.pages.length);
});
