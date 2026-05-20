#!/usr/bin/env node

import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";

const DESIGN_THEMES = [
  { name: "executiveBlue", desc: "Professional blue — balanced SaaS default" },
  { name: "clinicSoft", desc: "Calm green — clinical/healthcare" },
  { name: "studioElevated", desc: "Bold rose — creative/editorial" },
  { name: "operationsDense", desc: "Flat gray — dense internal tooling" },
  { name: "commerceWarm", desc: "Warm amber — e-commerce/admin" },
  { name: "violetSanctum", desc: "Rich purple — sophisticated creative" },
  { name: "tealFlow", desc: "Teal/cyan — calm modern apps" },
  { name: "warmNeutral", desc: "Warm brown — cozy editorial" },
];

const DESIGN_LAYOUTS = [
  { name: "hybridSaas", desc: "Topbar public, hybrid protected — SaaS dashboards" },
  { name: "sidebarWorkspace", desc: "Sidebar navigation — task-heavy internal tools" },
  { name: "topbarPortal", desc: "Topbar only — lightweight portals, MVPs" },
  { name: "rightRailStudio", desc: "Right rail sidebar — canvas/content-first apps" },
];

const DATA_TEMPLATES = [
  { name: "dashboard", desc: "Auto columns, comfortable density, cards on mobile" },
  { name: "denseOps", desc: "Four columns, compact density, table on desktop" },
  { name: "editorial", desc: "Three columns, spacious, centered, no pagination" },
  { name: "commerce", desc: "Four columns, comfortable, three product cards" },
];

const UI_VARIANTS = [
  { name: "refined", desc: "Elevated cards, centered modals — balanced SaaS" },
  { name: "operations", desc: "Outline cards, compact modals — admin tables" },
  { name: "studio", desc: "Glass cards, sheet modals — editorial/marketing" },
  { name: "commerce", desc: "Stat cards, wide modals, pill selects — catalog" },
  { name: "clinic", desc: "Soft cards, centered modals — clinical/calm" },
];

const FONT_PRESETS = [
  { name: "inter", family: "'Inter'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
  { name: "plus-jakarta", family: "'Plus Jakarta Sans'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" },
  { name: "outfit", family: "'Outfit'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" },
  { name: "instrument-sans", family: "'Instrument Sans'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" },
  { name: "onest", family: "'Onest'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" },
  { name: "geist", family: "'Geist'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" },
  { name: "dm-sans", family: "'DM Sans'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" },
  { name: "satoshi", family: "'Satoshi'", category: "sans-serif", url: "https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap" },
  { name: "cabinet-grotesk", family: "'Cabinet Grotesk'", category: "sans-serif", url: "https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700&display=swap" },
];

const HEADING_PRESETS = [
  { name: "inter", family: "'Inter'", url: "" },
  { name: "plus-jakarta", family: "'Plus Jakarta Sans'", url: "" },
  { name: "outfit", family: "'Outfit'", url: "" },
  { name: "instrument-sans", family: "'Instrument Sans'", url: "" },
  { name: "onest", family: "'Onest'", url: "" },
  { name: "geist", family: "'Geist'", url: "" },
  { name: "dm-sans", family: "'DM Sans'", url: "" },
  { name: "satoshi", family: "'Satoshi'", url: "" },
  { name: "cabinet-grotesk", family: "'Cabinet Grotesk'", url: "" },
  { name: "playfair", family: "'Playfair Display'", category: "serif", url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap" },
  { name: "prata", family: "'Prata'", category: "serif", url: "https://fonts.googleapis.com/css2?family=Prata&display=swap" },
  { name: "fraunces", family: "'Fraunces'", category: "serif", url: "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&display=swap" },
  { name: "chivo", family: "'Chivo'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Chivo:wght@400;500;600;700&display=swap" },
  { name: "archivo", family: "'Archivo'", category: "sans-serif", url: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap" },
];

/**
 * @param {string} projectRoot
 */
function getPresetPath(projectRoot) {
  return path.join(projectRoot, "frontend/src/config/app-preset.js");
}

/**
 * @param {string} projectRoot
 */
function getTailwindPath(projectRoot) {
  return path.join(projectRoot, "frontend/tailwind.config.js");
}

/**
 * @param {string} projectRoot
 */
function getGlobalsCssPath(projectRoot) {
  return path.join(projectRoot, "frontend/src/styles/globals.css");
}

/**
 * @param {string} projectRoot
 */
function getFontsCssPath(projectRoot) {
  return path.join(projectRoot, "frontend/src/config/fonts.css");
}

/**
 * @param {string} projectRoot
 */
function getCustomCssPath(projectRoot) {
  return path.join(projectRoot, "frontend/src/config/custom.css");
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
        choices: DESIGN_THEMES.map((t) => ({
          name: `${t.name} — ${t.desc}`,
          value: t.name,
        })),
      },
    ]);
    selectedTheme = answers.theme;
  }

  const themeNames = DESIGN_THEMES.map((t) => t.name);
  if (themeNames.includes(selectedTheme)) {
    presetCode = presetCode.replace(
      /theme:\s*designThemes\.\w+/,
      `theme: designThemes.${selectedTheme}`,
    );
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`Theme set to "${selectedTheme}"`);
  } else {
    spinner.fail(`Invalid theme. Available: ${themeNames.join(", ")}`);
  }
}

/**
 * @param {any} options
 */
export async function customizeThemeImport(options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  let presetCode = await ensureProject(projectRoot);

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
  spinner.succeed("Theme CSS saved to frontend/src/config/imported-shadcn-theme.css");

  // Auto-apply by modifying app-preset.js
  const rawImport = `import customShadcnCss from "./imported-shadcn-theme.css?raw";`;
  const shadcnImport = `import { installShadcnDesignPreset } from "@/lib/shadcn-theme";`;

  if (!presetCode.includes(rawImport)) {
    presetCode = presetCode.replace(
      /(import .+?from ["'].\/data-display-templates["'];)/,
      `$1\n${rawImport}\n${shadcnImport}`,
    );
  }

  const fallback = options.fallback || "calmBlue";
  const appearance = options.appearance || "quiet";
  const themeReplacement = `theme: installShadcnDesignPreset(customShadcnCss, {\n      fallbackTheme: designTokens.${fallback},\n      appearance: appearanceRecipes.${appearance},\n    })`;

  if (presetCode.includes("theme: designThemes.")) {
    presetCode = presetCode.replace(
      /theme:\s*designThemes\.\w+/,
      themeReplacement,
    );
  } else if (presetCode.includes("installShadcnDesignPreset")) {
    presetCode = presetCode.replace(
      /installShadcnDesignPreset\([^)]+(?:\)[^)])*\)/,
      themeReplacement,
    );
  }

  await fs.writeFile(getPresetPath(projectRoot), presetCode);
  spinner.succeed("Theme imported and auto-applied to app-preset.js");
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
        choices: DESIGN_LAYOUTS.map((l) => ({
          name: `${l.name} — ${l.desc}`,
          value: l.name,
        })),
      },
    ]);
    selectedLayout = answers.layout;
  }

  const layoutNames = DESIGN_LAYOUTS.map((l) => l.name);
  if (layoutNames.includes(selectedLayout)) {
    presetCode = presetCode.replace(
      /layout:\s*designLayouts\.\w+/,
      `layout: designLayouts.${selectedLayout}`,
    );
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`Layout set to "${selectedLayout}"`);
  } else {
    spinner.fail(`Invalid layout. Available: ${layoutNames.join(", ")}`);
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
        choices: DATA_TEMPLATES.map((d) => ({
          name: `${d.name} — ${d.desc}`,
          value: d.name,
        })),
      },
    ]);
    selectedTemplate = answers.template;
  }

  const templateNames = DATA_TEMPLATES.map((d) => d.name);
  if (templateNames.includes(selectedTemplate)) {
    presetCode = presetCode.replace(
      /dataDisplay:\s*dataDisplayTemplates\.\w+/,
      `dataDisplay: dataDisplayTemplates.${selectedTemplate}`,
    );
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`Data display template set to "${selectedTemplate}"`);
  } else {
    spinner.fail(`Invalid template. Available: ${templateNames.join(", ")}`);
  }
}

// ── UI VARIANTS ──
/**
 * @param {string} variant
 */
export async function customizeUiSet(variant) {
  const spinner = ora();
  const projectRoot = process.cwd();
  let presetCode = await ensureProject(projectRoot);

  let selected = variant;
  if (!selected) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "ui",
        message: "Select a UI variant preset:",
        choices: UI_VARIANTS.map((u) => ({
          name: `${u.name} — ${u.desc}`,
          value: u.name,
        })),
      },
    ]);
    selected = answers.ui;
  }

  const uiNames = UI_VARIANTS.map((u) => u.name);
  if (uiNames.includes(selected)) {
    if (!presetCode.includes("uiVariants")) {
      presetCode = presetCode.replace(
        /import \{ dataDisplayTemplates \} from "\.\/data-display-templates";/,
        `import { dataDisplayTemplates } from "./data-display-templates";\nimport { uiVariants } from "./ui-variants";`,
      );
    }
    if (/ui:\s*uiVariants\.\w+/.test(presetCode)) {
      presetCode = presetCode.replace(
        /ui:\s*uiVariants\.\w+/,
        `ui: uiVariants.${selected}`,
      );
    } else {
      presetCode = presetCode.replace(
        /(dataDisplay:\s*dataDisplayTemplates\.\w+,)/,
        `$1\n    ui: uiVariants.${selected},`,
      );
    }
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`UI variant set to "${selected}"`);
  } else {
    spinner.fail(`Invalid UI variant. Available: ${uiNames.join(", ")}`);
  }
}

// ── FONT ──
/**
 * @param {string} fontName
 * @param {any} options
 */
export async function customizeFontSet(fontName, options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  await ensureProject(projectRoot);

  let selectedFont = fontName;
  let selectedHeading = options.heading || fontName;

  if (!selectedFont) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "body",
        message: "Select a body font:",
        choices: FONT_PRESETS.map((f) => ({
          name: `${f.name} — ${f.category}`,
          value: f.name,
        })),
      },
      {
        type: "list",
        name: "heading",
        message: "Select a heading font:",
        choices: HEADING_PRESETS.map((f) => ({
          name: `${f.name} — ${f.category || "sans-serif"}`,
          value: f.name,
        })),
      },
    ]);
    selectedFont = answers.body;
    selectedHeading = answers.heading;
  }

  const fontDef = FONT_PRESETS.find((f) => f.name === selectedFont) || FONT_PRESETS[0];
  const headingDef = HEADING_PRESETS.find((f) => f.name === selectedHeading) || HEADING_PRESETS[0];

  const fontsDir = path.join(projectRoot, "frontend/src/config");
  await fs.ensureDir(fontsDir);

  // Collect all unique Google Fonts URLs needed
  const importUrls = new Set();
  if (fontDef.url) importUrls.add(fontDef.url);
  if (headingDef.url) importUrls.add(headingDef.url);

  const fontCssContent = [
    '/* Generated by `loom customize font set` */',
    ...Array.from(importUrls).map((url) => `@import url("${url}");`),
    '',
    `:root {`,
    `  --font-sans: ${fontDef.family}, ui-sans-serif, system-ui, sans-serif;`,
    `  --font-heading: ${headingDef.family}, ui-sans-serif, system-ui, sans-serif;`,
    `  --font-mono: ui-monospace, SFMono-Regular, monospace;`,
    '}',
    '',
  ].join('\n');

  await fs.writeFile(getFontsCssPath(projectRoot), fontCssContent);

  // Update globals.css to import fonts.css
  let globalsCss = await fs.readFile(getGlobalsCssPath(projectRoot), "utf-8");
  const fontsImport = '@import url("../config/fonts.css");';
  if (!globalsCss.includes(fontsImport)) {
    globalsCss = fontsImport + "\n" + globalsCss;
    await fs.writeFile(getGlobalsCssPath(projectRoot), globalsCss);
  }

  spinner.succeed(`Fonts set: body="${selectedFont}", heading="${selectedHeading}"`);
}

// ── CUSTOM CSS ──
/**
 * @param {any} options
 */
export async function customizeCssSet(options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  await ensureProject(projectRoot);

  const cssInput = options.file
    ? fs.existsSync(options.file)
      ? await fs.readFile(options.file, "utf-8")
      : (console.log(chalk.red(`✖  File not found: ${options.file}`)),
        process.exit(1))
    : options.css;

  if (!cssInput) {
    console.log(chalk.red('✖  Must provide --file <path> or --css "<rules>"'));
    process.exit(1);
  }

  const customCssPath = getCustomCssPath(projectRoot);
  await fs.ensureDir(path.dirname(customCssPath));

  let existing = "";
  if (fs.existsSync(customCssPath)) {
    existing = await fs.readFile(customCssPath, "utf-8");
  }

  const separator = "\n\n/* ── Custom rule added via `loom customize css` ── */\n";
  await fs.writeFile(customCssPath, existing + separator + cssInput);

  // Update globals.css to import custom.css
  let globalsCss = await fs.readFile(getGlobalsCssPath(projectRoot), "utf-8");
  const customImport = '@import url("../config/custom.css");';
  if (!globalsCss.includes(customImport)) {
    const fontsImport = '@import url("../config/fonts.css");';
    if (globalsCss.includes(fontsImport)) {
      globalsCss = globalsCss.replace(fontsImport, fontsImport + "\n" + customImport);
    } else {
      globalsCss = customImport + "\n" + globalsCss;
    }
    await fs.writeFile(getGlobalsCssPath(projectRoot), globalsCss);
  }

  spinner.succeed("Custom CSS appended to frontend/src/config/custom.css");
}

// ── LISTERS ──
export function customizeListThemes() {
  console.log(chalk.cyan("\nAvailable themes:\n"));
  DESIGN_THEMES.forEach((t) =>
    console.log(`  ${chalk.white("•")} ${chalk.bold(t.name)} — ${chalk.dim(t.desc)}`),
  );
}

export function customizeListLayouts() {
  console.log(chalk.cyan("\nAvailable layouts:\n"));
  DESIGN_LAYOUTS.forEach((l) =>
    console.log(`  ${chalk.white("•")} ${chalk.bold(l.name)} — ${chalk.dim(l.desc)}`),
  );
}

export function customizeListData() {
  console.log(chalk.cyan("\nAvailable data display templates:\n"));
  DATA_TEMPLATES.forEach((d) =>
    console.log(`  ${chalk.white("•")} ${chalk.bold(d.name)} — ${chalk.dim(d.desc)}`),
  );
}

export function customizeListUi() {
  console.log(chalk.cyan("\nAvailable UI variants:\n"));
  UI_VARIANTS.forEach((v) =>
    console.log(`  ${chalk.white("•")} ${chalk.bold(v.name)} — ${chalk.dim(v.desc)}`),
  );
  console.log(
    chalk.dim(
      "\nControls card, modal, select, pagination, and record card styles.\n",
    ),
  );
}

export function customizeListFonts() {
  console.log(chalk.cyan("\nAvailable body fonts:\n"));
  FONT_PRESETS.forEach((f) =>
    console.log(`  ${chalk.white("•")} ${chalk.bold(f.name)} — ${chalk.dim(f.category)}`),
  );
  console.log(chalk.cyan("\nAvailable heading fonts:\n"));
  HEADING_PRESETS.forEach((f) =>
    console.log(`  ${chalk.white("•")} ${chalk.bold(f.name)} — ${chalk.dim(f.category || "sans-serif")}`),
  );
}

export default {
  customizeThemeSet,
  customizeThemeImport,
  customizeLayoutSet,
  customizeBrandSet,
  customizeDataSet,
  customizeUiSet,
  customizeFontSet,
  customizeCssSet,
  customizeListThemes,
  customizeListLayouts,
  customizeListData,
  customizeListUi,
  customizeListFonts,
};
