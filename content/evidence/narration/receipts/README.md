# Narration generation receipts

This directory is reserved for durable narration-generation receipts used by the release provenance gate.

A receipt is **not** a retrospective declaration that an existing MP3 is acceptable. It must be produced from, or contemporaneously with, an actual narration generation/export batch and must bind the exact canonical text SHA-256 to the exact release MP3 SHA-256.

## Required receipt shape

Each JSON receipt uses `schemaVersion: 1` and records:

- a stable `batchId` and `createdAt` timestamp;
- `canonicalSource: content/published-stories.json`;
- provider name, voice, language, and generation implementation identifier;
- one rights claim (`owned`, `licensed`, `public-domain`, or `permission`) plus durable evidence references;
- one or more narration items containing canonical `key`, exact `public/audio/...mp3` path, `textSha256`, and `audioSha256`.

## Fail-closed import

Use the repository importer in dry-run mode first:

```sh
npm run narration:import -- --receipt content/evidence/narration/receipts/<batch>.json
```

Only after the dry run passes should an authorized release operator write the state:

```sh
npm run narration:import -- --receipt content/evidence/narration/receipts/<batch>.json --write
```

The importer refuses path mismatches, text-hash mismatches, audio-hash mismatches, missing/invalid MP3 payloads, unsafe evidence paths, and conflicting existing state unless replacement is explicitly requested after review.

## Release semantics

`current` requires both the canonical text SHA-256 and release MP3 SHA-256 to match narration state. Rights verification additionally re-opens the receipt from this directory, re-hashes it, checks provider/voice/rights metadata, and revalidates the exact receipt item.

Changing the canonical text, MP3 bytes, receipt bytes, receipt path, provider/voice metadata, rights claim, or rights evidence revokes the generated narration provenance until a new valid receipt is imported.

The existing legacy narration files have no historical receipts and therefore remain unverified. Do not create receipts retroactively merely to raise coverage numbers.
