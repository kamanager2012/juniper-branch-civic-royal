import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadStoryModel, repoRoot } from "./story-model.mjs";

export const PUBLISHED_RIGHTS_EVIDENCE_PATH = "content/evidence/story-text/project-authored-published.json";
const evidencePath = join(repoRoot, PUBLISHED_RIGHTS_EVIDENCE_PATH);

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function currentGitBlob(path) {
  return git(["hash-object", "--", path]);
}

export function loadPublishedRightsEvidence() {
  const parsed = JSON.parse(readFileSync(evidencePath, "utf8"));
  const source = parsed?.source;
  if (
    parsed?.schemaVersion !== 1 ||
    parsed.claim !== "owned" ||
    !source ||
    source.path !== "content/published-stories.json" ||
    typeof source.gitBlob !== "string" ||
    !/^[a-f0-9]{40}$/.test(source.gitBlob) ||
    source.stories !== 24
  ) {
    throw new Error(`${PUBLISHED_RIGHTS_EVIDENCE_PATH} must pin the exact 24-story canonical source blob`);
  }
  return parsed;
}

export function evaluatePublishedRightsEvidence(options = {}) {
  const model = options.model ?? loadStoryModel();
  const evidence = options.evidence ?? loadPublishedRightsEvidence();
  const blobForPath = options.blobForPath ?? currentGitBlob;
  const issues = [];
  const currentBlob = blobForPath(evidence.source.path);

  if (model.stories.length !== evidence.source.stories) {
    issues.push(`published story count drift: expected ${evidence.source.stories}, got ${model.stories.length}`);
  }
  if (currentBlob !== evidence.source.gitBlob) {
    issues.push(`published story rights evidence drift: ${evidence.source.path} expected ${evidence.source.gitBlob}, got ${currentBlob}`);
  }

  return {
    schemaVersion: 1,
    model,
    evidence,
    issues: [...new Set(issues)].sort(),
  };
}

export function buildPublishedProvenanceEntries(storyAssets, evaluation = evaluatePublishedRightsEvidence()) {
  const entries = {};
  if (evaluation.issues.length === 0) {
    for (const asset of storyAssets) {
      entries[asset.id] = {
        fingerprintSha256: asset.fingerprintSha256,
        claim: "owned",
        evidence: [PUBLISHED_RIGHTS_EVIDENCE_PATH, evaluation.evidence.source.path],
      };
    }
  }
  return { entries, issues: evaluation.issues };
}

export function buildPublishedLineageEntries(storyAssets, evaluation = evaluatePublishedRightsEvidence(), commit = git(["rev-parse", "HEAD"])) {
  const entries = {};
  if (evaluation.issues.length === 0) {
    for (const asset of storyAssets) {
      entries[asset.id] = {
        fingerprintSha256: asset.fingerprintSha256,
        origin: {
          commit,
          path: evaluation.evidence.source.path,
          method: "git-blob-identity",
          gitBlob: evaluation.evidence.source.gitBlob,
        },
      };
    }
  }
  return { entries, issues: evaluation.issues };
}
