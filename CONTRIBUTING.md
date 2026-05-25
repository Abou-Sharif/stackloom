# Contributor Guide

Welcome to the CLI contributor guide. This document explains how to add features, write tests, and maintain the codebase.

## 1. Local Development

Clone the repository and install dependencies:

```bash
pnpm install   # or npm install / yarn / bun
node bin/cli.js --help
pnpm link --global
loom --help
```

## 2. Project Structure

- `bin/cli.js`: Entry point and command definitions.
- `src/commands/`: Implementation of individual CLI commands.
- `src/recipes/`: Declarative generation recipes.
- `src/templates/`: EJS templates for generated files and snippets.
- `src/engine/`: Transactional generation core.
- `src/services/`: Shared collaborators like the reporter.
- `src/branding/`: CLI rebranding support.
- `src/utils/`: Shared utilities (logging, naming, validation).

## 3. Adding a New Generator

1. **Create Template**: Add `.ejs` files in `src/templates/`.
2. **Add or update a recipe**: Edit `src/recipes/builtin/<name>.json` to declare files, injections, and `when` conditions.
3. **Register the command or recipe**: The generator may already be available via `loom generate resource`; add a command in `bin/cli.js` only when a dedicated CLI entry is required.

## 4. Writing Tests

We use **Vitest** for unit tests and a custom **Smoke Test** for end-to-end validation.

- **Unit Tests**: Place in `src/__tests__/` or subsystem `__tests__/` directories. Run with `pnpm test` (or the test script of your PM).
- **Smoke Tests**: Run `pnpm test:smoke` or `node test-smoke.js`.

## 5. Coding Principles

- **Idempotency**: Always use `MarkerStrategy` when modifying existing files.
- **Stealth**: Respect the `stealth` option by omitting timestamps or metadata.
- **AI-Ready**: Ensure your command supports `--json` and updates the `manifest`.
- **DRY**: Use `ResourceDefinition` for any domain-related schema logic.
- **Reporter**: Use `reporterFromOptions()` instead of raw `console.*`/`chalk`/`ora` — it honors `--quiet`, `--json`, and `--no-color`.
- **Validation**: Backend errors from generated CRUD flow through `validate.js` middleware → `{ errors: [{ field, message }] }` → page templates parse and map to `form.setError()`. Keep this pipeline when modifying form/page templates.

## 6. Releasing

1. Update `CHANGELOG.md`.
2. Bump version in `package.json` if needed.
3. Run `pnpm test` and `pnpm test:smoke` to ensure no regressions.
4. `npm publish`.
5. Tag the release: `git tag v<version>` && `git push --tags`.
