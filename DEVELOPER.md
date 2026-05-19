# CLI Developer Guide

How the CLI is built, and how to extend it.

## Package layout

```
bin/cli.js                  # Commander entry — wires global flags + commands
branding.json               # rebrandable identity (name, bin, description)
CLI_USAGE.md                # CLI reference cookbook for real command usage
DEVELOPER.md                # this developer guide
CHANGELOG.md                # release notes and version history
CONTRIBUTING.md             # contribution workflow and local testing
package.json                # package metadata, scripts, dependencies
src/
    ├── blueprint/            # architecture contract and path/anchor resolution
    ├── recipes/              # declarative generation manifests
    ├── engine/               # transactional generation core: plan/render/inject/validate/commit
    ├── services/             # reporters, clocks, and shared collaborators
    ├── schemas/              # CLI input validation (schema-kit based)
    ├── branding/             # rebrandable identity loader + `loom rename`
    ├── commands/             # command handlers (one file per command)
    ├── core/                 # legacy generator helpers and resource definition logic
    └── templates/            # EJS templates — resource/ and snippets/
```

## The three layers

**Blueprint** (`blueprint/`) — _where things go_. A `.loom/blueprint.json`
declares `roots` (detected directory names), `paths` (named path templates),
and `anchors` (injection points). The engine never hardcodes `"backend"` /
`"frontend"` — it asks the Blueprint. A new architecture is a new blueprint.

**Recipe** (`recipes/`) — _what gets generated_. A recipe manifest lists
`files`, `inject` entries, and `requires` (dependencies), each gated by an
optional `when` condition. `Recipe.plan()` resolves a manifest into a concrete
list for one invocation: param defaults applied, `when` evaluated, `out` paths
rendered through the blueprint.

**Engine** (`engine/`) — _how_. `createGenerationPipeline()` composes the
standard steps:

```
plan → render → inject → validate → commit
```

- **plan** — `recipe.plan(...)` → the resolved file/inject/requires list.
- **render** — each file's EJS template is rendered and **staged** in a
  `FileTransaction`. Nothing is written yet.
- **inject** — each `inject` snippet is rendered and spliced into its anchor
  file by the `Injector` (idempotent; the modified file is staged too).
- **validate** — every staged file passes the `Validator`. A single failure
  aborts the whole generation.
- **commit** — the transaction writes atomically; on any error it rolls back
  every file from this commit. `--dry-run` stops here and reports the plan.

Composition over inheritance: generation is a list of small steps threading one
context object — not a god-class. New capability = new step.

## The Validator

`scanDelimiters` is a dependency-free balanced-delimiter scanner aware of
strings, template literals, comments, regex literals and JSX. It is a
_heuristic backstop_, not a full parser — it catches the real bug class (stray
code, unbalanced braces, unterminated literals). A `@babel/parser` / `tsc`
strategy can be registered per-extension via `new Validator({ strategies })`
without touching callers.

## Adding a generation feature

1. Add or edit a recipe in `src/recipes/builtin/<name>.json`.
2. Add the EJS template(s) under `src/templates/`.
3. If the recipe injects into an existing file, ensure the blueprint declares the anchor.
4. Use `loom generate resource X --recipe <name>` or the dedicated `resource` recipe path.

## Adding a command

1. Create `src/commands/<name>.js` exporting a default async handler.
2. Register the command in `bin/cli.js`.
3. Build a `Reporter` from the merged options:
   `const reporter = reporterFromOptions({ ...program.opts(), ...options })` —
   never call `console.*`, `chalk`, or `ora` directly.

## Local development & testing

- Run `pnpm install` at the repo root.
- Use `node bin/cli.js --help` to verify the CLI entrypoint.
- Use `pnpm link --global` and `loom --help` for local command testing.

## Templates & EJS

- Rendered with EJS, `rmWhitespace: false` (templates control whitespace with
  the `-%>` slurp tag — do not re-enable `rmWhitespace`, it flattens output).
- Three-tier resolution: project `.loom/templates/` → `~/.loom/templates/` →
  shipped `src/templates/`.
- Resource templates receive `{ resource, blueprint, options, project, utils }`.
- Shared UI wrapper components such as `PageWrapper` should accept the props
  used by generated pages, including `title`, `subtitle`, and `actions`.

## Conventions

- The CLI subsystems (`blueprint/`, `recipes/`, `engine/`, `services/`,
  `schemas/`, `branding/`) are **Node-core-only** — keep them dependency-free.
- Each subsystem has a vitest suite under `__tests__/`.
- Destructive commands (`cleanup`, `remove`) must guard their working
  directory — see `cleanup.js`'s `assertProjectRoot`.

## Testing

```bash
pnpm test                                    # full vitest suite
pnpm test:smoke                              # contract smoke test for the MERN template
node node_modules/vitest/vitest.mjs run src/engine   # one subsystem
```

## Roadmap

See [`SPLIT.md`](./SPLIT.md) — the planned split into `stackloom` (engine) and
`stackloom-templates` (template) repos, with the blueprint contract as the seam.
