import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildDraftProvenanceEntries } from "./draft-story-rights.mjs";
import { loadDraftStoryCatalog } from "./draft-story-catalog.mjs";
import { buildNarrationPlan } from "./narration-plan.mjs";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

const registryPath = join(repoRoot, "content/release-provenance.json");
const releaseAssetsPath = join(repoRoot, "content/release-assets.json");
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

export function readReleaseAssets() {
  const parsed = JSON.parse(readFileSync(releaseAssetsPath, "utf8"));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.productArtwork) || !Array.isArray(parsed.retiredProductArtwork)) {
    throw new Error("content/release-assets.json must use schemaVersion 1 with productArtwork and retiredProductArtwork arrays");
  }
  const productArtwork = parsed.productArtwork.map((value) => {
    if (typeof value !== "string" || !value.startsWith("public/") || value.includes("..") || value.includes("\\")) {
      throw new Error(`invalid product artwork path: ${String(value)}`);
    }
    const absolute = join(repoRoot, value);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`product artwork missing: ${value}`);
    return value;
  });
  if (new Set(productArtwork).size !== productArtwork.length) throw new Error("productArtwork paths must be unique");
  return { ...parsed, productArtwork };
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
    textStatus: "media-ready",
  };
}

function draftStoryTextAsset(story) {
  return {
    id: `text:story:${story.id}`,
    category: "story-text",
    label: story.title,
    fingerprintSha256: story.fingerprintSha256,
    sourcePath: story.sourcePath,
    textStatus: "text-ready-media-pending",
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
  return readReleaseAssets().productArtwork.map((path) => join(repoRoot, path)).sort();
}

function buildAssetInventory() {
  const model = loadStoryModel();
  const draftCatalog = loadDraftStoryCatalog();
  const narrationPlan = buildNarrationPlan();
  const assets = [];

  for (const story of model.stories) assets.push(storyTextAsset(story));
  for (const story of draftCatalog.stories) assets.push(draftStoryTextAsset(story));

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

export function validateEvidenceReference(value) {
  if (typeof value !== "string" || value.trim() === "") return { valid: false, kind: null, problem: "evidence reference must be a non-empty string" };
  const reference = value.trim();

  if (/^https:\/\//i.test(reference)) return { valid: true, kind: "https", problem: null };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(reference)) {
    return { valid: false, kind: null, problem: "external evidence URLs must use HTTPS" };
  }

  const normalized = reference.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.includes("\u0000") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return { valid: false, kind: null, problem: "local evidence must be a safe repository-relative path" };
  }

  const absolute = join(repoRoot, normalized);
  if (!existsSync(absolute)) return { valid: false, kind: "local", problem: `local evidence does not exist: ${normalized}` };
  const stat = statSync(absolute);
  if (!stat.isFile()) return { valid: false, kind: "local", problem: `local evidence is not a file: ${normalized}` };
  if (stat.size === 0) return { valid: false, kind: "local", problem: `local evidence is empty: ${normalized}` };
  return { valid: true, kind: "local", problem: null };
}

function validateEntry(asset, entry) {
  if (!entry) return { status: "unverified", problems: [] };
  const problems = [];
  if (!ALLOWED_CLAIMS.has(entry.claim)) problems.push("claim must be one of owned/licensed/public-domain/permission");
  if (typeof entry.fingerprintSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprintSha256)) {
    problems.push("fingerprintSha256 must be a lowercase SHA-256 hex string");
  }

  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    problems.push("evidence must be a non-empty string array");
  } else {
    let localEvidence = 0;
    for (const item of entry.evidence) {
      const result = validateEvidenceReference(item);
      if (!result.valid) problems.push(result.problem);
      if (result.valid && result.kind === "local") localEvidence += 1;
    }
    if (localEvidence === 0) problems.push("evidence must include at least one repository-local evidence file");
  }

  if (problems.length > 0) return { status: "invalid", problems };
  if (entry.fingerprintSha256 !== asset.fingerprintSha256) return { status: "stale", problems: [] };
  return { status: "verified", problems: [] };
}

export function buildReleaseReadiness() {
  const registry = readRegistry();
  const generatedDrafts = buildDraftProvenanceEntries();
  const entries = { ...registry.entries, ...generatedDrafts.entries };
  const assets = buildAssetInventory();
  const inventoryIds = new Set(assets.map((asset) => asset.id));
  const issues = [...generatedDrafts.issues];

  for (const key of Object.keys(entries)) {
    if (!inventoryIds.has(key)) issues.push(`provenance entry points to an unknown asset: ${key}`);
  }

  const evaluated = assets.map((asset) => {
    const entry = entries[asset.id] ?? null;
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
    registry: "content/release-provenance.json + project-authored draft evidence",
    provenance,
    narration,
    categories,
    issues: [...new Set(issues)].sort(),
    assets: evaluated,
    releaseReady,
  };
}

if (process.argv[1]?.endsWith("release-readiness.mjs")) {
  const report = buildReleaseReadiness();
  const summary = process.argv.includes("--summary");
  const check = process.argv.includes("--check");
  const release = process.argv.includes("--release");

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

  if (check && (report.issues.length > 0 || report.provenance.stale > 0 || report.provenance.invalid > 0)) process.exitCode = 1;
  if (release && !report.releaseReady) process.exitCode = 1;
}
