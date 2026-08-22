import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { repoRoot } from "./story-model.mjs";

const workflow = readFileSync(join(repoRoot, ".github/workflows/narration-production-expansion.yml"), "utf8");
const CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7";
const SETUP_NODE = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7";
const SETUP_PYTHON = "actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1 # v6";
const CACHE = "actions/cache@caa296126883cff596d87d8935842f9db880ef25 # v5";
const ACTIVATION_PARENT = "9198e04346eeee8a6265cb98f4da67cb3c2f4874";

function usesLines() {
  return workflow
    .split("\n")
    .filter((line) => /^\s*-\s+uses:\s+/.test(line))
    .map((line) => line.trim().replace(/^-\s*/, ""));
}

test("production expansion is a one-time owner push on the exact unified branch", () => {
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- feat\/narration-story-batch-expansion/);
  assert.equal(workflow.includes("pull_request:"), false);
  assert.equal(workflow.includes("workflow_dispatch:"), false);
  assert.match(workflow, /github\.repository == 'kamanager2012\/juniper-branch-civic-royal'/);
  assert.match(workflow, /github\.actor == 'kamanager2012'/);
  assert.ok(workflow.includes(`github.event.before == '${ACTIVATION_PARENT}'`));
  assert.match(workflow, /\[run-narration-production\]/);
  assert.ok(workflow.includes(`test \"\${{ github.event.before }}\" = \"${ACTIVATION_PARENT}\"`));
  assert.match(workflow, /REMOTE_HEAD=.*git ls-remote origin/);
  assert.match(workflow, /test \"\$REMOTE_HEAD\" = \"\$GITHUB_SHA\"/);
});

test("production workflow has only the write permission needed to commit verified assets", () => {
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*write/);
  assert.equal(workflow.includes("pull-requests: write"), false);
  assert.equal(workflow.includes("issues: write"), false);
  assert.equal(workflow.includes("actions: write"), false);
  assert.equal(workflow.includes("statuses: write"), false);
});

test("every third-party action is an approved immutable commit", () => {
  const allowed = new Set([
    `uses: ${CHECKOUT}`,
    `uses: ${SETUP_NODE}`,
    `uses: ${SETUP_PYTHON}`,
    `uses: ${CACHE}`,
  ]);
  const lines = usesLines();
  assert.ok(lines.length >= 6);
  for (const line of lines) assert.ok(allowed.has(line), `unexpected action reference: ${line}`);
});

test("full candidate verification runs before any narration synthesis", () => {
  const node20 = workflow.indexOf("Full candidate gate on Node 20");
  const node22 = workflow.indexOf("Full candidate gate on Node 22");
  const audit = workflow.indexOf("npm audit --audit-level=high");
  const e2e = workflow.indexOf("npm run test:e2e");
  const generate = workflow.indexOf("Generate and import the 23 approved story batches exactly once");
  assert.ok(node20 >= 0 && node22 > node20 && audit > node22 && e2e > audit && generate > e2e);
  assert.match(workflow, /node-version: \"20\"/);
  assert.match(workflow, /node-version: \"22\"/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
});

test("pre-generation scope is pinned to 24 stories / 9 protected / 23 batches / 207 items", () => {
  assert.match(workflow, /plan\.totalStories !== 24/);
  assert.match(workflow, /plan\.currentStoryCount !== 1 \|\| plan\.currentItemCount !== 9/);
  assert.match(workflow, /plan\.pendingStoryCount !== 23 \|\| plan\.pendingItemCount !== 207/);
  assert.match(workflow, /plan\.currentStories\[0\]\.storyId !== \"shou-zhu\"/);
  assert.match(workflow, /find public\/audio\/shou-zhu/);
  assert.match(workflow, /cmp \/tmp\/shou-zhu-before\.sha256 \/tmp\/shou-zhu-after\.sha256/);
  assert.match(workflow, /cmp \/tmp\/shou-zhu-evidence-before\.sha256 \/tmp\/shou-zhu-evidence-after\.sha256/);
});

test("production calls only the guarded pending-story orchestrator without broad replacement", () => {
  const commandEnd = workflow.indexOf("| tee /tmp/narration-production.log");
  assert.ok(commandEnd >= 0);
  const commandStart = workflow.lastIndexOf("node scripts/generate-narration-pending-stories.mjs", commandEnd);
  assert.ok(commandStart >= 0 && commandStart < commandEnd);
  const command = workflow.slice(commandStart, commandEnd);
  assert.match(command, /--execute/);
  assert.match(command, /--assets-dir \.runtime-assets/);
  assert.match(command, /--kokoro-src-dir \.runtime-src\/kokoro/);
  assert.match(command, /--misaki-src-dir \.runtime-src\/misaki/);
  assert.equal(command.includes("--summary"), false);
  assert.equal(command.includes("--all"), false);
  assert.equal(command.includes("--replace"), false);
  assert.equal(command.includes("--story"), false);
});

test("post-generation state and every new receipt receive fail-closed validation", () => {
  assert.match(workflow, /plan\.currentStoryCount !== 24 \|\| plan\.currentItemCount !== 216/);
  assert.match(workflow, /plan\.pendingStoryCount !== 0 \|\| plan\.pendingItemCount !== 0/);
  assert.match(workflow, /wc -l < \/tmp\/receipts-new\.txt/);
  assert.match(workflow, /kokoro-canary-qc\.mjs/);
  assert.match(workflow, /production-qc/);
  assert.match(workflow, /find \.narration-work\/production-qc[^\n]*wc -l/);
});

test("staged production transaction is exactly 207 MP3 + 23 receipts + 1 state", () => {
  assert.match(workflow, /git add content\/narration-state\.json content\/evidence\/narration\/receipts public\/audio/);
  assert.equal(workflow.includes("git add -A"), false);
  assert.equal(workflow.includes("git add ."), false);
  assert.match(workflow, /paths\.length !== 231/);
  assert.match(workflow, /receipts\.length !== 23/);
  assert.match(workflow, /audio\.length !== 207/);
  assert.match(workflow, /state\.length !== 1/);
  assert.match(workflow, /public\/audio\/shou-zhu/);
  assert.match(workflow, /byStory\.size !== 23/);
  assert.match(workflow, /count !== 9/);
  assert.match(workflow, /unexpected staged production path exists/);
  assert.match(workflow, /staged receipt set differs from the 23 receipts created by this run/);
});

test("verified production tree must pass final release gates before the single asset push", () => {
  const section = workflow.indexOf("Final release checks on the staged production tree");
  const finalCheck = workflow.indexOf("npm run check", section);
  const release = workflow.indexOf("npm run release:check", finalCheck);
  const commit = workflow.indexOf('git commit -m "assets: install verified narration expansion"');
  const push = workflow.indexOf('git push origin "HEAD:${GITHUB_REF_NAME}"');
  assert.ok(section >= 0 && finalCheck > section && release > finalCheck && commit > release && push > commit);
  assert.match(workflow, /test \"\$\(git rev-parse HEAD\^\)\" = \"\$GITHUB_SHA\"/);
  assert.match(workflow, /git status --porcelain --untracked-files=no/);
});
