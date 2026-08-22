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

test("Kokoro asset cache is keyed by the exact durable provider profile without broad restore fallback", () => {
  assert.match(workflow, /uses:\s*actions\/cache@v4/);
  assert.match(workflow, /path:\s*\.runtime-assets/);
  assert.match(
    workflow,
    /key:\s*kokoro-local-assets-v1-\$\{\{\s*hashFiles\('content\/evidence\/narration\/providers\/kokoro-v1\.1-zh-zf001\.json'\)\s*\}\}/,
  );
  assert.equal(workflow.includes("restore-keys:"), false, "canary asset cache must not use broad restore keys");
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
