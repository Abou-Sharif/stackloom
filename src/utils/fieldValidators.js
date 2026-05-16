#!/usr/bin/env node
/**
 * Input Validation Utility for Form/Module Field Definitions
 * Provides comprehensive validation and sanitization helpers for CLI field specs
 */

export const AVAILABLE_TYPES = [
  // Frontend form input types
  "text", "textarea", "email", "password", "number", "tel", "url", 
  "date", "datetime-local", "time", "color", "file", "range", "select", "hidden", "boolean",
  // Backend schema types (alias/extra)
  "string", "datetime"
];

export const VALIDATION_RULES = {
  required: { type: "flag", description: "Field must be filled" },
  unique: { type: "flag", description: "Value must be unique in database" },
  min: { type: "number", description: "Minimum numeric/date value" },
  max: { type: "number", description: "Maximum numeric/date value" },
  minLength: { type: "integer", description: "Minimum string length" },
  maxLength: { type: "integer", description: "Maximum string length" },
  step: { type: "number", description: "Step size for number/range inputs" },
  pattern: { type: "regex", description: "Regex pattern (format: /^[A-Z]+$/)" },
  default: { type: "any", description: "Default value" },
  accept: { type: "string", description: "File accept types (comma-separated MIME types)" },
  multiple: { type: "flag", description: "Allow multiple file selection" },
  options: { type: "array", description: "Dropdown options for select fields" },
};

const TYPE_VALIDATORS = {
  text: (value) => typeof value === "string",
  textarea: (value) => typeof value === "string",
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  password: (value) => typeof value === "string" && value.length >= 8,
  number: (value) => !isNaN(parseFloat(value)),
  tel: (value) => /^[+]?[1-9]\d{1,14}$/.test(value.replace(/[^+0-9]/g, "")),
  url: (value) => /^https?:\/\/.+\..+/.test(value),
  date: (value) => !isNaN(Date.parse(value)),
  "datetime-local": (value) => !isNaN(Date.parse(value)),
  time: (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
  color: (value) => /^#([0-9A-F]{3}){1,2}$/i.test(value),
  range: (value) => !isNaN(parseFloat(value)),
  boolean: (value) => typeof value === "boolean" || value === "true" || value === "false",
  file: (value) => value instanceof File || typeof value === "string",
};

const TYPE_SANITIZERS = {
  text: (value) => String(value).trim(),
  textarea: (value) => String(value).trim(),
  email: (value) => String(value).toLowerCase().trim(),
  password: (value) => String(value),
  number: (value) => parseFloat(value) || 0,
  tel: (value) => String(value).replace(/[^+0-9]/g, ""),
  url: (value) => String(value).trim(),
  date: (value) => String(value).split("T")[0],
  "datetime-local": (value) => String(value),
  time: (value) => String(value),
  color: (value) => String(value).toUpperCase(),
  range: (value) => parseFloat(value) || 0,
  boolean: (value) => value === true || value === "true",
  file: (value) => value,
};

/**
 * Parse field specification string into structured object
 * Format: "name:type:rule1,rule2,rule3" or object input
 * 
 * @param {string|object} input - Field specification
 * @returns {object|null} Parsed field object or null if invalid
 */
export function parseFieldSpec(input) {
  if (typeof input === "object" && input.name && input.type) {
    return validateFieldObject(input);
  }
  
  if (typeof input !== "string") return null;
  
  const parts = input.split(":");
  if (parts.length < 2) return null;
  
  const name = parts[0].trim();
  const type = parts[1].trim();
  
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    console.error(`✖  Invalid field name "${name}". Must be valid JS identifier.`);
    return null;
  }
  
  if (!AVAILABLE_TYPES.includes(type)) {
    console.error(`✖  Invalid type "${type}". Available: ${AVAILABLE_TYPES.join(", ")}`);
    return null;
  }
  
  const field = { name, type, validation: { required: false } };
  
  // Parse rules (pipe-separated: rule1|rule2|key=value)
  if (parts[2]) {
    const rules = parts[2].split("|");
    for (const rule of rules) {
      const trimmed = rule.trim();
      if (trimmed === "required") {
        field.validation.required = true;
      } else if (trimmed === "unique") {
        field.validation.unique = true;
      } else if (trimmed.startsWith("min=")) {
        const val = parseFloat(trimmed.split("=")[1]);
        if (!isNaN(val)) field.validation.min = val;
      } else if (trimmed.startsWith("max=")) {
        const val = parseFloat(trimmed.split("=")[1]);
        if (!isNaN(val)) field.validation.max = val;
      } else if (trimmed.startsWith("minLength=")) {
        const val = parseInt(trimmed.split("=")[1], 10);
        if (!isNaN(val)) field.validation.minLength = val;
      } else if (trimmed.startsWith("maxLength=")) {
        const val = parseInt(trimmed.split("=")[1], 10);
        if (!isNaN(val)) field.validation.maxLength = val;
      } else if (trimmed.startsWith("step=")) {
        const val = parseFloat(trimmed.split("=")[1]);
        if (!isNaN(val)) field.validation.step = val;
      } else if (trimmed.startsWith("pattern=")) {
        const pattern = trimmed.split("=")[1];
        try {
          new RegExp(pattern);
          field.validation.pattern = pattern;
        } catch {
          console.warn(`⚠  Invalid regex pattern for ${name}: ${pattern}`);
        }
      } else if (trimmed.startsWith("default=")) {
        field.validation.default = trimmed.split("=")[1];
      } else if (trimmed.startsWith("accept=")) {
        field.validation.accept = trimmed.split("=")[1].split(",");
      } else if (trimmed === "multiple") {
        field.validation.multiple = true;
      }
    }
  }
  
  // Cross-validate constraints
  if (field.validation.min !== undefined && field.validation.max !== undefined) {
    if (field.validation.min > field.validation.max) {
      console.error(`✖  min (${field.validation.min}) > max (${field.validation.max}) for field "${name}"`);
      return null;
    }
  }
  if (field.validation.minLength !== undefined && field.validation.maxLength !== undefined) {
    if (field.validation.minLength > field.validation.maxLength) {
      console.error(`✖  minLength > maxLength for field "${name}"`);
      return null;
    }
  }
  
  return validateFieldObject(field);
}

/**
 * Validate field object structure and constraints
 */
function validateFieldObject(field) {
  if (!field.name || !field.type) return null;
  
  if (!AVAILABLE_TYPES.includes(field.type)) {
    console.error(`✖  Type "${field.type}" not supported`);
    return null;
  }
  
  // Type-specific validation checks
  const validator = TYPE_VALIDATORS[field.type];
  if (field.validation.default !== undefined && !validator(field.validation.default)) {
    console.warn(`⚠  Default value for ${field.name} may not match type ${field.type}`);
  }
  
  if (field.validation.min !== undefined && !validator(field.validation.min)) {
    console.warn(`⚠  min value for ${field.name} is invalid`);
    delete field.validation.min;
  }
  
  if (field.validation.max !== undefined && !validator(field.validation.max)) {
    console.warn(`⚠  max value for ${field.name} is invalid`);
    delete field.validation.max;
  }
  
  // Cross-validation: min <= max
  if (field.validation.min !== undefined && field.validation.max !== undefined) {
    if (field.validation.min > field.validation.max) {
      console.error(`✖  min (${field.validation.min}) > max (${field.validation.max}) for ${field.name}`);
      return null;
    }
  }
  
  return field;
}

/**
 * Generate sanitized input handler code
 */
export function generateSanitizationCode(fields) {
  const sanitizers = [];
  
  fields.forEach(f => {
    const sanitizer = TYPE_SANITIZERS[f.type];
    if (sanitizer && f.type !== "file") {
      sanitizers.push(`    sanitized.${f.name} = sanitize${f.type.charAt(0).toUpperCase() + f.type.slice(1)}(values.${f.name});`);
    }
  });
  
  return sanitizers.join('\n');
}

/**
 * Generate validation code for frontend
 */
export function generateValidationCode(fields, useZod = false) {
  if (useZod) {
    return fields.map(f => {
      let zodType = "z.string()";
      if (f.type === "number") zodType = "z.number()";
      if (f.type === "boolean") zodType = "z.boolean()";
      if (f.type === "date") zodType = "z.string().datetime()";
      
      let refinements = [];
      if (f.validation.required) refinements.push(".min(1, 'Required')");
      else zodType += ".optional()";
      if (f.minLength) refinements.push(`.min(${f.minLength}, "Min ${f.minLength} chars")`);
      if (f.maxLength) refinements.push(`.max(${f.maxLength}, "Max ${f.maxLength} chars")`);
      if (f.pattern) refinements.push(`.regex(${f.pattern})`);
      
      return `    ${f.name}: ${zodType}${refinements.join('')}`;
    }).join(',\n');
  }
  
  // Inline validation function
  const checks = [];
  fields.forEach(f => {
    if (f.validation.required) {
      checks.push(`    if (!values.${f.name}) errors.push("${f.label || f.name} is required");`);
    }
    if (f.validation.min !== undefined) {
      checks.push(`    if (values.${f.name} < ${f.validation.min}) errors.push("Minimum ${f.validation.min}");`);
    }
    if (f.validation.max !== undefined) {
      checks.push(`    if (values.${f.name} > ${f.validation.max}) errors.push("Maximum ${f.validation.max}");`);
    }
    if (f.minLength) {
      checks.push(`    if (values.${f.name}.length < ${f.minLength}) errors.push("Min ${f.minLength} characters");`);
    }
    if (f.maxLength) {
      checks.push(`    if (values.${f.name}.length > ${f.maxLength}) errors.push("Max ${f.maxLength} characters");`);
    }
  });
  
  return checks.join('\n');
}

/**
 * Check if any field requires file upload handling
 */
export function hasFileUpload(fields) {
  return fields.some(f => f.type === "file");
}

/**
 * Check if any field requires rich text (WYSIWYG)
 */
export function hasRichText(fields) {
  return fields.some(f => f.type === "textarea" && (f.validation.maxLength > 500 || f.richText));
}

/**
 * Generate backend validator (Joi)
 */
export function generateJoiValidator(fields) {
  const rules = fields.map(f => {
    let rule = `  ${f.name}: `;
    
    switch (f.type) {
      case "string":
      case "text":
      case "email":
      case "url":
      case "tel":
      case "password":
        rule += "Joi.string().trim()";
        if (f.minLength) rule += `.min(${f.minLength})`;
        if (f.maxLength) rule += `.max(${f.maxLength})`;
        if (f.type === "email") rule += ".email()";
        if (f.type === "url") rule += ".uri()";
        if (f.type === "tel") rule += ".pattern(/^[+]?[1-9]\\d{1,14}$/)";
        if (f.type === "password") rule += ".min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)/)";
        break;
      case "number":
      case "range":
        rule += "Joi.number().integer()";
        if (f.validation.min !== undefined) rule += `.min(${f.validation.min})`;
        if (f.validation.max !== undefined) rule += `.max(${f.validation.max})`;
        break;
      case "boolean":
        rule += "Joi.boolean()";
        break;
      case "date":
      case "datetime":
        rule += "Joi.date().iso()";
        break;
      case "color":
        rule += "Joi.string().hexColor()";
        break;
      case "file":
        rule += "Joi.any()";
        break;
      default:
        rule += "Joi.any()";
    }
    
    if (f.validation.required) {
      rule += ".required()";
    }
    
    if (f.validation.unique) {
      // Comment for server-side unique check
      rule += ` // TODO: Add unique validation in controller`;
    }
    
    return rule;
  });
  
  return `const Joi = require("joi");

const schema = Joi.object({
${rules.join(",\n")}
});

module.exports = schema;`;
}

/**
 * Sanitize utilities (exported for use in generated code)
 */
export const sanitizers = {
  text: (value) => {
    if (typeof value !== "string") return value;
    // Remove HTML tags and trim
    return value.replace(/<[^>]*>?/gm, '').trim();
  },
  
  textarea: (value) => {
    if (typeof value !== "string") return value;
    // Preserve line breaks but remove dangerous tags
    return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  },
  
  email: (value) => {
    if (typeof value !== "string") return value;
    return value.toLowerCase().trim();
  },
  
  url: (value) => {
    if (typeof value !== "string") return value;
    return value.trim();
  },
  
  phone: (value) => {
    if (typeof value !== "string") return value;
    // E.164 format: +[country code][number]
    return value.replace(/[^+0-9]/g, '');
  },
  
  number: (value) => {
    return parseFloat(value) || 0;
  },
  
  default: (value) => value,
};
