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
import { readFileSync } from "node:fs";
import {
  ResourceDefinition,
  parseFieldSpec,
  parseRelationsSpec,
} from "../core/resource-definition.js";

function projectDefaultFormMode() {
  try {
    const bpPath = path.join(process.cwd(), ".loom", "blueprint.json");
    const bp = JSON.parse(readFileSync(bpPath, "utf-8"));
    if (bp.defaults?.formMode) return bp.defaults.formMode;
  } catch {}
  return null;
}
import {
  mergeFieldLists,
  removeFieldsFromList,
  serializeResourceSnapshot,
} from "../core/amend-merge.js";
import { StateTracker } from "../core/state-tracker.js";
import { TemplateLoader } from "../core/template-loader.js";
import { blueprintLoader } from "../blueprint/index.js";
import { recipeLoader } from "../recipes/index.js";
import { createGenerationPipeline } from "../engine/index.js";
import { reporterFromOptions } from "../services/index.js";
import {
  validateGenerateOptions,
  validateResourceDefinition,
} from "../schemas/index.js";
import { existsSync } from "node:fs";

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
async function resolveResource(name, options, projectRoot) {
  const pascalName = NAMING.pascal(name);
  const tracker = new StateTracker(projectRoot);
  let raw;

  if (options.amend && options.file) {
    const mod = await import(path.resolve(projectRoot, options.file));
    raw = mod.default || mod;
    if (raw == null || typeof raw !== "object") {
      throw new Error("Resource module must export a default object");
    }
    raw = { ...raw, name: raw.name || pascalName };
  } else if (options.amend) {
    const stored = await tracker.loadResourceDefinition(pascalName);
    const hasFields = Boolean(options.fields && String(options.fields).trim());
    const removeNames = parseRemoveFieldsList(options.removeFields);

    if (!stored && !hasFields && removeNames.length === 0) {
      throw new Error(
        `No stored definition for ${pascalName} (.loom/resources/). Run generate first, or pass --fields / --file.`,
      );
    }

    raw = stored ? { ...stored, name: stored.name || pascalName } : { name: pascalName, fields: [] };

    if (hasFields) {
      const incoming = [];
      for (const spec of String(options.fields).split(";").map((s) => s.trim()).filter(Boolean)) {
        const f = parseFieldSpec(spec);
        if (!f) {
          throw new Error(
            `Invalid field spec "${spec}". Use name:type[opts]:rules (see CLI_USAGE.md).`,
          );
        }
        incoming.push(f);
      }
      raw.fields = mergeFieldLists(raw.fields || [], incoming);
    }

    if (removeNames.length) {
      raw.fields = removeFieldsFromList(raw.fields || [], removeNames);
    }
  } else if (options.file) {
    const mod = await import(path.resolve(projectRoot, options.file));
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
    raw = { name: pascalName, fields };
  }

  if (options.relations && String(options.relations).trim()) {
    const parsedRel = parseRelationsSpec(String(options.relations).trim());
    raw.relations = raw.relations || {};
    const existing = Array.isArray(raw.relations.hasMany)
      ? raw.relations.hasMany
      : [];
    raw.relations.hasMany = [...existing, ...parsedRel.hasMany];
  }

  const validated = validateResourceDefinition(raw);
  if (!validated.success) {
    throw new Error(
      `Invalid resource definition:\n  - ${validated.issues.join("\n  - ")}`,
    );
  }
  return new ResourceDefinition(validated.data);
}

function parseRemoveFieldsList(spec) {
  if (!spec || typeof spec !== "string") return [];
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ensure the backend model exists before `--amend`. */
function assertAmendTargetExists(projectRoot, blueprint, resource) {
  const modulesRoot = blueprint.resolvePath("backend.modules", projectRoot);
  const modelAbs = path.join(
    modulesRoot,
    resource.kebabName,
    "models",
    `${resource.name}.js`,
  );
  if (!existsSync(modelAbs)) {
    throw new Error(
      `Resource ${resource.name} was not found at ${path.relative(projectRoot, modelAbs)}. Generate it first (without --amend).`,
    );
  }
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
        validate: (value) => {
          if (!value) return true;
          try { new RegExp(value); return true; }
          catch (e) { return `Invalid regex: ${e.message}`; }
        },
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

/** Interactive wizard for `--amend` / `loom resource sync`. */
async function promptAmendResource(name, options) {
  const projectRoot = options.projectRoot || process.cwd();
  const pascalName = NAMING.pascal(name);
  const tracker = new StateTracker(projectRoot);
  const stored = await tracker.loadResourceDefinition(pascalName);

  if (!stored?.fields?.length && !stored) {
    throw new Error(
      `No stored definition for ${pascalName} (.loom/resources/). Generate the resource first.`,
    );
  }

  const fieldList = stored.fields || [];
  const addedSpecs = [];
  const removedNames = new Set();
  let relationsSpec = String(options.relations || "").trim();

  let done = false;
  while (!done) {
    const summary =
      fieldList.length === 0
        ? "(no fields yet)"
        : fieldList
            .filter((f) => !removedNames.has(f.name))
            .map((f) => `${f.name}:${f.type}`)
            .join(", ");

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: `Amend ${pascalName} — current fields: ${summary}`,
        choices: [
          { name: "Add or update field(s)", value: "add" },
          { name: "Remove field(s)", value: "remove" },
          { name: "Add hasMany virtual relation(s)", value: "relations" },
          { name: "Apply changes", value: "done" },
        ],
      },
    ]);

    if (action === "done") {
      done = true;
      break;
    }

    if (action === "add") {
      const fields = await askResourceFields();
      addedSpecs.push(...fields.map(serializeFieldSpec));
    }

    if (action === "remove") {
      const remaining = fieldList.filter((f) => !removedNames.has(f.name));
      if (remaining.length === 0) {
        continue;
      }
      const { pick } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "pick",
          message: "Select fields to remove:",
          choices: remaining.map((f) => ({
            name: `${f.name} (${f.type})`,
            value: f.name,
          })),
        },
      ]);
      pick.forEach((n) => removedNames.add(n));
    }

    if (action === "relations") {
      const rel = await askHasManyVirtualRelations();
      if (rel) {
        relationsSpec = relationsSpec ? `${relationsSpec};${rel}` : rel;
      }
    }
  }

  const out = { ...options, name, amend: true };
  if (addedSpecs.length) out.fields = addedSpecs.join(";");
  if (removedNames.size) out.removeFields = [...removedNames].join(",");
  if (relationsSpec) out.relations = relationsSpec;
  return out;
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

  const amendInteractive =
    interactiveOptions.amend &&
    interactiveOptions.interactive &&
    !interactiveOptions.file &&
    !interactiveOptions.fields &&
    !interactiveOptions.removeFields;

  if (amendInteractive) {
    return promptAmendResource(name, interactiveOptions);
  }

  if (!interactiveOptions.amend && !interactiveOptions.file && !interactiveOptions.fields) {
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

  if (!interactiveOptions.crud || interactiveOptions.crud === 'full') {
    const { crud } = await inquirer.prompt([
      {
        type: 'list',
        name: 'crud',
        message: 'CRUD scope:',
        choices: [
          { name: 'Full CRUD — all operations', value: 'full' },
          { name: 'Insert-only — create form, no list/edit/delete', value: 'insert-only' },
        ],
        default: 'full',
      },
    ]);
    interactiveOptions.crud = crud;
  }

  if (!interactiveOptions.formMode) {
    const projectDefault = projectDefaultFormMode();
    const { formMode } = await inquirer.prompt([
      {
        type: "list",
        name: "formMode",
        message: `Form mode${projectDefault ? ` (project default: ${projectDefault})` : ""}:`,
        choices: [
          { name: "Page form", value: "page" },
          { name: "Modal dialog", value: "modal" },
          { name: "Sidepanel / drawer", value: "sidepanel" },
          { name: "Inline form above content", value: "inline" },
        ],
        default: projectDefault || "page",
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

  // Normalise --architecture to internal .arch
  if (executionOptions.architecture && !executionOptions.arch) {
    executionOptions.arch = executionOptions.architecture;
  }

  try {
    const hasExplicitOpts = Boolean(
      executionOptions.fields ||
      executionOptions.file ||
      executionOptions.amend ||
      executionOptions.relations
    );
    if (executionOptions.interactive || (!executionOptions.yes && !hasExplicitOpts)) {
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

    const resource = await resolveResource(name, executionOptions, projectRoot);
    const blueprint = await blueprintLoader.load(projectRoot);

    // Apply project-level default form-mode if not explicitly set
    if (!executionOptions.formMode && blueprint.data.defaults?.formMode) {
      executionOptions.formMode = blueprint.data.defaults.formMode;
    }

    if (executionOptions.amend) {
      assertAmendTargetExists(projectRoot, blueprint, resource);
      reporter.step(`Amending ${resource.name} (preserving custom zones where marked)`);
    }

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
      crud: executionOptions.crud || "full",
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

    const pipeline = createGenerationPipeline({
      renderer,
      amend: Boolean(executionOptions.amend),
      force: Boolean(executionOptions.force),
      resourceName: resource.name,
    });
    const ctx = await pipeline.run({
      projectRoot,
      recipe,
      blueprint,
      recipeContext,
      vars,
      templateContext,
      dryRun: Boolean(executionOptions.dryRun),
      amend: Boolean(executionOptions.amend),
    });

    const { files, dryRun } = ctx.result;
    const creates = files.filter((f) => f.action === "create").length;
    const updates = files.filter((f) => f.action === "update").length;
    reporter.step(`Change set: ${creates} new, ${updates} updated`);

    if (!executionOptions.brief) {
      for (const file of files) {
        reporter.event("file", { action: file.action, path: file.relPath });
        reporter.info(`${file.action === "create" ? "+" : "~"} ${file.relPath}`);
      }
    } else {
      for (const file of files) {
        reporter.event("file", { action: file.action, path: file.relPath });
      }
    }

    reporter.result({
      recipe: recipe.name,
      resource: resource.name,
      amend: Boolean(executionOptions.amend),
      dryRun,
      files,
      injections: ctx.injections || [],
    });

    if (!dryRun) {
      const tracker = new StateTracker(projectRoot);
      const snapshot = serializeResourceSnapshot(resource);
      await tracker.saveResourceDefinition(resource.name, snapshot);
      await tracker.recordEvent({
        action: executionOptions.amend ? "amend" : "generate",
        resource: resource.name,
        definition: snapshot,
        files: files.map((f) => ({
          path: f.relPath,
          action: String(f.action).toUpperCase(),
        })),
      });
    }

    reporter.success(
      dryRun
        ? `Dry run — ${files.length} file(s) would change`
        : executionOptions.amend
          ? `Amended ${resource.name} — ${files.length} file(s) updated`
          : `Generated ${resource.name} — ${files.length} file(s)`,
    );
  } catch (err) {
    reporter.error(err.message);
    reporter.result({ error: err.message });
    reporter.flush();
    process.exitCode =
      err.name === "BlueprintLoadError" ||
      err.name === "RecipeLoadError" ||
      err.name === "AmendMergeError" ||
      err.name === "AmendSafetyError"
        ? 1
        : 2;
    return;
  }
  reporter.flush();
}
