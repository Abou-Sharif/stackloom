/**
 * ResourceDefinition — unified schema for all generators
 * Central type that describes a domain resource end-to-end
 */

import { pluralize } from '../utils/namingUtils.js';

export class ResourceDefinition {
  constructor({
    name,
    collection,
    fields = [],
    relations = {},
    ui = {},
    features = {},
    hooks = {},
    permissions = {},
    options = {},
  }) {
    this.name = name; // 'User' | 'Product' | 'Order'
    this.collection = collection || this.toKebabCase(name) + "s";
    this.fields = (fields || []).map((f) => new FieldDefinition(f));
    const rel = relations || {};
    this.relations = {
      belongsTo: Array.isArray(rel.belongsTo) ? rel.belongsTo : [],
      hasMany: Array.isArray(rel.hasMany) ? rel.hasMany : [],
    };
    this.ui = ui || {};
    this.features = features || {};
    this.hooks = hooks || {};
    this.permissions = permissions || {};
    this.options = options || {};

    this._mongooseType = "";
    this._mongooseConstraints = [];
    this._mongooseDef = "";

    this.validate();
  }

  validate() {
    if (!this.name) throw new Error("Resource name is required");
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(this.name)) {
      throw new Error(
        `Resource name "${this.name}" must be PascalCase (start uppercase, alphanumeric)`,
      );
    }

    // Validate field names unique
    const fieldNames = this.fields.map((f) => f.name);
    const duplicates = fieldNames.filter(
      (name, i) => fieldNames.indexOf(name) !== i,
    );
    if (duplicates.length)
      throw new Error(`Duplicate fields: ${duplicates.join(", ")}`);
  }

  // ── Naming helpers ────────────────────────────────────────────────────────
  get pascalName() {
    return this.name;
  }
  get camelName() {
    return this.name[0].toLowerCase() + this.name.slice(1);
  }
  get snakeName() {
    return this.camelName.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
  }
  get kebabName() {
    return this.camelName.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  }
  get pluralKebab() {
    return pluralize(this.kebabName);
  }
  get pluralPascal() {
    return pluralize(this.pascalName);
  }

  // ── Computed flags ────────────────────────────────────────────────────────
  get hasTimestamps() {
    return true;
  } // always include createdAt, updatedAt
  get hasSoftDelete() {
    return this.features && this.features.softDelete === true;
  }
  get hasAuditLog() {
    return this.features && this.features.auditLog === true;
  }
  get hasAuth() {
    return this.features && this.features.auth !== false;
  } // default true

  // ── Indexes ───────────────────────────────────────────────────────────────
  get indexes() {
    const idxs = [];
    this.fields.forEach((f) => {
      if (f.validation && f.validation.unique)
        idxs.push({ [f.name]: 1 }, { unique: true });
      if (f.type === "text" || f.type === "richtext")
        idxs.push({ [f.name]: "text" });
    });
    return idxs;
  }

  toKebabCase(str) {
    if (!str) return "";
    return str
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
  }
}

export class FieldDefinition {
  constructor(data) {
    this.name = data.name;
    this.type = data.type || "string";
    this.validation = data.validation || {};
    this.special = data.special || {};
    this.ui = data.ui || {};

    // Derived properties
    this.formInputType = fieldTypeToFormInput(this.type);
    this.mongooseType = fieldTypeToMongoose(this.type);
    this._mongooseConstraints = this.buildMongooseConstraints();
    this.joiRule = this.buildJoiRule();
  }

  get mongooseDef() {
    return this._mongooseConstraints.join(', ');
  }

  buildJoiRule() {
    let rule = "Joi.";
    const v = this.validation;

    switch (this.type) {
      case "ref":
      case "reference":
        rule += "string().hex().length(24)";
        break;
      case "number":
      case "range":
        rule += "number()";
        if (v.min !== undefined) rule += `.min(${v.min})`;
        if (v.max !== undefined) rule += `.max(${v.max})`;
        break;
      case "boolean":
        rule += "boolean()";
        break;
      case "date":
      case "datetime":
        rule += "date()";
        break;
      case "email":
        rule += "string().email()";
        break;
      case "password":
        rule += "string().min(8)";
        break;
      default:
        rule += "string()";
        if (v.minLength !== undefined) rule += `.min(${v.minLength})`;
        if (v.maxLength !== undefined) rule += `.max(${v.maxLength})`;
        if (v.pattern) rule += `.pattern(${v.pattern})`;
    }

    if (this.type === "ref" || this.type === "reference") {
      if (v.required) rule += ".required()";
      else rule += ".allow(null, '').optional()";
    } else if (v.required) rule += ".required()";
    else rule += ".optional()";

    if (v.default !== undefined && this.type !== "ref" && this.type !== "reference") {
      const val = typeof v.default === "string" ? `'${v.default}'` : v.default;
      rule += `.default(${val})`;
    }

    return rule;
  }

  buildMongooseConstraints() {
    const c = [];
    const v = this.validation;

    // Always include type
    c.push(`type: ${this.mongooseType}`);

    if (v.required) c.push("required: true");
    if (v.unique) c.push("unique: true");
    if (v.default !== undefined) {
      const val = typeof v.default === "string" ? `'${v.default}'` : v.default;
      c.push(`default: ${val}`);
    }

    if (this.type === "number" || this.type === "range") {
      if (v.min !== undefined) c.push(`min: ${v.min}`);
      if (v.max !== undefined) c.push(`max: ${v.max}`);
    }

    if (this.type === "string" || this.type === "text") {
      if (v.minLength !== undefined) c.push(`minLength: ${v.minLength}`);
      if (v.maxLength !== undefined) c.push(`maxLength: ${v.maxLength}`);
      if (v.pattern) c.push(`match: ${v.pattern}`);
    }

    if (this.type === "ref" || this.type === "reference") {
      if (this.special && this.special.model)
        c.push(`ref: '${this.special.model}'`);
    }

    return c;
  }
}

/**
 * Map our unified types to Mongoose types
 */
export function fieldTypeToMongoose(type) {
  const map = {
    string: "String",
    text: "String",
    number: "Number",
    range: "Number",
    boolean: "Boolean",
    date: "Date",
    datetime: "Date",
    email: "String",
    password: "String",
    ref: "mongoose.Schema.Types.ObjectId",
    reference: "mongoose.Schema.Types.ObjectId",
    multiselect: "Array",
    array: "Array",
    object: "Object",
    image: "String",
    file: "String",
  };
  return map[type] || "String";
}

const IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const PASCAL = /^[A-Z][a-zA-Z0-9]*$/;

/**
 * Parse `--relations` for belongsTo (ref fields) and hasMany (virtual populate).
 *
 * Format (repeat with `;`):
 *   `fieldName:belongsTo:TargetModel`            — creates a ref field `fieldName` pointing to TargetModel
 *   `virtualField:hasMany:TargetModel:foreignKey` — virtual populate (e.g. orders:hasMany:Order:customerId)
 *
 * Examples:
 *   `employee:belongsTo:Employee`                — Salary.employee → Employee ObjectId ref
 *   `department:belongsTo:Department`            — Employee.department → Department ObjectId ref
 *   `orders:hasMany:Order:customerId`            — Customer.orders → Order docs where customerId === this._id
 *
 * @param {string} spec
 * @returns {{ belongsTo: Array<{ field: string, model: string }>, hasMany: Array<{ field: string, model: string, foreignKey: string }> } | null}
 */
export function parseRelationsSpec(spec) {
  if (!spec || typeof spec !== "string" || !spec.trim()) return null;

  const entries = spec
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const belongsTo = [];
  const hasMany = [];

  for (const entry of entries) {
    const parts = entry.split(":").map((p) => p.trim());
    if (parts.length === 3) {
      // belongsTo: fieldName:belongsTo:TargetModel
      const [field, kind, model] = parts;
      if (kind !== "belongsTo") {
        throw new Error(
          `Invalid relation "${entry}". Use: fieldName:belongsTo:TargetModel (3 parts) or virtualField:hasMany:TargetModel:foreignKey (4 parts).`,
        );
      }
      if (!IDENT.test(field)) {
        throw new Error(`Invalid field name "${field}" in "${entry}".`);
      }
      if (!PASCAL.test(model)) {
        throw new Error(
          `Invalid model "${model}" in "${entry}" — use PascalCase (e.g. Employee).`,
        );
      }
      belongsTo.push({ field, model });
    } else if (parts.length === 4) {
      // hasMany: virtualField:hasMany:TargetModel:foreignKey
      const [field, kind, model, foreignKey] = parts;
      if (kind !== "hasMany") {
        throw new Error(
          `Invalid relation "${entry}". Kind must be hasMany (got "${kind}").`,
        );
      }
      if (!IDENT.test(field)) {
        throw new Error(`Invalid virtual field name "${field}" in "${entry}".`);
      }
      if (!PASCAL.test(model)) {
        throw new Error(
          `Invalid model "${model}" in "${entry}" — use PascalCase (e.g. Order).`,
        );
      }
      if (!IDENT.test(foreignKey)) {
        throw new Error(`Invalid foreign key "${foreignKey}" in "${entry}".`);
      }
      hasMany.push({ field, model, foreignKey });
    } else {
      throw new Error(
        `Invalid relation "${entry}". Use: fieldName:belongsTo:TargetModel (3 parts) or virtualField:hasMany:TargetModel:foreignKey (4 parts).`,
      );
    }
  }

  // Detect duplicate virtual field names across both kinds
  const allFields = [
    ...belongsTo.map((r) => r.field),
    ...hasMany.map((r) => r.field),
  ];
  const dupes = [...new Set(allFields.filter((f, i) => allFields.indexOf(f) !== i))];
  if (dupes.length) {
    throw new Error(
      `Duplicate field name(s): ${dupes.join(", ")}. Each relation field must have a unique name.`,
    );
  }

  const result = {};
  if (belongsTo.length) result.belongsTo = belongsTo;
  if (hasMany.length) result.hasMany = hasMany;
  return Object.keys(result).length ? result : null;
}

/**
 * parseFieldSpec — parses a compact string representation of a field
 */
export function parseFieldSpec(spec) {
  if (!spec || typeof spec !== "string") return null;

  const match = spec.match(
    /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([a-zA-Z]+)(?:\[(.*?)\])?(?:[:|](.*))?$/,
  );
  if (!match) {
    return null;
  }

  const [, name, typeRaw, optionsRaw, rulesRaw] = match;

  const field = {
    name,
    type: typeRaw.toLowerCase(),
    validation: {},
    special: {},
    ui: {},
  };

  // Aliases
  if (field.type === "str") field.type = "string";
  if (field.type === "num") field.type = "number";
  if (field.type === "bool") field.type = "boolean";

  // Parse options in brackets [...]
  if (optionsRaw) {
    if (field.type === "ref" || field.type === "reference") {
      field.special.model = optionsRaw.trim();
    } else if (field.type === "select" || field.type === "multiselect") {
      field.special.options = optionsRaw.split(",").map((o) => o.trim());
    } else if (field.type === "image" || field.type === "file") {
      const opts = optionsRaw.split(";");
      field.special.upload = opts[0]?.trim() || field.type + "s";
      if (opts[1]) {
        const [k, v] = opts[1].split("=");
        if (k === "max") field.special.maxSize = v;
      }
    } else {
      const parts = optionsRaw.split(",").map((p) => p.trim());
      parts.forEach((part) => {
        if (part.includes("=")) {
          const [k, v] = part.split("=");
          if (k === "min") field.validation.min = parseFloat(v);
          else if (k === "max") field.validation.max = parseFloat(v);
          else if (k === "minLength") field.validation.minLength = parseInt(v);
          else if (k === "maxLength") field.validation.maxLength = parseInt(v);
          else if (k === "pattern") field.validation.pattern = v;
          else if (k === "default") field.validation.default = v;
        } else {
          if (part === "required") field.validation.required = true;
          else if (part === "unique") field.validation.unique = true;
        }
      });
    }
  }

  if (rulesRaw) {
    const rules = rulesRaw.split("|").map((r) => r.trim());
    rules.forEach((rule) => {
      if (rule === "required") field.validation.required = true;
      else if (rule === "unique") field.validation.unique = true;
      else if (rule.startsWith("min="))
        field.validation.min = parseFloat(rule.split("=")[1]);
      else if (rule.startsWith("max="))
        field.validation.max = parseFloat(rule.split("=")[1]);
      else if (rule.startsWith("minLength="))
        field.validation.minLength = parseInt(rule.split("=")[1]);
      else if (rule.startsWith("maxLength="))
        field.validation.maxLength = parseInt(rule.split("=")[1]);
      else if (rule.startsWith("default="))
        field.validation.default = rule.split("=").slice(1).join("=");
    });
  }

  return field;
}

function parseKeyValue(str) {
  const result = {};
  if (!str) return result;

  const pairs = str.split(",");
  pairs.forEach((pair) => {
    const [key, ...valParts] = pair.split("=");
    if (key && valParts.length > 0) {
      result[key.trim()] = valParts.join("=").trim();
    }
  });
  return result;
}

export function fieldTypeToFormInput(type) {
  const map = {
    string: "text",
    text: "textarea",
    number: "number",
    boolean: "checkbox",
    date: "date",
    email: "email",
    phone: "tel",
    url: "url",
    datetime: "datetime-local",
    time: "time",
    color: "color",
    file: "file",
    password: "password",
    range: "range",
    select: "select",
    multiselect: "multiselect",
    reference: "select",
    ref: "select",
    image: "image-upload",
  };
  return map[type] || "text";
}
