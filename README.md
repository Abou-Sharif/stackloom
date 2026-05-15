# stackloom

> Weave production-ready full-stack apps from a single command.

`stackloom` is a recipe-driven, transactional code-generation CLI. It scaffolds
a complete MERN application and then keeps extending it — full-stack resources,
admin pages, deploy configs — without ever leaving a half-written file behind.

The CLI command is **`loom`**. It is **rebrandable**: run `loom rename <name>`
to make the whole tool your own.

## Install

```bash
# one-off
npx stackloom new my-app

# or global
pnpm add -g stackloom
loom new my-app
```

## How it works

The CLI is a generic engine — it hardcodes nothing about MERN. Three layers:

| Layer | Lives in | Answers |
|-------|----------|---------|
| **Blueprint** | a project's `.loom/blueprint.json` | *where* things go — directory roots, path templates, injection anchors |
| **Recipe** | `src/recipes/builtin/*.json` | *what* gets generated — files, injections, dependencies, gated by `when` conditions |
| **Engine** | `src/engine/` | *how* — a transactional pipeline: `plan → render → inject → validate → commit` |

Generation is **all-or-nothing**: every file is rendered into a staging
transaction, syntax-validated, and only a fully-valid set is committed. A
broken file is never written; on any failure the whole change set rolls back.

Adding support for another stack (Next.js, PERN, …) is a new `blueprint.json` —
not an engine change.

## Commands

| Command | What it does |
|---------|--------------|
| `loom new [name]` | Create a new project from the starter template |
| `loom generate resource <Name>` | **Unified, engine-backed generator** — full-stack CRUD resource |
| `loom generate resource <Name> --recipe module` | Backend-only module |
| `loom generate resource <Name> --recipe page` | Frontend page wired to an existing resource |
| `loom generate theme` / `loom generate deploy` | Import a shadcn theme / emit deploy configs |
| `loom check` | Verify project health — blueprint validity, anchor integrity, env file |
| `loom env [--sync]` | Diff `.env` against `.env.example`; `--sync` appends missing keys |
| `loom rename <name>` | Rebrand the CLI itself (bin name, help text, output) |
| `loom cleanup [preset]` | De-brand a project — `minimal` \| `production` (full) \| `template` |
| `loom customize` | Theme / layout / brand / data-display |
| `loom wizard` | Interactive guided setup |
| `loom doctor` | Environment + project health check |
| `loom rollback` | Undo the last generation |
| `loom finalize` | Lint + test + build for production |
| `loom preset [name]` | Apply a predefined preset |
| `loom remove <type> <name>` | Remove a generated resource and its references |

> `generate module`, `generate page`, and `make:resource` still work but are
> **superseded** by `generate resource` — they print a deprecation notice.

`loom init` is kept as an alias for `loom new`.

## Global flags

Every command honors:

- `--quiet` / `-q` — errors and warnings only (auto-on under CI / when piped)
- `--json` — structured JSON output for scripts
- `--no-color` — disable ANSI colour
- `--debug` — diagnostic detail
- `--yes` / `-y` — assume defaults, never prompt

## Generating a resource

```bash
# Full-stack CRUD: model, service, controller, routes, validator,
# admin pages, table/form components, API client, hooks — all mounted and linked.
loom generate resource Product --fields "name:string:required;price:number;slug:string"

# Choose how the create/edit form is mounted
loom generate resource Order --fields "total:number" --form-mode modal

# Pick the architecture level (see below)
loom generate resource Invoice --fields "amount:number" --arch lightweight

# Preview without writing
loom generate resource Ticket --fields "subject:string" --dry-run
```

The engine creates the requested files **and links them**: mounts the route in
`backend/src/routes/index.js`, adds the lazy import + route to
`AppRouter.jsx`, and appends the nav entry to `app-preset.js`. Injection is
idempotent — re-running is safe.

### Architecture levels (`--arch`)

| Level | Backend shape |
|-------|---------------|
| `lightweight` | Inline controller, no service layer — minimal files |
| `moderate` *(default)* | Full layering — `models/`, `services/`, `controllers/`, `routes/` |
| `advanced` | `moderate` + generated tests + batch/transaction operations |

### Form modes (`--form-mode`)

`page` *(default)* · `modal` · `sidepanel` · `inline` — selects the list-page
shell and how the shared form component is mounted. One form component, four
thin page shells.

## Field spec

`--fields "name:type:rule|rule;name2:type2"` — e.g.
`"email:email:required|unique;age:number:min=0;bio:text"`. Types: `string`,
`text`, `number`, `boolean`, `date`, `email`, `password`, `ref`, `select`,
`image`, and more. Definitions can also come from a file: `--file resource.js`.

Inputs are schema-validated before generation runs — a bad field type, a
non-PascalCase name, or duplicate fields fail fast with a clear message.

## Customising templates

Templates resolve in three tiers (first match wins):

1. `<project>/.loom/templates/<path>` — project overrides
2. `~/.loom/templates/<path>` — user-global overrides
3. shipped defaults

A project can also override a recipe by pointing `blueprint.recipes.<name>` at
its own manifest.

## Rebranding the CLI

```bash
loom rename acme --display-name "ACME"
```

Updates `branding.json` and `package.json`'s `bin` key. Re-link with
`pnpm install` and the tool answers to `acme`.

## Preparing a project for handoff

```bash
loom cleanup production   # full de-brand — see below
```

`cleanup` refuses to run unless the working directory is a real project root
(has both `backend/` and `frontend/`). The `production` preset removes `.loom/`,
the bundled CLI, starter docs and demo content; strips `STARTER-KIT:` /
`TODO: Customize` comments and AUTO-GENERATED markers; resets package names;
and rewrites the README — leaving no trace of the starter kit.

## Local development

```bash
cd packages/cli
pnpm install
node bin/cli.js --help
pnpm test          # vitest — engine, blueprint, recipes, services, schemas
```

See [`DEVELOPER.md`](./DEVELOPER.md) for engine internals, [`API.md`](./API.md)
for the programmatic API, and [`SPLIT.md`](./SPLIT.md) for the planned
`stackloom` / `stackloom-templates` repo split.

## License

MIT
