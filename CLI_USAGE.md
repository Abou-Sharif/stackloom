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
```

Read-only summary: this CLI’s version vs the blueprint’s `engine.minCliVersion` and `schemaVersion`, plus optional `.loom/metadata.json` (`engineCompatibility`, `stack`). Does not modify files — use it before pulling template or CLI updates.

## Start a project

```bash
loom init my-app                              # interactive
loom init my-app --preset saas --no-install   # non-interactive
loom new my-app                               # alias for loom init
cd my-app && pnpm install && pnpm dev
```

### `loom init` options

| Flag                      | Available values                                                                   | What it does                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `--preset <variant>`      | `saas`, `clinic`, `studio`, `operations`, `commerce`, `custom`                     | Select a starter preset shape                                             |
| `--theme <theme>`         | `executiveBlue`, `clinicSoft`, `studioElevated`, `operationsDense`, `commerceWarm` | Choose the UI theme palette                                               |
| `--layout <layout>`       | `hybridSaas`, `sidebarWorkspace`, `topbarPortal`, `rightRailStudio`                | Choose the app shell layout                                               |
| `--brand-name <name>`     | any text                                                                           | Set the brand name used in README/brand files                             |
| `--tagline <text>`        | any text                                                                           | Set the slogan/tagline used in the project                                |
| `--extra-modules <list>`  | `users,products,...`                                                               | Include additional backend modules in the starter app                     |
| `--deploy-targets <list>` | `docker,vercel,railway`                                                            | Generate deployment config for the selected targets                       |
| `--architecture <level>`  | `lightweight`, `moderate`, `advanced`                                              | Choose the default generated architecture complexity                      |
| `--no-install`            | n/a                                                                                | Skip `pnpm install` after scaffold creation                               |
| `--target <dir>`          | any path                                                                           | Write the new project into a custom directory                             |
| `--force`                 | n/a                                                                                | Overwrite an existing target directory or continue past validation issues |
| `--local-template <path>` | path                                                                               | Use a local template tree instead of downloading                          |
| `--template <name>`       | template key from `config/templates.json` (default: `mern`)                        | Select a template source by name                                          |

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

| Flag                 | Values                                 | What it does                                      |
| -------------------- | -------------------------------------- | ------------------------------------------------- |
| `--fields <spec>`    | `name:type:rules;...`                  | Define the resource schema inline                 |
| `--file <path>`      | file path                              | Load schema from a resource definition file       |
| `--recipe <name>`    | `resource`, `module`, `page`           | Choose the kind of generation                     |
| `--arch <level>`     | `lightweight`, `moderate`, `advanced`  | Choose how much backend structure is generated    |
| `--form-mode <mode>` | `page`, `modal`, `sidepanel`, `inline` | Choose how the form is mounted in the UI          |
| `--with-tests`       | n/a                                    | Generate test files for the resource              |
| `--no-frontend`      | n/a                                    | Skip frontend generation, backend-only output     |
| `--interactive`      | n/a                                    | Prompt for missing resource details interactively |
| `--dry-run`          | n/a                                    | Preview the file plan without writing any changes |
| `--relations <spec>` | `virtual:hasMany:Model:foreignKey;…`   | Mongoose virtual `hasMany` populate (see below)   |
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

| Flag | What it does |
| ---- | ------------ |
| `--amend` | Amend mode (also: `loom resource sync <Name>`) |
| `--remove-fields <list>` | Comma-separated field names to drop (amend only) |
| `--force` | Overwrite files without markers / custom zone |

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

## Customize design and branding

```bash
loom customize theme list-themes
loom customize layout list-layouts
loom customize data list-data
loom customize brand set --name "Acme" --tagline "Ship faster"
```

| Command                                    | What it does                                  |
| ------------------------------------------ | --------------------------------------------- |
| `loom customize theme`                     | Theme operations and imports                  |
| `loom customize layout`                    | Layout shell operations                       |
| `loom customize brand`                     | Brand name / tagline / description operations |
| `loom customize data`                      | Data display template operations              |
| `list-themes`, `list-layouts`, `list-data` | Show available built-in options               |

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
| `loom doctor`             | Validate local Node, pnpm, and project environment |
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
