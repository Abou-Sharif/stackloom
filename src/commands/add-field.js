/**
 * `loom resource add-field <name> [field-spec]` — add a field to an existing resource.
 *
 * Delegates to the full amend pipeline so custom zone / AUTO-GENERATED markers
 * are preserved. A convenience wrapper around:
 *   loom resource sync <Name> --fields "spec"
 */
import inquirer from "inquirer";
import { reporterFromOptions } from "../services/index.js";
import generateResource from "./generate-resource.js";
import { StateTracker } from "../core/state-tracker.js";
import { parseFieldSpec } from "../core/resource-definition.js";

function toPascalCase(s) {
  if (!s) return s;
  return s
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

const FIELD_TYPE_CHOICES = [
  { name: "Text (single line)", value: "string" },
  { name: "Long text / textarea", value: "text" },
  { name: "Number", value: "number" },
  { name: "Boolean", value: "boolean" },
  { name: "Email", value: "email" },
  { name: "Password", value: "password" },
  { name: "Phone", value: "phone" },
  { name: "URL", value: "url" },
  { name: "Date", value: "date" },
  { name: "DateTime", value: "datetime" },
  { name: "Color", value: "color" },
  { name: "File / upload path", value: "file" },
  { name: "Range / slider", value: "range" },
  { name: "Reference → other document (ObjectId)", value: "ref" },
];

async function promptField() {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Field name:",
      validate: (input) =>
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(input) ||
        "Field name must be a valid identifier",
    },
    {
      type: "list",
      name: "type",
      message: "Field type:",
      choices: FIELD_TYPE_CHOICES,
      default: "string",
    },
    {
      type: "input",
      name: "refModel",
      message: "Referenced Mongoose model (PascalCase, e.g. Category):",
      when: (a) => a.type === "ref",
      validate: (v) =>
        /^[A-Z][a-zA-Z0-9]*$/.test((v || "").trim()) ||
        "Use PascalCase, matching the other resource's model name",
      filter: (v) => (v || "").trim(),
    },
    {
      type: "confirm",
      name: "required",
      message: "Required field?",
      default: true,
    },
    {
      type: "confirm",
      name: "unique",
      message: "Unique field?",
      default: false,
    },
    {
      type: "input",
      name: "minLength",
      message: "Min length (optional):",
      validate: (value) =>
        !value || /^\d+$/.test(value) || "Enter a whole number or leave blank",
    },
    {
      type: "input",
      name: "maxLength",
      message: "Max length (optional):",
      validate: (value) =>
        !value || /^\d+$/.test(value) || "Enter a whole number or leave blank",
    },
    {
      type: "input",
      name: "min",
      message: "Min value (optional):",
      validate: (value) =>
        !value || !Number.isNaN(Number(value)) || "Enter a number or leave blank",
    },
    {
      type: "input",
      name: "max",
      message: "Max value (optional):",
      validate: (value) =>
        !value || !Number.isNaN(Number(value)) || "Enter a number or leave blank",
    },
    {
      type: "input",
      name: "pattern",
      message: "Regex pattern (optional):",
    },
  ]);

  let spec = `${answers.name}:${answers.type}`;
  if (answers.type === "ref" && answers.refModel) {
    spec = `${answers.name}:ref[${answers.refModel}]`;
  }
  const rules = [];
  if (answers.required) rules.push("required");
  if (answers.unique) rules.push("unique");
  if (answers.minLength) rules.push(`minLength=${answers.minLength}`);
  if (answers.maxLength) rules.push(`maxLength=${answers.maxLength}`);
  if (answers.min) rules.push(`min=${answers.min}`);
  if (answers.max) rules.push(`max=${answers.max}`);
  if (answers.pattern) rules.push(`pattern=${answers.pattern}`);
  if (rules.length) spec += `:${rules.join("|")}`;
  return spec;
}

/**
 * @param {string} name - resource name (PascalCase or kebab-case)
 * @param {string|undefined} fieldSpec - compact field spec, e.g. "sku:string:required"
 * @param {object} options
 */
export default async function addFieldCmd(name, fieldSpec, options = {}) {
  const reporter = reporterFromOptions(options);
  const projectRoot = options.projectRoot || process.cwd();
  const pascalName = toPascalCase(name);
  const tracker = new StateTracker(projectRoot);

  const stored = await tracker.loadResourceDefinition(pascalName);
  if (!stored) {
    reporter.error(
      `No stored definition for ${pascalName} in .loom/resources/. Generate the resource first:\n` +
      `  loom generate resource ${pascalName} --fields "..."`,
    );
    reporter.result({ error: `Resource ${pascalName} not found` });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  let fieldsSpec = fieldSpec || "";

  if (!fieldSpec && options.interactive) {
    fieldsSpec = await promptField();
  }

  if (!fieldsSpec) {
    reporter.error(
      "Provide a field spec or use --interactive.\n" +
      `  loom resource add-field ${pascalName} "sku:string:required"`,
    );
    reporter.result({ error: "No field spec provided" });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const parsed = parseFieldSpec(fieldsSpec);
  if (!parsed) {
    reporter.error(
      `Invalid field spec "${fieldsSpec}". Use name:type:rules (e.g. "sku:string:required").`,
    );
    reporter.result({ error: `Invalid field spec: ${fieldsSpec}` });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const existingNames = (stored.fields || []).map((f) => f.name);
  if (existingNames.includes(parsed.name)) {
    reporter.warn(
      `Field "${parsed.name}" already exists on ${pascalName}. It will be updated with the new definition.`,
    );
  } else {
    reporter.step(`Adding field "${parsed.name}:${parsed.type}" to ${pascalName}...`);
  }

  return generateResource("resource", pascalName, {
    ...options,
    amend: true,
    fields: fieldsSpec,
    interactive: false,
    projectRoot,
  });
}
