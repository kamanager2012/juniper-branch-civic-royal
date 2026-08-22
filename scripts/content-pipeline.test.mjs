import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildContentReport } from "./content-report.mjs";
import { buildNarrationPlan, readNarrationState } from "./narration-plan.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const model = loadStoryModel();

test("all content tooling consumes the canonical story model", () => {
  const report = buildContentReport();
  const plan = buildNarrationPlan();
  assert.equal(report.totals.stories, model.stories.length);
  assert.equal(report.totals.pages, model.pages.length);
  assert.equal(plan.items.length, model.pages.length);
  assert.deepEqual(report.issues, [], `content report issues: ${report.issues.join("; ")}`);
});

test("narration provenance state is explicit and versioned", () => {
  const state = readNarrationState();
  assert.equal(state.schemaVersion, 1);
  assert.equal(typeof state.entries, "object");
  const allowed = new Set(["current", "stale", "unverified", "missing"]);
  for (const item of buildNarrationPlan().items) {
    assert.equal(allowed.has(item.status), true, `unexpected narration status for ${item.key}: ${item.status}`);
    assert.match(item.textSha256, /^[a-f0-9]{64}$/);
  }
});

test("obsolete duplicate story-text scripts cannot return", () => {
  for (const path of [
    "scripts/expand-stories.py",
    "scripts/generate-narration.py",
    "scripts/generate-narration-2.py",
  ]) {
    assert.equal(existsSync(join(repoRoot, path)), false, `${path} is an obsolete second content source`);
  }

  const generator = readFileSync(join(repoRoot, "scripts/generate-narration.mjs"), "utf8");
  assert.match(generator, /buildNarrationPlan/);
  assert.match(generator, /XAI_TTS_VOICE_ID/);
  assert.equal(generator.includes('voice_id: "luna"'), false);
});
