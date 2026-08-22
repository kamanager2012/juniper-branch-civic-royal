import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { repoRoot } from "./story-model.mjs";

const WORKFLOW_PATH = join(repoRoot, ".github/workflows/kokoro-canary.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

const CONFIG_SHA = "bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890";
const WEIGHTS_SHA = "b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b";
const VOICE_SHA = "9bdc9a87e13e9bb1ea3e7803259c2ecbfebaeeb2ff80b5d0c76df1a464c1c962";

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

test("pull-request and main-push canary sensitivity stay exactly aligned", () => {
  const pullRequestPaths = eventPaths("pull_request", "push");
  const pushPaths = eventPaths("push", "workflow_dispatch");
  assert.ok(pullRequestPaths.length > 0, "pull_request canary path list must not be empty");
  assert.deepEqual(pushPaths, pullRequestPaths);
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
  assert.match(cacheBlock, /uses:\s*actions\/cache@v4/);
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
  assert.match(workflow, /uses:\s*actions\/cache@v4/);
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
