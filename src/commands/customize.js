#!/usr/bin/env node

import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";

const DESIGN_THEMES = [
  "executiveBlue",
  "clinicSoft",
  "studioElevated",
  "operationsDense",
  "commerceWarm",
];

const DESIGN_LAYOUTS = [
  "hybridSaas",
  "sidebarWorkspace",
  "topbarPortal",
  "rightRailStudio",
];

const DATA_TEMPLATES = ["dashboard", "denseOps", "editorial", "commerce"];

/**
 * @param {string} projectRoot
 */
function getPresetPath(projectRoot) {
  return path.join(projectRoot, "frontend/src/config/app-preset.js");
}

/**
 * @param {string} projectRoot
 */
async function ensureProject(projectRoot) {
  const presetPath = getPresetPath(projectRoot);
  if (!fs.existsSync(presetPath)) {
    console.log(
      chalk.red("✖  Not a MERN Starter Kit project (missing app-preset.js)."),
    );
    process.exit(1);
  }
  return await fs.readFile(presetPath, "utf-8");
}

// ── THEME ──
/**
 * @param {string} theme
 * @param {any} _options
 */
export async function customizeThemeSet(theme, _options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  let presetCode = await ensureProject(projectRoot);

  let selectedTheme = theme;
  if (!selectedTheme) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "theme",
        message: "Select a theme:",
        choices: DESIGN_THEMES,
      },
    ]);
    selectedTheme = answers.theme;
  }

  if (DESIGN_THEMES.includes(selectedTheme)) {
    presetCode = presetCode.replace(
      /theme:\s*designThemes\.\w+/,
      `theme: designThemes.${selectedTheme}`,
    );
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`Theme set to "${selectedTheme}"`);
  } else {
    spinner.fail(`Invalid theme. Available: ${DESIGN_THEMES.join(", ")}`);
  }
}

/**
 * @param {any} options
 */
export async function customizeThemeImport(options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  await ensureProject(projectRoot);

  const css = options.file
    ? fs.existsSync(options.file)
      ? await fs.readFile(options.file, "utf-8")
      : (console.log(chalk.red(`✖  File not found: ${options.file}`)),
        process.exit(1))
    : options.paste;

  if (!css) {
    console.log(chalk.red('✖  Must provide --file <path> or --paste "<css>"'));
    process.exit(1);
  }

  const cssPath = path.join(
    projectRoot,
    "frontend/src/config/imported-shadcn-theme.css",
  );
  await fs.writeFile(cssPath, css);
  spinner.succeed(
    "Theme CSS saved to frontend/src/config/imported-shadcn-theme.css",
  );

  console.log(
    chalk.green(
      "\n✓  Apply it in your app-preset.js using installShadcnDesignPreset:\n",
    ),
  );
  console.log(
    chalk.white(
      `import { installShadcnDesignPreset } from "@/lib/shadcn-theme";`,
    ),
  );
  console.log(
    chalk.white(`import customCss from "./imported-shadcn-theme.css";`),
  );
  console.log("");
  console.log(chalk.white(`theme: installShadcnDesignPreset(customCss, {`));
  console.log(
    chalk.white(`  fallback: "${options.fallback || "executiveBlue"}",`),
  );
  console.log(chalk.white(`  appearance: "${options.appearance || "quiet"}"`));
  console.log(chalk.white(`});`));
}

// ── LAYOUT ──
/**
 * @param {string} layout
 */
export async function customizeLayoutSet(layout) {
  const spinner = ora();
  const projectRoot = process.cwd();
  let presetCode = await ensureProject(projectRoot);

  let selectedLayout = layout;
  if (!selectedLayout) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "layout",
        message: "Select a layout:",
        choices: DESIGN_LAYOUTS,
      },
    ]);
    selectedLayout = answers.layout;
  }

  if (DESIGN_LAYOUTS.includes(selectedLayout)) {
    presetCode = presetCode.replace(
      /layout:\s*designLayouts\.\w+/,
      `layout: designLayouts.${selectedLayout}`,
    );
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`Layout set to "${selectedLayout}"`);
  } else {
    spinner.fail(`Invalid layout. Available: ${DESIGN_LAYOUTS.join(", ")}`);
  }
}

// ── BRAND ──
/**
 * @param {any} options 
 */
export async function customizeBrandSet(options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  let presetCode = await ensureProject(projectRoot);

  const name = options.name || options.n;
  const tagline = options.tagline || options.t;

  if (!name && !tagline) {
    console.log(chalk.red("✖  Must provide at least --name or --tagline"));
    process.exit(1);
  }

  if (name) {
    presetCode = presetCode.replace(
      /brand:\s*\{\s*name:\s*["'][^"']+["']/,
      `brand: { name: "${name}"`,
    );
  }
  if (tagline) {
    presetCode = presetCode.replace(
      /tagline:\s*["'][^"']+["']/,
      `tagline: "${tagline}"`,
    );
  }

  await fs.writeFile(getPresetPath(projectRoot), presetCode);
  const parts = [];
  if (name) parts.push("name=" + name);
  if (tagline) parts.push("tagline=" + tagline);
  spinner.succeed(`Brand updated (${parts.join(", ")})`);
}

// ── DATA DISPLAY ──
/**
 * @param {string} template 
 */
export async function customizeDataSet(template) {
  const spinner = ora();
  const projectRoot = process.cwd();
  let presetCode = await ensureProject(projectRoot);

  let selectedTemplate = template;
  if (!selectedTemplate) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "template",
        message: "Select a data display template:",
        choices: DATA_TEMPLATES,
      },
    ]);
    selectedTemplate = answers.template;
  }

  if (DATA_TEMPLATES.includes(selectedTemplate)) {
    presetCode = presetCode.replace(
      /dataDisplay:\s*dataDisplayTemplates\.\w+/,
      `dataDisplay: dataDisplayTemplates.${selectedTemplate}`,
    );
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`Data display template set to "${selectedTemplate}"`);
  } else {
    spinner.fail(`Invalid template. Available: ${DATA_TEMPLATES.join(", ")}`);
  }
}

// ── LISTERS ──
export function customizeListThemes() {
  console.log(chalk.cyan("\nAvailable themes:\n"));
  DESIGN_THEMES.forEach((t) => console.log(`  ${chalk.white("•")} ${t}`));
}

export function customizeListLayouts() {
  console.log(chalk.cyan("\nAvailable layouts:\n"));
  DESIGN_LAYOUTS.forEach((l) => console.log(`  ${chalk.white("•")} ${l}`));
}

export function customizeListData() {
  console.log(chalk.cyan("\nAvailable data display templates:\n"));
  DATA_TEMPLATES.forEach((d) => console.log(`  ${chalk.white("•")} ${d}`));
}

export default {
  customizeThemeSet,
  customizeThemeImport,
  customizeLayoutSet,
  customizeBrandSet,
  customizeDataSet,
  customizeListThemes,
  customizeListLayouts,
  customizeListData,
};
