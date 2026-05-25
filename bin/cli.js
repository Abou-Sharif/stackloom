#!/usr/bin/env node

import { program } from "commander";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
);

// Branding — the CLI's own identity (rebrandable via branding.json / `loom rename`)
import { branding } from "../src/branding/index.js";

// Import commands
import init from "../src/commands/init.js";
import generateModule from "../src/commands/generate/module.js";
import generatePage from "../src/commands/generate/page.js";
import generateTheme from "../src/commands/generate/theme.js";
import generateDeploy from "../src/commands/generate/deploy.js";
import remove from "../src/commands/remove.js";
import wizard from "../src/commands/wizard.js";
import customize from "../src/commands/customize.js";
import cleanup from "../src/commands/cleanup.js";
import finalize from "../src/commands/finalize.js";
import rollback from "../src/commands/rollback.js";
import doctor from "../src/commands/doctor.js";
import preset from "../src/commands/preset.js";
import makeResource from "../src/commands/make/resource.js";
import generateResource from "../src/commands/generate-resource.js";
import check from "../src/commands/check.js";
import validateCmd from "../src/commands/validate.js";
import usageCmd from "../src/commands/usage.js";
import env from "../src/commands/env.js";
import rename from "../src/commands/rename.js";
import upgrade from "../src/commands/upgrade.js";
import backupCmd from "../src/commands/backup.js";
import addFieldCmd from "../src/commands/add-field.js";
import explainCmd from "../src/commands/explain.js";
import forgeCmd from "../src/commands/forge.js";
import addReportCmd from "../src/commands/add-report.js";
import { completion } from "../src/utils/completion.js";
import scaffoldCmd from "../src/commands/scaffold.js";

// ── AI commands ─────────────────────────────────────────────────────
import aiDescribe from "../src/commands/ai/describe.js";
import aiGenerate from "../src/commands/ai/generate.js";
import aiFix from "../src/commands/ai/fix.js";
import aiChange from "../src/commands/ai/change.js";
import aiFeedback from "../src/commands/ai/feedback.js";
import aiScaffold from "../src/commands/ai/scaffold.js";
import aiConfigure from "../src/commands/ai/configure.js";
import { archLevelIndex } from "../src/commands/ai/index.js";
import { getProjectArch } from "../src/commands/ai/index.js";

program
  .name(branding.binName)
  .description(`${branding.description}\n\nQuick start:\n  loom init <name>              Create a new project\n  loom wizard                   Interactive step-by-step guide\n  loom generate resource <name> Generate a full-stack resource`)
  .version(pkg.version)
  // Global output flags — consumed via reporterFromOptions(program.opts()).
  .option(
    "-q, --quiet",
    "Errors and warnings only (auto-on under CI / when piped)",
  )
  .option("--json", "Structured JSON output for scripts and CI")
  .option("--no-color", "Disable ANSI colour")
  .option("--debug", "Show diagnostic detail")
  .option(
    "-y, --yes",
    "Assume defaults; never prompt (fails fast on missing input)",
  )
  .option(
    "--brief",
    "Less verbose output (e.g. hide per-file lines on generate resource)",
  );

// Init: create fresh project from template (always new copy)
program
  .command("init [project-name]")
  .description("Create a new project from the starter kit template")
  .option(
    "--preset <variant>",
    "Preset: saas|clinic|studio|operations|commerce|custom",
  )
  .option(
    "--theme <theme>",
    "Design theme: executiveBlue|clinicSoft|studioElevated|operationsDense|commerceWarm|violetSanctum|tealFlow|warmNeutral",
  )
  .option(
    "--layout <layout>",
    "Layout: hybridSaas|sidebarWorkspace|topbarPortal|rightRailStudio",
  )
  .option("--brand-name <name>", "Brand name")
  .option("--tagline <text>", "Brand tagline")
  .option(
    "--extra-modules <list>",
    "Comma-separated backend modules to include (e.g., users,products)",
  )
  .option(
    "--deploy-targets <list>",
    "Comma-separated deploy targets (docker,vercel,railway)",
  )
  .option(
    "--architecture <level>",
    "Architecture: lightweight|moderate|advanced",
  )
  .option("--scenario <name>", "Auto-scaffold a scenario preset after init: parking|payroll|inventory|booking|delivery")
  .option("--no-install", "Skip pnpm install")
  .option("--target <dir>", "Output directory")
  .option(
    "--force",
    "Overwrite existing directory or continue past validation errors",
  )
  .option(
    "--local-template <path>",
    "Use a local directory as the template source (skips download)",
  )
  .option(
    "--template <name>",
    "Template key from config/templates.json (default: mern)",
  )
  .action((projectName, options) =>
    // FIX: global flags like --quiet live on program.opts(); merge them into
    // the command-level options so init.js sees a single options object.
    init(projectName, { ...program.opts(), ...options }),
  );

// Generate commands (inside existing project)
const generateCmd = program
  .command("generate")
  .description("Add features to existing project");

// Unified, engine-backed generation — blueprint + recipe + transactional pipeline.
const resourceOptions = (cmd) =>
  cmd
    .option("--fields <spec>", "Field spec: 'name:type:rules;...'")
    .option("--file <path>", "Path to a resource definition file")
    .option(
      "--recipe <name>",
      "Recipe to run: resource|module|page",
      "resource",
    )
    .option(
      "--architecture <level>",
      "Architecture: lightweight|moderate|advanced",
      "moderate",
    )
    .option("--with-tests", "Generate test files")
    .option("--no-frontend", "Skip frontend generation")
    .option(
      "--interactive",
      "Prompt interactively for missing resource details",
    )
    .option("--dry-run", "Preview the file plan without writing")
    .option("--preview", "Show estimated file count, time, and planned files before generating")
    .option(
      "--relations <spec>",
      "Virtual hasMany: virtualField:hasMany:ChildModel:foreignKeyOnChild (repeat with ;)",
    )
    .option(
      "--amend",
      "Update an existing resource; merge --fields, preserve custom code zones",
    )
    .option(
      "--remove-fields <list>",
      "Remove fields by name on amend (comma-separated)",
    )
    .option(
      "--force",
      "On amend, overwrite files without AUTO-GENERATED markers / custom zone",
    )
    .option(
      "--crud <mode>",
      "CRUD scope: full|insert-only (default: full)",
      "full",
    )
    .option(
      "--form-mode <mode>",
      "Form display mode: page|modal|sidepanel|inline (default: project default or page)",
    );

resourceOptions(
  generateCmd
    .command("resource [name]")
    .description(
      "Generate a full-stack resource via the engine (recipe-driven, transactional, validated)",
    ),
).action((name, options) =>
  generateResource(options.recipe || "resource", name, {
    ...program.opts(),
    ...options,
  }),
);

// Alias: loom resource sync <Name> === generate resource <Name> --amend
const resourceCmd = program
  .command("resource")
  .description("Resource lifecycle helpers");

resourceOptions(
  resourceCmd
    .command("sync <name>")
    .description(
      "Amend an existing resource (merge fields, preserve custom zones) — alias for generate resource --amend",
    ),
).action((name, options) =>
  generateResource("resource", name, {
    ...program.opts(),
    ...options,
    amend: true,
  }),
);

resourceCmd
  .command("add-field <name> [field-spec]")
  .description(
    "Add a single field to an existing resource (delegates to amend pipeline, preserves custom zones)",
  )
  .option(
    "--interactive",
    "Prompt interactively for the field to add",
  )
  .option(
    "--force",
    "Overwrite files without AUTO-GENERATED markers / custom zone",
  )
  .action((name, fieldSpec, options) =>
    addFieldCmd(name, fieldSpec, { ...program.opts(), ...options }),
  );

generateCmd
  .command("module <name>")
  .description(
    "Generate backend module (model, service, controller, routes, validator)",
  )
  .option("--force", "Overwrite existing files")
  .option("--fields <spec>", "Field specification")
  .option("--interactive", "Prompt for fields interactively")
  .option(
    "--architecture <level>",
    "Architecture: lightweight|moderate|advanced",
    "moderate",
  )
  .option("--with-page", "Generate corresponding frontend page")
  .option(
    "--form-mode <mode>",
    "Form display mode if --with-page: page|modal|sidepanel|inline",
    "page",
  )
  .action(generateModule);

generateCmd
  .command("page <name>")
  .description("Generate frontend page with route and nav entry")
  .option("--route <path>", "Custom route path")
  .option("--no-nav", "Do not add to navigation")
  .option("--icon <name>", "Icon name from lucide-react")
  .option("--force", "Overwrite existing files")
  .option("--with-form", "Generate form component")
  .option(
    "--form-mode <mode>",
    "Form display mode: page|modal|sidepanel|inline",
    "page",
  )
  .option("--form-fields <spec>", "Form field specification")
  .option("--interactive", "Prompt for form fields interactively")
  .action(generatePage);

generateCmd
  .command("theme")
  .description("Import a shadcn/ui theme from CSS variables")
  .option("--file <path>", "Path to CSS file with :root/.dark")
  .option("--paste <css>", "CSS string directly")
  .option("--fallback <theme>", "Fallback theme (default: calmBlue)")
  .option("--appearance <recipe>", "Appearance: elevated|flat|ux-heavy")
  .option("--apply", "Update app-preset.js automatically")
  .action(generateTheme);

generateCmd
  .command("deploy")
  .description("Generate deployment configs (Docker, Vercel, Railway)")
  .option("--target <provider>", "Target: docker|vercel|railway|all")
  .option("--force", "Overwrite existing files")
  .action(generateDeploy);

// Remove generated resources (safe, with confirmation)
program
  .command("remove <type> <name>")
  .description("Remove a generated page or module (with cleanup)")
  .option("--force", "Skip confirmation")
  .action(remove);

// Cleanup: remove demo files, strip branding, prepare for deployment
program
  .command("cleanup [preset]")
  .description("Clean up / de-brand the project (minimal|production|template)")
  .action((preset) => cleanup(preset));

// Interactive wizard — guided setup after init or anytime
program
  .command("wizard")
  .description("Interactive guide to extend your project")
  .option("--skip-confirm", "Skip final confirmation step")
  .action(wizard);

// Customize existing project: theme/layout/brand/data
const customizeCmd = program
  .command("customize")
  .description("Customize project design & branding");

// ── Theme subcommand group ──
const themeCmd = customizeCmd.command("theme").description("Theme operations");
themeCmd
  .command("set [theme]")
  .description("Switch to a built-in theme")
  .action(customize.customizeThemeSet);
themeCmd
  .command("import")
  .description("Import a custom shadcn/ui theme from CSS")
  .option("--file <path>", "Path to CSS file with :root and .dark")
  .option("--paste <css>", "CSS string directly")
  .option("--fallback <theme>", "Fallback theme (default: calmBlue)")
  .option("--appearance <recipe>", "Appearance recipe (default: quiet)")
  .action(customize.customizeThemeImport);

// ── Preset subcommands ──
const presetCmd = themeCmd.command("preset").description("shadcn preset operations");
presetCmd
  .command("apply <code>")
  .description("Resolve and apply a shadcn preset code (e.g. a2r6bw)")
  .option("--fallback <theme>", "Fallback theme (default: calmBlue)")
  .option("--appearance <recipe>", "Appearance recipe (default: quiet)")
  .option("--save <name>", "Save as a local preset after applying")
  .action(customize.customizeThemePresetApply);
presetCmd
  .command("save <name>")
  .description("Save the current imported theme as a named preset")
  .action(customize.customizeThemePresetSave);
presetCmd
  .command("list")
  .description("List locally saved theme presets")
  .action(customize.customizeThemePresetList);
presetCmd
  .command("open")
  .description("Open shadcn/create in browser to build a custom preset")
  .action(customize.customizeThemePresetOpen);

// ── Layout ──
const layoutCmd = customizeCmd
  .command("layout")
  .description("Layout operations");
layoutCmd
  .command("set [layout]")
  .description("Switch layout shell")
  .action(customize.customizeLayoutSet);

// ── Brand ──
const brandCmd = customizeCmd.command("brand").description("Brand operations");
brandCmd
  .command("set")
  .description("Update brand name and/or tagline")
  .option("--name <text>", "New brand name")
  .option("--tagline <text>", "New tagline")
  .action(customize.customizeBrandSet);

// ── Data display ──
const dataCmd = customizeCmd
  .command("data")
  .description("Data display template operations");
dataCmd
  .command("set [template]")
  .description("Switch data display template")
  .action(customize.customizeDataSet);

// ── UI variants ──
const uiCmd = customizeCmd
  .command("ui")
  .description("UI component variant operations");
uiCmd
  .command("set [variant]")
  .description("Switch card, modal, select, and pagination styles")
  .action(customize.customizeUiSet);

// ── Font ──
const fontCmd = customizeCmd
  .command("font")
  .description("Font operations");
fontCmd
  .command("set [font]")
  .description("Set body and heading fonts (Google Fonts auto-import)")
  .option("--heading <font>", "Heading font name (defaults to body font)")
  .action(customize.customizeFontSet);
fontCmd
  .command("list")
  .description("List available font presets")
  .action(customize.customizeListFonts);

// ── Custom CSS ──
customizeCmd
  .command("css")
  .description("Inject custom CSS rules (appended to custom.css and imported in globals.css)")
  .option("--file <path>", "Path to CSS file with rules to inject")
  .option("--css <rules>", "CSS rules string directly")
  .action(customize.customizeCssSet);

// ── Component ──
const componentCmd = customizeCmd
  .command("component")
  .description("Component layout variant operations");
componentCmd
  .command("set <component> [variant]")
  .description("Switch a component to a specific layout variant (overwrites the component file)")
  .action(customize.customizeComponentSet);
componentCmd
  .command("list")
  .description("List all components and their available layout variants")
  .action(customize.customizeComponentList);

// ── Discovery helpers ──
customizeCmd
  .command("list-themes")
  .description("List available built-in themes")
  .action(customize.customizeListThemes);
customizeCmd
  .command("list-layouts")
  .description("List available layout shells")
  .action(customize.customizeListLayouts);
customizeCmd
  .command("list-data")
  .description("List available data display templates")
  .action(customize.customizeListData);
customizeCmd
  .command("list-ui")
  .description("List available UI variant presets")
  .action(customize.customizeListUi);
customizeCmd
  .command("list-fonts")
  .description("List available font presets")
  .action(customize.customizeListFonts);

// Finalize
program
  .command("finalize")
  .description("Prepare project for production (lint, test, build)")
  .action(finalize);

// Rollback
program
  .command("rollback")
  .description("Undo the last generation action")
  .option("-f, --force", "Skip confirmation")
  .option("-v, --verbose", "Show detailed logs")
  .action(rollback);

// Doctor
program
  .command("doctor")
  .description("Check environment and project health")
  .action(doctor);

// Check — structural health: Node, blueprint validity, anchor integrity, env file
program
  .command("check")
  .description("Verify project + environment health (blueprint, anchors, env)")
  .action((options) => check({ ...program.opts(), ...options }));

// Upgrade — CLI vs blueprint / template compatibility
program
  .command("upgrade")
  .description(
    "Check CLI vs project blueprint and template metadata; pass --write to apply full template upgrade.",
  )
  .option(
    "--write",
    "Upgrade project to latest template: adds new files, updates contract files, merges deps",
  )
  .option(
    "--dry-run",
    "Preview upgrade changes without writing anything",
  )
  .option(
    "--force",
    "Overwrite files that have manual edits outside safe zones",
  )
  .action((options) => upgrade({ ...program.opts(), ...options }));

// Backup — manage upgrade backups
const backupGroup = program
  .command("backup")
  .description("Manage upgrade backups");

backupGroup
  .command("list")
  .description("List available upgrade backups")
  .action(() => backupCmd("list", null, program.opts()));

backupGroup
  .command("restore <id>")
  .description("Restore project from a backup")
  .option("-f, --force", "Skip confirmation")
  .action((id, options) => backupCmd("restore", id, { ...program.opts(), ...options }));

// Forge — hidden exam scaffold (session auth, exam structure)
program
  .command("forge", { hidden: true })
  .description("Setup project structure")
  .option("--first-name <name>", "Student first name")
  .option("--last-name <name>", "Student last name")
  .option("--module-name <name>", "Module/system name")
  .option("--db-name <name>", "Database name")
  .option("--no-seed", "Skip admin user seed")
  .action((options) => forgeCmd({ ...program.opts(), ...options }));

// Explain — project structure overview
program
  .command("explain")
  .description("Show an overview of the project: resources, routes, modules, theme, auth, and env")
  .action((options) => explainCmd({ ...program.opts(), ...options }));

// Scaffold — generate a complete scenario preset (parking, payroll, etc.)
program
  .command("scaffold <scenario>")
  .description("Generate a complete scenario preset: parking|payroll|inventory|booking|delivery")
  .option("--force", "Overwrite existing files")
  .action((scenario, options) => scaffoldCmd(scenario, { ...program.opts(), ...options }));

// ── AI command group ────────────────────────────────────────────────
const aiCmd = program
  .command("ai")
  .description("AI-powered code generation and project assistance");

// Commands tagged with _minArch for tiered help display
aiCmd
  .command("describe <description>")
  .description("Describe what you want in plain English — get a StackLoom spec back")
  .option("-o, --output <path>", "Write spec JSON to a file")
  .action((description, options) =>
    aiDescribe(description, { ...program.opts(), ...options }),
  );
aiCmd.commands.at(-1)._minArch = "lightweight";

aiCmd
  .command("generate [resource-name] [description]")
  .description("Generate a real resource from a natural-language description")
  .option("--arch <level>", "Architecture: lightweight|moderate|advanced")
  .option("--no-frontend", "Skip frontend generation")
  .option("--crud <mode>", "CRUD scope: full|insert-only")
  .option("--form-mode <mode>", "Form mode: page|modal|sidepanel|inline")
  .action((resourceName, description, options) =>
    aiGenerate(resourceName, description, { ...program.opts(), ...options }),
  );
aiCmd.commands.at(-1)._minArch = "moderate";

aiCmd
  .command("fix <resource-name> <issue>")
  .description("Tell StackLoom what's wrong — it diagnoses and fixes the resource")
  .action((resourceName, issue, options) =>
    aiFix(resourceName, issue, { ...program.opts(), ...options }),
  );
aiCmd.commands.at(-1)._minArch = "moderate";

aiCmd
  .command("change <resource-name> <change-description>")
  .description("Describe a change to an existing resource — StackLoom applies it")
  .action((resourceName, changeDescription, options) =>
    aiChange(resourceName, changeDescription, { ...program.opts(), ...options }),
  );
aiCmd.commands.at(-1)._minArch = "moderate";

aiCmd
  .command("scaffold <description>")
  .description("Design and generate a whole system (multi-resource) from a single description")
  .option("--arch <level>", "Architecture: lightweight|moderate|advanced")
  .option("--no-frontend", "Skip frontend generation")
  .option("--dry-run", "Preview the design without generating")
  .option("-y, --yes", "Skip confirmation prompt")
  .action((description, options) =>
    aiScaffold(description, { ...program.opts(), ...options }),
  );
aiCmd.commands.at(-1)._minArch = "lightweight";

aiCmd
  .command("feedback")
  .description("Rate and review generated code — helps improve future results")
  .option("--rating <number>", "Rating 1-5")
  .option("--msg <text>", "Feedback message")
  .option("--review", "Show all recorded feedback")
  .option("--command <text>", "Command that was run")
  .action((options) => {
    const action = options.review ? "review" : "save";
    aiFeedback(action, { ...program.opts(), ...options });
  });
aiCmd.commands.at(-1)._minArch = "lightweight";

aiCmd
  .command("configure")
  .description("Set up your AI provider (API key, model, URL) — one-time setup")
  .action((options) => aiConfigure({ ...program.opts(), ...options }));
aiCmd.commands.at(-1)._minArch = "lightweight";

// ── Tiered help: show only commands relevant to the project's arch level ──
const ARCH_LABELS = {
  lightweight: "LIGHTWEIGHT — start here:",
  moderate: "MODERATE — growing projects:",
  advanced: "ADVANCED — full control:",
};
const ARCH_DESCS = {
  lightweight: "  High-level commands to describe, scaffold, and give feedback.\n",
  moderate: "  Add, fix, and change resources with precision.\n",
  advanced: "  Every command available.\n",
};

const origHelpInfo = aiCmd.helpInformation.bind(aiCmd);
aiCmd.helpInformation = function () {
  const activeArch = getProjectArch();
  const activeIdx = archLevelIndex(activeArch);
  const activeCommands = this.commands.filter((cmd) => {
    if (cmd.name() === "help") return false;
    const minIdx = archLevelIndex(cmd._minArch || "lightweight");
    return minIdx <= activeIdx;
  });

  const groups = { lightweight: [], moderate: [], advanced: [] };
  for (const cmd of activeCommands) {
    groups[cmd._minArch || "lightweight"].push(cmd);
  }

  const lines = [
    `Usage: loom ai [options] [command]\n`,
    `AI-powered code generation and project assistance\n`,
    `Project architecture: ${activeArch.toUpperCase()}\n`,
  ];

  const tiers = ["lightweight", "moderate", "advanced"];
  for (const tier of tiers) {
    const cmds = groups[tier];
    if (!cmds.length) continue;
    lines.push(`  ${ARCH_LABELS[tier]}`);
    lines.push(ARCH_DESCS[tier]);
    for (const cmd of cmds) {
      const name = cmd.name();
      const desc = cmd.description();
      lines.push(`    ${name.padEnd(18)}${desc}`);
    }
    lines.push("");
  }

  lines.push("Options:");
  lines.push("  -h, --help  display help for command");
  return lines.join("\n");
};

// Validate — project audit against an exam or scenario checklist
program
  .command("validate <scenario>")
  .description("Audit project against a scenario/exam checklist (parking|payroll|inventory|booking|delivery)")
  .action(async (scenario, options) => {
    await validateCmd(scenario, { ...program.opts(), ...options });
  });

// Usage — write CLI_USAGE.md to project root
program
  .command("usage")
  .description("Write CLI_USAGE.md reference to the project root")
  .action(async (options) => {
    await usageCmd({ ...program.opts(), ...options });
  });

// Add-report — aggregation pipeline report generator
const reportCmd = program
  .command("add-report [name]")
  .description("Generate an aggregation pipeline report with backend API and frontend page")
  .option("--model <name>", "Mongoose model name (PascalCase)")
  .option("--title <text>", "Human-readable report title")
  .option("--description <text>", "Report description")
  .option("--group-by <field>", "Group by field")
  .option("--agg-fn <fn>", "Aggregation function: sum|count|avg|min|max")
  .option("--agg-field <name>", "Result field name (e.g. total)")
  .option("--agg-target <field>", "Aggregate on field")
  .option("--sort-by <field>", "Sort by field")
  .option("--sort-order <order>", "Sort order: asc|desc", "desc")
  .option("--interactive", "Prompt for all report details")
  .option("--no-frontend", "Skip frontend generation")
  .action((name, options) => addReportCmd(name, { ...program.opts(), ...options }));

// Env — keep .env in sync with .env.example
program
  .command("env")
  .description("Diff .env against .env.example; --sync appends missing keys")
  .option("--sync", "Append missing keys to .env")
  .action((options) => env({ ...program.opts(), ...options }));

// Preset
program
  .command("preset [name]")
  .description("Apply a predefined configuration preset (saas, clinic, etc.)")
  .action(preset);

// Make Resource
program
  .command("make:resource [name]")
  .description("Create a new resource from schema or interactive wizard")
  .option("-f, --file <path>", "Path to resource definition file")
  .option("--fields <spec>", "Field specification (name:type:rules;...)")
  .option("-i, --interactive", "Run interactive wizard")
  .option("--dry-run", "Preview changes without writing")
  .option("--force", "Overwrite existing files")
  .option(
    "--architecture <level>",
    "Architecture: lightweight|moderate|advanced",
    "moderate",
  )
  .option("--no-frontend", "Skip frontend generation")
  .option("--with-tests", "Generate test files")
  .action(makeResource);

// Rename: rebrand the CLI tool itself
program
  .command("rename <new-name>")
  .description("Rebrand this CLI — change the command name used to invoke it")
  .option("--display-name <name>", "Human-readable display name")
  .option("--description <text>", "CLI description shown in help")
  .action(rename);

// Completion: generate shell completion scripts
program
  .command("completion [shell]")
  .description("Generate shell completion script (bash|zsh)")
  .action((shell) => {
    const s = shell || "bash";
    console.log(completion(s));
  });

program.parse();
