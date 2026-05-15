/**
 * Schemas — strict validation for everything that enters the CLI from outside:
 * resource-definition files, parsed field specs, and command options.
 *
 * Every validator returns a discriminated `{ success, ... }` result rather than
 * throwing, so callers decide how to surface the typed error.
 */
export {
  resourceDefinitionSchema,
  validateResourceDefinition,
  FIELD_TYPES,
} from "./resource.js";
export {
  validateGenerateOptions,
  ARCHITECTURES,
  FORM_MODES,
  RECIPES,
} from "./options.js";
