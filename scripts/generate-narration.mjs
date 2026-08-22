#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildNarrationPlan, narrationStatePath, readNarrationState } from "./narration-plan.mjs";
import { repoRoot } from "./story-model.mjs";

const API = "https://api.x.ai/v1/tts";
const VOICES_API = "https://api.x.ai/v1/tts/voices";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function looksLikeMp3(buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listVoiceIds(apiKey) {
  const response = await fetch(VOICES_API, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`xAI voice lookup failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  const voices = Array.isArray(body?.voices) ? body.voices : [];
  return voices.map((voice) => voice?.voice_id).filter((id) => typeof id === "string");
}

async function decodeAudio(response) {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await response.json();
    if (typeof body?.audio !== "string") throw new Error("xAI TTS JSON response did not contain base64 audio");
    return Buffer.from(body.audio, "base64");
  }
  return Buffer.from(await response.arrayBuffer());
}

async function synthesize(item, apiKey, voiceId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: item.text,
          voice_id: voiceId,
          language: "zh",
        }),
      });
      if (!response.ok) throw new Error(`xAI TTS failed: ${response.status} ${await response.text()}`);
      const audio = await decodeAudio(response);
      if (audio.length < 1000 || !looksLikeMp3(audio)) {
        throw new Error(`xAI TTS returned an invalid MP3 payload (${audio.length} bytes)`);
      }
      return audio;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 900);
    }
  }
  throw lastError;
}

async function worker(queue, state, apiKey, voiceId) {
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) return;
    const audio = await synthesize(item, apiKey, voiceId);
    const outputPath = join(repoRoot, item.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    const tempPath = `${outputPath}.tmp-${process.pid}`;
    writeFileSync(tempPath, audio);
    renameSync(tempPath, outputPath);
    state.entries[item.key] = {
      provider: "xai",
      endpoint: "/v1/tts",
      voiceId,
      language: "zh",
      textSha256: item.textSha256,
      audioSha256: sha256(audio),
      generatedAt: new Date().toISOString(),
    };
    console.log(`generated ${item.key} (${audio.length} bytes)`);
  }
}

async function main() {
  const story = argValue("--story");
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const voiceId = argValue("--voice") ?? process.env.XAI_TTS_VOICE_ID ?? null;
  const concurrencyRaw = Number(argValue("--concurrency") ?? "3");
  const concurrency = Number.isInteger(concurrencyRaw) && concurrencyRaw >= 1 && concurrencyRaw <= 8 ? concurrencyRaw : 3;

  if (!story && !all) throw new Error("Refusing bulk generation without an explicit scope. Pass --story <id> or --all.");
  if (!voiceId) throw new Error("Voice must be explicit. Pass --voice <voice_id> or set XAI_TTS_VOICE_ID.");

  const plan = buildNarrationPlan({ story });
  const selected = plan.items.filter((item) => force || item.status !== "current");
  const summary = {
    scope: story ?? "all",
    voiceId,
    selected: selected.length,
    currentSkipped: plan.items.length - selected.length,
    statuses: Object.fromEntries(["current", "stale", "unverified", "missing"].map((status) => [status, plan.items.filter((item) => item.status === status).length])),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun || selected.length === 0) return;

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is required for generation");
  const voiceIds = await listVoiceIds(apiKey);
  if (!voiceIds.includes(voiceId)) {
    throw new Error(`Configured xAI voice '${voiceId}' is unavailable. Available voices: ${voiceIds.join(", ")}`);
  }

  const state = readNarrationState();
  const queue = [...selected];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker(queue, state, apiKey, voiceId)));

  const sortedEntries = Object.fromEntries(Object.entries(state.entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(narrationStatePath, `${JSON.stringify({ schemaVersion: 1, entries: sortedEntries }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
