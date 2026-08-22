import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN_COMMIT = "88c2080c715a1c37e64916970cbbc4af2ed7727a";
const IMAGINE_ROOT = "artifacts/imagine_images";
const RELEASE_ROOT = join(repoRoot, "public/stories");
const SAMPLE_SIZE = 16;
const DECODER_PATH_ENV = "STORY_IMAGE_JPEG_DECODER";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: options.binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

function relativePath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function loadDecoder() {
  const decoderPath = process.env[DECODER_PATH_ENV];
  if (!decoderPath) {
    throw new Error(`${DECODER_PATH_ENV} must point to a pinned jpeg-js module for this evidence audit`);
  }
  const absolute = resolve(decoderPath);
  const jpeg = require(absolute);
  if (typeof jpeg?.decode !== "function") throw new Error(`invalid jpeg-js decoder module: ${absolute}`);
  const packageJson = JSON.parse(readFileSync(join(dirname(absolute), "package.json"), "utf8"));
  if (packageJson.name !== "jpeg-js" || typeof packageJson.version !== "string") {
    throw new Error(`decoder package metadata is not jpeg-js: ${absolute}`);
  }
  return { jpeg, package: `${packageJson.name}@${packageJson.version}` };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bilinearChannel(data, width, height, x, y, channel) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = clamp(x - x0, 0, 1);
  const ty = clamp(y - y0, 0, 1);
  const at = (px, py) => data[(py * width + px) * 4 + channel];
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return Math.round(top * (1 - ty) + bottom * ty);
}

function imageVector(decoder, bytes, label) {
  const decoded = decoder.jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false });
  if (!decoded || !Number.isInteger(decoded.width) || !Number.isInteger(decoded.height) || !decoded.data) {
    throw new Error(`jpeg-js did not return a valid image for ${label}`);
  }
  if (decoded.width < 1 || decoded.height < 1) throw new Error(`invalid JPEG dimensions for ${label}`);

  const vector = Buffer.alloc(SAMPLE_SIZE * SAMPLE_SIZE * 3);
  let offset = 0;
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    const sourceY = ((y + 0.5) * decoded.height) / SAMPLE_SIZE - 0.5;
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      const sourceX = ((x + 0.5) * decoded.width) / SAMPLE_SIZE - 0.5;
      for (let channel = 0; channel < 3; channel += 1) {
        vector[offset] = bilinearChannel(decoded.data, decoded.width, decoded.height, sourceX, sourceY, channel);
        offset += 1;
      }
    }
  }
  return { vector, width: decoded.width, height: decoded.height };
}

function errorMetrics(a, b) {
  let abs = 0;
  let sq = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = a[i] - b[i];
    abs += Math.abs(delta);
    sq += delta * delta;
  }
  return {
    mae: abs / a.length,
    rmse: Math.sqrt(sq / a.length),
  };
}

function argValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function round(value) {
  return Number(value.toFixed(6));
}

function buildAudit() {
  git(["cat-file", "-e", `${ORIGIN_COMMIT}^{commit}`]);
  const decoder = loadDecoder();
  const originPaths = git(["ls-tree", "-r", "--name-only", ORIGIN_COMMIT, "--", IMAGINE_ROOT])
    .trim()
    .split("\n")
    .filter((path) => /\.jpe?g$/i.test(path));
  const releasePaths = walk(RELEASE_ROOT).filter((path) => /\.jpe?g$/i.test(path));

  const temp = mkdtempSync(join(tmpdir(), "story-image-origin-"));
  try {
    const imagine = originPaths.map((path, index) => {
      const bytes = git(["show", `${ORIGIN_COMMIT}:${path}`], { binary: true });
      const localPath = join(temp, `origin-${index}.jpg`);
      writeFileSync(localPath, bytes);
      const sampled = imageVector(decoder, bytes, path);
      return {
        path,
        gitBlob: git(["rev-parse", `${ORIGIN_COMMIT}:${path}`]).trim(),
        sha256: sha256(bytes),
        bytes: bytes.length,
        width: sampled.width,
        height: sampled.height,
        vector: sampled.vector,
      };
    });

    const release = releasePaths.map((path) => {
      const bytes = readFileSync(path);
      const sampled = imageVector(decoder, bytes, relativePath(path));
      return {
        path: relativePath(path),
        gitBlob: git(["hash-object", "--", path]).trim(),
        sha256: sha256(bytes),
        bytes: statSync(path).size,
        width: sampled.width,
        height: sampled.height,
        vector: sampled.vector,
      };
    });

    const matches = release.map((item) => {
      const candidates = imagine.map((candidate) => ({
        candidate,
        ...errorMetrics(item.vector, candidate.vector),
      })).sort((a, b) => a.mae - b.mae || a.rmse - b.rmse || a.candidate.path.localeCompare(b.candidate.path));
      const best = candidates[0];
      const second = candidates[1] ?? null;
      if (!best) throw new Error(`no Imagine candidates for ${item.path}`);
      return {
        releasePath: item.path,
        releaseGitBlob: item.gitBlob,
        releaseSha256: item.sha256,
        releaseBytes: item.bytes,
        releaseDimensions: `${item.width}x${item.height}`,
        imaginePath: best.candidate.path,
        imagineGitBlob: best.candidate.gitBlob,
        imagineSha256: best.candidate.sha256,
        imagineBytes: best.candidate.bytes,
        imagineDimensions: `${best.candidate.width}x${best.candidate.height}`,
        mae: round(best.mae),
        rmse: round(best.rmse),
        secondBestMae: second ? round(second.mae) : null,
        margin: second ? round(second.mae - best.mae) : null,
      };
    }).sort((a, b) => a.releasePath.localeCompare(b.releasePath));

    const usage = new Map();
    for (const match of matches) {
      const paths = usage.get(match.imaginePath) ?? [];
      paths.push(match.releasePath);
      usage.set(match.imaginePath, paths);
    }
    const collisions = [...usage.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([imaginePath, paths]) => ({ imaginePath, releasePaths: paths.sort() }));
    const unusedImagine = imagine.map((item) => item.path).filter((path) => !usage.has(path)).sort();
    const worstByMae = [...matches].sort((a, b) => b.mae - a.mae).slice(0, 12);
    const weakestMargins = [...matches]
      .filter((item) => item.margin != null)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 12);
    const mappingDigestSha256 = sha256(Buffer.from(JSON.stringify(matches.map((item) => ({
      releasePath: item.releasePath,
      releaseGitBlob: item.releaseGitBlob,
      releaseSha256: item.releaseSha256,
      imaginePath: item.imaginePath,
      imagineGitBlob: item.imagineGitBlob,
      imagineSha256: item.imagineSha256,
    }))), "utf8"));

    return {
      schemaVersion: 1,
      originCommit: ORIGIN_COMMIT,
      method: {
        decoder: decoder.package,
        sample: `${SAMPLE_SIZE}x${SAMPLE_SIZE} RGB via deterministic bilinear sampling`,
        metric: "mean absolute RGB channel error; RMSE retained as secondary diagnostic",
        selection: "nearest historical Imagine artifact per release image; second-best distance retained for separation analysis",
      },
      counts: {
        releaseImages: release.length,
        imagineArtifacts: imagine.length,
        uniqueImagineMatches: usage.size,
        collisions: collisions.length,
        unusedImagineArtifacts: unusedImagine.length,
      },
      summary: {
        minMae: round(Math.min(...matches.map((item) => item.mae))),
        maxMae: round(Math.max(...matches.map((item) => item.mae))),
        averageMae: round(matches.reduce((sum, item) => sum + item.mae, 0) / matches.length),
        minMargin: round(Math.min(...matches.map((item) => item.margin ?? Number.POSITIVE_INFINITY))),
        mappingDigestSha256,
      },
      collisions,
      unusedImagine,
      worstByMae,
      weakestMargins,
      matches,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const audit = buildAudit();
const output = argValue("--output");
if (output) writeFileSync(resolve(repoRoot, output), `${JSON.stringify(audit, null, 2)}\n`);

console.log(JSON.stringify({
  schemaVersion: audit.schemaVersion,
  originCommit: audit.originCommit,
  method: audit.method,
  counts: audit.counts,
  summary: audit.summary,
  collisions: audit.collisions,
  worstByMae: audit.worstByMae,
  weakestMargins: audit.weakestMargins,
}, null, 2));
