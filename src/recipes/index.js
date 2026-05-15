/**
 * Recipe subsystem — declarative generation manifests.
 *
 * A recipe answers "what gets generated"; the blueprint answers "where it
 * goes"; the engine just executes. New generation capabilities are new recipe
 * JSON, not new engine code.
 */
export { Recipe } from "./recipe.js";
export { RecipeLoader, RecipeLoadError, recipeLoader } from "./loader.js";
export { recipeSchema } from "./schema.js";
export { evaluateCondition } from "./condition.js";
