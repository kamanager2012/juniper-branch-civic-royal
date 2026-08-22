# Release provenance

`content/release-provenance.json` is an evidence registry, not a place to guess rights status.

The registry stays sparse until a human or a trusted import/verification process can attach durable evidence to the exact content fingerprint that is being released.

## Tracked release assets

The release-readiness tool derives its inventory from the product itself:

- one `story-text` bundle per canonical story;
- each unique referenced story image;
- each narration MP3;
- files under `public/fonts/`;
- product artwork such as `public/ui/*`, icons, favicon and social artwork.

Narration has two independent checks:

1. **Synchronization** — `content/narration-state.json` proves whether the MP3 matches the current page text hash.
2. **Release provenance** — `content/release-provenance.json` records the evidence for distributing that exact MP3.

A narration file is release-ready only when both conditions pass.

Source lineage is a third, separate concept. `content/source-lineage.json` can prove where bytes came from in repository history, but a known origin is never treated as distribution permission by itself.

## Entry format

Entries are keyed by the asset ID emitted by `npm run release:report`.

```json
{
  "schemaVersion": 1,
  "entries": {
    "image:public/stories/example/cover.jpg": {
      "fingerprintSha256": "<sha256 emitted by release:report>",
      "claim": "licensed",
      "evidence": [
        "docs/licenses/example-image-license.pdf",
        "https://provider.example/terms/version-used"
      ]
    }
  }
}
```

Allowed `claim` values:

- `owned` — the project has evidence that the exact asset is owned/created under terms that permit this distribution;
- `licensed` — a license covering the exact asset and intended distribution is recorded;
- `public-domain` — there is evidence that the exact material being distributed is public domain; do not infer this merely because the underlying idiom or historical subject is old;
- `permission` — explicit permission covering the exact asset/distribution is recorded.

The tool deliberately has no generic `ai-generated` claim. A generation method by itself is not proof of distribution rights. Record the actual rights basis and evidence instead.

## Fingerprint rule

Every claim is bound to the current SHA-256 fingerprint. If story text or a file changes, the old entry becomes `stale` and normal CI fails until the stale claim is removed or replaced with evidence for the new fingerprint.

This prevents a valid license/provenance record for one version from silently authorizing a different version.

## Evidence-reference rule

Each verified entry must contain at least one repository-local evidence file. This makes the proof bundle durable even if an external site later changes.

Evidence references are machine-validated:

- repository-local evidence must use a safe relative path, must exist, must be a regular file, and must be non-empty;
- external evidence must use `https://`;
- absolute paths, traversal such as `../`, missing files, directories, empty files, and non-HTTPS URLs are rejected;
- a URL alone is not enough: at least one local evidence artifact must accompany it.

A local evidence artifact can itself record pinned upstream commits, hashes, invoices/license records, source terms snapshots, creator declarations, permission records, or other durable facts. Where automated identity verification is used, record the exact tool/version and comparison result.

Do not use statements such as these as evidence:

- `probably public domain`;
- `downloaded from the internet`;
- `AI generated`;
- `the file was already in the repository`;
- `source lineage is known`;
- `another agent said it was allowed`.

Do not place API keys, private credentials, personal secrets, or unnecessary personal data in the provenance registry or evidence files.

## Current verified example: Ma Shan Zheng

`public/fonts/MaShanZheng.woff2` is verified separately from the historical Grok-export lineage. Its evidence bundle contains:

- the exact local WOFF2 SHA-256;
- a pinned upstream `googlefonts/mashanzheng` commit and TTF Git blob;
- FontTools 4.63.0 subset-equivalence results showing every codepoint present in the local WOFF2 matches the official TTF in cmap, outline, and horizontal metrics;
- a repository-local verbatim copy of the upstream SIL Open Font License 1.1.

See `content/evidence/fonts/MaShanZheng.json` and `licenses/fonts/MaShanZheng/OFL.txt`.

This font verification does not change the status of story text, images, narration, or product artwork.

## Commands

```bash
# Shows coverage and asset IDs. Unverified assets do not make this command fail.
npm run release:report

# Used in normal development CI. Fails on malformed, stale, unresolved, or unknown provenance entries.
npm run provenance:check

# Actual release gate. Fails until every tracked asset has current provenance and every narration is synchronized to current text.
npm run release:check
```

`release:check` being red before the evidence work is finished is expected. Do not weaken the gate to make the number green.
