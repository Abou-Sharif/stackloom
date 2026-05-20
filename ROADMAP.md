# Stackloom roadmap (product + CLI)

This file tracks larger capabilities discussed for **solo devs first**, without blocking current releases.

## Shipped in recent work

- **`--amend` / `loom resource sync`:** update an existing resource; **interactive** amend via `--interactive`; **safety audit** blocks manual edits outside custom zones / markers unless `--force`.
- **`loom upgrade`:** read-only compatibility check (CLI vs `engine.minCliVersion`, blueprint `schemaVersion`, optional `.loom/metadata.json` `engineCompatibility`).
- **`--brief`:** on `loom generate resource`, suppresses per-file `+` / `~` lines (structured `file` events unchanged for `--json`).
- **Refs:** `ref[Model]` field type (ObjectId + Mongoose `ref`, Joi validation, populated `getById`).
- **Virtual hasMany:** `--relations "virtual:hasMany:ChildModel:foreignKey"` and `relations.hasMany` in definition files; interactive wizard prompts.
- **Stricter field specs:** invalid `--fields` segments fail with a clear error (no silent drop).
- **Generation report:** `loom generate resource` prints a **change-set** line (`new` vs `updated` file counts) after the file list.
- **Validation overhaul:** Zod schemas in generated forms, backend error mapping to inline field errors via `form.setError()`.
- **Upgrade engine — user-code preservation:** marker-strategy merge for `AUTO-GENERATED` files, `.upgrade-new` sidecars for unmarked files, `--force` override. Includes backup/restore commands.
- **`loom resource add-field`:** single-field amend via the pipeline. Interactive or inline field spec.
- **`loom customize font set`:** interactive Google Fonts body + heading selection with auto-generated `fonts.css` and `--font-sans`/`--font-heading` CSS vars.
- **`loom customize css`:** inject custom CSS via `--file` or `--css`, saved to `custom.css` and auto-imported in `globals.css`.
- **`loom customize theme import` auto-apply:** uses Vite `?raw` import to embed imported CSS at build time — no manual `app-preset.js` edits.
- **3 new premium themes:** `violetSanctum` (purple), `tealFlow` (teal), `warmNeutral` (warm brown).
- **Accessibility tokens:** focus-ring, focus-offset, selection, scrollbar, motion-speed CSS vars across all 5 appearance recipes.
- **Globals.css overhaul:** full `prefers-reduced-motion`, `prefers-contrast`, `::selection`, custom scrollbar, `--font-sans` CSS var.
- **Descriptive CLI prompts:** all `list-*` / `set` inquirer choices now show option descriptions.
- **Tailwind config expansion:** heading/mono font stacks, card/button/input/nav radii, spacing tokens, display font sizes, theme-aware transition duration.
- **Weakness audit:** safe JSON parse, download timeout, temp dir cleanup, rollback backup preservation, backup dir unique suffix, symlink safety, env.example merge, Reporter usage, top-level inquirer import.

## Next: schema evolution (add / remove fields)

- **Field diff UI** in interactive amend — basic loop shipped (`loom resource sync <Name> --interactive`).
- **Deeper AST diff** for detecting edits inside generated blocks (optional future work).

## Next: upgrade path (CLI + template drift)

- **`loom upgrade --write` / migrations:** shipped. `loom upgrade` now supports `--write` for safe compatibility metadata migrations.
- **Recipe migrations:** versioned transforms (e.g. rename anchor comments, split files) applied in a transaction, same as generation.

## Next: architecture-only output

- Tighten recipe `when` conditions so **`--arch lightweight`** never plans service/test files; **`--no-frontend`** never plans UI files; document the matrix in one table.
- Optional **`--minimal`** preset: backend-only + no admin table until `--with-admin`.

## Next: customization & unique design

- **Project design tokens config:** merge `loom customize` with a single `design.tokens.json` (spacing, radius, font stacks) consumed by the template; document override order: `.loom/templates` → `~/.loom/templates` → built-ins.
- **Optional UI density packs:** "dense", "marketing", "dashboard" component presets (Tailwind class strategies), not only colour themes.

## Next: errors & edge cases

- Centralise **exit codes** (validation vs engine vs blueprint) and document them for scripting.
- **`--json` result** schema version field for CI consumers.
- More **`loom doctor`** checks: Node engine, anchor presence, orphan modules after `remove`.

## Reporting & ops

- **`--brief`:** shipped for `generate resource`; optional extension to other commands.
- **Shell completions** for bash/zsh.

Contributions welcome: pick a section, open an issue with the intended behaviour, then implement behind small PRs.
