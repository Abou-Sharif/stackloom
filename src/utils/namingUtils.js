
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
