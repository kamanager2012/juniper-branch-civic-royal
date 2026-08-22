import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildStoryImageReleaseSet } from "./story-image-release-set.mjs";
import { repoRoot } from "./story-model.mjs";

export const STORY_IMAGE_RIGHTS_EVIDENCE_PATH = "content/evidence/story-images/grok-imagine-rights.json";
export const STORY_IMAGE_ORIGIN_EVIDENCE_PATH = "content/evidence/story-images/grok-imagine-origin-audit.json";
const XAI_TERMS_URL = "https://x.ai/legal/terms-of-service";
const XAI_FAQ_URL = "https://x.ai/legal/faq";
const XAI_BRAND_URL = "https://x.ai/legal/brand-guidelines";

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

export function loadStoryImageRightsEvidence() {
  const evidence = readJson(STORY_IMAGE_RIGHTS_EVIDENCE_PATH);
  if (
    evidence?.schemaVersion !== 1 ||
    evidence.claim !== "owned" ||
    evidence.scope !== "matched-grok-output-and-optimized-release-derivative" ||
    evidence.releaseSet?.count !== 192 ||
    typeof evidence.releaseSet?.digestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(evidence.releaseSet.digestSha256) ||
    evidence.technicalOrigin?.evidence !== STORY_IMAGE_ORIGIN_EVIDENCE_PATH ||
    typeof evidence.technicalOrigin?.mappingDigestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(evidence.technicalOrigin.mappingDigestSha256) ||
    evidence.providerRights?.consumerTerms?.url !== XAI_TERMS_URL ||
    evidence.providerRights?.consumerTerms?.effectiveDate !== "2026-06-26" ||
    evidence.providerRights?.consumerFaq?.url !== XAI_FAQ_URL ||
    evidence.providerRights?.brandGuidelines?.url !== XAI_BRAND_URL ||
    evidence.providerRights?.brandGuidelines?.attribution !== "Created with Grok"
  ) {
    throw new Error(`${STORY_IMAGE_RIGHTS_EVIDENCE_PATH} is malformed or has changed rights semantics`);
  }
  return evidence;
}

export function loadStoryImageOriginEvidence() {
  const evidence = readJson(STORY_IMAGE_ORIGIN_EVIDENCE_PATH);
  if (
    evidence?.schemaVersion !== 1 ||
    evidence.evidenceType !== "historical-grok-imagine-derivation-audit" ||
    evidence.rightsClaimApplied !== false ||
    evidence.scope !== "technical-origin-only" ||
    evidence.audit?.releaseImages !== 192 ||
    evidence.audit?.historicalImagineArtifacts !== 194 ||
    evidence.audit?.uniqueImagineMatches !== 192 ||
    evidence.audit?.collisions !== 0 ||
    evidence.audit?.unusedImagineArtifacts !== 2 ||
    typeof evidence.audit?.mappingDigestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(evidence.audit.mappingDigestSha256)
  ) {
    throw new Error(`${STORY_IMAGE_ORIGIN_EVIDENCE_PATH} is malformed or no longer represents the approved audit`);
  }
  return evidence;
}

export function evaluateStoryImageRightsEvidence(options = {}) {
  const rights = options.rights ?? loadStoryImageRightsEvidence();
  const origin = options.origin ?? loadStoryImageOriginEvidence();
  const releaseSet = options.releaseSet ?? buildStoryImageReleaseSet();
  const issues = [];

  if (releaseSet.count !== rights.releaseSet.count) {
    issues.push(`story image release count drift: expected ${rights.releaseSet.count}, got ${releaseSet.count}`);
  }
  if (releaseSet.digestSha256 !== rights.releaseSet.digestSha256) {
    issues.push(`story image release digest drift: expected ${rights.releaseSet.digestSha256}, got ${releaseSet.digestSha256}`);
  }
  if (origin.origin?.commit !== rights.technicalOrigin.originCommit) {
    issues.push(`story image origin commit drift: expected ${rights.technicalOrigin.originCommit}, got ${origin.origin?.commit ?? "<missing>"}`);
  }
  if (origin.audit.mappingDigestSha256 !== rights.technicalOrigin.mappingDigestSha256) {
    issues.push(`story image origin mapping drift: expected ${rights.technicalOrigin.mappingDigestSha256}, got ${origin.audit.mappingDigestSha256}`);
  }
  if (origin.audit.releaseImages !== rights.technicalOrigin.matchedReleaseImages) {
    issues.push(`story image origin release count drift: expected ${rights.technicalOrigin.matchedReleaseImages}, got ${origin.audit.releaseImages}`);
  }
  if (origin.audit.uniqueImagineMatches !== rights.technicalOrigin.uniqueImagineMatches || origin.audit.collisions !== 0) {
    issues.push("story image historical Imagine mapping is no longer one-to-one");
  }

  return {
    schemaVersion: 1,
    rights,
    origin,
    releaseSet,
    issues: [...new Set(issues)].sort(),
  };
}

export function buildStoryImageProvenanceEntries(storyImageAssets, evaluation = evaluateStoryImageRightsEvidence()) {
  const issues = [...evaluation.issues];
  const entries = {};
  const assets = [...storyImageAssets].sort((a, b) => a.id.localeCompare(b.id));
  const releaseByPath = new Map(evaluation.releaseSet.entries.map((entry) => [entry.path, entry]));

  if (assets.length !== evaluation.rights.releaseSet.count) {
    issues.push(`story image inventory count drift: expected ${evaluation.rights.releaseSet.count}, got ${assets.length}`);
  }

  for (const asset of assets) {
    if (asset.category !== "story-image") {
      issues.push(`non-story-image asset passed to story image rights generator: ${asset.id}`);
      continue;
    }
    const pinned = releaseByPath.get(asset.path);
    if (!pinned) {
      issues.push(`story image rights evidence does not contain current asset path: ${asset.path}`);
      continue;
    }
    if (pinned.sha256 !== asset.fingerprintSha256) {
      issues.push(`story image fingerprint drift: ${asset.path}`);
    }
  }

  const uniqueIssues = [...new Set(issues)].sort();
  if (uniqueIssues.length > 0) return { entries, issues: uniqueIssues };

  const evidence = [
    STORY_IMAGE_RIGHTS_EVIDENCE_PATH,
    STORY_IMAGE_ORIGIN_EVIDENCE_PATH,
    XAI_TERMS_URL,
    XAI_FAQ_URL,
    XAI_BRAND_URL,
  ];
  for (const asset of assets) {
    entries[asset.id] = {
      fingerprintSha256: asset.fingerprintSha256,
      claim: "owned",
      evidence,
    };
  }
  return { entries, issues: [] };
}
