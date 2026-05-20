#!/usr/bin/env node

/**
 * `loom explain` — project structure overview.
 *
 * Reads the project files and prints a clean summary of resources, routes,
 * modules, auth, theme, layout, env vars, and generated artifacts.
 * Pure (path + reporter injectable) so it is fully testable.
 */

import path from "node:path";
import fs from "fs-extra";
import { existsSync, readdirSync } from "node:fs";
import { blueprintLoader } from "../blueprint/index.js";
import { reporterFromOptions } from "../services/index.js";

const MODULE_DIRS = ["backend/src/modules", "backend/modules", "api/src/modules", "api/modules"];

/**
 * @param {object} [options]
 * @param {string} [options.projectRoot]
 * @param {object} [options.reporter]
 */
export default async function explain(options = {}) {
  const reporter = options.reporter ?? reporterFromOptions(options);
  const projectRoot = options.projectRoot ?? process.cwd();
  const rootName = path.basename(projectRoot);

  const isProject =
    existsSync(path.join(projectRoot, "backend")) &&
    existsSync(path.join(projectRoot, "frontend"));

  if (!isProject) {
    reporter.error("Not a MERN Starter Kit project. Run this inside the project root.");
    reporter.flush();
    process.exitCode = 1;
    return { ok: false };
  }

  // ── 1. Project Identity ──
  const rootPkg = readJson(projectRoot, "package.json");
  const bePkg = readJson(projectRoot, "backend/package.json");
  const fePkg = readJson(projectRoot, "frontend/package.json");

  reporter.log("");
  reporter.heading(`📋  ${rootPkg?.name || rootName} — Project Overview`);
  reporter.log("");

  // ── 2. Blueprint / Architecture ──
  let blueprint = null;
  try {
    blueprint = await blueprintLoader.load(projectRoot);
  } catch {
    // optional
  }

  if (blueprint) {
    const arch = blueprint.data.architecture;
    reporter.log(
      `  Stack:  ${chalk.bold(arch?.name || blueprint.data.name || "MERN")}`,
    );
    reporter.log(`  Engine: ${chalk.dim(blueprint.data.engine?.minCliVersion ? `CLI >= ${blueprint.data.engine.minCliVersion}` : "—")}`);
    reporter.log(`  Schema: ${chalk.dim(`v${blueprint.data.schemaVersion}`)}`);
    reporter.log("");
  }

  // ── 3. Backend Modules & Routes ──
  const modules = findModules(projectRoot);
  reporter.section("Backend");

  if (modules.length > 0) {
    reporter.log(`  Modules (${modules.length}):`);
    for (const mod of modules) {
      const files = listFiles(mod.path, [".js"]);
      const routeMatch = files.find((f) => f.includes(".routes.") || f.includes("routes."));
      reporter.log(`    ${chalk.cyan(mod.name)}`);
      if (routeMatch) {
        reporter.log(`      └─ routes  ${chalk.dim(relativePath(projectRoot, routeMatch))}`);
      }
    }
  } else {
    reporter.log("  Modules:  none found");
  }

  // Parse mounted routes from routes index
  const routesFile = resolveRoutesIndex(projectRoot);
  if (routesFile && existsSync(routesFile)) {
    const content = fs.readFileSync(routesFile, "utf-8");
    const routeLines = extractRoutes(content);
    if (routeLines.length > 0) {
      reporter.log(`  Routes:`);
      for (const route of routeLines) {
        reporter.log(`    ${chalk.green(route.prefix.padEnd(16))} ${chalk.dim("→")}  ${route.source}`);
      }
    }
  }
  reporter.log("");

  // ── 4. Resources (generated) ──
  const resourcesDir = path.join(projectRoot, ".loom/resources");
  const resources = [];
  if (existsSync(resourcesDir)) {
    const entries = readdirSync(resourcesDir).filter((f) => f.endsWith(".json"));
    for (const entry of entries) {
      try {
        const def = fs.readJsonSync(path.join(resourcesDir, entry));
        resources.push(def);
      } catch {
        // skip unparseable
      }
    }
  }

  reporter.section("Resources");

  if (resources.length > 0) {
    for (const r of resources) {
      const fields = r.fields || [];
      const relations = r.relations?.hasMany || [];
      reporter.log(`  ${chalk.bold(r.name || r.resource)}`);
      if (fields.length > 0) {
        const parts = fields.map((f) => `${f.name}:${chalk.dim(f.type)}${f.required ? chalk.red("*") : ""}`);
        reporter.log(`    ${parts.join(", ")}`);
      }
      if (relations.length > 0) {
        for (const rel of relations) {
          reporter.log(`    ${chalk.dim("↗ hasMany")}  ${chalk.cyan(rel.model)} (as ${rel.virtualField || rel.as})`);
        }
      }
    }
  } else {
    reporter.log("  No generated resources found.");
    reporter.log(chalk.dim("  Generate one:  loom generate resource <Name> --fields \"...\""));
  }
  reporter.log("");

  // ── 5. Frontend Preset ──
  reporter.section("Frontend");

  const presetData = readFrontendPreset(projectRoot);
  if (presetData) {
    reporter.log(`  Theme:    ${chalk.bold(presetData.theme)}`);
    reporter.log(`  Layout:   ${chalk.bold(presetData.layout)}`);
    if (presetData.dataDisplay) reporter.log(`  Display:  ${chalk.bold(presetData.dataDisplay)}`);
    if (presetData.ui) reporter.log(`  UI:       ${chalk.bold(presetData.ui)}`);
    if (presetData.brand) reporter.log(`  Brand:    ${chalk.bold(presetData.brand.name)} ${presetData.brand.tagline ? chalk.dim(`— ${presetData.brand.tagline}`) : ""}`);
  }
  reporter.log("");

  // ── 6. Auth ──
  reporter.section("Auth");
  const authModule = modules.find((m) => /auth/i.test(m.name));
  if (authModule) {
    const hasRefreshCookie = existsSync(path.join(authModule.path, "auth.service.js"))
      ? fs.readFileSync(path.join(authModule.path, "auth.service.js"), "utf-8").includes("refreshToken")
      : false;
    reporter.log(`  Type:  ${chalk.bold(hasRefreshCookie ? "JWT with httpOnly refresh cookie" : "JWT")}`);
    const feAuth = ["frontend/src/context/AuthContext.jsx", "frontend/src/context/AuthContext.tsx"].find((f) =>
      existsSync(path.join(projectRoot, f)),
    );
    if (feAuth) reporter.log(`  Context:  ${chalk.dim(relativePath(projectRoot, feAuth))}`);
  } else {
    reporter.log("  No auth module detected.");
  }
  reporter.log("");

  // ── 7. Environment ──
  reporter.section("Environment");
  const envFiles = [];
  for (const candidate of ["backend/.env", "frontend/.env", ".env"]) {
    if (existsSync(path.join(projectRoot, candidate))) {
      envFiles.push(candidate);
    }
  }
  if (envFiles.length > 0) {
    for (const f of envFiles) {
      const envContent = fs.readFileSync(path.join(projectRoot, f), "utf-8");
      const vars = envContent
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#"))
        .map((l) => l.split("=")[0].trim());
      reporter.log(`  ${chalk.dim(f)}  (${vars.length} vars)`);
    }
  } else {
    reporter.log("  No .env files found. Copy from .env.example.");
  }
  reporter.log("");

  // ── 8. State / History ──
  const stateFile = path.join(projectRoot, ".loom/state.json");
  if (existsSync(stateFile)) {
    try {
      const state = fs.readJsonSync(stateFile);
      const events = state.events || state.generations || [];
      reporter.section("Generation History");
      reporter.log(`  ${events.length} generation event(s) recorded`);
      reporter.log(`  State:  ${chalk.dim(relativePath(projectRoot, stateFile))}`);
      reporter.log("");
    } catch {
      // skip
    }
  }

  // ── 9. Deploy / Config ──
  reporter.section("Deployment");
  const deployFiles = {
    "Docker": "Dockerfile",
    "docker-compose": "docker-compose.yml",
    "Vercel": "vercel.json",
    "Railway": "railway.yaml",
    "GitHub Actions": ".github/workflows",
  };
  let foundDeploy = false;
  for (const [label, file] of Object.entries(deployFiles)) {
    if (existsSync(path.join(projectRoot, file))) {
      reporter.log(`  ${chalk.green("✓")}  ${label}`);
      foundDeploy = true;
    }
  }
  if (!foundDeploy) {
    reporter.log(chalk.dim("  No deployment configs generated yet."));
    reporter.log(chalk.dim("  Generate:  loom generate deploy"));
  }
  reporter.log("");

  reporter.success("Run `loom doctor` for a health check, or `loom wizard` to extend the project.");
  reporter.flush();
  return { ok: true, resources, modules, blueprint };
}

// ── Helpers ──

import chalk from "chalk";

function readJson(root, relative) {
  const p = path.join(root, relative);
  try {
    return fs.readJsonSync(p);
  } catch {
    return null;
  }
}

function relativePath(root, file) {
  return path.relative(root, file);
}

function findModules(projectRoot) {
  for (const dir of MODULE_DIRS) {
    const p = path.join(projectRoot, dir);
    if (existsSync(p)) {
      return readdirSync(p, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, path: path.join(p, d.name) }));
    }
  }
  return [];
}

function listFiles(dir, extensions) {
  if (!existsSync(dir)) return [];
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(full, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function resolveRoutesIndex(projectRoot) {
  const candidates = [
    "backend/src/routes/index.js",
    "backend/routes/index.js",
    "api/src/routes/index.js",
    "api/routes/index.js",
  ];
  for (const c of candidates) {
    const p = path.join(projectRoot, c);
    if (existsSync(p)) return p;
  }
  return null;
}

function extractRoutes(content) {
  const lines = [];
  const routerUseRegex = /router\.use\(["']([^"']+)["'],\s*(?:require\(["']([^"']+)["']\)|([a-zA-Z]+))/g;
  let match;
  while ((match = routerUseRegex.exec(content)) !== null) {
    const prefix = match[1];
    const source = match[2] || match[3];
    lines.push({ prefix: prefix === "/" ? "/ (root)" : prefix, source });
  }
  return lines;
}

function readFrontendPreset(projectRoot) {
  const presetPath = path.join(projectRoot, "frontend/src/config/app-preset.js");
  if (!existsSync(presetPath)) return null;

  const content = fs.readFileSync(presetPath, "utf-8");

  const themeMatch = content.match(/theme:\s*(?:designThemes|presetVariants)\.(\w+)/);
  const layoutMatch = content.match(/layout:\s*designLayouts\.(\w+)/);
  const dataMatch = content.match(/dataDisplay:\s*dataDisplayTemplates\.(\w+)/);
  const uiMatch = content.match(/ui:\s*uiVariants\.(\w+)/);
  const brandNameMatch = content.match(/brand:\s*\{\s*name:\s*["']([^"']+)["']/);
  const taglineMatch = content.match(/tagline:\s*["']([^"']+)["']/);

  return {
    theme: themeMatch ? themeMatch[1] : "default",
    layout: layoutMatch ? layoutMatch[1] : "default",
    dataDisplay: dataMatch ? dataMatch[1] : null,
    ui: uiMatch ? uiMatch[1] : null,
    brand: brandNameMatch
      ? { name: brandNameMatch[1], tagline: taglineMatch ? taglineMatch[1] : null }
      : null,
  };
}
