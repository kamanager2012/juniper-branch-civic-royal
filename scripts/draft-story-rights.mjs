import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDraftStoryCatalog } from "./draft-story-catalog.mjs";
import { repoRoot } from "./story-model.mjs";

export const DRAFT_RIGHTS_EVIDENCE_PATH = "content/evidence/story-text/project-authored-drafts.json";
const evidencePath = join(repoRoot, DRAFT_RIGHTS_EVIDENCE_PATH);

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function currentGitBlob(path) {
  return git(["hash-object", "--", path]);
}

export function loadDraftRightsEvidence() {
  const parsed = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (
    parsed?.schemaVersion !== 1 ||
    parsed.claim !== "owned" ||
    !Array.isArray(parsed.sourceBundles) ||
    parsed.sourceBundles.length !== 4
  ) {
    throw new Error(`${DRAFT_RIGHTS_EVIDENCE_PATH} must declare schemaVersion 1, owned claim, and four source bundles`);
  }

  const seen = new Set();
  for (const item of parsed.sourceBundles) {
    if (
      typeof item?.path !== "string" ||
      !/^content\/story-drafts\/\d{2}\.json$/.test(item.path) ||
      typeof item.gitBlob !== "string" ||
      !/^[a-f0-9]{40}$/.test(item.gitBlob) ||
      item.stories !== 19
    ) {
      throw new Error(`${DRAFT_RIGHTS_EVIDENCE_PATH} contains an invalid source bundle entry`);
    }
    if (seen.has(item.path)) throw new Error(`${DRAFT_RIGHTS_EVIDENCE_PATH} contains duplicate source bundle ${item.path}`);
    seen.add(item.path);
  }
  return parsed;
}

export function evaluateDraftRightsEvidence(options = {}) {
  const catalog = options.catalog ?? loadDraftStoryCatalog();
  const evidence = options.evidence ?? loadDraftRightsEvidence();
  const blobForPath = options.blobForPath ?? currentGitBlob;
  const issues = [];
  const expected = new Map(evidence.sourceBundles.map((item) => [item.path, item]));
  const actualPaths = new Set(catalog.sourceFiles.map((item) => item.path));

  for (const source of catalog.sourceFiles) {
    const pinned = expected.get(source.path);
    if (!pinned) {
      issues.push(`draft rights evidence missing source bundle: ${source.path}`);
      continue;
    }
    const currentBlob = blobForPath(source.path);
    if (currentBlob !== pinned.gitBlob) {
      issues.push(`draft rights evidence drift: ${source.path} expected ${pinned.gitBlob}, got ${currentBlob}`);
    }
    if (source.count !== pinned.stories) {
      issues.push(`draft rights evidence story count drift: ${source.path} expected ${pinned.stories}, got ${source.count}`);
    }
  }

  for (const path of expected.keys()) {
    if (!actualPaths.has(path)) issues.push(`draft rights evidence points to unknown source bundle: ${path}`);
  }

  return {
    schemaVersion: 1,
    catalog,
    evidence,
    issues: [...new Set(issues)].sort(),
  };
}

export function buildDraftProvenanceEntries(evaluation = evaluateDraftRightsEvidence()) {
  const entries = {};
  if (evaluation.issues.length === 0) {
    for (const story of evaluation.catalog.stories) {
      entries[`text:story:${story.id}`] = {
        fingerprintSha256: story.fingerprintSha256,
        claim: "owned",
        evidence: [DRAFT_RIGHTS_EVIDENCE_PATH, story.sourcePath],
      };
    }
  }
  return { entries, issues: evaluation.issues };
}

export function buildDraftLineageEntries(evaluation = evaluateDraftRightsEvidence(), commit = git(["rev-parse", "HEAD"])) {
  const entries = {};
  if (evaluation.issues.length === 0) {
    const sourceByPath = new Map(evaluation.evidence.sourceBundles.map((item) => [item.path, item]));
    for (const story of evaluation.catalog.stories) {
      const source = sourceByPath.get(story.sourcePath);
      entries[`text:story:${story.id}`] = {
        fingerprintSha256: story.fingerprintSha256,
        origin: {
          commit,
          path: story.sourcePath,
          method: "git-blob-identity",
          gitBlob: source.gitBlob,
        },
      };
    }
  }
  return { entries, issues: evaluation.issues };
}
