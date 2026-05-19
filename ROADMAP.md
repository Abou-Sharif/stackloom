# Stackloom roadmap (product + CLI)

This file tracks larger capabilities discussed for **solo devs first**, without blocking current releases.

## Shipped in recent work

- **Refs:** `ref[Model]` field type (ObjectId + Mongoose `ref`, Joi validation, populated `getById`).
- **Virtual hasMany:** `--relations "virtual:hasMany:ChildModel:foreignKey"` and `relations.hasMany` in definition files; interactive wizard prompts.
- **Stricter field specs:** invalid `--fields` segments fail with a clear error (no silent drop).
- **Generation report:** `loom generate resource` prints a **change-set** line (`new` vs `updated` file counts) after the file list.

## Next: schema evolution (add / remove fields)

- **`loom generate resource <Name> --amend`** (or dedicated `loom resource sync`): diff an updated `--file` / `--fields` against the last committed `.loom` journal and patch model, validator, form, table, and API types—without clobbering **custom code zones**.
- **Guardrails:** refuse amend if the resource module has manual edits outside marked zones (or require `--force`).

## Next: upgrade path (CLI + template drift)

- **`loom upgrade`** (or `loom doctor --fix`): compare `blueprint.schemaVersion` / template tag to the running CLI; print a checklist of safe automated steps vs manual steps.
- **Recipe migrations:** versioned transforms (e.g. rename anchor comments, split files) applied in a transaction, same as generation.

## Next: architecture-only output

- Tighten recipe `when` conditions so **`--arch lightweight`** never plans service/test files; **`--no-frontend`** never plans UI files; document the matrix in one table.
- Optional **`--minimal`** preset: backend-only + no admin table until `--with-admin`.

## Next: customization & unique design

- **Project design tokens:** merge `loom customize` with a single `design.tokens.json` (spacing, radius, font stacks) consumed by the template and document override order: `.loom/templates` → `~/.loom/templates` → built-ins (already partially documented in README).
- **Optional UI packs:** “dense”, “marketing”, “dashboard” component density presets (Tailwind class strategies), not only colour themes.

## Next: errors & edge cases

- Centralise **exit codes** (validation vs engine vs blueprint) and document them for scripting.
- **`--json` result** schema version field for CI consumers.
- More **`loom doctor`** checks: Node engine, anchor presence, orphan modules after `remove`.

## Reporting & ops

- **`--brief`:** suppress per-file lines; show only digest + errors (optional global flag).
- **Shell completions** for bash/zsh.

Contributions welcome: pick a section, open an issue with the intended behaviour, then implement behind small PRs.
