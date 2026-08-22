import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLineageRegistry } from "./source-lineage.mjs";

const asset = {
  id: "image:public/stories/example/cover.jpg",
  category: "story-image",
  label: "public/stories/example/cover.jpg",
  fingerprintSha256: "a".repeat(64),
};

function registry(entry) {
  return {
    schemaVersion: 1,
    originCommit: "8".repeat(40),
    entries: entry ? { [asset.id]: entry } : {},
  };
}

const validEntry = {
  fingerprintSha256: "a".repeat(64),
  origin: {
    commit: "8".repeat(40),
    path: "public/stories/example/cover.jpg",
    method: "git-blob-identity",
    gitBlob: "b".repeat(40),
  },
};

test("current lineage entry is known", () => {
  const report = evaluateLineageRegistry([asset], registry(validEntry));
  assert.equal(report.lineage.known, 1);
  assert.equal(report.lineage.unknown, 0);
  assert.equal(report.lineage.stale, 0);
  assert.deepEqual(report.issues, []);
});

test("fingerprint drift makes lineage stale", () => {
  const report = evaluateLineageRegistry(
    [{ ...asset, fingerprintSha256: "c".repeat(64) }],
    registry(validEntry),
  );
  assert.equal(report.lineage.stale, 1);
  assert.equal(report.lineage.known, 0);
});

test("malformed or unknown lineage entries fail validation", () => {
  const malformed = registry({ ...validEntry, origin: { ...validEntry.origin, method: "assumed" } });
  malformed.entries["image:public/stories/removed.jpg"] = validEntry;
  const report = evaluateLineageRegistry([asset], malformed);
  assert.equal(report.lineage.invalid, 1);
  assert.equal(report.issues.length, 2);
  assert.match(report.issues.join("\n"), /origin\.method/);
  assert.match(report.issues.join("\n"), /unknown asset/);
});
