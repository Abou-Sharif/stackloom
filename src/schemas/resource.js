/**
 * Resource-definition schema — strict validation for `--file` definitions and
 * the structures the field-spec parser produces.
 *
 * Replaces "parse, maybe warn, generate anyway" with "validate, fail fast with
 * a path-pointed error". A bad definition never reaches the engine.
 */
import {
  object,
  record,
  arrayOf,
  string,
  boolean,
  number,
  enumOf,
  any,
} from "../blueprint/schema-kit.js";
import { suggestFieldType, didYouMean } from "../utils/suggest.js";

/** Field types the generator understands (kept in sync with resource-definition.js). */
export const FIELD_TYPES = [
  "string",
  "text",
  "richtext",
  "number",
  "range",
  "boolean",
  "date",
  "datetime",
  "time",
  "email",
  "password",
  "phone",
  "url",
  "color",
  "ref",
  "reference",
  "array",
  "object",
  "image",
  "file",
  "select",
  "multiselect",
];

const fieldSchema = object({
  name: string(),
  type: enumOf(...FIELD_TYPES).default("string"),
  validation: object({
    required: boolean().optional(),
    unique: boolean().optional(),
    min: number().optional(),
    max: number().optional(),
    minLength: number().optional(),
    maxLength: number().optional(),
    pattern: string().optional(),
    default: any().optional(),
  }).default({}),
  special: record(any()).default({}),
  ui: record(any()).default({}),
});

export const resourceDefinitionSchema = object({
  name: string(),
  collection: string().optional(),
  fields: arrayOf(fieldSchema).default([]),
  relations: record(any()).default({}),
  features: record(any()).default({}),
  ui: record(any()).default({}),
  hooks: record(any()).default({}),
  permissions: record(any()).default({}),
  options: record(any()).default({}),
});

const IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;

/**
 * Validate a raw resource definition. Returns `{ success, data }` or
 * `{ success: false, issues: string[] }`. Beyond the shape check it enforces
 * the semantic rules the engine depends on: PascalCase name, identifier-safe
 * unique field names.
 */
export function validateResourceDefinition(raw) {
  const parsed = resourceDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }

  const issues = [];
  const { name, fields } = parsed.data;

  // Annotate unknown field types with "did you mean?" suggestions
  if (!parsed.success && parsed.error?.issues) {
    for (const issue of parsed.error.issues) {
      if (issue.message && issue.message.includes("must be one of")) {
        const raw = issue.path?.length >= 2 ? issue.path[1] : null;
        if (raw && typeof raw === "string") {
          const sug = suggestFieldType(raw);
          if (sug) {
            console.warn(didYouMean(raw, sug));
          }
        }
      }
    }
  }

  if (!PASCAL_CASE.test(name)) {
    issues.push(`name: "${name}" must be PascalCase (start uppercase, alphanumeric)`);
  }
  for (const field of fields) {
    if (!IDENTIFIER.test(field.name)) {
      issues.push(`fields: "${field.name}" is not a valid identifier`);
    }
  }
  const names = fields.map((f) => f.name);
  const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (duplicates.length) {
    issues.push(`fields: duplicate field name(s): ${duplicates.join(", ")}`);
  }

  for (const field of fields) {
    if (field.type === "ref" || field.type === "reference") {
      const model = field.special && field.special.model;
      if (!model || typeof model !== "string" || !PASCAL_CASE.test(model.trim())) {
        issues.push(
          `fields.${field.name}: ref/reference needs target model in brackets, e.g. ${field.name}:ref[Category]`,
        );
      }
    }
    if (field.validation.min != null && field.validation.max != null && field.validation.min > field.validation.max) {
      issues.push(
        `fields.${field.name}: min (${field.validation.min}) cannot be greater than max (${field.validation.max})`,
      );
    }
    if (field.validation.minLength != null && field.validation.maxLength != null && field.validation.minLength > field.validation.maxLength) {
      issues.push(
        `fields.${field.name}: minLength (${field.validation.minLength}) cannot be greater than maxLength (${field.validation.maxLength})`,
      );
    }
  }

  const rel = parsed.data.relations;
  if (rel && Array.isArray(rel.hasMany)) {
    rel.hasMany.forEach((entry, i) => {
      const p = `relations.hasMany[${i}]`;
      if (!entry || typeof entry !== "object") {
        issues.push(`${p}: expected an object with field, model, foreignKey`);
        return;
      }
      if (!entry.field || !IDENTIFIER.test(entry.field)) {
        issues.push(`${p}.field: must be a valid identifier`);
      }
      if (!entry.model || !PASCAL_CASE.test(entry.model)) {
        issues.push(`${p}.model: must be PascalCase (Mongoose model name)`);
      }
      if (!entry.foreignKey || !IDENTIFIER.test(entry.foreignKey)) {
        issues.push(`${p}.foreignKey: must be a valid identifier (the field on the child doc pointing to this resource)`);
      }
    });
  } else if (rel && rel.hasMany != null && !Array.isArray(rel.hasMany)) {
    issues.push("relations.hasMany: must be an array when present");
  }

  return issues.length ? { success: false, issues } : { success: true, data: parsed.data };
}
