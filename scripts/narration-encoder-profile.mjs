#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "./story-model.mjs";

export const NARRATION_ENCODER_PROFILE_PATH = "content/evidence/narration/encoders/ffmpeg-noble-6.1.1-libmp3lame.json";
export const NARRATION_ENCODER_PROFILE_ID = "ffmpeg-noble-6.1.1-libmp3lame-v1";
export const narrationEncoderProfileAbsolutePath = resolve(repoRoot, NARRATION_ENCODER_PROFILE_PATH);

const EXPECTED = Object.freeze({
  profileId: NARRATION_ENCODER_PROFILE_ID,
  status: "approved",
  os: "Ubuntu 24.04.4 LTS",
  architecture: "amd64",
  codec: { name: "libmp3lame", bitrateKbps: 40, sampleRateHz: 24000, channels: 1 },
  binaries: {
    ffmpeg: { path: "/usr/bin/ffmpeg", package: "ffmpeg", packageVersion: "7:6.1.1-3ubuntu5", sha256: "ed16af623947494a72e284b6eb8ff225f2da22b38b5d5069c2fd4b4ba3384e41" },
    ffprobe: { path: "/usr/bin/ffprobe", package: "ffmpeg", packageVersion: "7:6.1.1-3ubuntu5", sha256: "272f6ebc634a63d9c8b4ca68e964119d980f25154e5aa2c35e5487da48e9a58f" },
  },
  libraries: {
    "libavcodec.so.60": { package: "libavcodec60", packageVersion: "7:6.1.1-3ubuntu5", sha256: "8231c9aecba7d02c132de0e16195ccb3e8002a235a5f364b3635df09e7f513e0" },
    "libavformat.so.60": { package: "libavformat60", packageVersion: "7:6.1.1-3ubuntu5", sha256: "5f0970c52b7723037a7f6357cc1931879513449f742240fff7c37ceb7175ac9f" },
    "libavutil.so.58": { package: "libavutil58", packageVersion: "7:6.1.1-3ubuntu5", sha256: "11b0836441b899e1b2183fc10eda5a5f637c03547fdfe5b97774e2cbd5aeb72c" },
    "libmp3lame.so.0": { package: "libmp3lame0", packageVersion: "3.100-6build1", sha256: "14b664b4af2fe18975adb3c06c0369b436dd6504ce421736649c0415447c9d00" },
    "libswresample.so.4": { package: "libswresample4", packageVersion: "7:6.1.1-3ubuntu5", sha256: "d6ca325614995109ee64b2b2e7dc2d2e5a6a67daba26fed101f0a44b65abc1b1" },
  },
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function command(...args) {
  return execFileSync(args[0], args.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function packageVersionFor(path) {
  const owner = command("dpkg-query", "-S", path).split(":", 1)[0];
  const version = command("dpkg-query", "-W", "-f=${Version}", owner);
  return { package: owner, packageVersion: version };
}

export function readNarrationEncoderProfile(path = narrationEncoderProfileAbsolutePath) {
  const bytes = readFileSync(path);
  return { profile: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex"), path: NARRATION_ENCODER_PROFILE_PATH };
}

export function validateNarrationEncoderProfile(profile) {
  const issues = [];
  if (profile?.schemaVersion !== 1) issues.push("encoder profile schemaVersion must be 1");
  if (profile?.profileId !== EXPECTED.profileId) issues.push("encoder profile id drifted");
  if (profile?.status !== EXPECTED.status) issues.push("encoder profile must remain approved");
  if (profile?.purpose !== "maintainer-side static narration MP3 encoding") issues.push("encoder profile purpose drifted");
  if (profile?.target?.os !== EXPECTED.os) issues.push("encoder profile OS drifted");
  if (profile?.target?.architecture !== EXPECTED.architecture) issues.push("encoder profile architecture drifted");
  for (const [key, value] of Object.entries(EXPECTED.codec)) {
    if (profile?.codec?.[key] !== value) issues.push(`encoder codec ${key} drifted`);
  }

  const binaries = new Map((profile?.binaries ?? []).map((item) => [item?.name, item]));
  for (const [name, expected] of Object.entries(EXPECTED.binaries)) {
    const actual = binaries.get(name);
    if (!actual) {
      issues.push(`encoder binary ${name} is missing`);
      continue;
    }
    for (const key of ["path", "package", "packageVersion", "sha256"]) {
      if (actual[key] !== expected[key]) issues.push(`encoder binary ${name} ${key} drifted`);
    }
  }
  if (binaries.size !== Object.keys(EXPECTED.binaries).length) issues.push("encoder profile contains unexpected binaries");

  const libraries = new Map((profile?.libraries ?? []).map((item) => [item?.soname, item]));
  for (const [soname, expected] of Object.entries(EXPECTED.libraries)) {
    const actual = libraries.get(soname);
    if (!actual) {
      issues.push(`encoder library ${soname} is missing`);
      continue;
    }
    for (const key of ["package", "packageVersion", "sha256"]) {
      if (actual[key] !== expected[key]) issues.push(`encoder library ${soname} ${key} drifted`);
    }
  }
  if (libraries.size !== Object.keys(EXPECTED.libraries).length) issues.push("encoder profile contains unexpected libraries");
  if (!String(profile?.encoderInventoryLine ?? "").includes("libmp3lame")) issues.push("encoder profile does not prove libmp3lame availability");
  if (!String(profile?.boundary ?? "").includes("browser application does not ship")) issues.push("encoder profile offline-app boundary is missing");

  return { valid: issues.length === 0, issues: [...new Set(issues)].sort() };
}

export function inspectLocalNarrationEncoder(options = {}) {
  const ffmpegPath = realpathSync(options.ffmpegPath ?? "/usr/bin/ffmpeg");
  const ffprobePath = realpathSync(options.ffprobePath ?? "/usr/bin/ffprobe");
  const lddLines = command("ldd", ffmpegPath).split(/\r?\n/);
  const wanted = new Set(Object.keys(EXPECTED.libraries));
  const libraries = [];
  for (const line of lddLines) {
    const soname = line.trim().split(/\s+/)[0];
    if (!wanted.has(soname)) continue;
    const match = line.match(/=>\s+(\S+)/);
    if (!match) continue;
    const path = realpathSync(match[1]);
    libraries.push({ soname, path, sha256: sha256File(path), ...packageVersionFor(path) });
  }
  const makeBinary = (name, path) => ({
    name,
    path,
    sha256: sha256File(path),
    ...packageVersionFor(path),
    versionLine: command(path, "-version").split(/\r?\n/, 1)[0],
  });
  return {
    schemaVersion: 1,
    architecture: command("dpkg", "--print-architecture"),
    binaries: [makeBinary("ffmpeg", ffmpegPath), makeBinary("ffprobe", ffprobePath)],
    libraries: libraries.sort((a, b) => a.soname.localeCompare(b.soname)),
    encoderInventoryLine: command(ffmpegPath, "-hide_banner", "-encoders").split(/\r?\n/).find((line) => line.includes("libmp3lame"))?.trim() ?? null,
  };
}

export function validateLocalNarrationEncoder(snapshot) {
  const issues = [];
  if (snapshot?.architecture !== EXPECTED.architecture) issues.push("local encoder architecture drifted");
  const binaries = new Map((snapshot?.binaries ?? []).map((item) => [item.name, item]));
  for (const [name, expected] of Object.entries(EXPECTED.binaries)) {
    const actual = binaries.get(name);
    if (!actual) { issues.push(`local encoder binary ${name} missing`); continue; }
    for (const key of ["path", "package", "packageVersion", "sha256"]) {
      if (actual[key] !== expected[key]) issues.push(`local encoder binary ${name} ${key} drifted`);
    }
  }
  const libraries = new Map((snapshot?.libraries ?? []).map((item) => [item.soname, item]));
  for (const [soname, expected] of Object.entries(EXPECTED.libraries)) {
    const actual = libraries.get(soname);
    if (!actual) { issues.push(`local encoder library ${soname} missing`); continue; }
    for (const key of ["package", "packageVersion", "sha256"]) {
      if (actual[key] !== expected[key]) issues.push(`local encoder library ${soname} ${key} drifted`);
    }
  }
  if (!String(snapshot?.encoderInventoryLine ?? "").includes("libmp3lame")) issues.push("local ffmpeg does not expose libmp3lame");
  return { valid: issues.length === 0, issues: [...new Set(issues)].sort() };
}

export function readApprovedNarrationEncoderBinding() {
  const binding = readNarrationEncoderProfile();
  const validation = validateNarrationEncoderProfile(binding.profile);
  if (!validation.valid) throw new Error(`Narration encoder profile is not approved:\n${validation.issues.join("\n")}`);
  return binding;
}

if (process.argv[1]?.endsWith("narration-encoder-profile.mjs")) {
  const local = process.argv.includes("--local");
  const binding = readNarrationEncoderProfile();
  const profileValidation = validateNarrationEncoderProfile(binding.profile);
  const report = { schemaVersion: 1, profileId: binding.profile.profileId, profileSha256: binding.sha256, profileValid: profileValidation.valid, profileIssues: profileValidation.issues };
  if (local) {
    const snapshot = inspectLocalNarrationEncoder();
    const localValidation = validateLocalNarrationEncoder(snapshot);
    report.local = { valid: localValidation.valid, issues: localValidation.issues, snapshot };
  }
  console.log(JSON.stringify(report, null, 2));
  if (!profileValidation.valid || (local && !report.local.valid)) process.exitCode = 1;
}
