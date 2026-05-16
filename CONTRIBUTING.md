# Contributor Guide

Welcome to the CLI contributor guide. This document explains how to add features, write tests, and maintain the codebase.

## 1. Local Development

Clone the repository and install dependencies:

```bash
pnpm install
cd packages/cli
pnpm start -- --help
```

## 2. Project Structure

- `bin/cli.js`: Entry point and command definitions.
- `src/commands/`: Implementation of individual CLI commands.
- `src/core/`: The "Engine" — `Generator`, `ResourceDefinition`, `MarkerStrategy`.
- `src/templates/`: EJS templates for code generation.
- `src/utils/`: Shared utilities (logging, naming, validation).

## 3. Adding a New Generator

1. **Create Template**: Add `.ejs` files in `src/templates/`.
2. **Update Generator**: Modify `src/core/generator.js` to include your new template in the appropriate generation method (e.g., `generateBackend`).
3. **Register Command**: Add the command to `bin/cli.js` using the `makeResource` pattern.

## 4. Writing Tests

We use **Vitest** for unit tests and a custom **Smoke Test** for end-to-end validation.

- **Unit Tests**: Place in `src/core/__tests__/`. Run with `pnpm test`.
- **Smoke Tests**: Run `pnpm smoke`. This creates a real project and runs all commands against it.

## 5. Coding Principles

- **Idempotency**: Always use `MarkerStrategy` when modifying existing files.
- **Stealth**: Respect the `stealth` option by omitting timestamps or metadata.
- **AI-Ready**: Ensure your command supports `--json` and updates the `manifest`.
- **DRY**: Use `ResourceDefinition` for any domain-related schema logic.

## 6. Releasing

1. Update `CHANGELOG.md`.
2. Bump version in `package.json`.
3. Run `pnpm smoke` to ensure no regressions.
4. `npm publish`.
