import assert from "node:assert/strict";
import test from "node:test";
import {
  NARRATION_ENCODER_PROFILE_ID,
  NARRATION_ENCODER_PROFILE_PATH,
  readNarrationEncoderProfile,
  validateLocalNarrationEncoder,
  validateNarrationEncoderProfile,
} from "./narration-encoder-profile.mjs";

const EXPECTED_FFMPEG_SHA = "ed16af623947494a72e284b6eb8ff225f2da22b38b5d5069c2fd4b4ba3384e41";
const EXPECTED_LAME_SHA = "14b664b4af2fe18975adb3c06c0369b436dd6504ce421736649c0415447c9d00";

function approvedSnapshot() {
  return {
    schemaVersion: 1,
    architecture: "amd64",
    binaries: [
      { name: "ffmpeg", path: "/usr/bin/ffmpeg", package: "ffmpeg", packageVersion: "7:6.1.1-3ubuntu5", sha256: EXPECTED_FFMPEG_SHA, versionLine: "ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers" },
      { name: "ffprobe", path: "/usr/bin/ffprobe", package: "ffmpeg", packageVersion: "7:6.1.1-3ubuntu5", sha256: "272f6ebc634a63d9c8b4ca68e964119d980f25154e5aa2c35e5487da48e9a58f", versionLine: "ffprobe version 6.1.1-3ubuntu5 Copyright (c) 2007-2023 the FFmpeg developers" },
    ],
    libraries: [
      { soname: "libavcodec.so.60", package: "libavcodec60", packageVersion: "7:6.1.1-3ubuntu5", sha256: "8231c9aecba7d02c132de0e16195ccb3e8002a235a5f364b3635df09e7f513e0" },
      { soname: "libavformat.so.60", package: "libavformat60", packageVersion: "7:6.1.1-3ubuntu5", sha256: "5f0970c52b7723037a7f6357cc1931879513449f742240fff7c37ceb7175ac9f" },
      { soname: "libavutil.so.58", package: "libavutil58", packageVersion: "7:6.1.1-3ubuntu5", sha256: "11b0836441b899e1b2183fc10eda5a5f637c03547fdfe5b97774e2cbd5aeb72c" },
      { soname: "libmp3lame.so.0", package: "libmp3lame0", packageVersion: "3.100-6build1", sha256: EXPECTED_LAME_SHA },
      { soname: "libswresample.so.4", package: "libswresample4", packageVersion: "7:6.1.1-3ubuntu5", sha256: "d6ca325614995109ee64b2b2e7dc2d2e5a6a67daba26fed101f0a44b65abc1b1" },
    ],
    encoderInventoryLine: "A....D libmp3lame           libmp3lame MP3 (MPEG audio layer 3) (codec mp3)",
  };
}

export { approvedSnapshot };

test("approved narration encoder profile is exact and model-free-app scoped", () => {
  const binding = readNarrationEncoderProfile();
  const validation = validateNarrationEncoderProfile(binding.profile);
  assert.equal(validation.valid, true, validation.issues.join("; "));
  assert.equal(binding.profile.profileId, NARRATION_ENCODER_PROFILE_ID);
  assert.equal(binding.path, NARRATION_ENCODER_PROFILE_PATH);
  assert.equal(binding.profile.codec.name, "libmp3lame");
  assert.match(binding.profile.boundary, /browser application does not ship/);
});

test("encoder profile identity or binary/library drift fails closed", () => {
  const { profile } = readNarrationEncoderProfile();
  for (const mutate of [
    (value) => { value.status = "pending"; },
    (value) => { value.binaries[0].sha256 = "0".repeat(64); },
    (value) => { value.libraries.find((item) => item.soname === "libmp3lame.so.0").sha256 = "0".repeat(64); },
    (value) => { value.codec.bitrateKbps = 64; },
  ]) {
    const changed = structuredClone(profile);
    mutate(changed);
    assert.equal(validateNarrationEncoderProfile(changed).valid, false);
  }
});

test("local encoder snapshot must match every pinned binary and critical library", () => {
  const good = approvedSnapshot();
  assert.equal(validateLocalNarrationEncoder(good).valid, true);

  const ffmpegDrift = structuredClone(good);
  ffmpegDrift.binaries[0].sha256 = "0".repeat(64);
  assert.equal(validateLocalNarrationEncoder(ffmpegDrift).valid, false);

  const lameDrift = structuredClone(good);
  lameDrift.libraries.find((item) => item.soname === "libmp3lame.so.0").sha256 = "0".repeat(64);
  assert.equal(validateLocalNarrationEncoder(lameDrift).valid, false);
});
