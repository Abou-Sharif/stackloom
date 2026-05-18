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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIX: hardcoded "dellzetter-lang/starter-kit-mern" was the old placeholder
// repo — the canonical templates now live under stackloom/. The real value is
// loaded from config/templates.json; this constant is only the last-resort
// fallback for installations where the config file has been deleted.
const FALLBACK_REPO = "stackloom/stackloom-templates";
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
      message: "Choose a preset variant:",
      choices: PRESET_VARIANTS,
      default: "saas",
    });
  }

  if (!config.theme) {
    questions.push({
      type: "list",
      name: "theme",
      message: "Design theme:",
      choices: DESIGN_THEMES,
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
      message: "Layout shell:",
      choices: DESIGN_LAYOUTS,
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
        { name: "Lightweight (Minimalist)", value: "lightweight" },
        { name: "Moderate (Standard MERN)", value: "moderate" },
        { name: "Advanced (Enterprise Ready)", value: "advanced" },
      ],
      default: "moderate",
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
      await fs.copy(source.path, outDir, {
        overwrite: true,
        // skip node_modules — local-dev templates often have one
        filter: (src) => !src.split(path.sep).includes("node_modules"),
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
    spinner.succeed("Project customized");
  } catch (err) {
    spinner.fail("Customization failed");
    console.error(chalk.red(`✖ ${err.message}`));
    // EXIT: top-level only — intentional
    process.exit(1);
  }

  // 7. Install dependencies — per subdirectory, only if that subdir has a package.json
  const wantInstall = finalConfig.installDeps || finalConfig.install;
  if (wantInstall) {
    for (const sub of ["backend", "frontend"]) {
      const subPath = path.join(outDir, sub);
      const subPkg = path.join(subPath, "package.json");
      if (!fs.existsSync(subPkg)) {
        console.log(
          chalk.yellow(
            `⚠ Skipping pnpm install in ${sub} — package.json not found.\n` +
              `  Run manually: pnpm -C "${subPath}" install`,
          ),
        );
        continue;
      }
      log(chalk.cyan(`\n━> Installing dependencies in ${sub}...`));
      try {
        execSync("pnpm install --no-frozen-lockfile", {
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
            `⚠ pnpm install failed in ${sub}.\n` +
              (stdout
                ? `  stdout: ${stdout.split("\n").slice(-5).join("\n  ")}\n`
                : "") +
              (stderr
                ? `  stderr: ${stderr.split("\n").slice(-5).join("\n  ")}\n`
                : "") +
              `  Failed command: pnpm install --no-frozen-lockfile\n` +
              `  Run manually: pnpm -C "${subPath}" install`,
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
  log(chalk.white("Next steps:"));
  log(chalk.white(`  cd ${resolvedProjectName}`));
  log(chalk.white(`  cp .env.example .env        # fill in your values`));
  log(chalk.white(`  pnpm -C backend dev`));
  log(chalk.white(`  pnpm -C frontend dev`));
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

  const presetVal =
    config.preset === "custom"
      ? `{ ...baseContent, brand: { name: "${config.brandName}", tagline: "${config.tagline}" }, layout: designLayouts.${config.layout}, theme: designThemes.${config.theme} }`
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

const sanitizeUtilContent = `export function sanitizeText(v) { return typeof v === 'string' ? v.replace(/<[^>]*>?/gm, "").trim() : v; }
export function sanitizeEmail(v) { return typeof v === 'string' ? v.toLowerCase().trim() : v; }
export function sanitizeUrl(v) { return typeof v === 'string' ? v.trim() : v; }
export function sanitizePhone(v) { return typeof v === 'string' ? v.replace(/[^+0-9]/g, '').trim() : v; }
export function sanitizeNumber(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
export function sanitizeBoolean(v) { return typeof v === 'boolean' ? v : (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v); }
`;
