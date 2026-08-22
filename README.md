# 成语故事 · Frozen Prototype

> **Status: Frozen prototype. This repository is not an actively maintained product and should be treated as historical material.**

This repository is a one-time export from an app-builder workflow for a small Chinese idiom storybook / audio-picture-book prototype.

It is intentionally **not** being promoted into a long-lived production repository.

## Why this repository is frozen

The current repository reflects an exported builder workspace rather than a clean product source tree:

- the repository name is an automatically generated workspace name rather than a product identity;
- the initial history is a single builder export;
- generated/deployment material, screenshots, and artifacts were committed together with source;
- the repository is unusually large for the actual application;
- there is no established CI/release/support contract.

Deleting those files from the current tip would not remove their historical weight from Git, so a cosmetic cleanup here would create churn without fixing the repository's underlying provenance.

## If the product is revived

Create a **new clean repository** with:

- a meaningful product name (for example `chengyu-storybook` or similar);
- source-only history;
- explicit content / image / audio provenance and licensing;
- deterministic install/build/test commands;
- CI and deployment evidence;
- no generated Vercel output or builder-export artifacts committed to Git.

The useful application code in this repository can be referenced or selectively migrated into that new repository, with provenance preserved.

## Maintenance policy

No new feature development is planned in this repository. It is kept only as an historical prototype snapshot.
