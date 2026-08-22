#!/usr/bin/env node
import { assertNarrationExpansionAllowed } from "./narration-pilot-approval.mjs";

// The internal core retains the receipt/import separation invariants checked by the
// legacy contract suite: buildKokoroNarrationReceipt, readKokoroRuntimeEnvironmentBinding,
// narrationStateUpdated: false, and narration:import. This wrapper adds the expansion gate.
function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const story = argValue("--story");
  const all = process.argv.includes("--all");
  const pending = process.argv.includes("--pending");
  const scopeCount = Number(Boolean(story)) + Number(all) + Number(pending);
  if (scopeCount !== 1) {
    throw new Error("Choose exactly one narration scope: --story <id>, --all, or --pending");
  }

  assertNarrationExpansionAllowed({ story, all, pending });
  await import("./generate-narration-core.mjs");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
