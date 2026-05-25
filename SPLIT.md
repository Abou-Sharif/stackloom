# Two-Repo Split — Migration Guide

The foundation phase built everything **inside this monorepo** so it stayed
runnable throughout. This document is the mechanical plan to finish the
decoupling into the two standalone repositories that will be published and
maintained from here on:

| Repo | What it is | npm |
|------|-----------|-----|
| **`stackloom`** | The CLI / engine — published to npm as the `stackloom` package, exposing the `loom` command | `npm i -g stackloom` |
| **`stackloom-templates`** | The runnable template apps — currently the MERN starter, future architectures sit alongside it | not published; fetched by `loom new` via tarball |

> Status: **prepared, not executed.** The seam (the blueprint contract) is in
> place; the steps below are safe to run once the test suite is green.

## Target shape

```
stackloom/                  (published npm package — the engine + commands)
  bin/cli.js                exposes the `loom` binary
  branding.json
  src/
    blueprint/      architecture contract loader + schema   ✅ built
    recipes/        declarative generation manifests        ✅ built
    engine/         transactional pipeline + injector       ✅ built
    services/       Reporter, Clock, DI container           ✅ built
    schemas/        CLI input validation                    ✅ built
    commands/       command handlers
    templates/      resource + snippet templates
    recipes/builtin/ shipped recipe manifests

stackloom-templates/        (template apps the CLI scaffolds from)
  mern/                     the runnable Express + React + MongoDB app
    backend/  frontend/
    .loom/
      blueprint.json        the architecture contract        ✅ built
      recipes/              optional project-specific recipe overrides
      templates/            optional project-specific template overrides
  next/                     (future) Next.js architecture — a new blueprint
  pern/                     (future) Postgres variant — a new blueprint
```

## The integration seam

The CLI and the templates no longer share a folder — they share a **contract**:
`.loom/blueprint.json` (validated by `src/blueprint/schema.js`). The CLI is a
generic engine that scaffolds into *any* project carrying a conforming
blueprint. This is what makes the split clean and what makes a second
architecture (Next.js, PERN, …) a new blueprint rather than an engine fork.

## Steps

1. **Create `stackloom-templates`** from the current `backend/` + `frontend/` +
   the repo-root `.loom/`. It is already a complete, runnable app — put it under
   `mern/` so the repo can host more architectures later.
2. **Create `stackloom`** from `packages/cli/`. Its `package.json` is already
   self-contained (`name: "stackloom"`, `bin: { loom: "./bin/cli.js" }`,
   `files`).
3. **Keep the `schemaVersion` compatibility gate** — the CLI already validates
   `blueprint.schemaVersion` against `SUPPORTED_SCHEMA_VERSIONS`; extend `loom
   new` to check the fetched template's version before scaffolding.
4. **Rework `loom new` (formerly `init`)** to fetch a *pinned release* of
   `stackloom-templates` (git tarball / `degit`) instead of copying a sibling
   folder. The default tarball is the `mern/` subtree at the latest tag.
5. **Delete `packages/test-smoke-project/`** — the committed full copy. CLI
   integration tests instead run against `stackloom-templates/mern/` as a
   pinned fixture.
6. **CI**: `stackloom-templates` CI asserts every blueprint-declared anchor
   exists in the codebase (catches anchor drift). `stackloom` CI runs the
   engine against the `mern/` fixture end to end.
7. **Versioning**: `stackloom` follows semver on the engine; the blueprint
   `schemaVersion` moves independently and only on breaking contract changes;
   each template under `stackloom-templates/<name>/` carries its own git tag.

## Why this is now low-risk

Every piece the split depends on already exists and is tested: the blueprint
loader (3-tier resolution + validation), the recipe loader, the transactional
pipeline, and the anchor injector. The split becomes a *move*, not a *rewrite*.

## Publishing checklist (post-split)

```bash
# stackloom (CLI)
cd stackloom
pnpm install   # or npm install / yarn / bun
pnpm test
npm version patch
npm publish --access public

# stackloom-templates (just tag — not published to npm)
cd ../stackloom-templates
git tag mern-v1.0.0
git push --tags
```

Consumers then run:

```bash
npx stackloom new my-app          # fetches the latest mern template tarball
# or, after a global install:
loom new my-app --template mern
```
