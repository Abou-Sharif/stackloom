/**
 * Suggestion engine — fuzzy matching for CLI commands, flags, and field types.
 * Provides "did you mean?" suggestions when users mistype flags or field type names.
 */

const FIELD_TYPES = [
  "string", "text", "number", "boolean", "email", "password",
  "phone", "url", "date", "datetime", "color", "file", "range",
  "ref", "select", "multiselect",
  // short aliases
  "str", "num", "bool",
];

const FLAGS = [
  "fields", "file", "arch", "architecture", "relations", "crud",
  "form-mode", "formMode", "with-tests", "withTests", "no-frontend", "noFrontend",
  "interactive", "amend", "remove-fields", "removeFields", "force",
  "dry-run", "dryRun", "quiet", "json", "debug", "yes", "brief",
  "help", "version",
  // scaffold / init
  "preset", "theme", "layout", "brand-name", "brandName",
  "tagline", "scenario", "no-install", "noInstall", "target",
  "local-template", "localTemplate", "template",
  // customize
  "heading", "file", "paste", "fallback", "appearance",
  "css", "save", "name",
  // add-report
  "model", "title", "description", "group-by", "groupBy",
  "agg-fn", "aggFn", "agg-field", "aggField", "agg-target", "aggTarget",
  "sort-by", "sortBy", "sort-order", "sortOrder",
];

/**
 * Levenshtein distance for fuzzy matching.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Normalise a string for comparison: strip leading dashes, convert kebab-case
 * and snake_case to camelCase, lowercase.
 */
function normalise(s) {
  return s.replace(/^--?/, "").replace(/[-_]([a-z])/g, (_, c) => c.toLowerCase()).toLowerCase();
}

/**
 * Find the closest match in a list of candidates.
 * Returns the best match if within threshold, or null.
 */
function closestMatch(input, candidates, threshold = 3) {
  const norm = normalise(input);
  let best = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = levenshtein(norm, normalise(c));
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  // Also check if input is a prefix of any candidate
  for (const c of candidates) {
    if (c.startsWith(norm.toLowerCase()) && norm.length >= 2) {
      return c;
    }
  }

  return bestDist <= threshold ? best : null;
}

/**
 * Suggest a flag when a user types an unknown one.
 * Returns a suggestion string or null.
 */
export function suggestFlag(input) {
  const match = closestMatch(input, FLAGS, 3);
  if (match) return `--${match}`;
  return null;
}

/**
 * Suggest a field type when a user types an unknown one.
 * Returns a suggestion string or null.
 */
export function suggestFieldType(input) {
  const match = closestMatch(input, FIELD_TYPES, 2);
  return match || null;
}

/**
 * Build a "did you mean?" message.
 */
export function didYouMean(input, suggestion) {
  if (!suggestion) return "";
  return `Did you mean "${suggestion}"?`;
}

/**
 * Suggest corrections for an entire field spec token (name:type:rules).
 * Returns an array of warning strings.
 */
export function suggestFieldSpec(token) {
  const warnings = [];
  const parts = token.split(":");
  if (parts.length < 2) return warnings;

  const type = parts[1];
  const suggestion = suggestFieldType(type);
  if (suggestion && suggestion !== type) {
    warnings.push(`Unknown type "${type}" in field "${parts[0]}". ${didYouMean(type, suggestion)}`);
  }
  return warnings;
}

export { FLAGS as SUGGEST_FLAGS, FIELD_TYPES as SUGGEST_FIELD_TYPES };
