/**
 * `loom generate resource|module|page <name>` — the unified, engine-backed
 * generation command.
 *
 * Replaces the divergent code paths (string-template page generator vs the EJS
 * generator) with one flow: blueprint + recipe → transactional pipeline. It
 * decides *nothing* about what files exist or where they go — the recipe and
 * blueprint do — it only wires the pieces and reports.
 */
import inquirer from "inquirer";
import path from "node:path";
import {
  ResourceDefinition,
  parseFieldSpec,
  parseRelationsSpec,
} from "../core/resource-definition.js";
import { TemplateLoader } from "../core/template-loader.js";
import { blueprintLoader } from "../blueprint/index.js";
import { recipeLoader } from "../recipes/index.js";
import { createGenerationPipeline } from "../engine/index.js";
import { reporterFromOptions } from "../services/index.js";
import {
  validateGenerateOptions,
  validateResourceDefinition,
} from "../schemas/index.js";

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

const DEFAULT_PAGE_ICONS = [
  "layout",
  "settings",
  "users",
  "shield-check",
  "bar-chart-2",
  "folder",
  "wand",
];

const NAMING = {
  pascal: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  camel: (s) => s.charAt(0).toLowerCase() + s.slice(1),
  kebab: (s) =>
    s
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase(),
};

/** Build a validated ResourceDefinition from --fields / --file / a bare name. */
async function resolveResource(name, options) {
  let raw;
  if (options.file) {
    const mod = await import(path.resolve(process.cwd(), options.file));
    raw = mod.default || mod;
    if (raw == null || typeof raw !== "object") {
      throw new Error("Resource module must export a default object");
    }
    raw = { ...raw };
  } else {
    const specs = options.fields
      ? options.fields.split(";").map((s) => s.trim()).filter(Boolean)
      : [];
    const fields = [];
    for (const spec of specs) {
      const f = parseFieldSpec(spec);
      if (!f) {
        throw new Error(
          `Invalid field spec "${spec}". Use name:type[opts]:rules (see CLI_USAGE.md).`,
        );
      }
      fields.push(f);
    }
    raw = { name: NAMING.pascal(name), fields };
  }

  if (options.relations && String(options.relations).trim()) {
    const parsedRel = parseRelationsSpec(String(options.relations).trim());
    raw.relations = raw.relations || {};
    const existing = Array.isArray(raw.relations.hasMany)
      ? raw.relations.hasMany
      : [];
    raw.relations.hasMany = [...existing, ...parsedRel.hasMany];
  }

  // Schema-validate before construction — typed errors, not a thrown stack trace.
  const validated = validateResourceDefinition(raw);
  if (!validated.success) {
    throw new Error(
      `Invalid resource definition:\n  - ${validated.issues.join("\n  - ")}`,
    );
  }
  return new ResourceDefinition(validated.data);
}

function serializeFieldSpec(field) {
  const rules = [];
  if (field.required) rules.push("required");
  if (field.unique) rules.push("unique");
  if (field.minLength != null) rules.push(`minLength=${field.minLength}`);
  if (field.maxLength != null) rules.push(`maxLength=${field.maxLength}`);
  if (field.min != null) rules.push(`min=${field.min}`);
  if (field.max != null) rules.push(`max=${field.max}`);
  if (field.pattern) rules.push(`pattern=${field.pattern}`);
  const isRef = field.type === "ref" || field.type === "reference";
  const refModel = field.special?.model;
  if (isRef && refModel) {
    const base = `${field.name}:ref[${refModel}]`;
    return rules.length ? `${base}:${rules.join("|")}` : base;
  }
  return rules.length
    ? `${field.name}:${field.type}:${rules.join("|")}`
    : `${field.name}:${field.type}`;
}

async function askResourceFields() {
  const fields = [];
  while (true) {
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
          !value ||
          /^\d+$/.test(value) ||
          "Enter a whole number or leave blank",
      },
      {
        type: "input",
        name: "maxLength",
        message: "Max length (optional):",
        validate: (value) =>
          !value ||
          /^\d+$/.test(value) ||
          "Enter a whole number or leave blank",
      },
      {
        type: "input",
        name: "min",
        message: "Min value (optional):",
        validate: (value) =>
          !value ||
          !Number.isNaN(Number(value)) ||
          "Enter a number or leave blank",
      },
      {
        type: "input",
        name: "max",
        message: "Max value (optional):",
        validate: (value) =>
          !value ||
          !Number.isNaN(Number(value)) ||
          "Enter a number or leave blank",
      },
      {
        type: "input",
        name: "pattern",
        message: "Regex pattern (optional):",
      },
      {
        type: "confirm",
        name: "more",
        message: "Add another field?",
        default: false,
      },
    ]);

    fields.push({
      name: answers.name,
      type: answers.type,
      required: answers.required,
      unique: answers.unique,
      minLength: answers.minLength ? Number(answers.minLength) : undefined,
      maxLength: answers.maxLength ? Number(answers.maxLength) : undefined,
      min: answers.min ? Number(answers.min) : undefined,
      max: answers.max ? Number(answers.max) : undefined,
      pattern: answers.pattern || undefined,
      special:
        answers.type === "ref" && answers.refModel
          ? { model: answers.refModel }
          : {},
    });

    if (!answers.more) break;
  }
  return fields;
}

async function askPageMetadata(name, options) {
  const defaultRoute = `/${NAMING.kebab(name)}`;
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "routeMode",
      message: "Route path:",
      choices: [
        { name: `Default (${defaultRoute})`, value: "default" },
        { name: "Custom route", value: "custom" },
      ],
      default: "default",
    },
    {
      type: "input",
      name: "route",
      message: "Enter route path (must start with /):",
      when: (answers) => answers.routeMode === "custom",
      default: defaultRoute,
      validate: (input) =>
        input.trim().startsWith("/") || "Route must start with a slash (/)",
      filter: (input) =>
        input.trim().startsWith("/") ? input.trim() : `/${input.trim()}`,
    },
    {
      type: "list",
      name: "icon",
      message: "Choose an icon:",
      choices: [
        ...DEFAULT_PAGE_ICONS.map((icon) => ({ name: icon, value: icon })),
        { name: "Custom icon name", value: "custom" },
      ],
      default: DEFAULT_PAGE_ICONS[0],
    },
    {
      type: "input",
      name: "customIcon",
      message: "Custom icon name:",
      when: (answers) => answers.icon === "custom",
      validate: (input) =>
        /^[a-z0-9-]+$/i.test(input) || "Use only letters, numbers and dashes",
      filter: (input) => input.trim(),
    },
    {
      type: "confirm",
      name: "addNav",
      message: "Add this page to navigation?",
      default: true,
    },
  ]);

  return {
    route: answers.route || defaultRoute,
    icon: answers.icon === "custom" ? answers.customIcon : answers.icon,
    noNav: !answers.addNav,
  };
}

/** Interactive: build `--relations`-style hasMany virtual populate specs. */
async function askHasManyVirtualRelations() {
  const { want } = await inquirer.prompt([
    {
      type: "confirm",
      name: "want",
      message:
        "Add hasMany virtual relations (child docs that reference this resource via a foreign key)?",
      default: false,
    },
  ]);
  if (!want) return "";

  const chunks = [];
  let more = true;
  while (more) {
    const ans = await inquirer.prompt([
      {
        type: "input",
        name: "field",
        message: "Virtual property name on this model (e.g. orders):",
        validate: (v) =>
          /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test((v || "").trim()) ||
          "Must be a valid JavaScript identifier",
        filter: (v) => (v || "").trim(),
      },
      {
        type: "input",
        name: "model",
        message: "Child Mongoose model name (PascalCase, e.g. Order):",
        validate: (v) =>
          /^[A-Z][a-zA-Z0-9]*$/.test((v || "").trim()) ||
          "Use PascalCase, matching the child model's name",
        filter: (v) => (v || "").trim(),
      },
      {
        type: "input",
        name: "foreignKey",
        message:
          "On the child document, which field stores THIS resource's id? (e.g. customerId)",
        validate: (v) =>
          /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test((v || "").trim()) ||
          "Must be a valid identifier",
        filter: (v) => (v || "").trim(),
      },
      {
        type: "confirm",
        name: "more",
        message: "Add another hasMany relation?",
        default: false,
      },
    ]);
    chunks.push(`${ans.field}:hasMany:${ans.model}:${ans.foreignKey}`);
    more = ans.more;
  }
  return chunks.join(";");
}

async function promptGenerateResourceOptions(type, name, options) {
  const interactiveOptions = { ...options };

  if (!name) {
    const { resourceName } = await inquirer.prompt([
      {
        type: "input",
        name: "resourceName",
        message: "Resource name:",
        validate: (value) =>
          /^[a-z0-9-_]+$/i.test(value) ||
          "Use only letters, numbers, dashes or underscores",
      },
    ]);
    name = resourceName;
  }

  if (!interactiveOptions.file && !interactiveOptions.fields) {
    const { addFields } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addFields",
        message: "Add fields to this resource?",
        default: true,
      },
    ]);
    if (addFields) {
      const fields = await askResourceFields();
      interactiveOptions.fields = fields.map(serializeFieldSpec).join(";");
    }
  }

  if (
    type === "resource" &&
    !String(interactiveOptions.relations || "").trim() &&
    !interactiveOptions.file
  ) {
    const relSpec = await askHasManyVirtualRelations();
    if (relSpec) interactiveOptions.relations = relSpec;
  }

  if (type === "page") {
    const pageMeta = await askPageMetadata(name, interactiveOptions);
    interactiveOptions.route = pageMeta.route;
    interactiveOptions.icon = pageMeta.icon;
    interactiveOptions.noNav = pageMeta.noNav;
  }

  if (!interactiveOptions.arch) {
    const { arch } = await inquirer.prompt([
      {
        type: "list",
        name: "arch",
        message: "Architecture level:",
        choices: [
          { name: "Lightweight — minimal structure", value: "lightweight" },
          { name: "Moderate — standard MERN", value: "moderate" },
          { name: "Advanced — enterprise-ready", value: "advanced" },
        ],
        default: "moderate",
      },
    ]);
    interactiveOptions.arch = arch;
  }

  if (!interactiveOptions.formMode) {
    const { formMode } = await inquirer.prompt([
      {
        type: "list",
        name: "formMode",
        message: "Form mode:",
        choices: [
          { name: "Page form", value: "page" },
          { name: "Modal dialog", value: "modal" },
          { name: "Sidepanel / drawer", value: "sidepanel" },
          { name: "Inline form above content", value: "inline" },
        ],
        default: "page",
      },
    ]);
    interactiveOptions.formMode = formMode;
  }

  return { ...interactiveOptions, name };
}

/**
 * @param {string} type - recipe name: "resource" | "module" | "page"
 * @param {string} name - resource name
 * @param {object} options - merged command + global options
 */
export default async function generateResource(type, name, options = {}) {
  const reporter = reporterFromOptions(options);
  const projectRoot = process.cwd();
  let executionOptions = { ...options };

  try {
    if (executionOptions.interactive) {
      const interactiveResult = await promptGenerateResourceOptions(
        type,
        name,
        executionOptions,
      );
      name = interactiveResult.name;
      executionOptions = interactiveResult;
    }

    if (!name)
      throw new Error(`A name is required: loom generate ${type} <Name>`);

    const optionCheck = validateGenerateOptions(executionOptions);
    if (!optionCheck.success) {
      throw new Error(
        `Invalid options:\n  - ${optionCheck.issues.join("\n  - ")}`,
      );
    }

    const resource = await resolveResource(name, executionOptions);
    const blueprint = await blueprintLoader.load(projectRoot);
    const recipe = await recipeLoader.load(
      executionOptions.recipe || type,
      blueprint,
    );

    reporter.step(
      `Generating ${recipe.name} "${resource.name}" (${blueprint.architecture.name})`,
    );

    // The recipe's `when` evaluation context: params + derived flags.
    const recipeContext = {
      withFrontend: executionOptions.frontend !== false,
      withTests: Boolean(executionOptions.withTests),
      architecture: executionOptions.arch || "moderate",
      formMode: executionOptions.formMode || "page",
      usesTypeScript: blueprint.usesTypeScript(projectRoot),
    };
    for (const field of resource.fields)
      recipeContext[`hasField:${field.name}`] = true;

    // Template-path tokens ({kebab}, {Name}) used by recipe `out`/`template`.
    const vars = { kebab: resource.kebabName, Name: resource.pascalName };

    // EJS rendering bridged to the engine's injected-renderer contract.
    const templates = new TemplateLoader();
    templates.projectRoot = projectRoot;
    const templateContext = {
      resource,
      blueprint,
      options: recipeContext,
      project: {
        root: projectRoot,
        usesTypeScript: recipeContext.usesTypeScript,
      },
      utils: NAMING,
    };
    const renderer = (templatePath) =>
      templates.render(templatePath, templateContext, projectRoot);

    const pipeline = createGenerationPipeline({ renderer });
    const ctx = await pipeline.run({
      projectRoot,
      recipe,
      blueprint,
      recipeContext,
      vars,
      templateContext,
      dryRun: Boolean(executionOptions.dryRun),
    });

    const { files, dryRun } = ctx.result;
    const creates = files.filter((f) => f.action === "create").length;
    const updates = files.filter((f) => f.action === "update").length;
    reporter.step(`Change set: ${creates} new, ${updates} updated`);

    for (const file of files) {
      reporter.event("file", { action: file.action, path: file.relPath });
      reporter.info(`${file.action === "create" ? "+" : "~"} ${file.relPath}`);
    }
    reporter.result({
      recipe: recipe.name,
      resource: resource.name,
      dryRun,
      files,
      injections: ctx.injections || [],
    });
    reporter.success(
      dryRun
        ? `Dry run — ${files.length} file(s) would change`
        : `Generated ${resource.name} — ${files.length} file(s)`,
    );
  } catch (err) {
    reporter.error(err.message);
    reporter.result({ error: err.message });
    reporter.flush();
    process.exitCode =
      err.name === "BlueprintLoadError" || err.name === "RecipeLoadError"
        ? 1
        : 2;
    return;
  }
  reporter.flush();
}
