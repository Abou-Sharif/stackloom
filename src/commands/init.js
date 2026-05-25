#!/usr/bin/env node

import inquirer from "inquirer";
import path from "node:path";
import fs from "fs-extra";
import os from "node:os";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "node:child_process";

import {
  validateMernTemplate,
  validateTemplateContract,
} from "../utils/templateValidator.js";
import { normalizePm, runInDirBare, convertRootScripts, packageManagerField, installCmd } from "../utils/package-manager.js";
import scaffoldCmd from "./scaffold.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIX: hardcoded "dellzetter-lang/starter-kit-mern" was the old placeholder
// repo — the canonical templates now live under stackloom/. The real value is
// loaded from config/templates.json; this constant is only the last-resort
// fallback for installations where the config file has been deleted.
const FALLBACK_REPO = "Abou-Sharif/stackloom-templates";
const FALLBACK_BRANCH = "main";
const FALLBACK_TEMPLATE_DIR = "mern";

const PRESET_VARIANTS = [
  "saas",
  "clinic",
  "studio",
  "operations",
  "commerce",
  "custom",
];

const PRESET_VARIANT_LABELS = {
  saas: "SaaS — business admin starter",
  clinic: "Clinic — healthcare operations hub",
  studio: "Studio — creative production dashboard",
  operations: "Operations — internal workflow console",
  commerce: "Commerce — product & order management",
  custom: "Custom — manual theme, layout and branding",
};

const PRESET_CHOICES = PRESET_VARIANTS.map((preset) => ({
  name: PRESET_VARIANT_LABELS[preset],
  value: preset,
}));

const DESIGN_THEMES = [
  "executiveBlue",
  "clinicSoft",
  "studioElevated",
  "operationsDense",
  "commerceWarm",
  "violetSanctum",
  "tealFlow",
  "warmNeutral",
];

const DESIGN_THEME_LABELS = {
  executiveBlue: "Executive Blue — crisp, professional palette",
  clinicSoft: "Clinic Soft — calm healthcare colors",
  studioElevated: "Studio Elevated — rich, modern accents",
  operationsDense: "Operations Dense — bold, data-focused UI",
  commerceWarm: "Commerce Warm — inviting retail theme",
  violetSanctum: "Violet Sanctum — creative, purple-forward palette",
  tealFlow: "Teal Flow — calm modern teal tones",
  warmNeutral: "Warm Neutral — editorial warm brown palette",
};

const DESIGN_THEME_CHOICES = DESIGN_THEMES.map((theme) => ({
  name: DESIGN_THEME_LABELS[theme],
  value: theme,
}));

const DESIGN_LAYOUTS = [
  "hybridSaas",
  "sidebarWorkspace",
  "topbarPortal",
  "rightRailStudio",
];

const DESIGN_LAYOUT_LABELS = {
  hybridSaas: "Hybrid SaaS — flexible topbar layout",
  sidebarWorkspace: "Sidebar Workspace — productivity-first UI",
  topbarPortal: "Topbar Portal — clean enterprise shell",
  rightRailStudio: "Right Rail Studio — creative workspace layout",
};

const DESIGN_LAYOUT_CHOICES = DESIGN_LAYOUTS.map((layout) => ({
  name: DESIGN_LAYOUT_LABELS[layout],
  value: layout,
}));

/**
 * Load config/templates.json safely.
 * FIX: previously the URL was a hardcoded module-level constant — there was no
 * way to point the CLI at a forked templates repo without editing source.
 */
function loadTemplatesConfig(quiet) {
  const cfgPath = path.join(__dirname, "..", "..", "config", "templates.json");
  let raw;
  try {
    raw = fs.readFileSync(cfgPath, "utf-8");
  } catch (err) {
    if (!quiet) {
      console.warn(
        chalk.yellow(
          `⚠ config/templates.json not readable (${err.code || err.message}); using built-in defaults`,
        ),
      );
    }
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    if (!quiet) {
      console.warn(
        chalk.yellow(
          `⚠ config/templates.json is malformed (${err.message}); using built-in defaults`,
        ),
      );
    }
    return null;
  }
}

/**
 * Resolve the template source by precedence:
 *   1. options.localTemplate (CLI flag)
 *   2. env.STACKLOOM_TEMPLATES_PATH (env var)
 *   3. config.defaultRepo + defaultBranch (config file → remote tarball)
 *   4. hardcoded fallback tarball
 *
 * Pure function so it is independently testable.
 *
 * @param {{ localTemplate?: string, template?: string, quiet?: boolean }} options
 * @param {Record<string,string|undefined>} env
 * @param {{ defaultRepo?: string, defaultBranch?: string, templates?: Record<string,{dir:string}> }|null} config
 * @returns {{ type: 'local'|'remote', path?: string, url?: string, step: number, why: string }}
 */
export function resolveTemplateSource(options, env, config) {
  const templateKey = options.template || "mern";

  if (options.localTemplate) {
    const abs = path.resolve(options.localTemplate);
    return {
      type: "local",
      path: abs,
      step: 1,
      why: `--local-template flag → ${abs}`,
    };
  }

  if (env.STACKLOOM_TEMPLATES_PATH) {
    // STACKLOOM_TEMPLATES_PATH points at a *root* containing one or more
    // template subdirectories. Append the selected template's dir.
    const subdir = config?.templates?.[templateKey]?.dir || templateKey;
    const abs = path.resolve(env.STACKLOOM_TEMPLATES_PATH, subdir);
    return {
      type: "local",
      path: abs,
      step: 2,
      why: `STACKLOOM_TEMPLATES_PATH=${env.STACKLOOM_TEMPLATES_PATH} → ${abs}`,
    };
  }

  if (config?.defaultRepo && config?.defaultBranch) {
    const url = `https://github.com/${config.defaultRepo}/archive/refs/heads/${config.defaultBranch}.tar.gz`;
    return {
      type: "remote",
      url,
      step: 3,
      why: `config/templates.json → ${config.defaultRepo}@${config.defaultBranch}`,
    };
  }

  const url = `https://github.com/${FALLBACK_REPO}/archive/refs/heads/${FALLBACK_BRANCH}.tar.gz`;
  return {
    type: "remote",
    url,
    step: 4,
    why: `built-in fallback → ${FALLBACK_REPO}@${FALLBACK_BRANCH}`,
  };
}

/**
 * Compute the subdirectory inside a multi-template tree where the selected
 * template's files live (e.g. `mern/` inside `stackloom-templates/`).
 */
function templateSubdir(options, config) {
  const key = options.template || "mern";
  return config?.templates?.[key]?.dir || FALLBACK_TEMPLATE_DIR;
}

export default async function initCmd(projectName, options) {
  const quiet = !!options.quiet;
  const spinner = ora({ discardStdin: false, isEnabled: !quiet });
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  // 0. Resolve project name and parent dir
  let resolvedProjectName = projectName;
  const parentDir = options.target
    ? path.resolve(options.target)
    : process.cwd();

  if (!resolvedProjectName) {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Project name:",
        default: "my-loom-app",
        validate: (input) =>
          /^[a-z0-9-_]+$/i.test(input) ||
          "Use only letters, numbers, dashes, underscores",
      },
    ]);
    resolvedProjectName = name;
  }

  const outDir = path.join(parentDir, resolvedProjectName);

  // 1. Check for directory existence
  if (fs.existsSync(outDir)) {
    if (options.force) {
      await fs.remove(outDir);
    } else {
      let files = [];
      try {
        files = fs.readdirSync(outDir).filter((f) => f !== "node_modules");
      } catch (err) {
        // FIX: readdirSync used to throw and bubble up unhandled.
        console.error(
          chalk.red(`✖ Cannot read target directory ${outDir}: ${err.message}`),
        );
        // EXIT: top-level only — intentional
        process.exit(1);
      }
      if (files.length > 0) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Directory ${resolvedProjectName} is not empty. Overwrite?`,
            default: false,
          },
        ]);
        if (!confirm) {
          log(chalk.gray("✖ Cancelled."));
          // EXIT: top-level only — intentional
          process.exit(0);
        }
        await fs.remove(outDir);
      }
    }
  }
  await fs.ensureDir(outDir);

  // 2. Smart Interactive Configuration
  // FIX: honour the global -y/--yes flag — skip every prompt and use defaults.
  // Without this, CI / piped invocations crash with ExitPromptError because
  // inquirer can't read a closed stdin.
  const assumeYes = !!options.yes;
  const config = { ...options };
  const questions = [];

  if (!config.preset) {
    questions.push({
      type: "list",
      name: "preset",
      message: "Select a UI preset variant:",
      choices: PRESET_CHOICES,
      default: "saas",
    });
  }

  if (!config.theme) {
    questions.push({
      type: "list",
      name: "theme",
      message: "Select a design theme:",
      choices: DESIGN_THEME_CHOICES,
      default: (answers) => {
        const p = config.preset || answers.preset;
        const map = {
          saas: "operationsDense",
          clinic: "clinicSoft",
          studio: "studioElevated",
          operations: "operationsDense",
          commerce: "commerceWarm",
        };
        return map[p] || "executiveBlue";
      },
    });
  }

  if (!config.layout) {
    questions.push({
      type: "list",
      name: "layout",
      message: "Select a layout shell:",
      choices: DESIGN_LAYOUT_CHOICES,
      default: (answers) => {
        const p = config.preset || answers.preset;
        const map = {
          saas: "topbarPortal",
          clinic: "sidebarWorkspace",
          studio: "rightRailStudio",
          operations: "sidebarWorkspace",
          commerce: "topbarPortal",
        };
        return map[p] || "hybridSaas";
      },
    });
  }

  if (!config.architecture) {
    questions.push({
      type: "list",
      name: "architecture",
      message: "Architecture level:",
      choices: [
        { name: "Lightweight — ship in hours, not days", value: "lightweight" },
        { name: "Minimal — structured but minimal ceremony", value: "minimal" },
        { name: "Moderate — standard MERN layered pattern", value: "moderate" },
        { name: "Advanced — enterprise-ready with batch ops", value: "advanced" },
      ],
      default: "lightweight",
    });
  }

  if (!config.formMode) {
    questions.push({
      type: "list",
      name: "formMode",
      message: "Default form display mode:",
      choices: [
        { name: "Page form (dedicated route)", value: "page" },
        { name: "Modal dialog (overlay)", value: "modal" },
        { name: "Sidepanel / drawer (slide-in)", value: "sidepanel" },
        { name: "Inline form (above table)", value: "inline" },
      ],
      default: "page",
    });
  }

  if (!config.packageManager) {
    questions.push({
      type: "list",
      name: "packageManager",
      message: "Package manager:",
      choices: [
        { name: "pnpm (recommended)", value: "pnpm" },
        { name: "npm", value: "npm" },
        { name: "yarn", value: "yarn" },
        { name: "bun", value: "bun" },
      ],
      default: "pnpm",
    });
  }

  if (config.install === undefined) {
    questions.push({
      type: "confirm",
      name: "installDeps",
      message: "Install dependencies automatically?",
      default: true,
    });
  }

  let interactiveAnswers = {};
  if (questions.length > 0) {
    if (assumeYes) {
      // Resolve each prompt's `default` (function or value) without showing it.
      const synthetic = {};
      for (const q of questions) {
        const def =
          typeof q.default === "function" ? q.default(synthetic) : q.default;
        synthetic[q.name] = def;
      }
      interactiveAnswers = synthetic;
    } else {
      interactiveAnswers = await inquirer.prompt(questions);
    }
  }
  const finalConfig = { ...config, ...interactiveAnswers };
  finalConfig.packageManager = normalizePm(finalConfig.packageManager || "pnpm");

  const presetDefaults = {
    saas: { brand: "MERN Starter", tagline: "Secure app foundation" },
    clinic: { brand: "CareDesk", tagline: "Clinic operations kit" },
    studio: { brand: "StudioBoard", tagline: "Creative production hub" },
    operations: { brand: "OpsGrid", tagline: "Internal operations console" },
    commerce: { brand: "MarketPilot", tagline: "Commerce admin starter" },
    custom: { brand: resolvedProjectName, tagline: "Build something great" },
  };

  const selectedPreset = finalConfig.preset || "saas";
  finalConfig.brandName =
    finalConfig.brandName || presetDefaults[selectedPreset].brand;
  finalConfig.tagline =
    finalConfig.tagline || presetDefaults[selectedPreset].tagline;

  // 3. Resolve template source
  const templatesCfg = loadTemplatesConfig(quiet);
  const source = resolveTemplateSource(options, process.env, templatesCfg);
  log(chalk.gray(`  template source: step ${source.step} — ${source.why}`));

  // 4. Materialise the template into outDir, with full error handling and cleanup.
  let tempDir = null;
  try {
    if (source.type === "local") {
      // FIX: local-template used to silently fall through to a remote download
      // when the directory was missing — now we throw with the absolute path.
      if (!(await fs.pathExists(source.path))) {
        throw new Error(
          `local template path does not exist: ${source.path}\n` +
            `  diagnose with: ls -la "${source.path}"`,
        );
      }
      spinner.start("Copying local template...");
      const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".cache", ".git", "tmp"]);
      await fs.copy(source.path, outDir, {
        overwrite: true,
        filter: (src) => !SKIP_DIRS.has(src.split(path.sep).pop()),
      });
      spinner.succeed("Template copied");
    } else {
      spinner.start("Downloading template...");
      tempDir = path.join(os.tmpdir(), `loom-${Date.now()}`);
      await fs.ensureDir(tempDir);
      try {
        await downloadTemplate(source.url, tempDir);
      } catch (err) {
        // re-throw with extra context so the outer catch can render advice.
        const e = new Error(
          `template download failed (${err.message})\n` +
            `  URL: ${source.url}\n` +
            `  diagnose with: curl -I "${source.url}"\n` +
            `  workaround: rerun with --local-template <path-to-template>`,
        );
        e.cause = err;
        throw e;
      }
      const tarballSubdir = templateSubdir(options, templatesCfg);
      const candidateMonorepo = path.join(tempDir, tarballSubdir);
      const useMonorepoSubdir = await fs.pathExists(candidateMonorepo);
      const sourceDir = useMonorepoSubdir ? candidateMonorepo : tempDir;
      spinner.text = "Extracting...";
      await fs.copy(sourceDir, outDir, { overwrite: true });
      await fs.remove(tempDir);
      tempDir = null;
      spinner.succeed("Template downloaded");
    }
  } catch (err) {
    spinner.fail("Failed to set up template");
    console.error(chalk.red(`✖ ${err.message}`));
    // FIX: leave-no-trace — partial scaffolds in outDir or tempDir confuse
    // users. Clean both up before exiting.
    try {
      if (tempDir) await fs.remove(tempDir);
    } catch {
      /* best-effort cleanup */
    }
    try {
      await fs.remove(outDir);
    } catch {
      /* best-effort cleanup */
    }
    // EXIT: top-level only — intentional
    process.exit(1);
  }

  // 5. Validate the materialised template
  const validation = await validateMernTemplate(outDir);
  const contractValidation = await validateTemplateContract(outDir);
  // FIX: both validators may report the same missing-blueprint error — dedupe
  // so the user does not see the same line twice.
  const allErrors = Array.from(
    new Set([...validation.errors, ...contractValidation.errors]),
  );
  const allWarnings = Array.from(
    new Set([...validation.warnings, ...contractValidation.warnings]),
  );

  if (allWarnings.length > 0 && !quiet) {
    for (const w of allWarnings) console.warn(chalk.yellow(`⚠ ${w}`));
  }

  if (allErrors.length > 0) {
    console.error(
      chalk.red("\n✖ Template validation failed. Missing required files:"),
    );
    for (const e of allErrors) console.error(chalk.red(`  - ${e}`));
    console.error("\nSuggested fixes:");
    console.error(`  1. Check the template is complete: ls -R "${outDir}"`);
    console.error(
      `  2. Re-run with a local template: loom init <name> --local-template <path>`,
    );
    console.error(
      `  3. Force continue (not recommended): loom init <name> --force`,
    );
    console.error(
      "\nDocs: https://github.com/Abou-Sharif/stackloom-templates\n",
    );

    if (!options.force) {
      try {
        await fs.remove(outDir);
      } catch {
        /* best-effort cleanup */
      }
      // EXIT: top-level only — intentional
      process.exit(1);
    } else {
      log(
        chalk.yellow(
          "⚠ --force set; continuing despite validation errors. You accepted responsibility.",
        ),
      );
    }
  }

  // 6. Apply preset customization (best-effort)
  spinner.start("Customizing...");
  try {
    await applyPresetCustomization(outDir, finalConfig);
    await syncProjectDependencies(outDir);
    await cleanupGeneratedProject(outDir, finalConfig);

    const sanitizePath = path.join(
      outDir,
      "frontend",
      "src",
      "utils",
      "sanitize.js",
    );
    if (!fs.existsSync(sanitizePath)) {
      await fs.ensureDir(path.dirname(sanitizePath));
      await fs.writeFile(sanitizePath, sanitizeUtilContent);
    }

    // Write project-level default form-mode to the blueprint
    if (finalConfig.formMode) {
      const bpPath = path.join(outDir, ".loom", "blueprint.json");
      if (await fs.pathExists(bpPath)) {
        try {
          const bp = JSON.parse(await fs.readFile(bpPath, "utf-8"));
          bp.defaults = { ...(bp.defaults || {}), formMode: finalConfig.formMode };
          await fs.writeFile(bpPath, JSON.stringify(bp, null, 2) + "\n");
        } catch {
          // non-fatal — blueprint defaults are advisory
        }
      }
    }

    // Write package-manager selection to metadata
    const metaPath = path.join(outDir, ".loom", "metadata.json");
    if (await fs.pathExists(metaPath)) {
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
        meta.packageManager = finalConfig.packageManager;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
      } catch {
        // non-fatal
      }
    }

    // Convert root package.json scripts from pnpm to the selected PM
    const rootPkgPath = path.join(outDir, "package.json");
    if (await fs.pathExists(rootPkgPath)) {
      try {
        const rootPkg = JSON.parse(await fs.readFile(rootPkgPath, "utf-8"));
        rootPkg.scripts = convertRootScripts(finalConfig.packageManager, rootPkg.scripts);
        rootPkg.packageManager = packageManagerField(finalConfig.packageManager);
        await fs.writeFile(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
      } catch {
        // non-fatal
      }
    }

    spinner.succeed("Project customized");
  } catch (err) {
    spinner.fail("Customization failed");
    console.error(chalk.red(`✖ ${err.message}`));
    // EXIT: top-level only — intentional
    process.exit(1);
  }

  // 7. Install dependencies — per subdirectory, only if that subdir has a package.json
  const wantInstall = finalConfig.installDeps || finalConfig.install;
  const pm = finalConfig.packageManager || "pnpm";
  if (wantInstall) {
    for (const sub of ["backend", "frontend"]) {
      const subPath = path.join(outDir, sub);
      const subPkg = path.join(subPath, "package.json");
      if (!fs.existsSync(subPkg)) {
        console.log(
          chalk.yellow(
            `⚠ Skipping ${pm} install in ${sub} — package.json not found.\n` +
              `  Run manually: ${runInDirBare(pm, '"' + subPath + '"', "install").replace('"', "").replace('"', "")}`,
          ),
        );
        continue;
      }
      log(chalk.cyan(`\n━> Installing dependencies in ${sub}...`));
      try {
        execSync(`${installCmd(pm)} --no-frozen-lockfile`, {
          shell: true,
          cwd: subPath,
          stdio: quiet ? "pipe" : "inherit",
          env: { ...process.env, CI: "true" },
        });
        log(chalk.green(`✓ ${sub} dependencies installed`));
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : "";
        const stdout = err.stdout ? err.stdout.toString() : "";
        console.warn(
          chalk.yellow(
            `⚠ ${pm} install failed in ${sub}.\n` +
              (stdout
                ? `  stdout: ${stdout.split("\n").slice(-5).join("\n  ")}\n`
                : "") +
              (stderr
                ? `  stderr: ${stderr.split("\n").slice(-5).join("\n  ")}\n`
                : "") +
              `  Failed command: ${installCmd(pm)} --no-frozen-lockfile\n` +
              `  Run manually: ${runInDirBare(pm, subPath, "install")}`,
          ),
        );
      }
    }
  }

  // 8. Setup .env files from .env.example (best-effort)
  for (const sub of ["backend", "frontend"]) {
    const envPath = path.join(outDir, sub, ".env");
    const examplePath = path.join(outDir, sub, ".env.example");
    try {
      if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
        await fs.copy(examplePath, envPath);
      }
    } catch (err) {
      console.warn(
        chalk.yellow(
          `⚠ Could not copy ${sub}/.env.example → .env: ${err.message}`,
        ),
      );
    }
  }

  // 9. Smoke check — confirm the scaffolded project has the contract files.
  const smokeChecks = [
    "frontend/src/config/app-preset.js",
    "backend/package.json",
    "frontend/package.json",
  ];
  const smokeMissing = [];
  for (const rel of smokeChecks) {
    const abs = path.join(outDir, ...rel.split("/"));
    if (fs.existsSync(abs)) {
      log(chalk.green(`  ✔ ${rel} — found`));
    } else {
      smokeMissing.push(rel);
      console.error(chalk.red(`  ✖ ${rel} — missing`));
    }
  }

  if (smokeMissing.length > 0) {
    console.error(
      chalk.red(
        `\n✖ Smoke check failed — scaffold may be incomplete.\n` +
          `  Missing: ${smokeMissing.join(", ")}\n\n` +
          `  This is likely a template issue. Please report it:\n` +
          `  https://github.com/Abou-Sharif/stackloom-templates/issues\n`,
      ),
    );
    // EXIT: top-level only — intentional
    process.exit(1);
  }

  log(chalk.green.bold("\n✅ StackLoom scaffold complete!"));
  log("");

  if (config.scenario) {
    const scenarioName = config.scenario.toLowerCase();
    const projectDir = path.resolve(process.cwd(), resolvedProjectName);
    log(chalk.cyan(`\n📦 Scaffolding scenario: ${scenarioName} in ${projectDir}\n`));
    const origDir = process.cwd();
    process.chdir(projectDir);
    try {
      await scaffoldCmd(scenarioName, { brief: true });
    } finally {
      process.chdir(origDir);
    }
  }

  log(chalk.white("Next steps:"));
  log(chalk.white(`  cd ${resolvedProjectName}`));
  log(chalk.white(`  cp .env.example .env        # fill in your values`));
  log(chalk.white(`  ${runInDirBare(pm, "backend", "dev")}`));
  log(chalk.white(`  ${runInDirBare(pm, "frontend", "dev")}`));
  log("");
  log(chalk.gray("Docs: https://stackloom.dev/docs/getting-started"));
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Stream a tarball from `url` and extract into `destDir`. Follows up to two
 * redirects so the GitHub `archive/refs/heads/<branch>.tar.gz` URL works.
 *
 * FIX: previously did not reject if a redirect had no Location header and did
 * not surface the HTTP status code in the error message.
 */
async function downloadTemplate(url, destDir, redirectsLeft = 5) {
  const { createGunzip } = await import("node:zlib");
  const { pipeline } = await import("node:stream");
  const https = await import("node:https");
  const { extract } = await import("tar");

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (!res.headers.location) {
          return reject(
            new Error(
              `HTTP ${status} redirect without Location header (${url})`,
            ),
          );
        }
        if (redirectsLeft <= 0) {
          return reject(new Error(`too many redirects following ${url}`));
        }
        res.resume();
        return downloadTemplate(
          res.headers.location,
          destDir,
          redirectsLeft - 1,
        ).then(resolve, reject);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status} from ${url}`));
      }
      pipeline(
        res,
        createGunzip(),
        extract({ cwd: destDir, strip: 1 }),
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
    req.on("error", reject);
  });
}

async function applyPresetCustomization(projectRoot, config) {
  const presetPath = path.join(
    projectRoot,
    "frontend",
    "src",
    "config",
    "app-preset.js",
  );
  if (!(await fs.pathExists(presetPath))) return;

  let code;
  try {
    code = await fs.readFile(presetPath, "utf-8");
  } catch (err) {
    throw new Error(`cannot read ${presetPath}: ${err.message}`);
  }

  function esc(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  const presetVal =
    config.preset === "custom"
      ? `{ ...baseContent, brand: { name: "${esc(config.brandName)}", tagline: "${esc(config.tagline)}" }, layout: designLayouts.${config.layout}, theme: designThemes.${config.theme} }`
      : `presetVariants.${config.preset || "saas"}`;

  // FIX: anchor to start-of-line in multiline mode so the regex never matches
  // an identical phrase inside a comment string (the GUIDE header at the top
  // of the template's app-preset.js contains the example wording verbatim).
  const re = /^export const appPreset = [^;]+;/m;
  if (!re.test(code)) {
    // Non-fatal: skip silently rather than corrupting an unrecognised preset file.
    return;
  }
  code = code.replace(re, `export const appPreset = ${presetVal};`);
  await fs.writeFile(presetPath, code, "utf-8");
}

async function syncProjectDependencies(outDir) {
  const frontendPkgPath = path.join(outDir, "frontend", "package.json");
  if (!(await fs.pathExists(frontendPkgPath))) return;

  let pkg;
  try {
    pkg = await fs.readJSON(frontendPkgPath);
  } catch (err) {
    throw new Error(`malformed frontend/package.json: ${err.message}`);
  }

  // FIX: pkg.dependencies could be undefined; original code crashed reading
  // pkg.dependencies[name]. Initialise it before mutating.
  pkg.dependencies = pkg.dependencies || {};

  const required = {
    "lucide-react": "^1.8.0",
    clsx: "^2.1.1",
    "tailwind-merge": "^3.5.0",
    "class-variance-authority": "^0.7.1",
    sonner: "^2.0.7",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-slot": "^1.2.4",
  };
  let changed = false;
  for (const [name, version] of Object.entries(required)) {
    if (!pkg.dependencies[name]) {
      pkg.dependencies[name] = version;
      changed = true;
    }
  }
  if (changed) await fs.writeJSON(frontendPkgPath, pkg, { spaces: 2 });
}

// ─── Post-init cleanup: prune template to config-matched subset ─────

export const COMPONENT_DIR_MAP = {
  sidebar: "Sidebar",
  navbar: "Navbar",
  footer: "Footer",
  card: "Card",
  modal: "Modal",
  button: "Button",
  formLayout: "FormLayout",
  dataDisplay: "DataDisplay",
};

export const BASE_COMPONENT_LAYOUTS = {
  sidebar: "default",
  navbar: "default",
  footer: "default",
  card: "elevated",
  modal: "centered",
  button: "solid",
  formLayout: "stacked",
  dataDisplay: "standard",
};

export const PRESET_LAYOUT_OVERRIDES = {
  saas: {},
  clinic: {},
  studio: {
    sidebar: "floating",
    navbar: "floating",
    footer: "detailed",
    card: "glass",
    modal: "sheet",
    button: "gradient",
    formLayout: "stacked",
    dataDisplay: "standard",
  },
  operations: {
    sidebar: "mini",
    navbar: "minimal",
    footer: "minimal",
    card: "flat",
    modal: "compact",
    button: "outline",
    formLayout: "inline",
    dataDisplay: "dense",
  },
  commerce: {
    sidebar: "default",
    navbar: "centered",
    footer: "detailed",
    card: "stat",
    modal: "wide",
    button: "pill",
    formLayout: "multiColumn",
    dataDisplay: "cardView",
  },
  custom: {},
};

export function variantValueToFilename(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase() + ".jsx";
}

/**
 * After template copy and preset assignment, prune generated project to
 * only the files and code that match the chosen configuration:
 *   1. Delete unused variant files (keep only the active variant per component)
 *   2. Strip non-active preset blocks from app-preset.js
 *   3. Remove shadcnPaste-only imports and the demoShadcnCss variable
 */
export async function cleanupGeneratedProject(projectRoot, config) {
  const presetName = config.preset || "saas";
  const frontendRoot = path.join(projectRoot, "frontend");
  const variantsRoot = path.join(frontendRoot, "src", "variants");
  const presetPath = path.join(frontendRoot, "src", "config", "app-preset.js");

  // ── 0. Remove unused frontend dependencies ──────────────────────
  const fePkgPath = path.join(frontendRoot, "package.json");
  if (await fs.pathExists(fePkgPath)) {
    const FRONTEND_UNUSED_DEPS = ["@tanstack/react-query", "@radix-ui/react-dropdown-menu"];
    try {
      const pkg = await fs.readJSON(fePkgPath);
      let changed = false;
      for (const name of FRONTEND_UNUSED_DEPS) {
        if (pkg.dependencies && pkg.dependencies[name]) {
          delete pkg.dependencies[name];
          changed = true;
        }
      }
      if (changed) await fs.writeJSON(fePkgPath, pkg, { spaces: 2 });
    } catch {
      // non-fatal — skip
    }
  }

  // ── 0b. Remove unused backend dependencies ──────────────────────
  const bePkgPath = path.join(projectRoot, "backend", "package.json");
  if (await fs.pathExists(bePkgPath)) {
    const BACKEND_UNUSED_DEPS = ["express-validator", "k6", "snyk"];
    try {
      const pkg = await fs.readJSON(bePkgPath);
      let changed = false;
      for (const name of BACKEND_UNUSED_DEPS) {
        if (pkg.dependencies && pkg.dependencies[name]) {
          delete pkg.dependencies[name];
          changed = true;
        }
        if (pkg.devDependencies && pkg.devDependencies[name]) {
          delete pkg.devDependencies[name];
          changed = true;
        }
      }
      if (changed) await fs.writeJSON(bePkgPath, pkg, { spaces: 2 });
    } catch {
      // non-fatal — skip
    }
  }

  // ── 1. Remove unused variant files ──────────────────────────────
  const overrides = PRESET_LAYOUT_OVERRIDES[presetName] || {};
  const activeLayouts = { ...BASE_COMPONENT_LAYOUTS, ...overrides };

  if (await fs.pathExists(variantsRoot)) {
    const componentDirs = await fs.readdir(variantsRoot);
    for (const dir of componentDirs) {
      const dirPath = path.join(variantsRoot, dir);
      let stat;
      try { stat = await fs.stat(dirPath); } catch { continue; }
      if (!stat.isDirectory()) continue;

      const componentKey = Object.entries(COMPONENT_DIR_MAP).find(
        ([, v]) => v === dir,
      )?.[0];
      if (!componentKey) continue;

      const activeVariant = activeLayouts[componentKey];
      if (!activeVariant) continue;

      const activeFilename = variantValueToFilename(activeVariant);
      let files;
      try { files = await fs.readdir(dirPath); } catch { continue; }

      for (const file of files) {
        if (file !== activeFilename) {
          await fs.remove(path.join(dirPath, file));
        }
      }
    }
  }

  // ── 1a. Lightweight architecture: remove heavy UI, config, and simplify entry points ──
  if (config.architecture === "lightweight") {
    const LIGHTWEIGHT_DIRS = [
      "frontend/src/components/ui",
      "frontend/src/variants",
      "frontend/src/components/layout",
      "frontend/src/components/common",
      "frontend/src/components/data",
      "frontend/src/components/forms",
      "frontend/src/hooks",
      "frontend/src/store",
      "frontend/src/context",
      "frontend/src/lib",
      "frontend/src/pages",
      "frontend/src/api",
    ];
    for (const rel of LIGHTWEIGHT_DIRS) {
      const fp = path.join(projectRoot, rel);
      try { await fs.remove(fp); } catch { /* already gone */ }
    }

    // Remove heavy frontend deps
    const fePkgPath = path.join(projectRoot, "frontend", "package.json");
    if (await fs.pathExists(fePkgPath)) {
      const LIGHTWEIGHT_FE_DEPS = [
        "@hookform/resolvers", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-slot", "@tanstack/react-query", "class-variance-authority",
        "lucide-react", "react-hook-form", "sonner", "zustand", "zod",
      ];
      try {
        const pkg = await fs.readJSON(fePkgPath);
        let changed = false;
        for (const name of LIGHTWEIGHT_FE_DEPS) {
          if (pkg.dependencies && pkg.dependencies[name]) {
            delete pkg.dependencies[name];
            changed = true;
          }
        }
        if (changed) await fs.writeJSON(fePkgPath, pkg, { spaces: 2 });
      } catch { /* non-fatal */ }
    }

    // Remove heavy backend deps
    const bePkgPath = path.join(projectRoot, "backend", "package.json");
    if (await fs.pathExists(bePkgPath)) {
      const LIGHTWEIGHT_BE_DEPS = [
        "bcryptjs", "cls-rtracer", "cookie-parser", "express-rate-limit",
        "express-validator", "helmet", "jsonwebtoken", "morgan", "slugify",
        "swagger-jsdoc", "swagger-ui-express", "winston",
      ];
      const LIGHTWEIGHT_BE_DEVDEPS = [
        "@types/bcryptjs", "@types/cookie-parser", "@types/cors", "@types/express",
        "@types/jsonwebtoken", "@types/mongoose", "@types/morgan", "@types/supertest",
        "autocannon", "k6", "mongodb-memory-server", "snyk", "supertest",
      ];
      try {
        const pkg = await fs.readJSON(bePkgPath);
        let changed = false;
        for (const name of LIGHTWEIGHT_BE_DEPS) {
          if (pkg.dependencies && pkg.dependencies[name]) { delete pkg.dependencies[name]; changed = true; }
        }
        for (const name of LIGHTWEIGHT_BE_DEVDEPS) {
          if (pkg.devDependencies && pkg.devDependencies[name]) { delete pkg.devDependencies[name]; changed = true; }
        }
        if (changed) await fs.writeJSON(bePkgPath, pkg, { spaces: 2 });
      } catch { /* non-fatal */ }
    }

    // Remove backend utils for ApiResponse/ApiError, middleware, auth module
    const LIGHTWEIGHT_BACKEND_FILES = [
      "backend/src/utils/ApiResponse.js",
      "backend/src/utils/ApiError.js",
      "backend/src/utils/asyncHandler.js",
      "backend/src/utils/logger.js",
      "backend/src/utils/tokenUtils.js",
      "backend/src/middlewares/auth.middleware.js",
      "backend/src/middlewares/error.middleware.js",
      "backend/src/middlewares/validate.js",
      "backend/src/middlewares/rateLimiter.js",
      "backend/src/middlewares/notFound.middleware.js",
      "backend/src/config/swagger.js",
      "backend/src/modules/auth/auth.controller.js",
      "backend/src/modules/auth/auth.service.js",
      "backend/src/modules/auth/auth.model.js",
      "backend/src/modules/auth/auth.routes.js",
      "backend/src/modules/auth/auth.validator.js",
    ];
    for (const rel of LIGHTWEIGHT_BACKEND_FILES) {
      const fp = path.join(projectRoot, rel);
      try { await fs.remove(fp); } catch { /* already gone */ }
    }

    // Remove empty dirs left behind
    try { const leftover = await fs.readdir(path.join(projectRoot, "backend", "src", "modules", "auth")); if (leftover.length === 0) await fs.remove(path.join(projectRoot, "backend", "src", "modules", "auth")); } catch {}
    try { const leftover = await fs.readdir(path.join(projectRoot, "backend", "src", "middlewares")); if (leftover.length === 0) await fs.remove(path.join(projectRoot, "backend", "src", "middlewares")); } catch {}
    try { const leftover = await fs.readdir(path.join(projectRoot, "frontend", "src", "config")); if (leftover.length === 0) await fs.remove(path.join(projectRoot, "frontend", "src", "config")); } catch {}
    try { const leftover = await fs.readdir(path.join(projectRoot, "frontend", "src", "utils")); if (leftover.length === 0) await fs.remove(path.join(projectRoot, "frontend", "src", "utils")); } catch {}

    // Simplify entry files for lightweight
    const LW_MAIN = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
`;
    const LW_APP = `import { AppRouter } from './routes/AppRouter';

export default function App() {
  return <AppRouter />;
}
`;
    const LW_ROUTER = `import { Routes, Route } from 'react-router-dom';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<div className="p-4"><h1 className="text-2xl font-bold">Welcome</h1></div>} />
    </Routes>
  );
}
`;
    const LW_SERVER = `const mongoose = require('mongoose');
const app = require('./src/app');
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/app')
  .then(() => app.listen(PORT, () => console.log('Server on port ' + PORT)))
  .catch(err => { console.error(err); process.exit(1); });
`;
    const LW_APP_JS = `const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

module.exports = app;
`;
    const LW_ROUTES = `const router = require('express').Router();
router.get('/health', (req, res) => res.json({ ok: true }));
module.exports = router;
`;
    try { await fs.writeFile(path.join(projectRoot, "frontend", "src", "main.jsx"), LW_MAIN); } catch {}
    try { await fs.writeFile(path.join(projectRoot, "frontend", "src", "App.jsx"), LW_APP); } catch {}
    try {
      await fs.ensureDir(path.join(projectRoot, "frontend", "src", "routes"));
      await fs.writeFile(path.join(projectRoot, "frontend", "src", "routes", "AppRouter.jsx"), LW_ROUTER);
    } catch {}
    try { await fs.writeFile(path.join(projectRoot, "backend", "server.js"), LW_SERVER); } catch {}
    try { await fs.writeFile(path.join(projectRoot, "backend", "src", "app.js"), LW_APP_JS); } catch {}
    try {
      await fs.ensureDir(path.join(projectRoot, "backend", "src", "routes"));
      await fs.writeFile(path.join(projectRoot, "backend", "src", "routes", "index.js"), LW_ROUTES);
    } catch {}

    // Remove leftover config files that don't apply
    const LW_CONFIG_REMOVE = [
      "frontend/src/config/design-layouts.js",
      "frontend/src/config/design-themes.js",
      "frontend/src/config/ui-variants.js",
      "frontend/src/config/component-layouts.js",
      "frontend/src/config/data-display-templates.js",
      "frontend/src/config/DESIGN_PRESETS.md",
      "frontend/src/utils/constants.js",
      "frontend/src/utils/formatters.js",
    ];
    for (const rel of LW_CONFIG_REMOVE) {
      try { await fs.remove(path.join(projectRoot, rel)); } catch {}
    }

    return; // lightweight is done — skip preset/variant cleanup below
  }

  // ── 1b. Remove deferred UI components (not needed at init) ─────
  const DEFERRED_UI = ["form.jsx", "label.jsx", "checkbox.jsx", "dropdown-menu.jsx"];
  const uiRoot = path.join(frontendRoot, "src", "components", "ui");
  if (await fs.pathExists(uiRoot)) {
    for (const file of DEFERRED_UI) {
      const fp = path.join(uiRoot, file);
      try { await fs.remove(fp); } catch { /* already gone */ }
    }
  }

  // ── 1c. Remove deployment & example-scaffold files ─────────────
  const INIT_UNNEEDED = [
    "backend/Dockerfile",
    "frontend/Dockerfile",
    "frontend/nginx.conf",
    "backend/tests/performance/load-test.js",
    "backend/src/modules/products/products.controller.js",
    "backend/src/modules/products/products.model.js",
    "backend/src/modules/products/products.routes.js",
    "backend/src/modules/products/products.service.js",
    "backend/src/modules/products/products.validator.js",
  ];
  for (const rel of INIT_UNNEEDED) {
    const fp = path.join(projectRoot, ...rel.split("/"));
    try { await fs.remove(fp); } catch { /* already gone */ }
  }
  // Remove the products route from the route index
  const routesIndex = path.join(projectRoot, "backend", "src", "routes", "index.js");
  try {
    let idx = await fs.readFile(routesIndex, "utf-8");
    idx = idx.replace(/router\.use\("\/products", require\("\.\.\/modules\/products\/products\.routes"\)\);\r?\n/, "");
    idx = idx.replace(/\n{3,}/g, "\n\n");
    await fs.writeFile(routesIndex, idx, "utf-8");
  } catch { /* non-fatal */ }

  // Remove empty products/ dir if left behind
  const prodsDir = path.join(projectRoot, "backend", "src", "modules", "products");
  try {
    const leftover = await fs.readdir(prodsDir);
    if (leftover.length === 0) await fs.remove(prodsDir);
  } catch { /* no dir or already gone */ }

  // ── 2. Strip non-active preset blocks from app-preset.js ────────
  if (!(await fs.pathExists(presetPath))) return;

  let code;
  try { code = await fs.readFile(presetPath, "utf-8"); } catch { return; }

  // 2a. Remove the shadcnPaste-only import
  code = code.replace(
    /^import \{ installShadcnDesignPreset \} from "[^"]+";\n?/m,
    "",
  );

  // 2b. Remove the demoShadcnCss variable
  code = code.replace(/^const demoShadcnCss[\s\S]*?^(?=export )/m, "");

  // 2c. Remove non-active preset blocks from presetVariants
  const ALL_PRESET_NAMES = ["saas", "clinic", "studio", "operations", "commerce", "shadcnPaste"];
  const presetsToRemove = ALL_PRESET_NAMES.filter((n) => n !== presetName);

  for (const name of presetsToRemove) {
    const re = new RegExp(`^\\s{2}${name}:\\s*\\{`, "m");
    const match = code.match(re);
    if (!match) continue;

    const startIdx = match.index;
    let depth = 0;
    let endIdx = startIdx;
    let inString = false;
    let stringChar = null;

    for (let i = startIdx; i < code.length; i++) {
      const ch = code[i];
      if (inString) {
        if (ch === "\\") { i += 1; continue; }
        if (ch === stringChar) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          endIdx = i + 1;
          if (code[endIdx] === ",") endIdx += 1;
          break;
        }
      }
    }

    code = code.slice(0, startIdx) + code.slice(endIdx);
  }

  // Clean up excess blank lines
  code = code.replace(/\n{3,}/g, "\n\n");
  code = code.replace(/\n+$/, "\n");

  await fs.writeFile(presetPath, code, "utf-8");
}

const sanitizeUtilContent = `export function sanitizeText(v) { return typeof v === 'string' ? v.replace(/<[^>]*>?/gm, "").trim() : v; }
export function sanitizeEmail(v) { return typeof v === 'string' ? v.toLowerCase().trim() : v; }
export function sanitizeUrl(v) { return typeof v === 'string' ? v.trim() : v; }
export function sanitizePhone(v) { return typeof v === 'string' ? v.replace(/[^+0-9]/g, '').trim() : v; }
export function sanitizeNumber(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
export function sanitizeBoolean(v) { return typeof v === 'boolean' ? v : (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v); }
`;
