import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { repoRoot } from "./story-model.mjs";

test("narration verification contract stays fail-closed", () => {
  const contract = JSON.parse(readFileSync(join(repoRoot, "content/evidence/narration/contract-v1.json"), "utf8"));
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.contract, "narration-verification-v1");
  assert.equal(contract.canonicalSource, "content/published-stories.json");
  assert.ok(contract.requirements.current.includes("exact canonical text SHA-256"));
  assert.ok(contract.requirements.current.includes("exact release MP3 SHA-256"));
  assert.ok(contract.requirements.rightsVerified.some((value) => value.includes("repository-local durable receipt")));
  assert.match(contract.legacyPolicy, /remains unverified/i);
  assert.match(contract.legacyPolicy, /Do not create retrospective receipts/i);
  assert.match(contract.driftPolicy, /revokes generated narration provenance/i);
  assert.match(contract.importMode, /dry-run by default/i);
  assert.match(contract.importMode, /--write/);
});
