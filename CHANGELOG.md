# Changelog

All notable changes to the CLI will be documented in this file.

## [1.7.0] — 2026-05-20

### Added

- **`--crud insert-only`** — new `--crud` option on `loom generate resource` (values: `full`, `insert-only`). When set to `insert-only`, only create-related code is generated: POST route, create controller method, create service method, create-only validator schema, form component, and API client with only the `create()` call. Skips list/detail/update/delete routes, pages, table components, hooks, and nav entries.

### Changed

- Template conditions (`when`) in `resource.json` recipe now check `crud` param to skip frontend page files (`page-{formMode}`, `page-detail`, `page-form`, `table`, `hooks`) and frontend injections for `insert-only` mode.
- Backend EJS templates (`routes`, `controller`, `service`, `validator`) conditionally render only create methods when `options.crud === "insert-only"`.

## [1.6.0] — 2026-05-20

### Added

- **`loom explain`** — project structure overview command showing resources, routes, modules, theme, auth type, env vars, and deployment configs. Supports `--json` output.
- **`loom forge`** — hidden exam-scaffold command. Creates the exact `FirstName_LastName_National_Practical_Exam_2025/backend-project/` + `frontend-project/` structure with session-based auth (`express-session` + bcrypt + username login) instead of JWT. Interactive prompts or `--first-name`/`--last-name`/`--module-name`/`--db-name` flags. Includes admin seed script, clean template comments, removes `.loom` metadata.
- **`Reporter.log()` / `heading()` / `section()`** — new methods on the Reporter class for human-readable informational commands like `explain`.

- **Upgrade engine — user-code preservation** — files with `AUTO-GENERATED` markers use marker-strategy merge (only the marked block is replaced). Files without markers get `.upgrade-new` sidecars instead of overwriting. `--force` flag to overwrite everything. Includes safe JSON parse in `mergePackageJson`, download timeout (30s), temp dir cleanup on failure, symlink safety, and env.example exact-line merge.
- **Backup management** — `loom backup list` and `loom backup restore <id>` commands for managing upgrade backups. Uses Reporter class for `--quiet`/`--json`/`--no-color` support.
- **`loom resource add-field <name> [field-spec]`** — add a single field to an existing resource, delegating to the amend pipeline. Supports `--interactive` and `--force`. Accepts `--projectRoot`.
- **Validation overhaul** — generated `form.jsx.ejs` now emits a Zod schema per field type (`z.string().email()`, `z.number().min(0)`, `.optional()`) wired to react-hook-form via `zodResolver`. All 5 page templates parse `err.response.data.errors` and map backend errors to inline field errors via `form.setError()`. Toast now surfaces the real backend message. `key` prop resets form state on create/edit switch.
- **3 new premium themes** — `violetSanctum` (purple, creative), `tealFlow` (teal, calm modern), `warmNeutral` (warm brown, editorial) added to `design-themes.js`.
- **Accessibility tokens** — `--focus-ring`, `--focus-offset`, `--selection-bg`, `--selection-text`, `--motion-speed`, `--scrollbar-width`, `--scrollbar-track`, `--scrollbar-thumb` across all 5 appearance recipes.
- **`loom customize font set`** — interactive wizard for body + heading fonts. Generates `fonts.css` with Google Fonts `@import`, sets `--font-sans`/`--font-heading`, adds import to `globals.css`. Includes 9 body presets and 13 heading presets.
- **`loom customize css`** — inject custom CSS rules via `--file` or `--css`. Saved to `custom.css` and auto-imported in `globals.css`.
- **`loom customize theme import` auto-apply** — instead of printing manual instructions, the imported CSS is auto-wired to `app-preset.js` via Vite `?raw` import and `installShadcnDesignPreset`.
- **Globals.css accessibility** — `prefers-reduced-motion` disables all animations, `prefers-contrast: more` thickens borders. Custom `::selection`, scrollbar styling, `--font-sans` CSS var for dynamic body font.
- **Tailwind config expansion** — new color tokens (`focus`, `selection`), radii (`card`, `button`, `input`, `nav`), font stacks (`sans` with `--font-sans`, `heading`, `mono`), spacing tokens, display font sizes, `transition-duration: theme`.
- **Descriptive CLI prompts** — all `list-*` and `set` inquirer choices now include descriptions for each option.

### Fixed

- Weakness audit: safe JSON parse in `mergePackageJson`, download timeout (30s), temp dir cleanup on failure, rollback preserves backup on partial restore, backup dir unique suffix to prevent collisions, symlink skipping in `listFilesRecursive`, `env.example` exact-line merge, Reporter usage in backup command, `restoreBackup` error reporting, top-level `inquirer` import in add-field.
- Upgrade.js: shared metadata backup between success and fallback paths preventing duplicate backup directories.

## [1.4.0] - 2026-05-19

### Added

- **Safe project upgrade** — added `loom upgrade --write` to apply low-risk compatibility metadata migrations for older scaffolded projects.
- **UI variant customization** — added `loom customize ui` and `loom customize ui set <variant>` to switch card, modal, select, pagination, and record card styles.
- **UI variant discovery** — added `loom customize ui list-ui` to list available UI variant presets.

### Documentation

- Updated `CLI_USAGE.md` to include the new `ui` customization commands.

## [1.3.0] - 2026-05-19

### Added

- **Resource relationships** — `ref[Model]` fields and `--relations` for virtual `hasMany` populate; validated in schema and reflected in generated model, controller, service, and form templates.
- **`loom upgrade`** — read-only compatibility check (CLI vs blueprint `engine.minCliVersion`, `schemaVersion`, and `.loom/metadata.json`).
- **`loom generate resource --amend`** and **`loom resource sync <Name>`** — update an existing resource from `.loom/resources/<kebab>.json`, merge `--fields`, `--remove-fields`, or `--file`; preserves model custom code zones and `AUTO-GENERATED` blocks.
- **Interactive amend** — `loom resource sync <Name> --interactive` to add, remove, or extend fields and relations step by step.
- **Amend safety audit** — blocks amend when manual edits are detected outside safe zones unless `--force` is passed.
- Global **`--brief`** flag — quieter `generate resource` output (change-set summary without per-file lines).

### Changed

- **State tracker** — persists resource definitions under `.loom/resources/` and records `generate` / `amend` events in `.loom/state.json`.
- Generation pipeline includes an **amend-merge** step for safe file updates.
- Stricter **`--fields`** validation — invalid segments fail fast instead of being dropped silently.

### Documentation

- `README.md`, `CLI_USAGE.md`, and `ROADMAP.md` updated for relations, upgrade, amend, sync, brief, and safety behavior.

## [1.0.12] - 2026-05-19

### Added

- Updated `README.md`, `CLI_USAGE.md`, `DEVELOPER.md`, and `CONTRIBUTING.md` with accurate CLI usage, option references, and local development workflows.
- Added explicit `loom init`, `loom wizard`, and `loom generate resource` usage documentation, including available option values and command behaviors.

### Changed

- Aligned developer and contributor guidance with the current repository layout and command registration flow.
- Documented `pnpm link --global` local CLI testing and the actual `loom` command set.

### Fixed

- Corrected stale documentation references to old package layout conventions.
- Fixed `PageWrapper` in the MERN template so generated pages can pass `title`, `subtitle`, and `actions` props.
- Fixed MERN template `FormField` so `Controller` is imported correctly and generated forms no longer crash at runtime.

## [2.1.0] - 2026-05-16

### Added

- **Configurable template source** for `loom init` — `--local-template <path>` flag, `STACKLOOM_TEMPLATES_PATH` env var, and `config/templates.json` are honoured in that order before falling back to the built-in remote. The chosen step is logged unless `--quiet` is set.
- **Template structure validation** — new `src/utils/templateValidator.js` exports `validateMernTemplate`, `validateTemplateContract`, and `listMissingFiles`. Init runs both validators after copy/extract and refuses to install dependencies into an incomplete scaffold (unless `--force`).
- **Contract metadata in the MERN template** — added a `contract` block to `.loom/blueprint.json` (navConfigPath, entryPoints, requiredEnvFiles) plus a new `.loom/metadata.json` declaring `engineCompatibility`.
- **`pnpm test:smoke`** — fast file-level contract check for the MERN template (no install, no spawn). The previous end-to-end runner now lives at `test-integration.js` and is wired as `pnpm test:integration`.
- **`--architecture <level>` flag** and `--yes` support for `loom init`, so non-interactive invocations don't hang waiting on inquirer.
- **Troubleshooting section** in `README.md` and a "Local Template Development" / "Template Contract" section in `CLI_USAGE.md`.

### Changed

- Init installs `pnpm` inside `frontend/` and `backend/` **separately** and only when a `package.json` exists in that subdir — eliminating the "pnpm install failed at project root" foot-gun.
- Failed downloads and validation failures now print the offending URL/path, suggested diagnostic command, and the `--local-template` workaround.
- The `applyPresetCustomization` regex is now anchored to start-of-line in multiline mode so it never rewrites a matching phrase inside a comment.
- `downloadTemplate` follows 301/302/303/307/308 redirects (was: 301/302 only) and surfaces redirects with missing Location headers as explicit errors.

### Fixed

- `syncProjectDependencies` no longer crashes when `frontend/package.json` has no `dependencies` block.
- `loom init` cleans `outDir` (and the temp tarball directory) on any pre-customization failure, instead of leaving a half-scaffolded project behind.
- All `JSON.parse` / `fs.readJSON` calls in the init path are wrapped in try/catch with descriptive errors.
- Hardcoded `dellzetter-lang/starter-kit-mern` template URL replaced with `Abou-Sharif/stackloom-templates`, sourced from `config/templates.json`.

### MERN template — runtime hardening

- **swagger-jsdoc** and **swagger-ui-express** moved from `devDependencies` to `dependencies` — they are required at runtime by `src/config/swagger.js`, so a `--prod` install used to crash the server on boot.
- **`src/utils/logger.js`** — fixed a destructure-on-string bug (`const { requestId } = require('cls-rtracer').id() || {}`) that always produced `undefined`; the log line now correctly carries the per-request id.
- **`vite.config.js`** — `__dirname` is not defined in ESM (the frontend package is `"type": "module"`); derive it from `import.meta.url` instead, otherwise `vite dev` / `vite build` fails on load with a `ReferenceError`.
- **`src/hooks/useLocalStorage.js`** — `JSON.parse` of a corrupted localStorage value used to crash the first render; both the parse and the write now have try/catch fallbacks, and the SSR-unsafe `window` access is guarded.
- Verified end-to-end after fixes: `pnpm install` + `vite build` succeeds (1946 modules) and the Express app boots and serves `GET /api/health → 200` from a freshly scaffolded project.

## [2.0.0] - 2026-05-11

### Added

- **Domain-Driven Generation**: Introduced `make:resource` command for unified full-stack scaffolding.
- **Idempotency**: Added `MarkerStrategy` to preserve custom code during regeneration.
- **Stealth Mode**: Added `--stealth` flag to remove timestamps and CLI metadata from output.
- **AI-Ready Layer**: Added `--json` mode and `manifest` command for machine consumption.
- **Plugin System**: Support for runtime command registration via `.loom/plugins/`.
- **Telemetry**: Local activity logging with `report` command.
- **Quality Gates**: Switched to Vitest for unit testing; added comprehensive smoke tests.
- **Health Check**: New `doctor` command for project diagnostics.

### Changed

- **Architecture**: Refactored generators into a core `Generator` engine.
- **Schema**: Unified field parsing logic in `ResourceDefinition`.
- **Logging**: Enhanced with colorized output, debug modes, and telemetry integration.
- **Documentation**: Overhauled README and added Architecture Decision Records (ADRs).

### Fixed

- Fixed inconsistent field parsing across different generators.
- Resolved race conditions in multi-file generation.
- Improved error recovery and stack trace reporting in debug mode.

## [1.0.0] - Initial Release

- Basic `init` and `generate module` commands.
