import { parseRelationsSpec } from "../core/resource-definition.js";
import { suggestFlag, didYouMean } from "../utils/suggest.js";

/**
 * Command-option validation — rejects bad CLI flags before any generation runs.
 *
 * Commander does presence/type; this does *domain* validity: an `--arch` or
 * `--form-mode` that the engine doesn't support is caught here with a clear
 * message, not discovered as a broken render later.
 */

const FLAG_ALIASES = {
  fields: ["field", "flds"],
  file: ["f"],
  arch: ["architecture", "archi"],
  relations: ["relation", "rel"],
  crud: [],
  "form-mode": ["formMode", "form_mode", "form"],
  "with-tests": ["withTests", "tests"],
  "no-frontend": ["noFrontend", "withoutFrontend"],
  interactive: ["i"],
  amend: [],
  "remove-fields": ["removeFields", "remove"],
  force: ["f"],
  "dry-run": ["dryRun", "dryrun", "preview"],
};

/**
 * Suggest a corrected flag name for a given unknown flag.
 */
export function suggestFlagName(input) {
  const stripped = input.replace(/^--?/, "");
  for (const [canonical, aliases] of Object.entries(FLAG_ALIASES)) {
    if (aliases.includes(stripped)) return canonical;
  }
  const match = suggestFlag(input);
  if (match) return match.replace(/^--/, "");
  return null;
}

export const ARCHITECTURES = ["lightweight", "moderate", "advanced"];
export const FORM_MODES = ["page", "modal", "sidepanel", "inline"];
export const RECIPES = ["resource", "module", "page"];
export const CRUD_MODES = ["full", "insert-only"];

/** A reusable "must be one of" check. */
function oneOf(value, allowed, flag) {
  if (value === undefined || value === null) return null;
  if (!allowed.includes(value)) {
    return `${flag} must be one of: ${allowed.join(", ")} (got "${value}")`;
  }
  return null;
}

/**
 * Validate the options accepted by `loom generate <type>`.
 * @returns {{ success: boolean, issues: string[] }}
 */
export function validateGenerateOptions(options = {}) {
  const issues = [
    oneOf(options.arch, ARCHITECTURES, "--arch"),
    oneOf(options.formMode, FORM_MODES, "--form-mode"),
    oneOf(options.recipe, RECIPES, "--recipe"),
    oneOf(options.crud, CRUD_MODES, "--crud"),
  ].filter(Boolean);

  if (options.fields && options.file) {
    issues.push("--fields and --file are mutually exclusive");
  }

  if (typeof options.relations === "string" && options.relations.trim()) {
    try {
      parseRelationsSpec(options.relations.trim());
    } catch (e) {
      issues.push(`--relations: ${e.message}`);
    }
  }

  if (options.removeFields && !options.amend) {
    issues.push("--remove-fields requires --amend (or loom resource sync)");
  }

  return { success: issues.length === 0, issues };
}
