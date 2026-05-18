/**
 * Blueprint subsystem — the architecture contract layer.
 *
 * A blueprint describes *where things go* for a given stack so the generation
 * engine stays architecture-agnostic. Adding support for a new architecture is
 * a new `blueprint.json`, not an engine change.
 */
export { Blueprint } from "./blueprint.js";
export { BlueprintLoader, BlueprintLoadError, blueprintLoader } from "./loader.js";
export { blueprintSchema, SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";
