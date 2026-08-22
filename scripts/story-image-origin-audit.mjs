import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN_COMMIT = "88c2080c715a1c37e64916970cbbc4af2ed7727a";
const IMAGINE_ROOT = "artifacts/imagine_images";
const RELEASE_ROOT = join(repoRoot, "public/stories");
const SAMPLE_SIZE = 16;

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

function commandVersion(command, args) {
  const probe = spawnSync(command, args, { encoding: "utf8" });
  if (probe.status !== 0) return null;
  return `${probe.stdout ?? ""}${probe.stderr ?? ""}`.split("\n").find(Boolean)?.trim() ?? command;
}

function findImageTool() {
  for (const command of ["magick", "convert"]) {
    const version = commandVersion(command, ["-version"]);
    if (version) return { kind: "imagemagick", command, version };
  }
  const ffmpegVersion = commandVersion("ffmpeg", ["-version"]);
  if (ffmpegVersion) return { kind: "ffmpeg", command: "ffmpeg", version: ffmpegVersion };
  throw new Error("historical image-origin audit requires ImageMagick or FFmpeg");
}

function imageVector(tool, path) {
  let value;
  if (tool.kind === "imagemagick") {
    value = execFileSync(tool.command, [
      path,
      "-auto-orient",
      "-resize", `${SAMPLE_SIZE}x${SAMPLE_SIZE}!`,
      "-colorspace", "sRGB",
      "-depth", "8",
      "rgb:-",
    ], { encoding: null, maxBuffer: 8 * 1024 * 1024 });
  } else {
    value = execFileSync(tool.command, [
      "-v", "error",
      "-i", path,
      "-vf", `scale=${SAMPLE_SIZE}:${SAMPLE_SIZE}:flags=area`,
      "-frames:v", "1",
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "pipe:1",
    ], { encoding: null, maxBuffer: 8 * 1024 * 1024 });
  }
  const expected = SAMPLE_SIZE * SAMPLE_SIZE * 3;
  if (value.length !== expected) throw new Error(`unexpected normalized pixel size for ${path}: ${value.length} != ${expected}`);
  return value;
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
  const tool = findImageTool();
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
      return {
        path,
        gitBlob: git(["rev-parse", `${ORIGIN_COMMIT}:${path}`]).trim(),
        sha256: sha256(bytes),
        bytes: bytes.length,
        vector: imageVector(tool, localPath),
      };
    });

    const release = releasePaths.map((path) => {
      const bytes = readFileSync(path);
      return {
        path: relativePath(path),
        gitBlob: git(["hash-object", "--", path]).trim(),
        sha256: sha256(bytes),
        bytes: statSync(path).size,
        vector: imageVector(tool, path),
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
        imaginePath: best.candidate.path,
        imagineGitBlob: best.candidate.gitBlob,
        imagineSha256: best.candidate.sha256,
        imagineBytes: best.candidate.bytes,
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
        tool: tool.version,
        toolKind: tool.kind,
        sample: `${SAMPLE_SIZE}x${SAMPLE_SIZE} sRGB 8-bit RGB`,
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
