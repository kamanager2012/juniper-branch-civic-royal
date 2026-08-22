# Narration generation receipts

This directory is reserved for durable narration-generation receipts used by the release provenance gate.

A receipt is **not** a retrospective declaration that an existing MP3 is acceptable. It must be produced contemporaneously with an actual narration generation/export batch and must bind the exact approved generation input set, exact provider evidence, and exact resulting release MP3 bytes.

## Approved generation input

Before audio generation, the canonical narration input set is pinned by:

`content/evidence/narration/generation-set-v1.json`

The approved full set contains 216 items. Its digest is computed from the sorted `{ key, file, textSha256 }` tuples before any audio result exists. A canonical text/path change requires a new reviewed generation-set identity before synthesis may start.

Inspect it with:

```sh
npm run narration:batch -- --all --summary
```

A single-story generation scope is allowed only when its nine inputs are an exact subset of that approved full set.

## Approved local provider

The release-approved local provider is:

`content/evidence/narration/providers/kokoro-v1.1-zh-zf001.json`

It pins the Kokoro v1.1 Chinese model revision, config/model/voice SHA-256 values, the bundled `zf_001` voice, exact Kokoro and Misaki source commits, and the rights boundary. The local generator validates those model assets and requires clean Git checkouts at the approved runtime commits before synthesis.

Kokoro receipts also bind the exact provider profile bytes through `provider.profile.id`, `provider.profile.evidence`, and `provider.profile.sha256`. The release rights gate re-opens that provider profile, re-hashes it, and re-runs the approved-profile validator. Provider-profile drift therefore revokes generated narration provenance.

## Local generation

Generation requires locally downloaded pinned model assets plus clean exact Kokoro and Misaki source checkouts. The command is intentionally explicit:

```sh
npm run narration:generate -- \
  --story <story-id> \
  --assets-dir <kokoro-assets-dir> \
  --kokoro-src-dir <pinned-kokoro-checkout> \
  --misaki-src-dir <pinned-misaki-checkout> \
  --dry-run
```

Use `--all` instead of `--story <story-id>` only for a reviewed 216-item full replacement. After dry-run validation succeeds, remove `--dry-run` to synthesize. `--device cpu` is the default; `--device cuda` is explicit. If the scope already contains current narration, generation refuses unless `--replace` is explicitly supplied.

The Node orchestrator validates the approved input set, provider profile, local model assets, and clean source checkouts before invoking the Python waveform engine. The Python engine loads only the supplied local model/config/voice files and writes staged 24 kHz mono WAV files. `ffmpeg` then encodes staged MP3s with `libmp3lame` at 40 kbps. Every MP3 must remain within the 180,000-byte release budget.

The generator stages all outputs under ignored `.narration-work/`, constructs a contemporaneous receipt, and only then replaces the canonical MP3 files. It does **not** mutate `content/narration-state.json`.

## Required receipt shape

Each JSON receipt uses `schemaVersion: 1` and records:

- a stable `batchId` and `createdAt` timestamp;
- `canonicalSource: content/published-stories.json`;
- `inputItemCount` matching the exact receipt item count;
- `inputDigestSha256` matching the exact sorted `{ key, file, textSha256 }` input set;
- provider name, voice, language, generation implementation identifier, and provider-profile binding when required;
- one rights claim (`owned`, `licensed`, `public-domain`, or `permission`) plus durable evidence references;
- one or more narration items containing canonical `key`, exact `public/audio/...mp3` path, `textSha256`, and `audioSha256`;
- execution metadata for pinned model/runtime identity and the MP3 encoder.

The receipt validator independently recomputes `inputDigestSha256`; editing selected keys, paths, or text hashes without updating the generation identity is invalid.

## Fail-closed import

After generation, use the repository importer in dry-run mode first:

```sh
npm run narration:import -- --receipt content/evidence/narration/receipts/<batch>.json
```

Only after the dry run passes should an authorized release operator write the state:

```sh
npm run narration:import -- --receipt content/evidence/narration/receipts/<batch>.json --write
```

For an intentional replacement of already-current narration, the importer also requires `--replace`.

The importer refuses path mismatches, text-hash mismatches, audio-hash mismatches, missing/invalid MP3 payloads, unsafe evidence paths, provider-profile evidence failures, and conflicting existing state. The generation input count/digest, provider-profile identity, and receipt SHA-256 are persisted into narration state.

## Release semantics

`current` requires both the canonical text SHA-256 and release MP3 SHA-256 to match narration state. Rights verification additionally re-opens the receipt and provider profile, re-hashes them, checks generation input identity and provider/voice/rights metadata, and revalidates the exact receipt item.

Technical source lineage is separate from rights provenance. A current receipt-backed narration asset receives `generation-receipt` source lineage, proving which batch produced its exact bytes. That does not by itself grant rights; the rights gate separately requires the approved provider evidence.

Changing the generation input selection, canonical text, MP3 bytes, receipt bytes/path, provider profile bytes, model/runtime identity, provider/voice metadata, rights claim, or rights evidence revokes the relevant generated narration verification until a new valid batch is generated and imported.

The existing legacy narration files have no historical receipts and therefore remain unverified. Do not create receipts retroactively merely to raise coverage numbers.
