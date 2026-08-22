import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildNarrationStateFromReceipt } from "./import-narration-receipt.mjs";
import { readNarrationReceipt, sha256Buffer, validateNarrationReceipt } from "./narration-receipt.mjs";
import { evaluateNarrationStatus } from "./narration-plan.mjs";
import { buildNarrationProvenanceEntries } from "./narration-rights.mjs";

const TEXT_SHA = "a".repeat(64);
const RECEIPT_PATH = "content/evidence/narration/receipts/test-batch.json";
const AUDIO_PATH = "public/audio/demo/p0.mp3";
const RIGHTS_PATH = "content/evidence/narration/rights/test-provider.txt";

function fixtureReceipt(audioSha256) {
  return {
    schemaVersion: 1,
    batchId: "test-batch-001",
    canonicalSource: "content/published-stories.json",
    createdAt: "2026-08-22T06:00:00.000Z",
    provider: {
      name: "test-provider",
      voice: "voice-a",
      language: "zh",
      generator: "test-generator-v1",
    },
    rights: {
      claim: "permission",
      evidence: [RIGHTS_PATH],
    },
    items: [
      {
        key: "demo/p0",
        file: AUDIO_PATH,
        textSha256: TEXT_SHA,
        audioSha256,
      },
    ],
  };
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "narration-contract-"));
  mkdirSync(join(root, "public/audio/demo"), { recursive: true });
  mkdirSync(join(root, "content/evidence/narration/receipts"), { recursive: true });
  mkdirSync(join(root, "content/evidence/narration/rights"), { recursive: true });

  const audio = Buffer.concat([Buffer.from("ID3", "ascii"), Buffer.alloc(1200, 7)]);
  const audioSha256 = sha256Buffer(audio);
  writeFileSync(join(root, AUDIO_PATH), audio);
  writeFileSync(join(root, RIGHTS_PATH), "Test-only provider permission evidence.\n");

  const receipt = fixtureReceipt(audioSha256);
  writeFileSync(join(root, RECEIPT_PATH), `${JSON.stringify(receipt, null, 2)}\n`);
  return { root, audioSha256, receipt };
}

test("narration current state requires exact text and audio hashes", () => {
  assert.equal(evaluateNarrationStatus({ exists: false, textSha256: TEXT_SHA, audioSha256: null, entry: null }), "missing");
  assert.equal(evaluateNarrationStatus({ exists: true, textSha256: TEXT_SHA, audioSha256: "b".repeat(64), entry: null }), "unverified");
  assert.equal(evaluateNarrationStatus({ exists: true, textSha256: TEXT_SHA, audioSha256: "b".repeat(64), entry: { textSha256: TEXT_SHA } }), "stale");
  assert.equal(evaluateNarrationStatus({ exists: true, textSha256: TEXT_SHA, audioSha256: "b".repeat(64), entry: { textSha256: TEXT_SHA, audioSha256: "b".repeat(64) } }), "current");
  assert.equal(evaluateNarrationStatus({ exists: true, textSha256: TEXT_SHA, audioSha256: "b".repeat(64), entry: { textSha256: "c".repeat(64), audioSha256: "b".repeat(64) } }), "stale");
  assert.equal(evaluateNarrationStatus({ exists: true, textSha256: TEXT_SHA, audioSha256: "b".repeat(64), entry: { textSha256: TEXT_SHA, audioSha256: "c".repeat(64) } }), "stale");
});

test("receipt schema rejects ambiguous paths and duplicate narration entries", () => {
  const valid = fixtureReceipt("b".repeat(64));
  assert.deepEqual(validateNarrationReceipt(valid), { valid: true, problems: [] });

  const invalid = structuredClone(valid);
  invalid.items.push({ ...invalid.items[0], file: "../escape.mp3" });
  const result = validateNarrationReceipt(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("duplicates")));
  assert.ok(result.problems.some((problem) => problem.includes("canonical public/audio")));
});

test("receipt contract binds exact canonical text/audio pair and durable rights evidence", () => {
  const fixture = makeFixture();
  try {
    const durable = readNarrationReceipt(RECEIPT_PATH, { root: fixture.root });
    const plan = {
      items: [{
        key: "demo/p0",
        output: AUDIO_PATH,
        textSha256: TEXT_SHA,
        audioSha256: fixture.audioSha256,
      }],
    };
    const result = buildNarrationStateFromReceipt({
      receipt: durable.receipt,
      receiptPath: durable.receiptPath,
      receiptSha256: durable.receiptSha256,
      plan,
      state: { schemaVersion: 1, entries: {} },
      root: fixture.root,
    });

    assert.equal(result.valid, true, result.problems.join("; "));
    assert.equal(result.imported, 1);
    const entry = result.state.entries["demo/p0"];
    assert.equal(entry.textSha256, TEXT_SHA);
    assert.equal(entry.audioSha256, fixture.audioSha256);
    assert.equal(entry.receiptSha256, durable.receiptSha256);
    assert.equal(entry.rightsClaim, "permission");
    assert.deepEqual(entry.rightsEvidence, [RIGHTS_PATH]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("text or audio mismatch prevents narration state update", () => {
  const fixture = makeFixture();
  try {
    const durable = readNarrationReceipt(RECEIPT_PATH, { root: fixture.root });
    const badReceipt = structuredClone(durable.receipt);
    badReceipt.items[0].textSha256 = "c".repeat(64);
    const result = buildNarrationStateFromReceipt({
      receipt: badReceipt,
      receiptPath: durable.receiptPath,
      receiptSha256: durable.receiptSha256,
      plan: { items: [{ key: "demo/p0", output: AUDIO_PATH, textSha256: TEXT_SHA, audioSha256: fixture.audioSha256 }] },
      state: { schemaVersion: 1, entries: {} },
      root: fixture.root,
    });
    assert.equal(result.valid, false);
    assert.ok(result.problems.some((problem) => problem.includes("text SHA-256")));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("durable receipt drift revokes generated narration provenance", () => {
  const fixture = makeFixture();
  try {
    const durable = readNarrationReceipt(RECEIPT_PATH, { root: fixture.root });
    const imported = buildNarrationStateFromReceipt({
      receipt: durable.receipt,
      receiptPath: durable.receiptPath,
      receiptSha256: durable.receiptSha256,
      plan: { items: [{ key: "demo/p0", output: AUDIO_PATH, textSha256: TEXT_SHA, audioSha256: fixture.audioSha256 }] },
      state: { schemaVersion: 1, entries: {} },
      root: fixture.root,
    });
    assert.equal(imported.valid, true);

    const state = imported.state.entries["demo/p0"];
    const plan = {
      items: [{
        key: "demo/p0",
        output: AUDIO_PATH,
        textSha256: TEXT_SHA,
        audioSha256: fixture.audioSha256,
        status: "current",
        provenance: state,
      }],
    };
    const assets = [{
      id: `audio:${AUDIO_PATH}`,
      category: "narration",
      path: AUDIO_PATH,
      fingerprintSha256: fixture.audioSha256,
    }];
    const readReceipt = (path) => readNarrationReceipt(path, { root: fixture.root });

    const good = buildNarrationProvenanceEntries(assets, plan, { readReceipt });
    assert.deepEqual(Object.keys(good.entries), [`audio:${AUDIO_PATH}`]);
    assert.deepEqual(good.issues, []);

    const changed = JSON.parse(readFileSync(join(fixture.root, RECEIPT_PATH), "utf8"));
    changed.provider.voice = "voice-b";
    writeFileSync(join(fixture.root, RECEIPT_PATH), `${JSON.stringify(changed, null, 2)}\n`);

    const drifted = buildNarrationProvenanceEntries(assets, plan, { readReceipt });
    assert.deepEqual(drifted.entries, {});
    assert.ok(drifted.issues.some((issue) => issue.includes("receipt SHA-256")));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
