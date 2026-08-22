# AGENTS.md

## Mission

Maintain **成语故事** as a small, local-first Chinese idiom audio storybook. The core product is a static browser application: story metadata + image/audio assets + reader UI + local progress.

## Hard boundaries

- Do not add authentication, accounts, cloud databases, server functions, SSR, API routes, multiplayer, analytics SDKs, or vendor preview bridges unless a concrete product requirement explicitly needs them.
- Do not reintroduce `@tanstack/react-start`, Nitro, Better Auth, PostgreSQL/PGlite/Kysely, or Grok Builder runtime code as generic infrastructure.
- Keep the deployable runtime static: Vite + React + TanStack Router + files under `public/`.
- Preserve the existing story reading flow, narration, highlighting, page navigation, progress, settings, and mobile-safe-area behavior unless the task explicitly changes UX.
- Treat `src/data/stories.ts` as the canonical story manifest. Every referenced image and narration file must exist and be non-empty.
- Do not silently rename story IDs, page IDs, or asset paths; these are persistence/content keys.
- Do not commit generated deployment output, screenshots, local workspace state, secrets, or `.env` files.
- Do not claim content provenance, copyright clearance, or production readiness merely because files exist.

## Required verification

Before claiming a change is complete, run:

```bash
npm run deps:inventory
npm run typecheck
npm test
npm run build
```

CI must pass on Node 20 and Node 22. Dependency audit must not report high/critical findings.

## Routing and deployment

Routes are file-based under `src/routes/` and generated through `@tanstack/router-plugin`. Static hosts must use an SPA fallback to `index.html` so direct navigation to `/story/<id>` works.

## Architecture changes

Prefer deleting unused infrastructure over keeping speculative abstractions. Add a service only when the product has a user-facing requirement that cannot be met by the static/local-first architecture.
