import assert from "node:assert/strict";
import test from "node:test";
import { validateAudioProbe, validateVolumeReport } from "./kokoro-canary-qc.mjs";

test("canary audio probe accepts 24 kHz mono MP3 within narration bitrate range", () => {
  const result = validateAudioProbe({
    streams: [{
      codec_type: "audio",
      codec_name: "mp3",
      sample_rate: "24000",
      channels: 1,
      bit_rate: "40000",
      duration: "3.25",
    }],
    format: { duration: "3.25", bit_rate: "40000" },
  });
  assert.equal(result.valid, true, result.problems.join("; "));
  assert.equal(result.durationSeconds, 3.25);
  assert.equal(result.bitRate, 40000);
});

test("canary audio probe fails closed on wrong codec/sample rate/channels", () => {
  const result = validateAudioProbe({
    streams: [{
      codec_type: "audio",
      codec_name: "aac",
      sample_rate: "44100",
      channels: 2,
      bit_rate: "128000",
      duration: "0.2",
    }],
    format: { duration: "0.2", bit_rate: "128000" },
  });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((problem) => problem.includes("codec")));
  assert.ok(result.problems.some((problem) => problem.includes("sample rate")));
  assert.ok(result.problems.some((problem) => problem.includes("mono")));
  assert.ok(result.problems.some((problem) => problem.includes("duration")));
  assert.ok(result.problems.some((problem) => problem.includes("bitrate")));
});

test("canary volume report rejects silence and suspiciously quiet output", () => {
  const good = validateVolumeReport("mean_volume: -20.5 dB\nmax_volume: -2.0 dB\n");
  assert.equal(good.valid, true, good.problems.join("; "));
  assert.equal(good.meanDb, -20.5);
  assert.equal(good.maxDb, -2);

  const silent = validateVolumeReport("mean_volume: -inf dB\nmax_volume: -inf dB\n");
  assert.equal(silent.valid, false);

  const quiet = validateVolumeReport("mean_volume: -60.0 dB\nmax_volume: -35.0 dB\n");
  assert.equal(quiet.valid, false);
  assert.ok(quiet.problems.some((problem) => problem.includes("mean volume")));
  assert.ok(quiet.problems.some((problem) => problem.includes("max volume")));
});
