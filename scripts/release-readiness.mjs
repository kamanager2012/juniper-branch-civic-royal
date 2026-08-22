import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const registryPath = join(repoRoot, "content/release-provenance.json");
const ALLOWED_CLAIMS = new Set(["owned", "licensed", "public-domain", "permission"]);

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function sha256Json(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(value), "utf8"));
}

function rel(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

function readRegistry() {
  const parsed = JSON.parse(readFileSync(registryPath, "utf8"));
  if (parsed?.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
    throw new Error("content/release-provenance.json must use schemaVersion 1 with an entries object");
  }
  return parsed;
}

function storyTextAsset(story) {
  const content = {
    id: story.id,
    title: story.title,
    pinyin: story.pinyin,
    tagline: story.tagline,
    meaning: story.meaning,
    moral: story.moral,
    pages: story.pages.map((page) => ({ id: page.id, kind: page.kind, text: page.text })),
  };
  return {
    id: `text:story:${story.id}`,
    category: "story-text",
    label: story.title,
    fingerprintSha256: sha256Json(content),
  };
}

function fileAsset(idPrefix, category, path, extra = {}) {
  return {
    id: `${idPrefix}:${rel(path)}`,
    category,
    label: rel(path),
    path: rel(path),
    fingerprintSha256: sha256File(path),
    ...extra,
  };
}

function productArtworkFiles() {
  const rootFiles = readdirSync(join(repoRoot, "public"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(repoRoot, "public", entry.name))
    .filter((path) => {
      const name = basename(path);
      return name === "favicon.svg" || name === "og.jpg" || /^icon-\d+\.(?:png|jpe?g|webp|svg)$/i.test(name);
    });
  return [...rootFiles, ...walk(join(repoRoot, "public/ui"))].sort();
}

function buildAssetInventory() {
  const model = loadStoryModel();
  const narrationPlan = buildNarrationPlan();
  const assets = [];

  for (const story of model.stories) assets.push(storyTextAsset(story));

  const imagePaths = new Set();
  for (const page of model.pages) imagePaths.add(join(repoRoot, "public", page.image));
  for (const path of [...imagePaths].sort()) assets.push(fileAsset("image", "story-image", path));

  for (const item of narrationPlan.items) {
    const path = join(repoRoot, item.output);
    assets.push(fileAsset("audio", "narration", path, { narrationStatus: item.status, storyId: item.storyId, pageId: item.pageId }));
  }

  for (const path of walk(join(repoRoot, "public/fonts"))) assets.push(fileAsset("font", "font", path));
  for (const path of productArtworkFiles()) assets.push(fileAsset("artwork", "product-artwork", path));

  return assets.sort((a, b) => a.id.localeCompare(b.id));
}

function validateEntry(asset, entry) {
  if (!entry) return { status: "unverified", problems: [] };
  const problems = [];
  if (!ALLOWED_CLAIMS.has(entry.claim)) problems.push("claim must be one of owned/licensed/public-domain/permission");
  if (typeof entry.fingerprintSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprintSha256)) {
    problems.push("fingerprintSha256 must be a lowercase SHA-256 hex string");
  }
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.some((item) => typeof item !== "string" || item.trim() === "")) {
    problems.push("evidence must be a non-empty string array");
  }
  if (problems.length > 0) return { status: "invalid", problems };
  if (entry.fingerprintSha256 !== asset.fingerprintSha256) return { status: "stale", problems: [] };
  return { status: "verified", problems: [] };
}

export function buildReleaseReadiness() {
  const registry = readRegistry();
  const assets = buildAssetInventory();
  const inventoryIds = new Set(assets.map((asset) => asset.id));
  const issues = [];

  for (const key of Object.keys(registry.entries)) {
    if (!inventoryIds.has(key)) issues.push(`provenance entry points to an unknown asset: ${key}`);
  }

  const evaluated = assets.map((asset) => {
    const entry = registry.entries[asset.id] ?? null;
    const result = validateEntry(asset, entry);
    for (const problem of result.problems) issues.push(`${asset.id}: ${problem}`);
    return {
      ...asset,
      provenanceStatus: result.status,
      claim: result.status === "verified" ? entry.claim : entry?.claim ?? null,
      evidence: result.status === "verified" ? entry.evidence : entry?.evidence ?? [],
    };
  });

  const categories = {};
  for (const asset of evaluated) {
    categories[asset.category] ??= { total: 0, verified: 0, unverified: 0, stale: 0, invalid: 0 };
    categories[asset.category].total += 1;
    categories[asset.category][asset.provenanceStatus] += 1;
  }

  const provenance = {
    total: evaluated.length,
    verified: evaluated.filter((asset) => asset.provenanceStatus === "verified").length,
    unverified: evaluated.filter((asset) => asset.provenanceStatus === "unverified").length,
    stale: evaluated.filter((asset) => asset.provenanceStatus === "stale").length,
    invalid: evaluated.filter((asset) => asset.provenanceStatus === "invalid").length,
  };
  provenance.coverage = provenance.total === 0 ? 1 : provenance.verified / provenance.total;

  const narration = {
    total: evaluated.filter((asset) => asset.category === "narration").length,
    current: evaluated.filter((asset) => asset.category === "narration" && asset.narrationStatus === "current").length,
    stale: evaluated.filter((asset) => asset.category === "narration" && asset.narrationStatus === "stale").length,
    unverified: evaluated.filter((asset) => asset.category === "narration" && asset.narrationStatus === "unverified").length,
    missing: evaluated.filter((asset) => asset.category === "narration" && asset.narrationStatus === "missing").length,
  };

  const releaseReady =
    issues.length === 0 &&
    provenance.verified === provenance.total &&
    provenance.stale === 0 &&
    provenance.invalid === 0 &&
    narration.current === narration.total;

  return {
    schemaVersion: 1,
    registry: "content/release-provenance.json",
    provenance,
    narration,
    categories,
    issues: [...new Set(issues)].sort(),
    releaseReady,
    assets: evaluated,
  };
}

if (process.argv[1]?.endsWith("release-readiness.mjs")) {
  const report = buildReleaseReadiness();
  const summary = process.argv.includes("--summary");
  const strictRelease = process.argv.includes("--release");
  const checkRegistry = process.argv.includes("--check");

  if (summary) {
    console.log(JSON.stringify({
      schemaVersion: report.schemaVersion,
      releaseReady: report.releaseReady,
      provenance: report.provenance,
      narration: report.narration,
      categories: report.categories,
      issues: report.issues,
    }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  if (checkRegistry && (report.issues.length > 0 || report.provenance.stale > 0 || report.provenance.invalid > 0)) process.exitCode = 1;
  if (strictRelease && !report.releaseReady) process.exitCode = 1;
}
