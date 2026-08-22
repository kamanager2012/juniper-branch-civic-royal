#!/usr/bin/env node
import { assertNarrationExpansionAllowed } from "./narration-pilot-approval.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const story = argValue("--story");
  const all = process.argv.includes("--all");
  if (Boolean(story) === Boolean(all)) {
    throw new Error("Choose exactly one narration scope: --story <id> or --all");
  }

  assertNarrationExpansionAllowed({ story, all });
  await import("./generate-narration-core.mjs");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
