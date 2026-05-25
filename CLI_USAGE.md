# CLI Usage Cookbook

Practical recipes. For a conceptual overview see [`README.md`](./README.md).

## Global flags

Every command accepts these global options:

| Flag            | Description                                                                   |
| --------------- | ----------------------------------------------------------------------------- |
| `-q, --quiet`   | Errors and warnings only; automatically enabled in CI or when output is piped |
| `--json`        | Structured JSON output for scripts and CI                                     |
| `--no-color`    | Disable ANSI color                                                            |
| `--debug`       | Show diagnostic detail                                                        |
| `-y, --yes`     | Assume defaults and never prompt                                              |
| `--brief`       | Less verbose human output where supported (e.g. `generate resource`)          |
| `-V, --version` | Print the CLI version                                                         |
| `-h, --help`    | Show help for a command                                                       |

## Compatibility (`loom upgrade`)

Run from the **project root** (where `backend/` and `frontend/` live, or `.loom/blueprint.json` exists):

```bash
loom upgrade
loom upgrade --write
```

`loom upgrade` is a read-only compatibility summary: it checks this CLI’s version against the blueprint’s `engine.minCliVersion` and `schemaVersion`, plus optional `.loom/metadata.json` (`engineCompatibility`, `stack`).

Add `--write` to apply safe, low-risk migrations after the compatibility check. The CLI preserves a backup of updated metadata before writing.

## Start a project

```bash
loom init my-app                              # interactive (prompts for PM, preset, theme, layout)
loom init my-app --preset saas --no-install   # non-interactive
loom new my-app                               # alias for loom init
cd my-app && {pnpm|npm|yarn|bun} dev          # uses your chosen package manager
```

### `loom init` options

| Flag                      | Available values                                                                                                                | What it does                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `--preset <variant>`      | `saas`, `clinic`, `studio`, `operations`, `commerce`, `custom`                                                                  | Select a starter preset shape                                             |
| `--theme <theme>`         | `executiveBlue`, `clinicSoft`, `studioElevated`, `operationsDense`, `commerceWarm`, `violetSanctum`, `tealFlow`, `warmNeutral`  | Choose the UI theme palette (8 built-in)                                 |
| `--layout <layout>`       | `hybridSaas`, `sidebarWorkspace`, `topbarPortal`, `rightRailStudio`                                                             | Choose the app shell layout                                               |
| `--brand-name <name>`     | any text                                                                           | Set the brand name used in README/brand files                             |
| `--tagline <text>`        | any text                                                                           | Set the slogan/tagline used in the project                                |
| `--extra-modules <list>`  | `users,products,...`                                                               | Include additional backend modules in the starter app                     |
| `--deploy-targets <list>` | `docker,vercel,railway`                                                            | Generate deployment config for the selected targets                       |
| `--architecture <level>`  | `lightweight`, `moderate`, `advanced`                                              | Choose the default generated architecture complexity                      |
| `--scenario <name>`       | `parking`,`payroll`,`inventory`,`booking`,`delivery`                               | Auto-scaffold a scenario preset after init                                |
| `--no-install`            | n/a                                                                                | Skip dependency install after scaffold creation                           |
| `--target <dir>`          | any path                                                                           | Write the new project into a custom directory                             |
| `--force`                 | n/a                                                                                | Overwrite an existing target directory or continue past validation issues |
| `--local-template <path>` | path                                                                               | Use a local template tree instead of downloading                          |
| `--template <name>`       | template key from `config/templates.json` (default: `mern`)                        | Select a template source by name                                          |

> **Package manager** is prompted interactively. Choose from pnpm, npm, yarn, or bun. Your choice is
> persisted in `.loom/metadata.json` and used by all subsequent commands (`generate`, `finalize`,
> `doctor`, `cleanup`, `preset`).

## Interactive project extension

```bash
loom wizard
loom wizard --skip-confirm
```

The wizard walks through adding pages, resources, routes, icons, and deployment targets.

| Option           | What it does                          |
| ---------------- | ------------------------------------- |
| `--skip-confirm` | Skip the final review and commit step |

## Generate a full-stack resource

```bash
loom generate resource Product --fields "name:string:required;price:number;slug:string"
```

A single `generate resource` command can create or extend:

- backend model, service, controller, routes, validator
- frontend admin pages, table/form components, API client, hooks
- route and nav mounting in the app shell
- backend route registration in `backend/src/routes/index.js`

### `loom generate resource` options

| Flag                 | Values                                 | What it does                                                          |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `--fields <spec>`    | `name:type:rules;...`                  | Define the resource schema inline                                     |
| `--file <path>`      | file path                              | Load schema from a resource definition file                           |
| `--recipe <name>`    | `resource`, `module`, `page`           | Choose the kind of generation                                         |
| `--arch <level>`     | `lightweight`, `moderate`, `advanced`  | Choose how much backend structure is generated                        |
| `--form-mode <mode>` | `page`, `modal`, `sidepanel`, `inline` | Choose how the form is mounted in the UI                              |
| `--with-tests`       | n/a                                    | Generate test files for the resource                                  |
| `--no-frontend`      | n/a                                    | Skip frontend generation, backend-only output                         |
| `--interactive`      | n/a                                    | Prompt for missing resource details interactively                     |
| `--dry-run`          | n/a                                    | Preview the file plan without writing any changes                     |
| `--relations <spec>` | `virtual:hasMany:Model:foreignKey;…`   | Mongoose virtual `hasMany` populate (see below)                       |
| `--brief`            | n/a                                    | Skip per-file `+` / `~` lines (still emits `file` events in `--json`) |

### `--relations` (virtual hasMany)

Each segment is four colon-separated parts: `virtualField:hasMany:ChildPascalModel:foreignKeyOnChild`.

Example on `Customer`: `--relations "orders:hasMany:Order:customerId"` exposes `customer.orders` as `Order` docs where `order.customerId === customer._id`. Multiple relations: separate with `;`.

### `--recipe` behaviors

| Recipe     | What it generates                             |
| ---------- | --------------------------------------------- |
| `resource` | Full-stack CRUD resource (backend + frontend) |
| `module`   | Backend-only module                           |
| `page`     | Frontend page wired to an existing resource   |

### Architecture levels (`--arch`)

| Level         | What it gives you                                                  |
| ------------- | ------------------------------------------------------------------ |
| `lightweight` | Minimal backend with inline controller, fewer files                |
| `moderate`    | Default full-layered `models`, `services`, `controllers`, `routes` |
| `advanced`    | Includes generated tests and batch/transaction helpers             |

### Form mount modes (`--form-mode`)

| Mode        | What it gives you                         |
| ----------- | ----------------------------------------- |
| `page`      | Default page-based edit/create form shell |
| `modal`     | Dialog-style form overlay                 |
| `sidepanel` | Side sheet / panel form shell             |
| `inline`    | Inline form above the listing table       |

### Field spec format

```bash
--fields "name:type:rule|rule;name2:type2:rule"
```

Example: `"email:email:required|unique;age:number:min=0;role:select"`

ObjectId to another model: `categoryId:ref[Category]:required` — `Category` must match the referenced resource’s Mongoose model name (PascalCase).

### Amending (`--amend` / `loom resource sync`)

```bash
loom resource sync Product --fields "sku:string:required"
loom generate resource Product --amend --remove-fields "oldField"
```

Loads the last saved definition from `.loom/resources/product.json`, merges `--fields` by name, applies `--remove-fields`, re-renders resource files, and preserves **custom code zones** on the model (and `AUTO-GENERATED` blocks elsewhere). Requires a prior `generate resource` for that name.

| Flag                     | What it does                                     |
| ------------------------ | ------------------------------------------------ |
| `--amend`                | Amend mode (also: `loom resource sync <Name>`)   |
| `--remove-fields <list>` | Comma-separated field names to drop (amend only) |
| `--force`                | Overwrite files without markers / custom zone    |

**Safety:** amend stops if manual code appears outside the custom zone or `AUTO-GENERATED` blocks. Use `--force` to override.

**Interactive:** `loom resource sync Product --interactive` — menu to add, remove, or wire relations, then apply.

## Available generate commands

```bash
loom generate module User
loom generate page Dashboard
loom generate theme
loom generate deploy
```

> `loom generate resource` is the recommended unified generator. `generate module` and `generate page` are still available but are effectively superseded.

## Remove generated content

```bash
loom remove module products
loom remove page reports --force
```

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `loom remove module <name>` | Remove a generated backend module and cleanup references |
| `loom remove page <name>`   | Remove a generated frontend page and nav entry           |
| `--force`                   | Skip the confirmation prompt                             |

## Add a field to an existing resource

```bash
loom resource add-field Product "sku:string:required"            # inline field spec
loom resource add-field Product --interactive                    # interactive prompt
```

Delegates to the amend pipeline — preserves custom code zones and `AUTO-GENERATED` markers. Supports `--force` to overwrite unmarked files.

## Upgrade with safe code preservation

```bash
loom upgrade                           # read-only compatibility check
loom upgrade --dry-run                 # preview upgrade changes
loom upgrade --write                   # apply safe migrations
loom upgrade --write --force           # overwrite files without markers
```

The upgrade engine uses a two-tier preservation strategy:
- Files with `AUTO-GENERATED` markers: only the marked block is replaced, custom code outside stays.
- Files without markers: backed up as `.upgrade-new` sidecars instead of overwriting.
- `--force`: overwrite everything, skip preservation.

## Manage upgrade backups

```bash
loom backup list                       # list all upgrade backups
loom backup restore <id>               # restore project from a backup
```

Backups are stored in `.loom/upgrade-backups/` with unique suffixes. Supports `--quiet`, `--json`, and `--no-color` global flags.

## Customize design and branding

```bash
loom customize theme set violetSanctum           # switch to purple theme
loom customize theme list-themes                 # list all 8 built-in themes
loom customize theme import --file ./theme.css   # import shadcn CSS (auto-applied)
loom customize layout set sidebarWorkspace       # switch layout
loom customize data set denseOps                 # switch data display
loom customize ui set studio                     # switch UI variant
loom customize brand set --name "Acme"           # update brand name
loom customize font set                          # interactive font selection
loom customize font set inter --heading playfair # body + heading fonts
loom customize font list                         # list available font presets
loom customize css --file ./custom.css           # inject custom CSS rules
loom customize css --css "body { ... }"          # inline CSS string
```

| Command                                                    | What it does                                              |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `loom customize theme set <name>`                          | Switch color palette, radius, shadows (8 themes)          |
| `loom customize theme import --file <path> / --paste <css>` | Import a shadcn CSS theme — saved and auto-applied       |
| `loom customize layout set <name>`                         | Switch app shell (4 layouts)                              |
| `loom customize brand set --name / --tagline`              | Update brand name/tagline                                 |
| `loom customize data set <name>`                           | Switch data display template (4 templates)                |
| `loom customize ui set <name>`                             | Switch card, modal, select, pagination styles (5 variants)|
| `loom customize font set [name]`                           | Set body + heading fonts (Google Fonts auto-import)       |
| `loom customize css --file / --css`                        | Inject custom CSS (appended to custom.css)                |
| `list-themes`, `list-layouts`, `list-data`, `list-ui`, `list-fonts` | Show available built-in options               |

## Env / project maintenance

```bash
loom env
loom env --sync
loom check
loom doctor
loom rollback --verbose
loom finalize
```

| Command                   | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| `loom env`                | Compare `.env` to `.env.example`                   |
| `loom env --sync`         | Append missing keys to `.env`                      |
| `loom check`              | Verify blueprint, anchor, and project health       |
| `loom doctor`             | Validate Node, selected PM, and project environment |
| `loom rollback`           | Undo the last generation action                    |
| `loom rollback --force`   | Skip confirmation when rolling back                |
| `loom rollback --verbose` | Show detailed rollback logs                        |
| `loom finalize`           | Lint, test, and build for production readiness     |

## Rebrand the CLI

```bash
loom rename acme --display-name "ACME"
```

| Option                  | What it does                             |
| ----------------------- | ---------------------------------------- |
| `--display-name <name>` | Set the human-readable CLI display name  |
| `--description <text>`  | Set the description shown in help output |

After renaming, re-link with `pnpm install` or `pnpm link --global` so the new binary name is available.

## Local template development

```bash
loom init my-app --local-template /path/to/your/template
```

Or set the environment variable for all commands:

```bash
export STACKLOOM_TEMPLATES_PATH=/path/to/your/templates
loom init my-app
```

`STACKLOOM_TEMPLATES_PATH` should point to a directory containing template keys like `mern/`. `--local-template` points directly at a specific template root.

## Template contract

Every StackLoom template must include:

| File                                | Purpose                       |
| ----------------------------------- | ----------------------------- |
| `frontend/package.json`             | Frontend dependency manifest  |
| `backend/package.json`              | Backend dependency manifest   |
| `frontend/src/config/app-preset.js` | App configuration contract    |
| `frontend/src/main.jsx`             | Frontend entry point          |
| `frontend/index.html`               | Vite host page                |
| `backend/server.js`                 | Backend boot file             |
| `backend/src/app.js`                | Express app factory           |
| `.loom/blueprint.json`              | Template contract declaration |
| `.loom/metadata.json`               | Engine compatibility metadata |

## Names and usage

`loom init` and `loom new` both create projects. `loom generate resource` is the recommended unified command to create resources. `loom init` supports preset, theme, layout, and template selection so docs, starter files, and architecture are created correctly.
