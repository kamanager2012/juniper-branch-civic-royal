import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { repoRoot } from "./story-model.mjs";

const workflow = readFileSync(join(repoRoot, ".github/workflows/exact-head-ci.yml"), "utf8");
const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7";
const SETUP_NODE = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7";

test("observable exact-head CI runs on every project branch family and can only publish statuses", () => {
  assert.match(workflow, /branches:\s*\[main, "feat\/\*\*", "fix\/\*\*", "chore\/\*\*", "generated\/\*\*"\]/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read\s*\n\s*statuses:\s*write/);
  assert.equal(workflow.includes("contents: write"), false);
  assert.equal(workflow.includes("pull-requests: write"), false);
  assert.equal(workflow.includes("git push"), false);
});

test("observable gate executes Node 20/22, dependency audit, and Chromium E2E", () => {
  assert.match(workflow, /matrix:\s*\n\s*node:\s*\[20, 22\]/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:e2e/);
});

test("all third-party actions are immutable approved commits", () => {
  const uses = workflow.split("\n").filter((line) => line.includes("uses:")).map((line) => line.trim().replace(/^-\s*/, ""));
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.ok(line === `uses: ${CHECKOUT}` || line === `uses: ${SETUP_NODE}`, `unexpected action reference: ${line}`);
  }
});

test("machine-readable success is impossible unless every required job succeeds", () => {
  assert.match(workflow, /needs:\s*\[check, dependency-audit, e2e\]/);
  assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(workflow, /CHECK_RESULT:\s*\$\{\{ needs\.check\.result \}\}/);
  assert.match(workflow, /AUDIT_RESULT:\s*\$\{\{ needs\.dependency-audit\.result \}\}/);
  assert.match(workflow, /E2E_RESULT:\s*\$\{\{ needs\.e2e\.result \}\}/);
  assert.match(workflow, /if \[ "\$CHECK_RESULT" = success \] && \[ "\$AUDIT_RESULT" = success \] && \[ "\$E2E_RESULT" = success \]/);
  assert.match(workflow, /context="exact-head-ci"/);
  assert.match(workflow, /statuses\/\$\{GITHUB_SHA\}/);
  assert.match(workflow, /test "\$state" = success/);
});
