# Release provenance

`content/release-provenance.json` is an evidence registry, not a place to guess rights status.

The registry is intentionally empty until a human or a trusted import process can attach durable evidence to the exact content fingerprint that is being released.

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

## Evidence rules

Evidence must be specific enough for another reviewer to understand why the exact asset can be distributed. Useful evidence can include a repository document, invoice/license record, source terms version, creator declaration, permission record, or other durable source.

Do not use statements such as these as evidence:

- `probably public domain`;
- `downloaded from the internet`;
- `AI generated`;
- `the file was already in the repository`;
- `another agent said it was allowed`.

Do not place API keys, private credentials, personal secrets, or unnecessary personal data in the provenance registry.

## Commands

```bash
# Shows coverage and asset IDs. Unverified assets do not make this command fail.
npm run release:report

# Used in normal development CI. Fails on malformed, stale, or unknown provenance entries.
npm run provenance:check

# Actual release gate. Fails until every tracked asset has current provenance and every narration is synchronized to current text.
npm run release:check
```

`release:check` being red before the evidence work is finished is expected. Do not weaken the gate to make the number green.
