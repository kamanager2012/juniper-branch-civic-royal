import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDraftLineageEntries } from "./draft-story-rights.mjs";
import { buildNarrationLineageEntries } from "./narration-lineage.mjs";
import { buildPublishedLineageEntries } from "./published-story-rights.mjs";
import { buildReleaseReadiness, readReleaseAssets } from "./release-readiness.mjs";
import { repoRoot } from "./story-model.mjs";

const registryPath = join(repoRoot, "content/source-lineage.json");
const generatedRegistryPath = join(repoRoot, "content/generated-source-lineage.json");
const DEFAULT_ORIGIN_COMMIT = "88c2080c715a1c37e64916970cbbc4af2ed7727a";
const ALLOWED_METHODS = new Set([
  "git-blob-identity",
  "canonical-source-blob-identity",
  "deterministic-project-generator",
  "generation-receipt",
]);

function readRegistry() {
  const parsed = JSON.parse(readFileSync(registryPath, "utf8"));
  if (
    parsed?.schemaVersion !== 1 ||
    typeof parsed.originCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(parsed.originCommit) ||
    !parsed.entries ||
    typeof parsed.entries !== "object" ||
    Array.isArray(parsed.entries)
  ) {
    throw new Error("content/source-lineage.json must use schemaVersion 1, originCommit, and an entries object");
  }
  return parsed;
}

function readGeneratedRegistry() {
  const parsed = JSON.parse(readFileSync(generatedRegistryPath, "utf8"));
  if (parsed?.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
    throw new Error("content/generated-source-lineage.json must use schemaVersion 1 with an entries object");
  }
  return parsed;
}

function mergedRegistry(assets, historical = readRegistry()) {
  const generated = readGeneratedRegistry();
  const draft = buildDraftLineageEntries();
  const publishedAssets = assets.filter((asset) => asset.category === "story-text" && asset.textStatus === "media-ready");
  const published = buildPublishedLineageEntries(publishedAssets);
  const narrationAssets = assets.filter((asset) => asset.category === "narration");
  const narration = buildNarrationLineageEntries(narrationAssets);
  return {
    ...historical,
    entries: {
      ...historical.entries,
      ...generated.entries,
      ...draft.entries,
      ...published.entries,
      ...narration.entries,
    },
    generatedIssues: [...draft.issues, ...published.issues, ...narration.issues],
  };
}

function finalizeGeneratedIssues(report, registry) {
  return {
    ...report,
    issues: [...new Set([...report.issues, ...(registry.generatedIssues ?? [])])].sort(),
  };
}

function retiredAssetIds() {
  return new Set(readReleaseAssets().retiredProductArtwork.map((path) => `artwork:${path}`));
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function currentBlob(path) {
  return git(["hash-object", "--", path]);
}

function originBlobIndex(commit) {
  const output = git(["ls-tree", "-r", "--full-tree", commit]);
  const index = new Map();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const match = line.match(/^\d{6} blob ([a-f0-9]{40})\t(.+)$/);
    if (!match) continue;
    const [, blob, path] = match;
    const paths = index.get(blob) ?? [];
    paths.push(path);
    index.set(blob, paths);
  }
  for (const paths of index.values()) paths.sort();
  return index;
}

function validateEntry(asset, entry) {
  if (!entry) return { status: "unknown", problems: [] };
  const problems = [];
  if (typeof entry.fingerprintSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprintSha256)) {
    problems.push("fingerprintSha256 must be a lowercase SHA-256 hex string");
  }
  if (!entry.origin || typeof entry.origin !== "object" || Array.isArray(entry.origin)) {
    problems.push("origin must be an object");
  } else {
    const method = entry.origin.method;
    if (!ALLOWED_METHODS.has(method)) {
      problems.push("origin.method must be git-blob-identity, canonical-source-blob-identity, deterministic-project-generator, or generation-receipt");
    }
    if (typeof entry.origin.path !== "string" || entry.origin.path.trim() === "") {
      problems.push("origin.path must be a non-empty string");
    }

    if (method === "generation-receipt") {
      if (typeof entry.origin.receiptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.origin.receiptSha256)) {
        problems.push("generation-receipt origin.receiptSha256 must be lowercase SHA-256");
      }
      if (typeof entry.origin.batchId !== "string" || entry.origin.batchId.trim() === "") {
        problems.push("generation-receipt origin.batchId must be non-empty");
      }
      if (typeof entry.origin.provider !== "string" || entry.origin.provider.trim() === "") {
        problems.push("generation-receipt origin.provider must be non-empty");
      }
    } else {
      if (typeof entry.origin.commit !== "string" || !/^[a-f0-9]{40}$/.test(entry.origin.commit)) {
        problems.push("origin.commit must be a 40-character lowercase Git SHA");
      }
      if (typeof entry.origin.gitBlob !== "string" || !/^[a-f0-9]{40}$/.test(entry.origin.gitBlob)) {
        problems.push("origin.gitBlob must be a 40-character lowercase Git blob SHA");
      }
    }
  }
  if (problems.length > 0) return { status: "invalid", problems };
  if (entry.fingerprintSha256 !== asset.fingerprintSha256) return { status: "stale", problems: [] };
  return { status: "known", problems: [] };
}

export function evaluateLineageRegistry(assets, registry, retiredIds = new Set()) {
  const inventoryIds = new Set(assets.map((asset) => asset.id));
  const issues = [];

  for (const key of Object.keys(registry.entries)) {
    if (!inventoryIds.has(key) && !retiredIds.has(key)) issues.push(`source-lineage entry points to an unknown asset: ${key}`);
  }

  const evaluated = assets.map((asset) => {
    const entry = registry.entries[asset.id] ?? null;
    const result = validateEntry(asset, entry);
    for (const problem of result.problems) issues.push(`${asset.id}: ${problem}`);
    return {
      id: asset.id,
      category: asset.category,
      label: asset.label,
      fingerprintSha256: asset.fingerprintSha256,
      lineageStatus: result.status,
      origin: entry?.origin ?? null,
    };
  });

  const categories = {};
  for (const asset of evaluated) {
    categories[asset.category] ??= { total: 0, known: 0, unknown: 0, stale: 0, invalid: 0 };
    categories[asset.category].total += 1;
    categories[asset.category][asset.lineageStatus] += 1;
  }

  const lineage = {
    total: evaluated.length,
    known: evaluated.filter((asset) => asset.lineageStatus === "known").length,
    unknown: evaluated.filter((asset) => asset.lineageStatus === "unknown").length,
    stale: evaluated.filter((asset) => asset.lineageStatus === "stale").length,
    invalid: evaluated.filter((asset) => asset.lineageStatus === "invalid").length,
  };
  lineage.coverage = lineage.total === 0 ? 1 : lineage.known / lineage.total;

  return {
    schemaVersion: 1,
    registry: "historical + generated + project-authored published/draft + receipt-backed narration lineage",
    originCommit: registry.originCommit,
    lineage,
    categories,
    issues: [...new Set(issues)].sort(),
    assets: evaluated,
  };
}

export function buildSourceLineage() {
  const release = buildReleaseReadiness();
  const registry = mergedRegistry(release.assets);
  return finalizeGeneratedIssues(evaluateLineageRegistry(release.assets, registry, retiredAssetIds()), registry);
}

export function recoverSourceLineage(originCommit = DEFAULT_ORIGIN_COMMIT) {
  const release = buildReleaseReadiness();
  const registry = readRegistry();
  const entries = { ...registry.entries };
  const originIndex = originBlobIndex(originCommit);

  for (const asset of release.assets) {
    if (asset.category === "story-text") continue;
    if (!asset.path || asset.category === "product-artwork") continue;
    const blob = currentBlob(asset.path);
    const originPaths = originIndex.get(blob) ?? [];
    if (originPaths.length === 0) continue;
    const originPath = originPaths.includes(asset.path) ? asset.path : originPaths[0];
    entries[asset.id] = {
      fingerprintSha256: asset.fingerprintSha256,
      origin: {
        commit: originCommit,
        path: originPath,
        method: "git-blob-identity",
        gitBlob: blob,
      },
    };
  }

  const next = { schemaVersion: 1, originCommit, entries };
  const merged = mergedRegistry(release.assets, next);
  return {
    registry: next,
    report: finalizeGeneratedIssues(evaluateLineageRegistry(release.assets, merged, retiredAssetIds()), merged),
  };
}

if (process.argv[1]?.endsWith("source-lineage.mjs")) {
  const recover = process.argv.includes("--recover");
  const write = process.argv.includes("--write");
  const summary = process.argv.includes("--summary");
  const check = process.argv.includes("--check");

  let report;
  if (recover) {
    const recovered = recoverSourceLineage();
    if (write) writeFileSync(registryPath, `${JSON.stringify(recovered.registry, null, 2)}\n`);
    report = recovered.report;
  } else {
    report = buildSourceLineage();
  }

  if (summary) {
    console.log(JSON.stringify({
      schemaVersion: report.schemaVersion,
      originCommit: report.originCommit,
      lineage: report.lineage,
      categories: report.categories,
      issues: report.issues,
    }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  if (check && (report.issues.length > 0 || report.lineage.stale > 0 || report.lineage.invalid > 0)) {
    process.exitCode = 1;
  }
}
