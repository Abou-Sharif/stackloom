import inquirer from "inquirer";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAiConfig,
  callLlm,
  parseJsonResponse,
  getProjectArch,
  hasAiConfig,
} from "./index.js";
import { reporterFromOptions } from "../../services/index.js";
import generateResource from "../generate-resource.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ROOT = path.resolve(__dirname, "..", "..", "..");

const SCENARIO_TYPES = [
  { name: "E-commerce (products, orders, customers)", value: "ecommerce" },
  { name: "Clinic / Healthcare (patients, appointments, doctors)", value: "clinic" },
  { name: "Task / Project management (projects, tasks, users)", value: "task-management" },
  { name: "Inventory / Warehouse (products, stock, suppliers)", value: "inventory" },
  { name: "Booking / Reservation (services, bookings, customers)", value: "booking" },
  { name: "Content management (articles, authors, categories)", value: "cms" },
  { name: "Finance / Accounting (transactions, accounts, invoices)", value: "finance" },
  { name: "HR / Payroll (employees, departments, timesheets)", value: "hr" },
  { name: "Education (courses, students, enrollments)", value: "education" },
  { name: "Real estate (properties, tenants, leases)", value: "real-estate" },
  { name: "Custom / Other", value: "custom" },
];

function loadBlueprintPrompt() {
  const bundled = path.join(CLI_ROOT, "src", "commands", "ai", "prompts", "master-prompt-blueprint.md");
  const cwdPrompt = path.join(process.cwd(), ".loom", "ai", "master-prompt-blueprint.md");
  const file = fs.existsSync(cwdPrompt) ? cwdPrompt : bundled;
  return fs.readFileSync(file, "utf-8");
}

function loadOrCreateChecklist(blueprintName) {
  const dir = path.join(process.cwd(), ".loom", "ai", "blueprints");
  const file = path.join(dir, `${blueprintName}-checklist.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  }
  return null;
}

function loadOrCreateBlueprint(blueprintName) {
  const dir = path.join(process.cwd(), ".loom", "ai", "blueprints");
  const file = path.join(dir, `${blueprintName}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  }
  return null;
}

function saveChecklist(blueprintName, checklist) {
  const dir = path.join(process.cwd(), ".loom", "ai", "blueprints");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${blueprintName}-checklist.json`),
    JSON.stringify(checklist, null, 2) + "\n",
    "utf-8",
  );
}

export default async function aiBlueprint(options = {}) {
  const reporter = reporterFromOptions(options);

  if (!hasAiConfig()) {
    reporter.error(
      "AI is not configured.\nRun:  loom ai configure\nOr set:  export STACKLOOM_AI_API_KEY=your-key",
    );
    reporter.result({ error: "AI not configured" });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  // ── Status mode: show checklist progress ──
  if (options.status) {
    const checklist = loadOrCreateChecklist(options.status);
    if (!checklist) {
      reporter.error(`No blueprint found with slug "${options.status}".`);
      reporter.info("Check .loom/ai/blueprints/ for available blueprints.");
      reporter.result({ error: "Blueprint not found" });
      reporter.flush();
      process.exitCode = 1;
      return;
    }
    const total = checklist.length;
    const done = checklist.filter((c) => c.status === "completed").length;
    const pending = checklist.filter((c) => c.status === "pending").length;
    console.log(`\nBlueprint: ${options.status}`);
    console.log(`Progress: ${done}/${total} resources generated\n`);
    for (const entry of checklist) {
      const icon = entry.status === "completed" ? "✓" : "○";
      const deps = entry.dependsOn?.length ? ` (depends on: ${entry.dependsOn.join(", ")})` : "";
      console.log(`  ${icon} ${entry.resource}${deps}`);
    }
    console.log("");
    reporter.result({ slug: options.status, total, done, pending });
    reporter.flush();
    return;
  }

  // ── Resume mode: continue from a saved blueprint ──
  if (options.resume) {
    const blueprint = loadOrCreateBlueprint(options.resume);
    if (!blueprint) {
      reporter.error(`No blueprint found with slug "${options.resume}".`);
      reporter.result({ error: "Blueprint not found" });
      reporter.flush();
      process.exitCode = 1;
      return;
    }
    const checklist = loadOrCreateChecklist(options.resume);
    const resources = blueprint.resources || [];
    const slug = options.resume;
    await generateFromBlueprint(blueprint, resources, checklist, slug, options, reporter);
    reporter.flush();
    return;
  }

  try {
    // ── Interactive questionnaire ──
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "systemDescription",
        message: "What system are you building? Describe it in a sentence:",
        validate: (v) => (v ? true : "Description is required"),
      },
      {
        type: "list",
        name: "scenario",
        message: "What type of system is this?",
        choices: SCENARIO_TYPES,
        default: "custom",
      },
      {
        type: "input",
        name: "entities",
        message: "What entities / models does it need? (comma-separated, e.g. User, Product, Order)\n  Leave blank if unsure — the AI will figure it out:",
      },
      {
        type: "input",
        name: "businessRules",
        message: "Any business rules or constraints? (e.g. 'orders can have multiple products', 'users must have unique email')\n  Leave blank if none:",
      },
      {
        type: "list",
        name: "arch",
        message: "Architecture level:",
        choices: [
          { name: "Lightweight — minimal files, fast to start", value: "lightweight" },
          { name: "Moderate — full MERN layers (model, controller, routes)", value: "moderate" },
          { name: "Advanced — enterprise with services, DTOs, tests", value: "advanced" },
        ],
        default: getProjectArch(),
      },
      {
        type: "confirm",
        name: "proceed",
        message: "Ready to design the system with AI?",
        default: true,
      },
    ]);

    if (!answers.proceed) {
      reporter.info("Blueprint cancelled.");
      reporter.result({ cancelled: true });
      reporter.flush();
      return;
    }

    // ── Build prompt ──
    const master = loadBlueprintPrompt();
    const config = getAiConfig();
    const entities = answers.entities
      ? answers.entities.split(",").map((e) => e.trim()).filter(Boolean)
      : ["auto-detect"];

    const prompt = `${master}

## User Input

### System Description
${answers.systemDescription}

### Scenario Type
${answers.scenario}

### Entities Needed
${entities.join(", ")}

### Business Rules
${answers.businessRules || "None specified — infer reasonable defaults."}

### Architecture Level
${answers.arch}

## Task
Design a complete multi-resource system based on the above. Output the blueprint JSON.`;

    // ── Call AI ──
    const spinner = ora({
      text: `Designing system with ${config.model}...`,
      spinner: "dots",
      color: "cyan",
    }).start();

    const response = await callLlm(prompt, config);
    spinner.stop();

    const blueprint = parseJsonResponse(response);

    if (blueprint.error) {
      reporter.error(`AI could not design this: ${blueprint.error}`);
      reporter.result({ error: blueprint.error });
      reporter.flush();
      process.exitCode = 1;
      return;
    }

    const resources = blueprint.resources || [];
    const checklist = blueprint.checklist || resources.map((r) => ({
      resource: r.name,
      status: "pending",
      dependsOn: [],
    }));

    // ── Show blueprint ──
    const name = blueprint.name || answers.systemDescription;
    reporter.info(`\n=== Blueprint: ${name} ===`);
    reporter.info(`Scenario: ${blueprint.scenario || answers.scenario}`);
    if (blueprint.description) reporter.info(`Description: ${blueprint.description}`);
    reporter.info(`Architecture: ${(blueprint.architecture || answers.arch).toUpperCase()}`);
    reporter.info(`Resources: ${resources.length}`);

    console.log("\n" + JSON.stringify(blueprint, null, 2) + "\n");

    // ── Confirm generation ──
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Generate all resources now?",
        default: true,
      },
    ]);

    if (!confirm) {
      // Save blueprint for later reference
      const saveDir = path.join(process.cwd(), ".loom", "ai", "blueprints");
      fs.mkdirSync(saveDir, { recursive: true });
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      fs.writeFileSync(
        path.join(saveDir, `${slug}.json`),
        JSON.stringify(blueprint, null, 2) + "\n",
        "utf-8",
      );
      saveChecklist(slug, checklist);
      reporter.info(`Blueprint saved to .loom/ai/blueprints/${slug}.json`);
      reporter.info(`Run:  loom ai blueprint --resume ${slug}  to continue later`);
      reporter.result({ saved: true, slug, resources: resources.length });
      reporter.flush();
      return;
    }

    // ── Generate resources ──
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await generateFromBlueprint(blueprint, resources, checklist, slug, { ...options, arch: answers.arch }, reporter);

  } catch (err) {
    reporter.error(err.message);
    reporter.result({ error: err.message });
    process.exitCode = 1;
  }
  reporter.flush();
}

async function generateFromBlueprint(blueprint, resources, checklist, slug, options, reporter) {
  const generated = [];
  const failed = [];
  const sorted = topologicalSort(resources, checklist);

  for (const res of sorted) {
    const fields = (res.fields || []).map(toFieldSpec).join(";");
    const relations = toRelationsSpec(res);

    try {
      const prevCi = process.env.CI;
      process.env.CI = "true";
      try {
        const genOptions = {
          ...options,
          projectRoot: options.projectRoot || process.cwd(),
          fields: fields || undefined,
          relations: relations || undefined,
          arch: res.options?.arch || options.arch || "lightweight",
          crud: res.options?.crud || "full",
          formMode: res.options?.formMode || "page",
          interactive: false,
          brief: true,
          amend: false,
          force: false,
        };

        await generateResource("resource", res.name, genOptions);
        generated.push(res.name);

        const entry = checklist.find((c) => c.resource === res.name);
        if (entry) entry.status = "completed";
        saveChecklist(slug, checklist);

        reporter.success(`Generated: ${res.name}`);
      } finally {
        delete process.env.CI;
      }
    } catch (err) {
      failed.push({ name: res.name, error: err.message });
      reporter.error(`Failed: ${res.name} — ${err.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  reporter.info("BLUEPRINT COMPLETE");
  console.log("=".repeat(50));
  reporter.success(`Generated: ${generated.length}/${resources.length} resources`);

  if (generated.length > 0) {
    console.log("\nGenerated:");
    generated.forEach((r) => console.log(`  ✓ ${r}`));
  }

  if (failed.length > 0) {
    console.log("\nFailed:");
    failed.forEach((r) => console.log(`  ✗ ${r.name}: ${r.error}`));
  }

  saveChecklist(slug, checklist);
  reporter.info(`\nChecklist saved to .loom/ai/blueprints/${slug}-checklist.json`);
  reporter.info(`Run:  loom ai blueprint --status ${slug}  to see progress`);

  reporter.result({
    blueprint: slug,
    total: resources.length,
    generated: generated.length,
    failed: failed.length,
    failedList: failed,
  });
}

// ── Helpers (duplicated from generate.js to keep blueprint self-contained) ──

function toFieldSpec(field) {
  const rules = [];
  const v = field.validation || {};
  if (v.required) rules.push("required");
  if (v.unique) rules.push("unique");
  if (v.minLength != null) rules.push(`minLength=${v.minLength}`);
  if (v.maxLength != null) rules.push(`maxLength=${v.maxLength}`);
  if (v.min != null) rules.push(`min=${v.min}`);
  if (v.max != null) rules.push(`max=${v.max}`);
  if (v.pattern) rules.push(`pattern=${v.pattern}`);
  const isRef = field.type === "ref" || field.type === "reference";
  const refModel = field.special?.model;
  if (isRef && refModel) {
    const base = `${field.name}:ref[${refModel}]`;
    return rules.length ? `${base}:${rules.join("|")}` : base;
  }
  const isSelect = field.type === "select" || field.type === "multiselect";
  if (isSelect && field.special?.options) {
    const base = `${field.name}:${field.type}[${field.special.options.join(",")}]`;
    return rules.length ? `${base}:${rules.join("|")}` : base;
  }
  return rules.length
    ? `${field.name}:${field.type}:${rules.join("|")}`
    : `${field.name}:${field.type}`;
}

function toRelationsSpec(resource) {
  const parts = [];
  const seen = new Set();
  const rel = resource.relations || {};
  if (Array.isArray(rel.belongsTo)) {
    for (const bt of rel.belongsTo) {
      const key = `bt:${bt.field}:${bt.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        parts.push(`${bt.field}:belongsTo:${bt.model}`);
      }
    }
  }
  if (Array.isArray(rel.hasMany)) {
    for (const hm of rel.hasMany) {
      const key = `hm:${hm.field}:${hm.model}:${hm.foreignKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        parts.push(`${hm.field}:hasMany:${hm.model}:${hm.foreignKey}`);
      }
    }
  }
  return parts.join(";");
}

function topologicalSort(resources, checklist) {
  const done = new Set();
  const ordered = [];
  const remaining = [...resources];

  while (remaining.length > 0) {
    let progress = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const res = remaining[i];
      const entry = checklist.find((c) => c.resource === res.name);
      const deps = entry?.dependsOn || [];
      if (deps.every((d) => done.has(d) || !resources.find((r) => r.name === d))) {
        ordered.push(res);
        done.add(res.name);
        remaining.splice(i, 1);
        progress = true;
      }
    }
    if (!progress) {
      ordered.push(...remaining);
      break;
    }
  }
  return ordered;
}
