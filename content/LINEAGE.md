# Source lineage

`content/source-lineage.json` records where the exact current release asset can be traced in repository history. It is deliberately separate from `content/release-provenance.json`.

**Known source lineage is not a rights claim.** A file can be proven to come from the original Grok export and still remain `unverified` for public distribution until a license, ownership record, permission, or other durable rights evidence is recorded.

## Recovery baseline

The first recovery anchor is the original repository export commit:

`88c2080c715a1c37e64916970cbbc4af2ed7727a` — `Export from Grok`

Recovery uses identity, not filenames alone:

- file assets are matched by Git blob SHA against the complete original-export tree;
- moved files remain recoverable when their bytes are unchanged;
- story-text bundles are considered source-known only while the canonical `src/data/stories.ts` Git blob is byte-identical to the original-export version;
- every lineage entry is also bound to the current release SHA-256 fingerprint, so later content changes make the entry stale.

## Registry entry

```json
{
  "fingerprintSha256": "<current release fingerprint>",
  "origin": {
    "commit": "88c2080c715a1c37e64916970cbbc4af2ed7727a",
    "path": "public/stories/example/cover.jpg",
    "method": "git-blob-identity",
    "gitBlob": "<git blob sha>"
  }
}
```

Allowed automated recovery methods are:

- `git-blob-identity` — current file bytes match a blob in the original export tree;
- `canonical-source-blob-identity` — the canonical story source file itself is byte-identical to the original-export source.

Do not add an `origin` entry merely because a filename looks familiar, a commit message mentions Grok, or an agent assumes how an asset was created.

## Commands

```bash
# Validate committed lineage against current release fingerprints.
npm run source:check

# Show current source-lineage coverage.
npm run source:report

# Requires full Git history. Recovers exact blob-identity matches and writes the registry.
npm run source:recover
```

`source:check` may be green while release provenance is still incomplete. Release rights remain governed independently by `npm run provenance:check` and `npm run release:check`.
