#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { execSync } from "child_process";
import os from "os";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";

/**
 * Extract the active preset name from app-preset.js code.
 * Returns the name (e.g. "saas", "clinic") or null if already inline.
 */
function getActivePresetName(code) {
  const m = code.match(/^export const appPreset\s*=\s*presetVariants\.(\w+);/m);
  return m ? m[1] : null;
}

/**
 * Modify a key-value setting within the ACTIVE preset's definition block.
 * Handles both `presetVariants.XXXX` references and inline appPreset objects.
 *
 * @param {string} code - Raw app-preset.js source
 * @param {string} key   - Config key to modify (e.g. "theme", "layout", "brand")
 * @param {string} replacePattern - Regex that matches the old value within the active section
 * @param {string} replacement    - Replacement string (capture groups from replacePattern preserved)
 * @returns {string} Modified source
 */
function modifyActivePreset(code, key, replacePattern, replacement) {
  const active = getActivePresetName(code);
  if (active) {
    // Preset variant reference — scope the replacement to the active preset block
    const scoped = new RegExp(
      `(${active}:\\s*\\{[\\s\\S]*?${key}:\\s*)${replacePattern.source || replacePattern}`,
    );
    if (scoped.test(code)) {
      return code.replace(scoped, `$1${replacement}`);
    }
    // Fallback: try whole-file pattern (some keys live in baseContent)
    const fallback = new RegExp(
      `(${key}:\\s*)${replacePattern.source || replacePattern}`,
    );
    return code.replace(fallback, `$1${replacement}`);
  }
  // Inline — modify directly
  const inline = new RegExp(
    `(${key}:\\s*)${replacePattern.source || replacePattern}`,
  );
  return code.replace(inline, `$1${replacement}`);
}

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

const COMPONENTS = [
  {
    name: "sidebar",
    desc: "Navigation sidebar",
    variants: [
      { name: "default", desc: "Slide-over on mobile, inline on desktop" },
      { name: "mini", desc: "Icon-only (4rem), expand labels on hover" },
      { name: "floating", desc: "Detached rounded card with shadow" },
      { name: "drawer", desc: "Always overlay drawer from side" },
    ],
    target: "frontend/src/components/layout/Sidebar.jsx",
  },
  {
    name: "navbar",
    desc: "Top navigation bar",
    variants: [
      { name: "default", desc: "Sticky top bar, brand left, nav center" },
      { name: "floating", desc: "Detached rounded bar with backdrop-blur" },
      { name: "minimal", desc: "Thin bar, logo + user menu only" },
      { name: "centered", desc: "Centered logo, nav links below" },
    ],
    target: "frontend/src/components/layout/Navbar.jsx",
  },
  {
    name: "footer",
    desc: "Page footer",
    variants: [
      { name: "default", desc: "Border-top with brand name" },
      { name: "minimal", desc: "Tiny copyright line only" },
      { name: "detailed", desc: "Multi-column with links and social icons" },
    ],
    target: "frontend/src/components/layout/Footer.jsx",
  },
  {
    name: "card",
    desc: "Card container component",
    configOnly: true,
    variants: [
      { name: "elevated", desc: "White bg with shadow, rounded" },
      { name: "glass", desc: "Frosted glass, backdrop-blur" },
      { name: "bordered", desc: "Clean border, no shadow" },
      { name: "stat", desc: "Large value, gradient background" },
      { name: "flat", desc: "No border or shadow, tinted bg" },
    ],
  },
  {
    name: "modal",
    desc: "Modal dialog component",
    configOnly: true,
    variants: [
      { name: "centered", desc: "Standard centered dialog (max-w-lg)" },
      { name: "wide", desc: "Wider dialog for forms (max-w-3xl)" },
      { name: "sheet", desc: "Bottom sheet that slides up" },
      { name: "compact", desc: "Small modal for confirmations" },
    ],
  },
  {
    name: "button",
    desc: "Button component",
    configOnly: true,
    variants: [
      { name: "solid", desc: "Filled background, standard CTA" },
      { name: "outline", desc: "Border-only, transparent bg" },
      { name: "ghost", desc: "No border or bg, minimal hover" },
      { name: "gradient", desc: "Gradient background" },
      { name: "pill", desc: "Fully rounded, friendly appearance" },
    ],
  },
  {
    name: "formLayout",
    desc: "Form field layout",
    variants: [
      { name: "stacked", desc: "Labels above inputs, one column" },
      { name: "inline", desc: "Labels beside inputs on same row" },
      { name: "floating", desc: "Labels float inside input border" },
      { name: "multiColumn", desc: "Grid with 2-3 columns" },
    ],
    target: "frontend/src/components/layout/FormLayout.jsx",
  },
  {
    name: "dataDisplay",
    desc: "Tabular data display",
    variants: [
      { name: "standard", desc: "Table desktop, cards mobile" },
      { name: "dense", desc: "Compact rows, smaller text" },
      { name: "cardView", desc: "Always rendered as cards" },
      { name: "striped", desc: "Alternating row colors" },
    ],
    target: "frontend/src/components/data/ResponsiveRecordView.jsx",
  },
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
    const before = presetCode;
    presetCode = modifyActivePreset(
      presetCode,
      "theme",
      /designThemes\.\w+/,
      `designThemes.${selectedTheme}`,
    );
    if (presetCode === before) {
      // Fallback: handle custom/imported themes via installShadcnDesignPreset
      presetCode = presetCode.replace(
        /(theme:\s*)installShadcnDesignPreset\([\s\S]*?\)/,
        `$1designThemes.${selectedTheme}`,
      );
    }
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

// ── SHADCN PRESET ──

const LOOM_THEMES_DIR = ".loom/themes";
const LOOM_THEMES_INDEX = "index.json";

/**
 * @param {string} projectRoot
 */
function getThemesDir(projectRoot) {
  return path.join(projectRoot, LOOM_THEMES_DIR);
}

function getThemesIndexPath(projectRoot) {
  return path.join(getThemesDir(projectRoot), LOOM_THEMES_INDEX);
}

/**
 * @param {string} projectRoot
 */
async function ensureThemesIndex(projectRoot) {
  const indexPath = getThemesIndexPath(projectRoot);
  await fs.ensureDir(getThemesDir(projectRoot));
  if (!fs.existsSync(indexPath)) {
    await fs.writeJson(indexPath, { presets: [] });
  }
  return await fs.readJson(indexPath);
}

/**
 * Apply a shadcn preset code to the project via npx shadcn.
 * Resolves the preset in a temp shadcn project, extracts the generated CSS variables,
 * and imports them into the loom project.
 *
 * @param {string} code - shadcn preset code (e.g. "a2r6bw")
 * @param {object} options
 */
export async function customizeThemePresetApply(code, options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  await ensureProject(projectRoot);

  if (!code) {
    console.log(chalk.red("✖  Preset code required (e.g., loom customize theme preset apply a2r6bw)"));
    process.exit(1);
  }

  spinner.start("Resolving shadcn preset…");

  const tmpDir = path.join(os.tmpdir(), `loom-shadcn-preset-${Date.now()}`);
  const srcDir = path.join(tmpDir, "src");

  try {
    await fs.ensureDir(srcDir);
    await fs.writeFile(path.join(srcDir, "index.css"), "");

    // Minimal package.json for shadcn init
    await fs.writeJson(path.join(tmpDir, "package.json"), {
      name: "loom-tmp-preset",
      private: true,
      type: "module",
      scripts: { dev: "vite", build: "vite build" },
    });

    // Init shadcn with Vite template to create components.json + CSS scaffold
    execSync("npx shadcn@latest init --template vite --yes --defaults", {
      shell: true,
      cwd: tmpDir,
      stdio: "pipe",
      timeout: 120_000,
    });

    // Apply the preset — this rewrites CSS variables in src/index.css
    execSync(`npx shadcn@latest init --preset ${code} --force --yes --no-reinstall`, {
      shell: true,
      cwd: tmpDir,
      stdio: "pipe",
      timeout: 120_000,
    });

    spinner.succeed("Preset resolved");

    // Read generated CSS
    const cssPath = path.join(srcDir, "index.css");
    if (!fs.existsSync(cssPath)) {
      spinner.fail("Could not locate generated CSS from shadcn preset");
      process.exit(1);
    }

    let generatedCss = await fs.readFile(cssPath, "utf-8");

    // Extract only :root and .dark CSS variable blocks
    const rootMatch = generatedCss.match(/:root\s*\{[^}]+\}/);
    const darkMatch = generatedCss.match(/\.dark\s*\{[^}]+\}/);

    if (!rootMatch) {
      spinner.fail("Generated CSS contains no :root block — preset may be invalid");
      process.exit(1);
    }

    const themeCss = [
      "/* Generated by `loom customize theme preset apply` */",
      "",
      rootMatch[0],
      darkMatch ? `\n${darkMatch[0]}` : "",
      "",
    ].join("\n");

    // Save as imported theme (same flow as customizeThemeImport)
    const cssDest = path.join(projectRoot, "frontend/src/config/imported-shadcn-theme.css");
    await fs.writeFile(cssDest, themeCss);
    spinner.succeed("Theme CSS saved to frontend/src/config/imported-shadcn-theme.css");

    // Wire up app-preset.js
    let presetCode = await fs.readFile(getPresetPath(projectRoot), "utf-8");

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
      presetCode = presetCode.replace(/theme:\s*designThemes\.\w+/, themeReplacement);
    } else if (presetCode.includes("installShadcnDesignPreset")) {
      presetCode = presetCode.replace(
        /installShadcnDesignPreset\([\s\S]*?\)/,
        themeReplacement,
      );
    }

    await fs.writeFile(getPresetPath(projectRoot), presetCode);
    spinner.succeed(`shadcn preset "${code}" applied — theme active`);

    // If --save, also store as local preset
    if (options.save) {
      await customizeThemePresetSave(options.save);
    }
  } catch (err) {
    spinner.fail(`Preset resolution failed: ${err.message}`);
    process.exit(1);
  } finally {
    await fs.remove(tmpDir);
  }
}

/**
 * Save the current imported theme CSS as a named preset.
 * @param {string} name
 */
export async function customizeThemePresetSave(name) {
  const spinner = ora();
  const projectRoot = process.cwd();

  if (!name) {
    console.log(chalk.red("✖  Preset name required"));
    process.exit(1);
  }

  const cssPath = path.join(projectRoot, "frontend/src/config/imported-shadcn-theme.css");
  if (!fs.existsSync(cssPath)) {
    spinner.fail("No imported theme found — import a theme first via `loom customize theme import` or `preset apply`");
    process.exit(1);
  }

  const css = await fs.readFile(cssPath, "utf-8");

  const indexPath = getThemesIndexPath(projectRoot);
  await fs.ensureDir(getThemesDir(projectRoot));

  let index = { presets: [] };
  if (fs.existsSync(indexPath)) {
    index = await fs.readJson(indexPath);
  }

  // Remove duplicate name
  index.presets = index.presets.filter((p) => p.name !== name);

  index.presets.push({
    name,
    savedAt: new Date().toISOString(),
    file: `${name}.css`,
  });

  // Save the CSS file
  const destCss = path.join(getThemesDir(projectRoot), `${name}.css`);
  await fs.writeFile(destCss, css);

  // Save index
  await fs.writeJson(indexPath, index, { spaces: 2 });

  spinner.succeed(`Theme saved as "${name}" in .loom/themes/`);
}

/**
 * List locally saved theme presets.
 */
export async function customizeThemePresetList() {
  const projectRoot = process.cwd();
  const indexPath = getThemesIndexPath(projectRoot);

  if (!fs.existsSync(indexPath)) {
    console.log(chalk.yellow("\nNo saved theme presets found."));
    console.log(chalk.dim("  Use `loom customize theme preset apply <code> --save <name>` to save one.\n"));
    return;
  }

  const index = await fs.readJson(indexPath);
  if (!index.presets || index.presets.length === 0) {
    console.log(chalk.yellow("\nNo saved theme presets found.\n"));
    return;
  }

  console.log(chalk.cyan("\nSaved theme presets:\n"));
  for (const p of index.presets) {
    const date = new Date(p.savedAt).toLocaleDateString();
    console.log(`  ${chalk.white("•")} ${chalk.bold(p.name)} — saved ${chalk.dim(date)}  (${p.file})`);
  }
  console.log("");
  console.log(chalk.dim("  Apply: loom customize theme import --file .loom/themes/<name>.css\n"));
}

/**
 * Open shadcn/create in the browser to build a custom preset.
 */
export async function customizeThemePresetOpen() {
  const url = "https://ui.shadcn.com/create";

  try {
    // Try opening in browser
    const { execSync } = await import("child_process");
    execSync(
      process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `start "" "${url}"`
          : `xdg-open "${url}"`,
      { stdio: "ignore", timeout: 5000 },
    );
    console.log(chalk.green(`\n  Opened ${url} in your browser.\n`));
  } catch {
    console.log(chalk.cyan(`\n  Open this URL in your browser:\n  ${url}\n`));
  }
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
    presetCode = modifyActivePreset(
      presetCode,
      "layout",
      /designLayouts\.\w+/,
      `designLayouts.${selectedLayout}`,
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

  let name = options.name;
  let tagline = options.tagline;

  if (!name && !tagline) {
    const answers = await inquirer.prompt([
      { type: "input", name: "name", message: "Brand name:", default: presetCode.match(/name:\s*"([^"]+)"/)?.[1] || "" },
      { type: "input", name: "tagline", message: "Tagline:", default: presetCode.match(/tagline:\s*"([^"]+)"/)?.[1] || "" },
    ]);
    name = answers.name;
    tagline = answers.tagline;
    if (!name && !tagline) {
      console.log(chalk.red("✖  Must provide at least --name or --tagline"));
      process.exit(1);
    }
  }

  const esc = (s) => String(s).replace(/["\\]/g, "\\$&");
  const active = getActivePresetName(presetCode);

  if (name) {
    const safe = esc(name);
    if (active) {
      const re = new RegExp(
        `(${active}:\\s*\\{[\\s\\S]*?brand:\\s*\\{\\s*)name:\\s*"[^"]+"`,
      );
      presetCode = re.test(presetCode)
        ? presetCode.replace(re, `$1name: "${safe}"`)
        : presetCode.replace(/brand:\s*\{\s*name:\s*"[^"]+"/, `brand: { name: "${safe}"`);
    } else {
      presetCode = presetCode.replace(
        /(appPreset\s*=\s*\{[\s\S]*?brand:\s*\{\s*)name:\s*"[^"]+"/,
        `$1name: "${safe}"`,
      );
    }
  }

  if (tagline) {
    const safe = esc(tagline);
    if (active) {
      const re = new RegExp(
        `(${active}:\\s*\\{[\\s\\S]*?brand:\\s*\\{[\\s\\S]*?)tagline:\\s*"[^"]+"`,
      );
      presetCode = re.test(presetCode)
        ? presetCode.replace(re, `$1tagline: "${safe}"`)
        : presetCode.replace(/(brand:\s*\{[\s\S]*?)tagline:\s*"[^"]+"/, `$1tagline: "${safe}"`);
    } else {
      presetCode = presetCode.replace(
        /(appPreset\s*=\s*\{[\s\S]*?brand:\s*\{[\s\S]*?)tagline:\s*"[^"]+"/,
        `$1tagline: "${safe}"`,
      );
    }
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
    presetCode = modifyActivePreset(
      presetCode,
      "dataDisplay",
      /dataDisplayTemplates\.\w+/,
      `dataDisplayTemplates.${selectedTemplate}`,
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
    // Use modifyActivePreset to target the active preset's ui key
    const before = presetCode;
    presetCode = modifyActivePreset(
      presetCode,
      "ui",
      /uiVariants\.\w+/,
      `uiVariants.${selected}`,
    );
    // Fallback: if scoped replacement didn't work, try adding ui key
    if (presetCode === before) {
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

// ── COMPONENT ──
/**
 * List components and their available layout variants.
 */
export function customizeComponentList() {
  console.log(chalk.cyan("\nAvailable components and their layout variants:\n"));
  COMPONENTS.forEach((comp) => {
    console.log(`  ${chalk.white("•")} ${chalk.bold(comp.name)} — ${chalk.dim(comp.desc)}`);
    comp.variants.forEach((v) =>
      console.log(`    ${chalk.green("✚")} ${v.name} — ${chalk.dim(v.desc)}`),
    );
    console.log("");
  });
  console.log(chalk.dim("  Set: loom customize component set <component> <variant>\n"));
}

/**
 * Set a component to a specific layout variant (scaffold-time rewrite).
 * @param {string} componentName
 * @param {string} variantName
 */
export async function customizeComponentSet(componentName, variantName) {
  const spinner = ora();
  const projectRoot = process.cwd();
  await ensureProject(projectRoot);

  // Resolve component definition
  const component = COMPONENTS.find((c) => c.name === componentName);
  if (!component) {
    const names = COMPONENTS.map((c) => c.name).join(", ");
    spinner.fail(`Unknown component "${componentName}". Available: ${names}`);
    return;
  }

  // Interactive picker if no variant specified
  let selectedVariant = variantName;
  if (!selectedVariant) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "variant",
        message: `Select layout for "${componentName}":`,
        choices: component.variants.map((v) => ({
          name: `${v.name} — ${v.desc}`,
          value: v.name,
        })),
      },
    ]);
    selectedVariant = answers.variant;
  }

  // Validate variant
  const variantDef = component.variants.find((v) => v.name === selectedVariant);
  if (!variantDef) {
    const names = component.variants.map((v) => v.name).join(", ");
    spinner.fail(`Unknown variant "${selectedVariant}" for "${componentName}". Available: ${names}`);
    return;
  }

  // Config-only components (Card, Modal, Button) skip file overwrite
  if (component.configOnly) {
    spinner.succeed(`Component "${componentName}" set to "${selectedVariant}" (config-only — reads at runtime)`);
  } else {
    // Resolve variant source paths
    const templatesRoot = path.join(projectRoot, "frontend/src/variants");
    const componentPascal = componentName.charAt(0).toUpperCase() + componentName.slice(1);
    let variantFile = path.join(templatesRoot, componentPascal, `${selectedVariant}.jsx`);

    // Fallback to loom package's bundled variants
    if (!fs.existsSync(variantFile)) {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const pkgVariantsRoot = path.resolve(__dirname, "../../src/variants");
      variantFile = path.join(pkgVariantsRoot, componentPascal, `${selectedVariant}.jsx`);
    }

    if (!fs.existsSync(variantFile)) {
      spinner.fail(`Variant source not found for "${componentName}/${selectedVariant}". Run \`loom upgrade\` to get the latest templates.`);
      return;
    }

    const targetFile = path.join(projectRoot, component.target);
    const backupPath = targetFile + ".bak";
    if (fs.existsSync(targetFile)) {
      await fs.copy(targetFile, backupPath).catch(() => {});
    }

    const variantContent = await fs.readFile(variantFile, "utf-8");
    await fs.writeFile(targetFile, variantContent);
    // Remove backup on success
    await fs.remove(backupPath).catch(() => {});
    spinner.succeed(`Component "${componentName}" set to variant "${selectedVariant}"`);
  }

  // Update app-preset.js with the selection (scoped to active preset)
  try {
    let presetCode = await fs.readFile(getPresetPath(projectRoot), "utf-8");
    const active = getActivePresetName(presetCode);
    const newEntry = `${componentName}: "${selectedVariant}"`;

    if (active) {
      // Scoped to active preset
      const scopeRe = new RegExp(
        `(${active}:\\s*\\{[\\s\\S]*?componentLayouts:\\s*\\{)`,
      );
      if (scopeRe.test(presetCode)) {
        const entryRe = new RegExp(
          `(${active}:\\s*\\{[\\s\\S]*?componentLayouts:\\s*\\{[\\s\\S]*?)${componentName}:\\s*"[^"]+"`,
        );
        if (entryRe.test(presetCode)) {
          presetCode = presetCode.replace(entryRe, `$1${newEntry}`);
        } else {
          presetCode = presetCode.replace(
            scopeRe,
            `$1\n    ${newEntry},`,
          );
        }
      } else {
        // componentLayouts not present in active preset — add it
        const uiRe = new RegExp(
          `(${active}:\\s*\\{[\\s\\S]*?ui:\\s*uiVariants\\.\\w+,)`,
        );
        presetCode = uiRe.test(presetCode)
          ? presetCode.replace(uiRe, `$1\n    componentLayouts: {\n      ${newEntry},\n    }`)
          : presetCode + `\n    componentLayouts: {\n      ${newEntry},\n    },`;
      }
    } else {
      // Inline — modify the appPreset object directly
      if (presetCode.includes("componentLayouts:")) {
        const regex = new RegExp(`${componentName}:\\s*"[^"]+"`);
        presetCode = regex.test(presetCode)
          ? presetCode.replace(regex, newEntry)
          : presetCode.replace(
              /(componentLayouts:\s*\{)/,
              `$1\n    ${newEntry},`,
            );
      } else {
        presetCode = presetCode.replace(
          /(ui:\s*uiVariants\.\w+,)/,
          `$1\n    componentLayouts: {\n      ${newEntry},\n    },`,
        );
      }
    }
    await fs.writeFile(getPresetPath(projectRoot), presetCode);
  } catch (e) {
    console.warn(chalk.yellow(`⚠ Preset config update skipped: ${e.message}`));
  }
}

export default {
  customizeThemeSet,
  customizeThemeImport,
  customizeThemePresetApply,
  customizeThemePresetSave,
  customizeThemePresetList,
  customizeThemePresetOpen,
  customizeLayoutSet,
  customizeBrandSet,
  customizeDataSet,
  customizeUiSet,
  customizeComponentSet,
  customizeFontSet,
  customizeCssSet,
  customizeListThemes,
  customizeListLayouts,
  customizeListData,
  customizeListUi,
  customizeComponentList,
  customizeListFonts,
};
