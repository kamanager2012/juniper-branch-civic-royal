#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildNarrationGenerationSet } from "./narration-generation-set.mjs";
import { readNarrationReceipt } from "./narration-receipt.mjs";
import { KOKORO_MP3_MAX_BYTES, KOKORO_SAMPLE_RATE_HZ } from "./kokoro-generation-contract.mjs";
import { repoRoot } from "./story-model.mjs";

const EXPECTED_KEYS = Object.freeze(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "moral"]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function runJson(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${label} is unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  try {
    return JSON.parse((result.stdout ?? "").trim());
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateAudioProbe(probe) {
  const problems = [];
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const audio = streams.find((stream) => stream?.codec_type === "audio") ?? streams[0] ?? null;
  const duration = Number(probe?.format?.duration ?? audio?.duration);
  const bitRate = Number(audio?.bit_rate ?? probe?.format?.bit_rate);

  if (!audio) problems.push("ffprobe returned no audio stream");
  if (audio?.codec_name !== "mp3") problems.push(`audio codec must be mp3, got ${String(audio?.codec_name)}`);
  if (Number(audio?.sample_rate) !== KOKORO_SAMPLE_RATE_HZ) problems.push(`sample rate must be ${KOKORO_SAMPLE_RATE_HZ} Hz`);
  if (Number(audio?.channels) !== 1) problems.push("audio must be mono");
  if (!Number.isFinite(duration) || duration < 0.5) problems.push("audio duration must be at least 0.5 seconds");
  if (Number.isFinite(bitRate) && (bitRate < 30000 || bitRate > 60000)) problems.push(`audio bitrate is outside expected 30-60 kbps range: ${bitRate}`);

  return {
    valid: problems.length === 0,
    problems,
    durationSeconds: Number.isFinite(duration) ? duration : null,
    bitRate: Number.isFinite(bitRate) ? bitRate : null,
  };
}

export function validateVolumeReport(stderr) {
  const meanMatch = String(stderr).match(/mean_volume:\s*(-?inf|[-+]?\d+(?:\.\d+)?)\s*dB/i);
  const maxMatch = String(stderr).match(/max_volume:\s*(-?inf|[-+]?\d+(?:\.\d+)?)\s*dB/i);
  const parse = (match) => {
    if (!match) return null;
    return match[1].toLowerCase() === "-inf" ? -Infinity : Number(match[1]);
  };
  const meanDb = parse(meanMatch);
  const maxDb = parse(maxMatch);
  const problems = [];
  if (meanDb === null || !Number.isFinite(meanDb)) problems.push("mean volume is missing or silent");
  if (maxDb === null || !Number.isFinite(maxDb)) problems.push("max volume is missing or silent");
  if (Number.isFinite(meanDb) && meanDb < -55) problems.push(`mean volume is suspiciously quiet: ${meanDb} dB`);
  if (Number.isFinite(maxDb) && maxDb < -30) problems.push(`max volume is suspiciously quiet: ${maxDb} dB`);
  return { valid: problems.length === 0, problems, meanDb, maxDb };
}

function inspectVolume(path, ffmpeg) {
  const result = spawnSync(ffmpeg, [
    "-hide_banner",
    "-nostats",
    "-i", path,
    "-af", "volumedetect",
    "-f", "null",
    "-",
  ], { encoding: "utf8" });
  if (result.error) throw new Error(`ffmpeg volumedetect is unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg volumedetect failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return validateVolumeReport(result.stderr ?? "");
}

export function inspectCanaryReceipt(receiptPath, options = {}) {
  const ffprobe = options.ffprobe ?? "ffprobe";
  const ffmpeg = options.ffmpeg ?? "ffmpeg";
  const { receipt, receiptSha256, receiptPath: normalizedReceiptPath } = readNarrationReceipt(receiptPath);
  const problems = [];

  if (receipt.provider.name !== "kokoro-local") problems.push("canary receipt provider must be kokoro-local");
  if (receipt.inputItemCount !== 9 || receipt.items.length !== 9) problems.push("canary receipt must contain exactly one nine-item story batch");

  const storyIds = [...new Set(receipt.items.map((item) => item.key.split("/")[0]))];
  if (storyIds.length !== 1) problems.push("canary receipt must contain exactly one story id");
  const storyId = storyIds[0] ?? null;

  let generationSet = null;
  if (storyId) {
    generationSet = buildNarrationGenerationSet({ story: storyId });
    if (generationSet.count !== 9) problems.push("canonical canary generation set must contain nine items");
    if (generationSet.inputDigestSha256 !== receipt.inputDigestSha256) problems.push("receipt input digest no longer matches canonical story generation set");
    const expectedKeys = generationSet.entries.map((entry) => entry.key).sort();
    const actualKeys = receipt.items.map((item) => item.key).sort();
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) problems.push("receipt keys do not exactly match canonical story generation set");
    const suffixes = receipt.items.map((item) => item.key.split("/")[1]).sort();
    if (JSON.stringify(suffixes) !== JSON.stringify([...EXPECTED_KEYS].sort())) problems.push("receipt does not contain p0..p7 plus moral exactly once");
  }

  const items = [];
  for (const item of receipt.items) {
    const path = `${repoRoot}/${item.file}`;
    let bytes;
    let actualSha;
    try {
      const buffer = readFileSync(path);
      bytes = buffer.length;
      actualSha = sha256(buffer);
    } catch (error) {
      problems.push(`${item.key}: generated MP3 cannot be read: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (bytes < 1000 || bytes > KOKORO_MP3_MAX_BYTES) problems.push(`${item.key}: MP3 bytes are outside 1000..${KOKORO_MP3_MAX_BYTES}`);
    if (actualSha !== item.audioSha256) problems.push(`${item.key}: MP3 SHA-256 does not match receipt`);
    if (statSync(path).size !== bytes) problems.push(`${item.key}: MP3 size changed during QC`);

    let probeValidation;
    let volumeValidation;
    try {
      const probe = runJson(ffprobe, [
        "-v", "error",
        "-show_entries", "format=duration,bit_rate:stream=codec_type,codec_name,sample_rate,channels,bit_rate,duration",
        "-of", "json",
        path,
      ], `${item.key} ffprobe`);
      probeValidation = validateAudioProbe(probe);
      for (const problem of probeValidation.problems) problems.push(`${item.key}: ${problem}`);
    } catch (error) {
      problems.push(`${item.key}: ${error instanceof Error ? error.message : String(error)}`);
      probeValidation = { valid: false, durationSeconds: null, bitRate: null, problems: [] };
    }

    try {
      volumeValidation = inspectVolume(path, ffmpeg);
      for (const problem of volumeValidation.problems) problems.push(`${item.key}: ${problem}`);
    } catch (error) {
      problems.push(`${item.key}: ${error instanceof Error ? error.message : String(error)}`);
      volumeValidation = { valid: false, meanDb: null, maxDb: null, problems: [] };
    }

    items.push({
      key: item.key,
      file: item.file,
      bytes,
      audioSha256: actualSha,
      durationSeconds: probeValidation.durationSeconds,
      bitRate: probeValidation.bitRate,
      meanDb: volumeValidation.meanDb,
      maxDb: volumeValidation.maxDb,
    });
  }

  const durations = items.map((item) => item.durationSeconds).filter(Number.isFinite);
  const byteCounts = items.map((item) => item.bytes).filter(Number.isFinite);
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const report = {
    schemaVersion: 1,
    canary: "kokoro-one-story-v1",
    valid: problems.length === 0,
    problems: [...new Set(problems)].sort(),
    storyId,
    receiptPath: normalizedReceiptPath,
    receiptSha256,
    inputDigestSha256: receipt.inputDigestSha256,
    runtimeEnvironmentId: receipt.execution?.runtime?.environment?.id ?? null,
    runtimeLockSha256: receipt.execution?.runtime?.environment?.lock?.sha256 ?? null,
    itemCount: items.length,
    durationSeconds: durations.length ? {
      min: Math.min(...durations),
      max: Math.max(...durations),
      average: sum(durations) / durations.length,
      total: sum(durations),
    } : null,
    bytes: byteCounts.length ? {
      min: Math.min(...byteCounts),
      max: Math.max(...byteCounts),
      average: sum(byteCounts) / byteCounts.length,
      total: sum(byteCounts),
    } : null,
    items,
  };
  return report;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1]?.endsWith("kokoro-canary-qc.mjs")) {
  const receiptPath = argValue("--receipt");
  if (!receiptPath) throw new Error("Pass --receipt content/evidence/narration/receipts/<batch>.json");
  const report = inspectCanaryReceipt(receiptPath, {
    ffprobe: argValue("--ffprobe") ?? "ffprobe",
    ffmpeg: argValue("--ffmpeg") ?? "ffmpeg",
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}
