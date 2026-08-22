#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { assertNarrationExpansionAllowed } from "./narration-pilot-approval.mjs";
import { repoRoot } from "./story-model.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const story = argValue("--story");
const all = process.argv.includes("--all");
const pending = process.argv.includes("--pending");
const scopeCount = Number(Boolean(story)) + Number(all) + Number(pending);
if (scopeCount !== 1) {
  throw new Error("Choose exactly one narration scope: --story <id>, --all, or --pending");
}

assertNarrationExpansionAllowed({ story, all, pending });

const engine = join(repoRoot, "scripts/generate-narration.mjs");
const result = spawnSync(process.execPath, [engine, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Narration generator terminated by signal ${result.signal}`);
process.exitCode = result.status ?? 1;
