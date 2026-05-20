#!/usr/bin/env node

import inquirer from "inquirer";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import { fileURLToPath } from "url";
import { default as pageGenerator } from "./generate/page.js";
import { default as moduleGenerator } from "./generate/module.js";
import { default as themeGenerator } from "./generate/theme.js";
import { default as deployGenerator } from "./generate/deploy.js";
import { default as removeCommand } from "./remove.js";
import generateResource from "./generate-resource.js";
import addReportCmd from "./add-report.js";
import scaffoldCmd from "./scaffold.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PAGE_ICONS = [
  "layout",
  "settings",
  "users",
  "chart-pie",
  "bell",
  "shield-check",
  "package",
  "wand",
];

const DEPLOY_TARGETS = [
  { name: "Docker — local container workflow", value: "docker" },
  { name: "Vercel — serverless frontend + backend", value: "vercel" },
  { name: "Railway — easy cloud deployment", value: "railway" },
];

const THEME_METHODS = [
  { name: "From a CSS file", value: "file" },
  { name: "Paste CSS directly", value: "paste" },
];

const ACTION_CHOICES = [
  { name: "📦 Add a full-stack resource (fields, routes, pages)", value: "add_resource" },
  { name: "📊 Add an aggregation report", value: "add_report" },
  { name: "🏗️  Scaffold a scenario preset (parking, payroll, etc.)", value: "scaffold" },
  { name: "➕ Add a backend module (deprecated — use resource instead)", value: "add_module" },
  { name: "➕ Add a frontend page", value: "add_page" },
  { name: "🎨 Import a shadcn theme", value: "add_theme" },
  { name: "📦 Generate deploy configs", value: "add_deploy" },
  { name: "🗑️  Remove something", value: "remove" },
  { name: "🔍 Review current plan", value: "review" },
  { name: "✅ Finish and execute plan", value: "done" },
];

function ensureLeadingSlash(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function summarizeStep(step) {
  if (step.type === "generate") {
    const labels = {
      resource: "Full-stack resource",
      report: "Aggregation report",
      scaffold: "Scenario preset",
      module: "Backend module",
      page: "Frontend page",
      theme: "Shadcn theme",
      deploy: "Deploy configs",
    };
    const name = step.name ? ` "${step.name}"` : "";
    const detail =
      step.subtype === "page" && step.options?.route
        ? ` → ${step.options.route}`
        : "";
    const deployDetail =
      step.subtype === "deploy" && step.options?.target
        ? ` → ${step.options.target}`
        : "";
    return `  • Generate ${labels[step.subtype] || step.subtype}${name}${detail}${deployDetail}`;
  }
  if (step.type === "remove") {
    return `  • Remove ${step.resourceType} "${step.name}"`;
  }
  return `  • ${JSON.stringify(step)}`;
}

function printPlan(steps) {
  if (steps.length === 0) {
    console.log(chalk.gray("  (No planned actions yet)"));
    return;
  }
  console.log(chalk.cyan("\n📋 Current plan:"));
  steps.forEach((step) =>
    console.log(
      step.type === "remove"
        ? chalk.yellow(summarizeStep(step))
        : chalk.white(summarizeStep(step)),
    ),
  );
}

export default async function wizardCmd(options) {
  const spinner = ora({ discardStdin: false });
  const projectRoot = process.cwd();

  // Verify we're in a MERN Starter project
  if (!fs.existsSync(path.join(projectRoot, "frontend/src/App.jsx"))) {
    console.log(
      chalk.red(
        "✖  Not a MERN Starter Kit project. Run this inside your project directory.",
      ),
    );
    process.exit(1);
  }

  console.log(chalk.cyan("\n🚀 MERN Starter Kit Wizard"));
  console.log(
    chalk.gray(
      "Interactive guide to extend your project in a step-by-step flow.\n",
    ),
  );

  const steps = [];

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: ACTION_CHOICES,
      },
    ]);

    if (action === "done") {
      break;
    }

    if (action === "review") {
      printPlan(steps);
      continue;
    }

    if (action === "add_resource") {
      const { resourceName } = await inquirer.prompt([
        {
          type: "input",
          name: "resourceName",
          message: "Resource name (e.g. Product, Category, Order):",
          validate: (input) =>
            /^[a-z0-9-_]+$/i.test(input) ||
            "Use only letters, numbers, dashes, underscores",
        },
      ]);

      const { addFields } = await inquirer.prompt([
        {
          type: "confirm",
          name: "addFields",
          message: "Configure fields now?",
          default: true,
        },
      ]);

      let fields = '';
      if (addFields) {
        const { fieldSpec } = await inquirer.prompt([
          {
            type: "input",
            name: "fieldSpec",
            message:
              "Field spec (name:type:rules;...): e.g. name:string:required;price:number;email:email",
            default: 'name:string:required',
          },
        ]);
        fields = fieldSpec;
      }

      steps.push({
        type: "generate",
        subtype: "resource",
        name: resourceName,
        options: { fields, arch: 'moderate', crud: 'full', force: false },
      });
      console.log(chalk.green(`✓ Resource queued: ${resourceName}`));
    }

    if (action === "add_report") {
      const { reportName, model } = await inquirer.prompt([
        {
          type: "input",
          name: "reportName",
          message: "Report name (e.g. sales-summary, user-stats):",
          validate: (input) =>
            /^[a-z0-9-]+$/i.test(input) ||
            "Use only letters, numbers, dashes",
        },
        {
          type: "input",
          name: "model",
          message: "Mongoose model to aggregate (PascalCase):",
          validate: (input) =>
            /^[A-Z][a-zA-Z0-9]*$/.test(input) || "Use PascalCase",
        },
      ]);
      steps.push({
        type: "generate",
        subtype: "report",
        name: reportName,
        options: { model, interactive: true, frontend: true },
      });
      console.log(chalk.green(`✓ Report queued: ${reportName}`));
    }

    if (action === "scaffold") {
      const { scenario } = await inquirer.prompt([
        {
          type: "list",
          name: "scenario",
          message: "Select a scenario preset:",
          choices: [
            { name: "Parking — slots, vehicles, tickets", value: "parking" },
            { name: "Payroll — departments, employees, timesheets, payroll", value: "payroll" },
            { name: "Inventory — categories, products, suppliers, stock", value: "inventory" },
            { name: "Booking — customers, services, bookings", value: "booking" },
            { name: "Delivery — drivers, routes, packages, orders", value: "delivery" },
          ],
        },
      ]);
      steps.push({
        type: "generate",
        subtype: "scaffold",
        name: scenario,
        options: {},
      });
      console.log(chalk.green(`✓ Scenario queued: ${scenario}`));
    }

    if (action === "add_module") {
      const { moduleName, architecture } = await inquirer.prompt([
        {
          type: "input",
          name: "moduleName",
          message: "Module name (e.g. products, invoices, appointments):",
          validate: (input) =>
            /^[a-z0-9-_]+$/i.test(input) ||
            "Use only letters, numbers, dashes, underscores",
        },
        {
          type: "list",
          name: "architecture",
          message: "Architecture level for this module:",
          choices: [
            {
              name: "Lightweight — minimal files and quick setup",
              value: "lightweight",
            },
            {
              name: "Moderate — standard MERN module structure",
              value: "moderate",
            },
            { name: "Advanced — enterprise-ready patterns", value: "advanced" },
          ],
          default: "moderate",
        },
      ]);
      steps.push({
        type: "generate",
        subtype: "module",
        name: moduleName,
        options: { architecture, force: false },
      });
      console.log(chalk.green(`✓ Backend module queued: ${moduleName}`));
    }

    if (action === "add_page") {
      const { pageName } = await inquirer.prompt([
        {
          type: "input",
          name: "pageName",
          message: "Page name (e.g. settings, reports, team):",
          validate: (input) =>
            /^[a-z0-9-_]+$/i.test(input) ||
            "Use only letters, numbers, dashes, underscores",
        },
      ]);

      const defaultRoute = `/${pageName}`;
      const { routeMode } = await inquirer.prompt([
        {
          type: "list",
          name: "routeMode",
          message: "Route path:",
          choices: [
            { name: `Default route (${defaultRoute})`, value: "default" },
            { name: "Custom route path", value: "custom" },
          ],
        },
      ]);

      let route = defaultRoute;
      if (routeMode === "custom") {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: "route",
            message: "Custom route path (must start with /):",
            default: defaultRoute,
            validate: (input) =>
              input.trim().startsWith("/") ||
              "Route path must start with a slash (/)",
            filter: (input) => ensureLeadingSlash(input.trim()),
          },
        ]);
        route = answer.route || defaultRoute;
      }

      const { iconChoice } = await inquirer.prompt([
        {
          type: "list",
          name: "iconChoice",
          message: "Choose an icon for the page:",
          choices: [
            ...DEFAULT_PAGE_ICONS.map((icon) => ({
              name: `Lucide: ${icon}`,
              value: icon,
            })),
            { name: "Custom icon name", value: "custom" },
          ],
          default: DEFAULT_PAGE_ICONS[0],
        },
      ]);

      let icon = iconChoice;
      if (iconChoice === "custom") {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: "customIcon",
            message: "Enter the Lucide icon name:",
            default: "layout",
            validate: (input) =>
              /^[a-z0-9-]+$/i.test(input) ||
              "Use only letters, numbers and dashes",
          },
        ]);
        icon = answer.customIcon;
      }

      const { addNav } = await inquirer.prompt([
        {
          type: "confirm",
          name: "addNav",
          message: "Add this page to the main navigation?",
          default: true,
        },
      ]);

      steps.push({
        type: "generate",
        subtype: "page",
        name: pageName,
        options: {
          route,
          icon,
          noNav: !addNav,
          force: false,
        },
      });
      console.log(
        chalk.green(`✓ Frontend page queued: ${pageName} (${route})`),
      );
    }

    if (action === "add_theme") {
      const { method } = await inquirer.prompt([
        {
          type: "list",
          name: "method",
          message: "How would you like to provide the theme CSS?",
          choices: THEME_METHODS,
        },
      ]);

      let filePath;
      let pasteContent;
      if (method === "file") {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: "filePath",
            message: "Path to CSS file (must contain :root and .dark):",
            validate: (value) =>
              value.trim() &&
              fs.existsSync(path.resolve(projectRoot, value.trim()))
                ? true
                : "Enter a valid file path",
            filter: (input) => path.resolve(projectRoot, input.trim()),
          },
        ]);
        filePath = answer.filePath;
      } else {
        const answer = await inquirer.prompt([
          {
            type: "editor",
            name: "pasteContent",
            message: "Paste your CSS variables (Ctrl+D to finish):",
          },
        ]);
        pasteContent = answer.pasteContent;
      }

      steps.push({
        type: "generate",
        subtype: "theme",
        options: {
          file: filePath,
          paste: pasteContent,
          fallback: "executiveBlue",
          appearance: "quiet",
        },
      });
      console.log(chalk.green("✓ Theme import queued"));
    }

    if (action === "add_deploy") {
      const { targets } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "targets",
          message: "Select deployment targets:",
          choices: DEPLOY_TARGETS,
          validate: (input) =>
            input.length > 0 || "Select at least one deployment target",
        },
      ]);

      steps.push({
        type: "generate",
        subtype: "deploy",
        options: {
          target: targets.join(","),
          force: false,
        },
      });
      console.log(chalk.green(`✓ Deploy config queued: ${targets.join(", ")}`));
    }

    if (action === "remove") {
      const { resourceType, resourceName } = await inquirer.prompt([
        {
          type: "list",
          name: "resourceType",
          message: "What type of resource do you want to remove?",
          choices: [
            { name: "Frontend page", value: "page" },
            { name: "Backend module", value: "module" },
          ],
        },
        {
          type: "input",
          name: "resourceName",
          message: "Name of the resource to remove:",
          validate: (input) =>
            /^[a-z0-9-_]+$/i.test(input) ||
            "Use only letters, numbers, dashes, underscores",
        },
      ]);
      steps.push({
        type: "remove",
        resourceType,
        name: resourceName,
      });
      console.log(
        chalk.yellow(`⚠ Removal queued: ${resourceType} ${resourceName}`),
      );
    }

    const { continueWizard } = await inquirer.prompt([
      {
        type: "confirm",
        name: "continueWizard",
        message: "Add another item to the wizard plan?",
        default: true,
      },
    ]);
    if (!continueWizard) break;
  }

  if (steps.length === 0) {
    console.log(chalk.gray("No actions selected. Bye!"));
    process.exit(0);
  }

  console.log(chalk.cyan("\n📋 Summary of actions:"));
  for (const step of steps) {
    const line = summarizeStep(step);
    console.log(
      step.type === "remove" ? chalk.yellow(line) : chalk.white(line),
    );
  }

  const skipConfirm = options.skipConfirm;
  let confirmed = skipConfirm;
  if (!skipConfirm) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Proceed with the queued actions?",
        default: true,
      },
    ]);
    confirmed = confirm;
  }

  if (!confirmed) {
    console.log(chalk.gray("✖  Cancelled."));
    process.exit(0);
  }

  console.log("");
  const originalCwd = process.cwd();

  for (const step of steps) {
    if (step.type === "generate") {
      const planName = step.name || step.subtype;
      spinner.start(`Generating ${step.subtype}: ${planName}`);

      try {
        process.chdir(projectRoot);

        switch (step.subtype) {
          case "resource":
            await generateResource('resource', step.name, step.options);
            break;
          case "report":
            await addReportCmd(step.name, step.options);
            break;
          case "scaffold":
            await scaffoldCmd(step.name, step.options);
            break;
          case "module":
            await moduleGenerator(step.name, step.options);
            break;
          case "page":
            await pageGenerator(step.name, step.options);
            break;
          case "deploy":
            await deployGenerator(step.options);
            break;
          case "theme":
            await themeGenerator(step.options);
            break;
          default:
            throw new Error(`Unsupported generate subtype: ${step.subtype}`);
        }

        spinner.succeed(`Generated ${step.subtype}: ${planName}`);
        process.chdir(originalCwd);
      } catch (err) {
        process.chdir(originalCwd);
        spinner.fail(
          `Failed to generate ${step.subtype}: ${planName} — ${err.message}`,
        );
      }
    }

    if (step.type === "remove") {
      spinner.start(`Removing ${step.resourceType}: ${step.name}`);
      try {
        await removeCommand(step.resourceType, step.name, { force: false });
        spinner.succeed(`Removed ${step.resourceType}: ${step.name}`);
      } catch (err) {
        spinner.fail(
          `Failed to remove ${step.resourceType}: ${step.name} — ${err.message}`,
        );
      }
    }
  }

  console.log(chalk.green.bold("\n✨ Wizard complete!\n"));
}
