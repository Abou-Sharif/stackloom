# CLI Usage Cookbook

Practical recipes. For the conceptual overview see [`README.md`](./README.md).

## Start a project

```bash
loom new my-app                              # interactive
loom new my-app --preset saas --no-install   # non-interactive
cd my-app && pnpm install && pnpm dev
```

> `loom init` is still accepted as an alias for `loom new`.

## Local Template Development

Use a local template directory instead of downloading from GitHub:

```bash
loom init my-app --local-template /path/to/your/template
```

Or set the environment variable for all commands:

```bash
export STACKLOOM_TEMPLATES_PATH=/path/to/your/templates
loom init my-app
```

`STACKLOOM_TEMPLATES_PATH` points at a directory **containing** template
subfolders (e.g. `mern/`); `--local-template` points directly at the template
root.

## Template Contract

Every StackLoom template must include:

| File | Purpose |
|---|---|
| `frontend/package.json` | Frontend dependencies |
| `backend/package.json` | Backend dependencies |
| `frontend/src/config/app-preset.js` | App configuration contract |
| `frontend/src/main.jsx` | Frontend entry point |
| `frontend/index.html` | Vite host page |
| `backend/server.js` | Backend boot file |
| `backend/src/app.js` | Express app factory |
| `.loom/blueprint.json` | Template contract declaration |
| `.loom/metadata.json` | Engine compatibility metadata |

## Init Flags

| Flag | Description |
|---|---|
| `--local-template <path>` | Use a local directory as the template source |
| `--template <name>` | Template key from `config/templates.json` (default: `mern`) |
| `--force` | Overwrite existing directory **and** continue past validation errors |
| `-q, --quiet` | Suppress non-essential output |

## Generate a full-stack resource

```bash
# model + service + controller + routes + validator
# + admin pages + table/form components + API client + hooks — all linked
loom generate resource Product --fields "name:string:required;price:number;slug:string"
```

What gets created and **linked**:
- `backend/src/modules/product/{models,services,controllers,routes}/…`
- `backend/src/utils/validators/Product.validator.js`
- route mounted in `backend/src/routes/index.js`
- `frontend/src/pages/admin/product/{ListPage,DetailPage,FormPage}.jsx`
- `frontend/src/components/{tables,forms}/Product*.jsx`
- `frontend/src/api/product.api.js`, `frontend/src/hooks/useProduct.js`
- lazy import + `<Route>` in `AppRouter.jsx`, nav entry in `app-preset.js`

### Variations

```bash
loom generate resource Order  --fields "total:number" --form-mode modal      # Dialog form
loom generate resource Note   --fields "body:text"    --form-mode sidepanel  # Sheet form
loom generate resource Task   --fields "title:string" --form-mode inline     # form above table
loom generate resource Tag    --fields "label:string" --arch lightweight     # minimal, inline controller
loom generate resource Report --fields "name:string"  --arch advanced        # + tests + batch ops
loom generate resource Lead   --fields "email:email"  --recipe module        # backend only
loom generate resource Lead   --fields "email:email"  --recipe page          # frontend only
loom generate resource Draft  --fields "title:string" --dry-run              # preview, write nothing
loom generate resource User   --file ./user.resource.js                      # definition from a file
```

### Field spec

```
name:type:rule|rule;name2:type2:rule
```

- **types** — `string` `text` `number` `boolean` `date` `email` `password`
  `phone` `url` `ref` `select` `multiselect` `image` `file` `color` `range` …
- **rules** — `required` `unique` `min=N` `max=N` `minLength=N` `maxLength=N`
  `pattern=…` `default=…`

Example: `"email:email:required|unique;age:number:min=0;role:select"`

## Inspect & maintain

```bash
loom check                 # blueprint valid? anchors intact? env file present?
loom env                   # which .env keys are missing vs .env.example
loom env --sync            # append the missing keys
loom doctor                # Node / pnpm / project structure / deps
loom rollback              # undo the last generation
```

## Customise design

```bash
loom customize theme set executiveBlue
loom customize theme import --file ./brand.css
loom customize layout set sidebarWorkspace
loom customize brand set --name "Acme" --tagline "Ship faster"
loom customize data set dashboard
loom customize list-themes      # also: list-layouts, list-data
```

## Rebrand the CLI itself

```bash
loom rename acme --display-name "ACME"
pnpm install            # re-link — the binary is now `acme`
```

## Prepare for handoff / production

```bash
loom cleanup minimal      # remove demo content + branding
loom cleanup production   # full de-brand — nothing reveals the starter kit
loom cleanup template     # extract reusable parts into .template/
loom finalize             # lint + test + build
```

`cleanup` refuses to run unless the working directory has both `backend/` and
`frontend/` — it is destructive by design.

## CI / scripting

```bash
loom generate resource Product --fields "name:string" --quiet      # errors only
loom generate resource Product --fields "name:string" --json       # structured output
loom check --json                                                  # machine-readable health
```

Under CI or when piped, output auto-quiets. Exit codes: `0` ok, `1`
user/validation error, `2` engine error.

## Remove a generated resource

```bash
loom remove module products          # prompts for confirmation
loom remove page reports --force     # skip confirmation
```
