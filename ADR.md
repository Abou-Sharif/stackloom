# Architecture Decision Records (ADR)

## ADR 001: Unified Resource Schema (ResourceDefinition)

**Context**: 
The CLI had multiple disparate generators (module, page, etc.) each with its own field parsing and validation logic. This led to inconsistencies and duplication.

**Decision**:
Introduce a `ResourceDefinition` class that acts as a single source of truth for a domain resource. It handles:
- Naming conversions (Pascal, Camel, Snake, Kebab).
- Field normalization and validation.
- Derived properties for specific targets (Mongoose types, Joi rules, Form input types).

**Consequences**:
- Generators now accept a `ResourceDefinition` object.
- Consistent output across backend and frontend.
- Easier to add new targets (e.g., GraphQL, TypeORM) by extending `FieldDefinition`.

## ADR 002: Marker-Based Idempotency (MarkerStrategy)

**Context**:
Rerunning a generator on an existing file would either overwrite custom changes or require complex AST parsing to merge.

**Decision**:
Implement a "Marker Strategy" using comment-based delimiters:
- `// AUTO-GENERATED — DO NOT EDIT MANUALLY`
- `// END AUTO-GENERATED`
Everything outside these markers is considered a "Custom Zone" and is preserved when the CLI is rerun.

**Consequences**:
- CLI commands are idempotent.
- Users can safely add custom logic to generated files.
- No heavy AST dependency required.

## ADR 003: Stealth Mode and Metadata Stripping

**Context**:
Enterprise users often want to hide the fact that a codebase was scaffolded by a tool to avoid "tooling debt" or for proprietary reasons.

**Decision**:
Add a `--stealth` flag that:
- Removes timestamps from generated files.
- Strips CLI-specific comments and watermarks.
- Disables verbose logging.

**Consequences**:
- Generated code looks like manual implementation.
- Clean git diffs (no timestamp noise).

## ADR 004: AI-Ready Generation Layer

**Context**:
Downstream AI agents (like Trae, Cursor, or custom scripts) need a way to invoke the CLI programmatically and understand its capabilities.

**Decision**:
- Implement a `manifest` command that outputs a JSON schema of all generators.
- Implement a `--json` flag for all commands to return structured results (files created, issues found, resource state) instead of human-readable text.

**Consequences**:
- AI agents can discover and use the CLI without human intervention.
- Better integration with CI/CD pipelines.

## ADR 005: Local-Only Telemetry

**Context**:
We need to track CLI usage and errors to improve the tool, but we must respect user privacy and GDPR.

**Decision**:
Implement a telemetry module that logs activity to a local file (`~/.loom/cli-activity.log`). 
- No network calls by default.
- Anonymized command names.
- Optional `report` command to export data for manual analysis.

**Consequences**:
- Zero privacy concerns for offline usage.
- High performance (no sync network calls).
- Debuggable activity history for the user.
