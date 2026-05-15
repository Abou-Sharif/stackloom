/**
 * Command-option validation — rejects bad CLI flags before any generation runs.
 *
 * Commander does presence/type; this does *domain* validity: an `--arch` or
 * `--form-mode` that the engine doesn't support is caught here with a clear
 * message, not discovered as a broken render later.
 */

export const ARCHITECTURES = ["lightweight", "moderate", "advanced"];
export const FORM_MODES = ["page", "modal", "sidepanel", "inline"];
export const RECIPES = ["resource", "module", "page"];

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
  ].filter(Boolean);

  if (options.fields && options.file) {
    issues.push("--fields and --file are mutually exclusive");
  }

  return { success: issues.length === 0, issues };
}
