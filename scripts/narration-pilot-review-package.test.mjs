import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildPilotReviewManifest,
  renderPilotReviewHtml,
  writePilotReviewPackage,
} from "./narration-pilot-review-package.mjs";
import { validateCurrentNarrationPilot } from "./narration-pilot-approval.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const controlledPaths = [
  join(repoRoot, "content/narration-state.json"),
  join(repoRoot, "content/evidence/narration/pilots/shou-zhu-v1.json"),
  ...["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "moral"].map((pageId) =>
    join(repoRoot, "public/audio/shou-zhu", `${pageId}.mp3`),
  ),
];

function controlledHashes() {
  return Object.fromEntries(controlledPaths.map((path) => [path, sha256File(path)]));
}

test("installed pilot review manifest binds exactly nine current release MP3 files to durable evidence", () => {
  const validation = validateCurrentNarrationPilot();
  assert.equal(validation.valid, true, validation.problems.join("; "));
  const manifest = buildPilotReviewManifest({ validation });
  assert.equal(manifest.packageType, "installed-narration-pilot-listening-review");
  assert.equal(manifest.pilotId, "shou-zhu-kokoro-v1");
  assert.equal(manifest.storyId, "shou-zhu");
  assert.equal(manifest.itemCount, 9);
  assert.deepEqual(manifest.qualityReview, validation.evidence.qualityReview);
  assert.equal(manifest.reviewPolicy.humanListeningRequired, true);
  assert.equal(manifest.reviewPolicy.packageCannotApproveExpansion, true);

  const evidenceShas = validation.evidence.audioSha256;
  assert.deepEqual(
    manifest.items.map((item) => item.key).sort(),
    Object.keys(evidenceShas).sort(),
  );

  for (const item of manifest.items) {
    assert.equal(item.audioSha256, evidenceShas[item.key]);
    assert.equal(sha256File(join(repoRoot, item.source)), item.audioSha256);
    assert.match(item.reviewFile, /^audio\/[A-Za-z0-9._-]+\.mp3$/);
    assert.ok(item.text.trim().length > 0);
    assert.match(item.textSha256, /^[a-f0-9]{64}$/);
  }
});

test("review HTML is offline-only and exposes exact text plus local audio controls", () => {
  const manifest = buildPilotReviewManifest();
  const html = renderPilotReviewHtml(manifest);
  assert.equal(/https?:\/\//i.test(html), false, "review HTML must not depend on remote resources");
  assert.match(html, /本包只复制仓库当前已安装的 release MP3/);
  assert.match(html, /它不会调用 Kokoro/);
  assert.match(html, /HTML 本身不会写 evidence/);

  for (const item of manifest.items) {
    assert.ok(html.includes(`src="${item.reviewFile}"`));
    assert.ok(html.includes(item.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")));
  }
  assert.equal((html.match(/<audio controls/g) ?? []).length, 9);
  assert.equal((html.match(/<input type="checkbox" data-check="pass">/g) ?? []).length, 9);
});

test("review package copies installed evidence-bound audio without mutating controlled release files", () => {
  const outDir = join(repoRoot, ".tmp-pilot-review-package-test");
  rmSync(outDir, { recursive: true, force: true });
  const before = controlledHashes();
  const validation = validateCurrentNarrationPilot();
  try {
    const result = writePilotReviewPackage({ outDir });
    assert.equal(result.itemCount, 9);
    assert.equal(result.listeningStatus, validation.listeningStatus);
    assert.equal(result.expansionApproved, validation.expansionApproved);

    for (const name of ["manifest.json", "review.html", "README.txt", "evidence/pilot.json", "evidence/receipt.json"]) {
      assert.equal(existsSync(join(outDir, name)), true, `${name} must exist`);
    }

    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
    assert.equal(manifest.itemCount, 9);
    for (const item of manifest.items) {
      const copied = join(outDir, item.reviewFile);
      assert.equal(existsSync(copied), true);
      assert.equal(sha256File(copied), item.audioSha256);
    }
    assert.equal(sha256File(join(outDir, "evidence/receipt.json")), manifest.installedBatch.receiptSha256);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  assert.deepEqual(controlledHashes(), before);
});

test("review package construction fails closed on stale or mismatched plan entries", () => {
  const validation = validateCurrentNarrationPilot();
  const realPlan = buildNarrationPlan({ story: "shou-zhu" });

  const stalePlan = structuredClone(realPlan);
  stalePlan.items[0].status = "stale";
  assert.throws(
    () => buildPilotReviewManifest({ validation, plan: stalePlan }),
    /installed pilot narration is not current/,
  );

  const wrongShaPlan = structuredClone(realPlan);
  wrongShaPlan.items[0].audioSha256 = "0".repeat(64);
  assert.throws(
    () => buildPilotReviewManifest({ validation, plan: wrongShaPlan }),
    /release audio SHA does not match pilot evidence/,
  );
});
