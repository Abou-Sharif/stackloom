# stackloom — CLI

> Weave production-ready full-stack apps from a single command.

`stackloom` is a recipe-driven, transactional code-generation CLI. It scaffolds
a complete MERN application and then keeps extending it — full-stack resources,
admin pages, deploy configs — without ever leaving a half-written file behind.

The CLI command is **`loom`** (rebrandable via `loom rename`).

---

## Quick start (30 seconds)

```bash
# 1. Install (one-time)
npm install -g stackloom-cli

# 2. Create a project — picks your PM, preset, theme, layout
loom init my-app

# 3. Generate a full-stack resource
cd my-app
loom generate resource Product --fields "name:string:required;price:number"

# 4. Start developing
pnpm -C backend dev    # API at :5000
pnpm -C frontend dev   # UI at :5173
```

That's it. You now have a working CRUD API, React pages, and nav entry for Product.

---

## Install

```bash
# One-off (no install required)
npx stackloom-cli init my-app

# Global install (any PM)
npm install -g stackloom-cli
pnpm add -g stackloom-cli
yarn global add stackloom-cli
bun add -g stackloom-cli
```

During `loom init` you choose your package manager (pnpm, npm, yarn, bun).
All subsequent commands (`generate`, `finalize`, `doctor`, `cleanup`, `preset`)
use it automatically — no more hardcoded pnpm.

---

## How it works

Three layers — the CLI hardcodes nothing about MERN:

| Layer         | Lives in                           | Answers                                                                             |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| **Blueprint** | a project's `.loom/blueprint.json` | _where_ things go — directory roots, path templates, injection anchors              |
| **Recipe**    | `src/recipes/builtin/*.json`       | _what_ gets generated — files, injections, dependencies, gated by `when` conditions |
| **Engine**    | `src/engine/`                      | _how_ — a transactional pipeline: `plan → render → inject → validate → commit`      |

Generation is **all-or-nothing**: every file is staged, syntax-validated, then
committed atomically. A broken file is never written; on any failure the whole
change set rolls back.

---

## ── Commands by architecture level ──

StackLoom adapts to your experience level. Start with **Lightweight** — just
a few simple commands. As your project grows, unlock more.

### ⚡ Lightweight — start here

| Command | What it does |
| ------- | ------------ |
| `loom init <name>` | Create a new project from the starter template |
| `loom wizard` | Interactive step-by-step builder (great for learning) |
| `loom ai describe <description>` | Describe what you want in plain English — get a StackLoom spec back |
| `loom ai scaffold <description>` | Design and generate a whole system (multi-resource) from one sentence |
| `loom ai configure` | Set up your AI provider (API key, model, URL) — one-time setup |
| `loom ai feedback` | Rate and review generated code — helps improve future results |

### 📈 Moderate — growing projects

| Command | What it does |
| ------- | ------------ |
| `loom generate resource <Name>` | Full-stack CRUD — API + pages + nav, all wired up |
| `loom ai generate [name] [desc]` | Generate a resource from a natural-language description |
| `loom ai fix <resource> <issue>` | Tell StackLoom what's wrong — it diagnoses and fixes the resource |
| `loom ai change <resource> <change>` | Describe a change to an existing resource — StackLoom applies it |
| `loom scaffold <scenario>` | Generate a complete scenario preset (parking, payroll, …) |
| `loom remove <type> <name>` | Remove a generated module or page |
| `loom add-report [name]` | Aggregation pipeline report (backend + frontend) |

### 🔧 Advanced — full control

| Command | What it does |
| ------- | ------------ |
| `loom customize theme set <name>` | Switch color palette, radius, shadows (8 themes) |
| `loom customize layout set <name>` | Switch app shell (4 layouts) |
| `loom customize brand set --name "X"` | Update brand name/tagline |
| `loom customize data set <name>` | Switch data display template (4 templates) |
| `loom customize ui set <name>` | Switch card/modal/select/pagination |
| `loom customize font set <font>` | Body + heading fonts (Google Fonts auto-import) |
| `loom customize css --file ./custom.css` | Inject custom CSS rules |
| `loom customize component set <c> <v>` | Switch component layout variant |
| `loom doctor` | Check Node.js, PM, project structure |
| `loom check` | Verify blueprint, anchors, env |
| `loom env [--sync]` | Diff `.env` against `.env.example` |
| `loom finalize` | Lint, test, build — production readiness |
| `loom cleanup [preset]` | De-brand project for handoff |
| `loom upgrade [--write]` | Check and apply safe template upgrades |
| `loom validate <scenario>` | Audit project against a scenario/exam checklist |
| `loom explain` | Show project overview (resources, routes, theme, auth) |
| `loom rename <name>` | Rebrand the CLI itself (bin name, help text) |
| `loom usage` | Write `CLI_USAGE.md` reference to project root |
| `loom backup` / `loom rollback` | Safety nets — backup and undo |
| `loom completion [bash\|zsh]` | Generate shell completion script |

_`generate module`, `generate page`, and `make:resource` still work but are
superseded by `generate resource` — the unified engine-backed generator._

---

## Global flags

Every command honors:

| Flag                    | Description                                                                 |
| ----------------------- | --------------------------------------------------------------------------- |
| `-q, --quiet`           | Errors and warnings only (auto-on under CI / when piped)                   |
| `--json`                | Structured JSON output for scripts and CI                                   |
| `--no-color`            | Disable ANSI colour                                                         |
| `--debug`               | Show diagnostic detail                                                      |
| `-y, --yes`             | Assume defaults, never prompt                                               |
| `--brief`               | Less chatty output where supported                                          |

---

## Typical workflow (recommended)

```
loom init my-app --preset saas    # 1. Create project
cd my-app
loom wizard                         # 2. Add resources interactively
loom generate resource Product \    # 3. Or add directly
  --fields "name:string:required;price:number"
loom customize theme set tealFlow   # 4. Tweak the look
loom doctor                         # 5. Verify everything is healthy
loom finalize                       # 6. Before shipping
loom cleanup production             # 7. Before handing off
```

---

## Generating a resource

```bash
# Full-stack CRUD: model, service, controller, routes, validator,
# admin pages, table/form components, API client, hooks — all mounted and linked.
loom generate resource Product --fields "name:string:required;price:number;slug:string"

# Choose how the create/edit form is mounted
loom generate resource Order --fields "total:number" --form-mode modal

# Pick the architecture level
loom generate resource Invoice --fields "amount:number" --arch lightweight

# Preview without writing
loom generate resource Ticket --fields "subject:string" --dry-run

# Quieter log: summary + change-set only (file list still in --json)
loom generate resource Tag --fields "name:string:required" --brief
```

### Options

| Flag                   | Values                                   | What it does                                            |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `--fields <spec>`      | `name:type:rules;...`                   | Define the resource schema inline                        |
| `--file <path>`        | path                                     | Load schema from a resource definition file              |
| `--recipe <name>`      | `resource`, `module`, `page`            | Full-stack, backend-only, or frontend-only               |
| `--arch <level>`       | `lightweight`, `moderate`, `advanced`    | Backend complexity                                       |
| `--form-mode <mode>`   | `page`, `modal`, `sidepanel`, `inline`   | How the form mounts in the UI                            |
| `--crud <mode>`        | `full`, `insert-only`                    | CRUD scope — insert-only skips list/detail/update/delete |
| `--relations <spec>`   | see below                                | Virtual `hasMany` populate                               |
| `--with-tests`         | —                                        | Generate test files                                      |
| `--no-frontend`        | —                                        | Backend-only output                                      |
| `--interactive`        | —                                        | Prompt for missing details                               |
| `--dry-run`            | —                                        | Preview the file plan without writing                    |
| `--preview`            | —                                        | Show estimated file count before generating              |
| `--amend`              | —                                        | Update an existing resource (preserves custom zones)     |
| `--remove-fields`      | comma-separated field names              | Drop fields on amend                                     |
| `--force`              | —                                        | On amend, overwrite unmarked files                       |

### Architecture levels (`--arch`)

| Level                  | Backend shape                                                     |
| ---------------------- | ----------------------------------------------------------------- |
| `lightweight`          | Inline controller, no service layer — minimal files               |
| `moderate` _(default)_ | Full layering — `models/`, `services/`, `controllers/`, `routes/` |
| `advanced`             | `moderate` + generated tests + batch/transaction operations       |

### Form modes (`--form-mode`)

`page` _(default)_ · `modal` · `sidepanel` · `inline`

Selects the list-page shell and how the shared form component is mounted.

### CRUD scoping (`--crud`)

| Mode           | Backend                                    | Frontend                               |
| -------------- | ------------------------------------------ | -------------------------------------- |
| `full`         | POST, GET (list/detail), PUT, DELETE       | List, detail, create/edit form, delete |
| `insert-only`  | POST only (with validation)                | Create form only (no list/edit/delete) |

Use **insert-only** for public-facing forms (contact, applications, surveys).

---

## Field spec format

```bash
--fields "fieldName:type:rule1|rule2;fieldName2:type2:rule"
```

Example: `"email:email:required|unique;age:number:min=0;role:select"`

### Types

`string` · `text` · `number` · `boolean` · `email` · `password` · `phone` · `url` ·
`date` · `datetime` · `color` · `file` · `image` · `select` · `ref[Model]`

### Validation rules

`required` · `unique` · `minLength=N` · `maxLength=N` · `min=N` · `max=N` · `pattern=REGEX`

### Relations (virtual hasMany)

```bash
--relations "orders:hasMany:Order:customerId"
```

Each segment: `virtualField:hasMany:ChildPascalModel:foreignKeyOnChild`.
Multiple relations separated with `;`. Adds Mongoose virtual populate.

### File-based definitions

Instead of `--fields`, use `--file resource.js`:

```js
export default {
  name: "Product",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "price", type: "number", required: true, min: 0 },
  ],
  relations: {
    hasMany: [{ name: "reviews", model: "Review", foreignKey: "product" }],
  },
};
```

---

## Amending a resource (`--amend` / `loom resource sync`)

After the first `generate resource`, the schema is saved in `.loom/resources/<kebab>.json`.

```bash
# Add or update fields (merged by name; omitted fields are kept)
loom generate resource Product --amend --fields "sku:string:required"

# Alias
loom resource sync Product --fields "sku:string:required"

# Remove fields
loom generate resource Product --amend --remove-fields "legacyCode"

# Interactive amend — walks through add/remove fields and relations
loom resource sync Product --interactive
```

**Merge rules:**
- **Model** (`models/*.js`): code above `// ✎ CUSTOM CODE ZONE` is regenerated; your code below is kept.
- **Other files** with `AUTO-GENERATED` markers: only the marked block is replaced.
- **Unmarked files**: amend fails unless you pass `--force`.

**Safety:** amend refuses to run if manual edits appear outside safe zones.
Use `--force` to override.

---

## Best practices

| Practice | Why |
| -------- | --- |
| **Use `--dry-run` first** | Preview what will change before writing. No risk. |
| **Commit before generation** | Rollback is great; git is better. Commit before big changes. |
| **Use `--interactive` when learning** | Each prompt explains its options. You learn as you go. |
| **Start with `lightweight` for prototypes** | Fewer files, faster iteration. Upgrade to `moderate` later. |
| **Use the wizard for multi-resource sessions** | Queue up several resources, review, then execute all at once. |
| **Run `loom doctor` after init** | Catches missing PM, missing `.env`, or broken structure early. |
| **Use `loom finalize` before deployment** | Runs lint, test, build, and security audit in one command. |
| **Run `loom cleanup production` before handoff** | Strips all starter-kit traces. The project looks hand-written. |
| **Use `insert-only` for public endpoints** | Prevents users from listing or editing data they shouldn't access. |
| **Custom code goes below the `CUSTOM CODE ZONE` marker** | That zone is preserved on amend. Code above it gets regenerated. |

---

## Watch out for

| Pitfall | How to avoid |
| ------- | ------------ |
| **Fields without `required` are optional** | Mongoose will save `undefined`. Add `required` if the field must be present. |
| **Amend won't overwrite custom code** | If you edited outside the `CUSTOM CODE ZONE`, amend bails. Use `--force` to overwrite anyway. |
| **`routes/index.js` uses `\r\n` line endings** | The CLI handles both `\n` and `\r\n`, but if you manually edit it, keep consistent line endings. |
| **Insert-only resources have no list/edit UI** | The API only has POST. If you later need a list page, regenerate with `--crud full`. |
| **`ref[Model]` requires the referenced model to exist** | Create the referenced resource first, then add the ref field via amend. |
| **`loom cleanup production` removes `.loom/`** | That destroys upgrade/rollback/amend history. Only run this for final handoff. |
| **Shell completions reflect the current CLI version** | Re-run `loom completion <shell>` after upgrading the CLI. |
| **`--local-template` overrides remote download** | Useful for offline work. The template must pass the contract validation. |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `HTTP 404 from https://github.com/...` | Wrong repo/branch in `config/templates.json` | Edit config or pass `--local-template` |
| `local template path does not exist: …` | Typo in `--local-template` | Use the absolute path printed in the error |
| `Template validation failed. Missing required files: ...` | Incomplete template | `ls -R` the printed path; fix and rerun |
| `SyntaxError: Identifier 'path' has already been declared` | Duplicate import in generated code | Delete the duplicate `import path` line |
| `<pm> install failed in frontend` | PM not installed or network down | Check PM is available: `pnpm --version` / `npm --version` |
| `Smoke check failed` | Template missing contract files | File an issue at the template repo |
| `Amend refused: manual edits detected outside safe zone` | You edited outside `CUSTOM CODE ZONE` | Pass `--force` or move your code below the marker |

---

## Template customization

Templates resolve in three tiers (first match wins):

1. `<project>/.loom/templates/<path>` — project overrides
2. `~/.loom/templates/<path>` — user-global overrides
3. shipped defaults

## Template contract

| File | Purpose |
| ---- | ------- |
| `frontend/package.json` · `backend/package.json` | per-tier dependency manifests |
| `frontend/src/config/app-preset.js` | preset surface the CLI rewrites |
| `frontend/src/main.jsx` · `frontend/index.html`  | frontend entry points |
| `backend/server.js` · `backend/src/app.js` | backend entry points |
| `.loom/blueprint.json` | template contract |
| `.loom/metadata.json` | engine compatibility |

---

## Local template development

```bash
# Point at a local template tree instead of downloading from GitHub
loom init my-app --local-template ../stackloom-templates/mern

# Or via env var (parent dir; appends the template key)
export STACKLOOM_TEMPLATES_PATH=../stackloom-templates
loom init my-app
```

Resolution order: `--local-template` → `STACKLOOM_TEMPLATES_PATH` →
`config/templates.json` → built-in fallback.

---

## Development

```bash
cd stackloom
pnpm install          # or npm install / yarn / bun
node bin/cli.js --help
pnpm test             # vitest — full test suite (1206 tests)
```

See [`CLI_USAGE.md`](./CLI_USAGE.md) for the full command reference,
[`DEVELOPER.md`](./DEVELOPER.md) for engine internals,
[`API.md`](./API.md) for the programmatic API,
[`ROADMAP.md`](./ROADMAP.md) for upcoming features,
and [`SPLIT.md`](./SPLIT.md) for the planned repo split.

---

## License

MIT
