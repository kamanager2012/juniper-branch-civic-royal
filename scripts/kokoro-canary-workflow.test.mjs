import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { repoRoot } from "./story-model.mjs";

const NARRATION_WORKFLOW_FILES = [
  "kokoro-adapter.yml",
  "kokoro-canary.yml",
  "kokoro-provider-audit.yml",
  "kokoro-runtime.yml",
  "narration-encoder.yml",
];

const APPROVED_ACTIONS = new Map([
  ["actions/checkout", { sha: "3d3c42e5aac5ba805825da76410c181273ba90b1", major: "v7" }],
  ["actions/setup-node", { sha: "820762786026740c76f36085b0efc47a31fe5020", major: "v7" }],
  ["actions/setup-python", { sha: "ece7cb06caefa5fff74198d8649806c4678c61a1", major: "v6" }],
  ["actions/cache", { sha: "caa296126883cff596d87d8935842f9db880ef25", major: "v5" }],
  ["actions/upload-artifact", { sha: "b7c566a772e6b6bfb58ed0dc250532a479d7789f", major: "v6" }],
]);

const workflowPath = (file) => join(repoRoot, ".github/workflows", file);
const narrationWorkflows = new Map(
  NARRATION_WORKFLOW_FILES.map((file) => [file, readFileSync(workflowPath(file), "utf8")]),
);
const workflow = narrationWorkflows.get("kokoro-canary.yml");

const CONFIG_SHA = "bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890";
const WEIGHTS_SHA = "b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b";
const VOICE_SHA = "9bdc9a87e13e9bb1ea3e7803259c2ecbfebaeeb2ff80b5d0c76df1a464c1c962";
const CACHE_REF = `actions/cache@${APPROVED_ACTIONS.get("actions/cache").sha}`;
const UPLOAD_REF = `actions/upload-artifact@${APPROVED_ACTIONS.get("actions/upload-artifact").sha}`;

function indexOfRequired(text, label) {
  const index = workflow.indexOf(text);
  assert.notEqual(index, -1, `${label} is missing from Kokoro canary workflow`);
  return index;
}

function eventPaths(eventName, nextEventName) {
  const start = indexOfRequired(`  ${eventName}:\n`, `${eventName} trigger`);
  const end = indexOfRequired(`  ${nextEventName}:\n`, `${nextEventName} trigger`);
  assert.ok(start < end, `${eventName} trigger must appear before ${nextEventName}`);
  return [...workflow.slice(start, end).matchAll(/^\s{6}- "([^"]+)"$/gm)].map((match) => match[1]);
}

test("narration maintenance workflows pin every GitHub Action to the approved immutable commit", () => {
  for (const [file, content] of narrationWorkflows) {
    const usesLines = [...content.matchAll(/^\s*-\s+uses:\s+([^\s#]+)(?:\s+#\s+(v\d+))?\s*$/gm)];
    assert.ok(usesLines.length > 0, `${file} must contain at least one action use`);

    for (const [, reference, majorComment] of usesLines) {
      const match = reference.match(/^([^@]+)@([0-9a-f]{40})$/);
      assert.ok(match, `${file}: action reference must use a lowercase 40-hex commit SHA: ${reference}`);
      const [, action, sha] = match;
      const approved = APPROVED_ACTIONS.get(action);
      assert.ok(approved, `${file}: unapproved GitHub Action: ${action}`);
      assert.equal(sha, approved.sha, `${file}: ${action} must use the approved immutable commit`);
      assert.equal(majorComment, approved.major, `${file}: ${action} must retain the approved major comment`);
    }

    assert.equal(/uses:\s+[^\s#]+@(?![0-9a-f]{40}(?:\s|#|$))/.test(content), false, `${file}: floating action reference detected`);
  }
});

test("pull-request and main-push canary sensitivity stay exactly aligned", () => {
  const pullRequestPaths = eventPaths("pull_request", "push");
  const pushPaths = eventPaths("push", "workflow_dispatch");
  assert.ok(pullRequestPaths.length > 0, "pull_request canary path list must not be empty");
  assert.deepEqual(pushPaths, pullRequestPaths);
});

test("canary cache and artifact actions stay on approved Node 24 action commits", () => {
  const cacheUses = [...workflow.matchAll(new RegExp(`uses:\\s*${CACHE_REF}\\s+#\\s+v5`, "g"))];
  assert.equal(cacheUses.length, 2);
  assert.ok(workflow.includes(`uses: ${UPLOAD_REF} # v6`));
  assert.equal(workflow.includes("actions/cache@v4"), false);
  assert.equal(workflow.includes("actions/upload-artifact@v4"), false);
});

test("uv cache accelerates package downloads without caching the locked runtime environment", () => {
  const installUv = indexOfRequired("name: Install pinned uv", "pinned uv install step");
  const cache = indexOfRequired("name: Restore locked narration uv package cache", "uv package cache step");
  const sync = indexOfRequired("name: Sync locked CPU narration toolchain from lockfile", "locked runtime sync step");
  const encoder = indexOfRequired("name: Install exact approved MP3 encoder/probe tooling", "encoder step");
  assert.ok(installUv < cache && cache < sync && sync < encoder, "uv install, cache restore, and locked sync must stay ordered");

  const installBlock = workflow.slice(installUv, cache);
  assert.match(installBlock, /uv==0\.10\.0/);
  assert.match(installBlock, /test "\$\(uv cache dir\)" = "\$HOME\/\.cache\/uv"/);

  const cacheBlock = workflow.slice(cache, sync);
  assert.ok(cacheBlock.includes(`uses: ${CACHE_REF} # v5`));
  assert.match(cacheBlock, /path:\s*~\/\.cache\/uv/);
  assert.match(
    cacheBlock,
    /key:\s*kokoro-uv-packages-v1-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-py312-uv0\.10\.0-\$\{\{ hashFiles\('scripts\/narration-runtime\/pyproject\.toml', 'scripts\/narration-runtime\/uv\.lock'\) \}\}/,
  );
  assert.equal(cacheBlock.includes(".venv"), false, "uv cache must never include the runnable virtual environment");

  const syncBlock = workflow.slice(sync, encoder);
  assert.equal(/\n\s*if:/.test(syncBlock), false, "locked runtime sync must run on both uv cache hit and miss");
  assert.match(syncBlock, /rm -rf scripts\/narration-runtime\/\.venv/);
  assert.match(syncBlock, /uv sync --locked --project scripts\/narration-runtime/);
  assert.match(syncBlock, /node scripts\/kokoro-runtime-environment\.mjs/);
});

test("Kokoro asset cache is keyed by the exact durable provider profile without broad restore fallback", () => {
  assert.ok(workflow.includes(`uses: ${CACHE_REF} # v5`));
  assert.match(workflow, /path:\s*\.runtime-assets/);
  assert.match(
    workflow,
    /key:\s*kokoro-local-assets-v1-\$\{\{\s*hashFiles\('content\/evidence\/narration\/providers\/kokoro-v1\.1-zh-zf001\.json'\)\s*\}\}/,
  );
  assert.equal(workflow.includes("restore-keys:"), false, "canary caches must not use broad restore keys");
});

test("cache hit may skip network download but can never skip exact asset verification", () => {
  const cache = indexOfRequired("name: Restore exact pinned model asset cache", "cache restore step");
  const download = indexOfRequired("name: Download exact pinned local model assets on cache miss", "cache-miss download step");
  const verify = indexOfRequired("name: Verify exact pinned local model assets after restore or download", "post-cache verification step");
  assert.ok(cache < download && download < verify, "cache, optional download, and mandatory verification must stay ordered");
  assert.match(workflow, /if:\s*steps\.kokoro-assets-cache\.outputs\.cache-hit != 'true'/);

  const verifyBlock = workflow.slice(verify, indexOfRequired("name: Record immutable application state before canary", "state snapshot step"));
  assert.equal(/\n\s*if:/.test(verifyBlock), false, "post-cache verification must run on both cache hit and cache miss");
  assert.match(verifyBlock, /find \.runtime-assets -type f/);
  assert.match(verifyBlock, /test "\$\{#ASSET_FILES\[@\]\}" = "3"/);
  assert.match(verifyBlock, /config\.json/);
  assert.match(verifyBlock, /kokoro-v1_1-zh\.pth/);
  assert.match(verifyBlock, /voices\/zf_001\.pt/);
  assert.ok(verifyBlock.includes(CONFIG_SHA));
  assert.ok(verifyBlock.includes(WEIGHTS_SHA));
  assert.ok(verifyBlock.includes(VOICE_SHA));
  assert.match(verifyBlock, /3228/);
  assert.match(verifyBlock, /327247856/);
  assert.match(verifyBlock, /kokoro-provider-profile\.mjs --check --assets-dir \.runtime-assets/);
});

test("default-branch canary seeds reusable cache while retaining read-only repository permissions", () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.equal(workflow.includes("contents: write"), false);
  assert.equal(workflow.includes("git push"), false);
});
