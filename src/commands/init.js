#!/usr/bin/env node

import inquirer from "inquirer";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { fileURLToPath } from "url";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);

const TEMPLATE_REPO = "dellzetter-lang/starter-kit-mern";
const DEFAULT_BRANCH = "main";
const GITHUB_TAR_URL = `https://github.com/${TEMPLATE_REPO}/archive/refs/heads/${DEFAULT_BRANCH}.tar.gz`;

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

const DATA_TEMPLATES = ["dashboard", "denseOps", "editorial", "commerce"];

export default async function initCmd(projectName, options) {
  const spinner = ora({ discardStdin: false });

  // Resolve project name and directory
  let resolvedProjectName = projectName;
  let parentDir = options.target ? path.resolve(options.target) : process.cwd();

  // 1. Ask for Project Name if not provided
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

  // 2. Check for directory existence
  if (fs.existsSync(outDir)) {
    if (options.force) {
      await fs.remove(outDir);
    } else {
      const files = fs.readdirSync(outDir).filter((f) => f !== "node_modules");
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
          console.log(chalk.gray("✖ Cancelled."));
          process.exit(0);
        }
        await fs.remove(outDir);
      }
    }
  }
  await fs.ensureDir(outDir);

  // 3. Smart Interactive Configuration
  // We only ask for options that weren't provided as flags
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

  const interactiveAnswers =
    questions.length > 0 ? await inquirer.prompt(questions) : {};
  const finalConfig = { ...config, ...interactiveAnswers };

  // Set defaults for brand/tagline if not provided
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

  // 4. Scaffolding Process
  spinner.start("Downloading template...");
  const tempDir = path.join(os.tmpdir(), `loom-${Date.now()}`);
  await fs.ensureDir(tempDir);

  try {
    await downloadTemplate(tempDir);
    spinner.succeed("Template downloaded");
  } catch (err) {
    spinner.fail("Failed to download template");
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  spinner.start("Extracting and customizing...");
  await fs.copy(tempDir, outDir);
  await fs.remove(tempDir);

  await applyPresetCustomization(outDir, finalConfig);
  await syncProjectDependencies(outDir);

  // Ensure sanitize.js
  const sanitizePath = path.join(outDir, "frontend/src/utils/sanitize.js");
  if (!fs.existsSync(sanitizePath)) {
    await fs.ensureDir(path.dirname(sanitizePath));
    await fs.writeFile(sanitizePath, sanitizeUtilContent);
  }
  spinner.succeed("Project customized");

  // 5. Install Dependencies
  if (finalConfig.installDeps || finalConfig.install) {
    console.log(chalk.cyan("\n━> Installing dependencies with pnpm..."));
    try {
      execSync("pnpm install --no-frozen-lockfile", {
        cwd: outDir,
        stdio: "inherit",
        env: { ...process.env, CI: "true" },
      });
      console.log(chalk.green("✓ Dependencies installed\n"));
    } catch (err) {
      console.log(
        chalk.yellow(
          "⚠ Installation failed. You can run 'pnpm install' manually.\n",
        ),
      );
    }
  }

   // 6. Setup .env
   const backendEnvPath = path.join(outDir, "backend", ".env");
   const backendEnvExamplePath = path.join(outDir, "backend", ".env.example");
   if (!fs.existsSync(backendEnvPath) && fs.existsSync(backendEnvExamplePath)) {
     await fs.copy(backendEnvExamplePath, backendEnvPath);
   }

   const frontendEnvPath = path.join(outDir, "frontend", ".env");
   const frontendEnvExamplePath = path.join(outDir, "frontend", ".env.example");
   if (!fs.existsSync(frontendEnvPath) && fs.existsSync(frontendEnvExamplePath)) {
     await fs.copy(frontendEnvExamplePath, frontendEnvPath);
   }

  console.log(chalk.green.bold("✨ Project created successfully!"));
  console.log(chalk.white(`\n  cd ${resolvedProjectName}`));
  console.log(chalk.white(`  pnpm dev\n`));
}

// ─── Helpers ────────────────────────────────────────────

async function downloadTemplate(destDir) {
  const { createGunzip } = await import("zlib");
  const { pipeline } = await import("stream");
  const https = await import("https");
  const { extract } = await import("tar");

  return new Promise((resolve, reject) => {
    https
      .get(GITHUB_TAR_URL, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          https
            .get(res.headers.location, (res2) => {
              pipeline(
                res2.pipe(createGunzip()),
                extract({ cwd: destDir, strip: 1 }),
                (err) => {
                  if (err) reject(err);
                  else resolve();
                },
              );
            })
            .on("error", reject);
          return;
        }
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode}`));
        pipeline(
          res.pipe(createGunzip()),
          extract({ cwd: destDir, strip: 1 }),
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      })
      .on("error", reject);
  });
}

async function applyPresetCustomization(projectRoot, config) {
  const presetPath = path.join(
    projectRoot,
    "frontend/src/config/app-preset.js",
  );
  if (!(await fs.pathExists(presetPath))) return;

  let code = await fs.readFile(presetPath, "utf-8");
  const presetVal =
    config.preset === "custom"
      ? `{ ...baseContent, brand: { name: "${config.brandName}", tagline: "${config.tagline}" }, layout: designLayouts.${config.layout}, theme: designThemes.${config.theme} }`
      : `presetVariants.${config.preset || "saas"}`;

  code = code.replace(
    /export const appPreset = .+;/,
    `export const appPreset = ${presetVal};`,
  );
  await fs.writeFile(presetPath, code, "utf-8");
}

async function syncProjectDependencies(outDir) {
  const frontendPkgPath = path.join(outDir, "frontend/package.json");
  if (await fs.pathExists(frontendPkgPath)) {
    const pkg = await fs.readJSON(frontendPkgPath);
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
}

 const sanitizeUtilContent = `export function sanitizeText(v) { return typeof v === 'string' ? v.replace(/<[^>]*>?/gm, "").trim() : v; }
 export function sanitizeEmail(v) { return typeof v === 'string' ? v.toLowerCase().trim() : v; }
 export function sanitizeUrl(v) { return typeof v === 'string' ? v.trim() : v; }
 export function sanitizePhone(v) { return typeof v === 'string' ? v.replace(/[^+0-9]/g, '').trim() : v; }
 export function sanitizeNumber(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
 export function sanitizeBoolean(v) { return typeof v === 'boolean' ? v : (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v); }
 `;
