#!/usr/bin/env node
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readNarrationReceipt, safeRelativePath } from "./narration-receipt.mjs";
import { buildNarrationPlan, narrationStatePath, readNarrationState } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function looksLikeMp3(buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function validateEvidenceReference(value) {
  if (typeof value !== "string" || value.trim() === "") return "rights evidence must be a non-empty string";
  const reference = value.trim();
  if (/^https:\/\//i.test(reference)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(reference)) return "external rights evidence URLs must use HTTPS";
  if (!safeRelativePath(reference)) return "local rights evidence must be a safe repository-relative path";
  const absolute = join(repoRoot, reference);
  if (!existsSync(absolute)) return `local rights evidence does not exist: ${reference}`;
  const stat = statSync(absolute);
  if (!stat.isFile()) return `local rights evidence is not a file: ${reference}`;
  if (stat.size === 0) return `local rights evidence is empty: ${reference}`;
  return null;
}

export function buildNarrationStateFromReceipt({ receipt, receiptPath, receiptSha256, plan, state, replace = false }) {
  const problems = [];
  const byKey = new Map(plan.items.map((item) => [item.key, item]));
  const nextEntries = { ...state.entries };

  for (const evidence of receipt.rights.evidence) {
    const problem = validateEvidenceReference(evidence);
    if (problem) problems.push(problem);
  }

  for (const receiptItem of receipt.items) {
    const canonical = byKey.get(receiptItem.key);
    if (!canonical) {
      problems.push(`${receiptItem.key}: item is not present in the canonical narration plan`);
      continue;
    }
    if (receiptItem.file !== canonical.output) {
      problems.push(`${receiptItem.key}: receipt file does not match canonical output ${canonical.output}`);
    }
    if (receiptItem.textSha256 !== canonical.textSha256) {
      problems.push(`${receiptItem.key}: receipt text SHA-256 does not match canonical text`);
    }
    if (!canonical.audioSha256) {
      problems.push(`${receiptItem.key}: canonical narration MP3 is missing`);
    } else if (receiptItem.audioSha256 !== canonical.audioSha256) {
      problems.push(`${receiptItem.key}: receipt audio SHA-256 does not match release MP3`);
    }

    const audioPath = join(repoRoot, canonical.output);
    if (existsSync(audioPath)) {
      const audio = readFileSync(audioPath);
      if (audio.length < 1000 || !looksLikeMp3(audio)) {
        problems.push(`${receiptItem.key}: release narration is not a valid MP3 payload`);
      }
    }

    const existing = state.entries[receiptItem.key] ?? null;
    if (existing && !replace) {
      const samePair = existing.textSha256 === receiptItem.textSha256 && existing.audioSha256 === receiptItem.audioSha256;
      if (!samePair) {
        problems.push(`${receiptItem.key}: narration state already contains a different text/audio pair; pass --replace only after intentional review`);
        continue;
      }
    }

    nextEntries[receiptItem.key] = {
      ...(existing ?? {}),
      provider: receipt.provider.name,
      voice: receipt.provider.voice,
      language: receipt.provider.language,
      generator: receipt.provider.generator,
      textSha256: receiptItem.textSha256,
      audioSha256: receiptItem.audioSha256,
      generatedAt: receipt.createdAt,
      batchId: receipt.batchId,
      receiptPath,
      receiptSha256,
      rightsClaim: receipt.rights.claim,
      rightsEvidence: [...receipt.rights.evidence],
    };
  }

  if (problems.length > 0) {
    return { valid: false, problems: [...new Set(problems)].sort(), state: null, imported: 0 };
  }

  const sortedEntries = Object.fromEntries(Object.entries(nextEntries).sort(([a], [b]) => a.localeCompare(b)));
  return {
    valid: true,
    problems: [],
    state: { schemaVersion: 1, entries: sortedEntries },
    imported: receipt.items.length,
  };
}

export function importNarrationReceipt(receiptPath, options = {}) {
  const { receipt, receiptSha256, receiptPath: normalizedReceiptPath } = readNarrationReceipt(receiptPath);
  const plan = buildNarrationPlan();
  const state = readNarrationState();
  const result = buildNarrationStateFromReceipt({
    receipt,
    receiptPath: normalizedReceiptPath,
    receiptSha256,
    plan,
    state,
    replace: options.replace === true,
  });
  if (!result.valid) throw new Error(`Narration receipt does not match release state:\n${result.problems.join("\n")}`);
  return { ...result, receipt, receiptSha256, receiptPath: normalizedReceiptPath };
}

function writeStateAtomically(state) {
  const tempPath = `${narrationStatePath}.tmp-${process.pid}`;
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tempPath, narrationStatePath);
}

if (process.argv[1]?.endsWith("import-narration-receipt.mjs")) {
  const receiptPath = argValue("--receipt");
  const write = process.argv.includes("--write");
  const replace = process.argv.includes("--replace");
  if (!receiptPath) throw new Error("Pass --receipt content/evidence/narration/receipts/<batch>.json");

  const result = importNarrationReceipt(receiptPath, { replace });
  console.log(JSON.stringify({
    schemaVersion: 1,
    receiptPath: result.receiptPath,
    receiptSha256: result.receiptSha256,
    batchId: result.receipt.batchId,
    imported: result.imported,
    mode: write ? "write" : "dry-run",
  }, null, 2));

  if (write) writeStateAtomically(result.state);
}
