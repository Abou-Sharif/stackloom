
export function toCamelCase(str) {
  return str.replace(/([-_\s][a-z])/ig, ($1) => {
    return $1.toUpperCase()
      .replace('-', '')
      .replace('_', '')
      .replace(' ', '');
  });
}

export function toPascalCase(str) {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}

export function toKebabCase(str) {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

const IRREGULAR_PLURALS = {
  person: "people",
  child: "children",
  man: "men",
  woman: "women",
  tooth: "teeth",
  foot: "feet",
  mouse: "mice",
  goose: "geese",
  ox: "oxen",
  leaf: "leaves",
  loaf: "loaves",
  thief: "thieves",
  wife: "wives",
  wolf: "wolves",
  knife: "knives",
  shelf: "shelves",
  self: "selves",
  life: "lives",
  half: "halves",
  calf: "calves",
  elf: "elves",
  scarf: "scarves",
  index: "indices",
  appendix: "appendices",
  criterion: "criteria",
  phenomenon: "phenomena",
  datum: "data",
  medium: "media",
  analysis: "analyses",
  thesis: "theses",
  crisis: "crises",
  axis: "axes",
  hypothesis: "hypotheses",
  diagnosis: "diagnoses",
  emphasis: "emphases",
  addendum: "addenda",
  genus: "genera",
};

const UNCOUNTABLE = new Set([
  "equipment", "information", "rice", "money", "species", "series",
  "fish", "sheep", "deer", "moose", "aircraft", "salmon", "trout",
  "swiss", "chinese", "japanese", "portuguese", "vietnamese",
]);

export function pluralize(word) {
  if (!word || typeof word !== "string") return word;

  const lower = word.toLowerCase();

  // Uncountable / same plural
  if (UNCOUNTABLE.has(lower)) return word;

  // Irregular
  if (IRREGULAR_PLURALS[lower]) {
    const irc = IRREGULAR_PLURALS[lower];
    if (word[0] === word[0].toUpperCase()) {
      return irc[0].toUpperCase() + irc.slice(1);
    }
    return irc;
  }

  // Ends with s, x, z, ch, sh → add "es"
  if (/[sxz]$/.test(lower) || /[cs]h$/.test(lower)) return word + "es";

  // Ends with consonant + y → change y to ies
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";

  // Ends with f or fe → change to ves
  if (/fe?$/i.test(lower) && lower.length > 2) {
    if (/fe$/.test(lower)) return word.slice(0, -2) + "ves";
    if (/f$/.test(lower)) return word.slice(0, -1) + "ves";
  }

  // Ends with o → add "es" (common pattern)
  if (/[aeiou]o$/i.test(lower)) return word + "s";
  if (/o$/i.test(lower)) return word + "es";

  // Default: add "s"
  return word + "s";
}

export function detectCase(str) {
  if (/^[a-z]+([A-Z][a-z0-9]+)*$/.test(str)) {
    return 'camelCase';
  }
  if (/^[A-Z]+([A-Z][a-z0-9]+)*$/.test(str)) {
    return 'PascalCase';
  }
  if (/^[a-z]+(_[a-z0-9]+)*$/.test(str)) {
    return 'snake_case';
  }
  if (/^[a-z]+(-[a-z0-9]+)*$/.test(str)) {
    return 'kebab-case';
  }
  return 'unknown';
}
