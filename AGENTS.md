# AGENTS.md

## Mission

Maintain **成语故事** as a small, local-first Chinese idiom audio storybook. The core product is a static browser application: story metadata + image/audio assets + reader UI + local progress.

## Hard boundaries

- Do not add authentication, accounts, cloud databases, server functions, SSR, API routes, multiplayer, analytics SDKs, or vendor preview bridges unless a concrete product requirement explicitly needs them.
- Do not reintroduce `@tanstack/react-start`, Nitro, Better Auth, PostgreSQL/PGlite/Kysely, or Grok Builder runtime code as generic infrastructure.
- Keep the deployable runtime static: Vite + React + TanStack Router + files under `public/`.
- Preserve the existing story reading flow, narration, highlighting, page navigation, progress, settings, and mobile-safe-area behavior unless the task explicitly changes UX.
- Treat `src/data/stories.ts` as the only canonical story manifest. Every content tool must consume it through `scripts/story-model.mjs`; do not copy story text into generators, migrations, fixtures, or one-off scripts.
- Do not silently rename story IDs, page IDs, or asset paths; these are persistence/content keys.
- Do not commit generated deployment output, screenshots, local workspace state, secrets, or `.env` files.
- Do not claim content provenance, copyright clearance, narration freshness, or production readiness merely because files exist.

## Content pipeline boundary

- `scripts/story-model.mjs` is the shared parser for the canonical story model.
- `npm run content:check` must pass: referenced images/audio must exist, have valid file signatures, and the story/audio trees must not contain unreferenced orphan assets.
- `npm run content:report` is the deterministic machine-readable inventory for story/page counts, byte sizes, hashes, warnings, and asset issues.
- Narration planning is derived from canonical page text with SHA-256 fingerprints. `content/narration-state.json` records only narration generated/verified through the current pipeline.
- Existing MP3 files without a matching state entry are **unverified**, not current. Never fabricate or infer provenance for them.
- Do not restore `expand-stories.py`, `generate-narration.py`, `generate-narration-2.py`, or any other duplicate story-text source.
- TTS generation must be explicitly scoped with `--story <id>` or `--all` and must use an explicit voice (`--voice` or `XAI_TTS_VOICE_ID`). No silent bulk generation and no hard-coded provider voice assumptions.
- API credentials stay in environment variables only. Never commit API keys, tokens, or generated secret-bearing logs.

## Offline/PWA boundary

- `public/sw.js` is a small product-owned service worker, not a framework runtime.
- Offline support covers the app shell, built static assets, and story images that were previously visited while online.
- Do not automatically cache `/audio/*` or HTTP Range responses. Narration files can be large and browsers may request byte ranges; full offline narration needs an explicit user-facing download/storage design.
- Cache cleanup must only delete keys owned by this application (`chengyu-storybook-*`), never every Cache Storage entry on the origin.
- Service-worker registration is progressive enhancement: a registration failure must not prevent online reading.

## Required verification

Before claiming a change is complete, run:

```bash
npm run deps:inventory
npm run typecheck
npm test
npm run content:check
npm run build
```

CI must pass on Node 20 and Node 22. Dependency audit must not report high/critical findings.

For changes that affect routing, the reader UI, media loading, responsive layout, PWA/offline behavior, or deployment behavior, also run:

```bash
npx playwright install chromium
npm run test:e2e
```

For story text, page structure, image, or narration changes, also inspect:

```bash
npm run content:report
npm run narration:plan
```

## Routing and deployment

Routes are file-based under `src/routes/` and generated through `@tanstack/router-plugin`. Static hosts must use an SPA fallback to `index.html` so direct navigation to `/story/<id>` works.

## Architecture changes

Prefer deleting unused infrastructure over keeping speculative abstractions. Add a service only when the product has a user-facing requirement that cannot be met by the static/local-first architecture.
