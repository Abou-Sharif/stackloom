/**
 * RecipeLoader — resolves, reads, and validates a recipe by name.
 *
 * Resolution order:
 *   1. A blueprint override — `blueprint.recipes[name]`, resolved relative to
 *      the blueprint file's directory (lets a project ship custom recipes).
 *   2. The CLI's built-in recipe — `recipes/builtin/<name>.json`.
 *
 * Every recipe is schema-validated before use, so a malformed manifest fails
 * fast with a path-pointed error rather than producing broken output.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recipeSchema } from "./schema.js";
import { Recipe } from "./recipe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_RECIPES = path.join(__dirname, "builtin");

/** Raised when a recipe cannot be found, read, or validated. */
export class RecipeLoadError extends Error {
  constructor(message, { source, issues } = {}) {
    super(message);
    this.name = "RecipeLoadError";
    this.source = source;
    this.issues = issues;
  }
}

export class RecipeLoader {
  /** Absolute path to the CLI's built-in recipe directory. */
  get builtinDir() {
    return BUILTIN_RECIPES;
  }

  /**
   * Load a recipe by name, honoring any blueprint override.
   * @param {string} name
   * @param {import('../blueprint/blueprint.js').Blueprint} [blueprint]
   */
  async load(name, blueprint) {
    const ref = blueprint ? blueprint.getRecipe(name) : null;
    if (ref) {
      const resolved = path.isAbsolute(ref)
        ? ref
        : path.resolve(path.dirname(blueprint.source), ref);
      if (!existsSync(resolved)) {
        throw new RecipeLoadError(
          `Blueprint "${blueprint.id}" points recipe "${name}" at ${resolved}, which does not exist.`,
          { source: resolved },
        );
      }
      return this.loadFile(resolved);
    }

    const builtin = path.join(BUILTIN_RECIPES, `${name}.json`);
    if (existsSync(builtin)) return this.loadFile(builtin);

    throw new RecipeLoadError(
      `No recipe named "${name}". Expected a built-in at ${builtin} or a blueprint override.`,
      { source: builtin },
    );
  }

  /** Load + validate a recipe from an explicit file path. */
  async loadFile(source) {
    let raw;
    try {
      raw = JSON.parse(await readFile(source, "utf-8"));
    } catch (err) {
      throw new RecipeLoadError(
        `Could not read recipe JSON at ${source}: ${err.message}`,
        { source },
      );
    }

    const parsed = recipeSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`,
      );
      throw new RecipeLoadError(
        `Invalid recipe at ${source}:\n${issues.join("\n")}`,
        { source, issues: parsed.error.issues },
      );
    }

    return new Recipe(parsed.data, source);
  }
}

/** Shared loader instance for convenience. */
export const recipeLoader = new RecipeLoader();
