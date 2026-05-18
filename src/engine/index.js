/**
 * Engine — the transactional generation core.
 *
 * Composable, injectable, all-or-nothing: a recipe is planned, every file is
 * rendered and validated in a staging transaction, and only a fully-valid set
 * is committed atomically. Nothing here knows about a specific architecture or
 * template library — those arrive as a Blueprint and an injected renderer.
 */
export { FileTransaction, realFs } from "./transaction.js";
export { Validator, scanDelimiters } from "./validator.js";
export { Injector, InjectionError } from "./injector.js";
export {
  Pipeline,
  defineStep,
  planStep,
  commitStep,
  createRenderStep,
  createInjectStep,
  createValidateStep,
  createGenerationPipeline,
} from "./pipeline.js";
