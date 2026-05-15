# Changelog

All notable changes to the CLI will be documented in this file.

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
