/**
 * `loom upgrade` — compare this CLI to the project's blueprint + template metadata.
 *
 * `--write` upgrades your project to match the latest template:
 *   - Adds new files the template ships but your project is missing
 *   - Updates contract, scaffold, and config files to the latest template version
 *   - Merges package.json dependencies (adds missing deps, never removes existing)
 *   - Refreshes .loom/metadata.json compatibility marker
 *   - Skips generated resource files (managed via `loom resource sync`)
 *   - Creates a backup under `.loom/upgrade-backup-*` for rollback
 *
 * `--dry-run` previews changes without touching anything.
 */
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import fs from "fs-extra";
import { blueprintLoader } from "../blueprint/index.js";
import { SUPPORTED_SCHEMA_VERSIONS } from "../blueprint/schema.js";
import { reporterFromOptions } from "../services/index.js";
import {
  minCliSatisfied,
  metadataCompatSatisfied,
  parseMetadataCompat,
} from "../utils/semver.js";
import { UpgradeEngine } from "../core/upgrade-engine.js";

function readCliPackage() {
  return JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
  );
}

async function createBackup(projectRoot, reporter, filePaths) {
  const existingFiles = [];
  for (const filePath of filePaths) {
    if (await fs.pathExists(filePath)) existingFiles.push(filePath);
  }
  if (!existingFiles.length) return null;

  const backupDir = path.join(
    projectRoot,
    ".loom",
    `upgrade-backup-${Date.now()}`,
  );
  await fs.ensureDir(backupDir);

  for (const filePath of existingFiles) {
    const relativePath = path.relative(projectRoot, filePath);
    const destination = path.join(backupDir, relativePath);
    await fs.ensureDir(path.dirname(destination));
    await fs.copy(filePath, destination, { overwrite: false });
  }

  reporter.info(
    `Created backup of existing files at ${path.relative(projectRoot, backupDir)}`,
  );
  return backupDir;
}

async function refreshMetadata(projectRoot, reporter, cliPkg, cliVersion) {
  const metadataPath = path.join(projectRoot, ".loom", "metadata.json");
  const expectedCompatibility = `${cliPkg.name}@>=${cliVersion}`;
  let metadata = {};
  let changed = false;

  if (await fs.pathExists(metadataPath)) {
    try {
      metadata = await fs.readJSON(metadataPath);
    } catch {
      reporter.warn(
        "Could not parse existing .loom/metadata.json. Creating a fresh compatibility marker.",
      );
      metadata = {};
      changed = true;
    }
  }

  if (metadata.engineCompatibility !== expectedCompatibility) {
    metadata.engineCompatibility = expectedCompatibility;
    changed = true;
  }

  if (changed) {
    await fs.ensureDir(path.dirname(metadataPath));
    await fs.writeJSON(metadataPath, metadata, { spaces: 2 });
    reporter.step("Updated .loom/metadata.json with current CLI compatibility");
    return metadataPath;
  }

  return null;
}

async function applyFullUpgrade(
  projectRoot,
  reporter,
  cliPkg,
  cliVersion,
  { dryRun = false, force = false, templateDir = null } = {},
) {
  const migratedFiles = [];
  let engine;
  let metadataBackupDir = null;

  // Create metadata backup up-front so it's shared between full upgrade
  // and fallback path — avoids two backup dirs in rapid succession.
  if (!dryRun) {
    metadataBackupDir = await createBackup(projectRoot, reporter, [
      path.join(projectRoot, ".loom", "metadata.json"),
    ]);
  }

  try {
    engine = new UpgradeEngine({ projectRoot, reporter, dryRun, force, templateDir });
    const { newFiles, changedFiles, deletedFiles } = await engine.analyze();

    const totals = {
      new: newFiles.length,
      changed: changedFiles.length,
      deleted: deletedFiles.length,
    };
    const total = totals.new + totals.changed;

    if (total === 0) {
      reporter.info("Project is already up-to-date with the latest template.");
      await engine.cleanup();
      return { migratedFiles, fileTotals: totals };
    }

    reporter.step(
      `Upgrade plan: ${totals.new} new, ${totals.changed} updated, ${totals.deleted} removed`,
    );

    const changes = await engine.apply({ newFiles, changedFiles, deletedFiles });

    for (const c of changes) {
      migratedFiles.push(c.rel);
    }

    if (!dryRun) {
      const refreshed = await refreshMetadata(projectRoot, reporter, cliPkg, cliVersion);
      if (refreshed) migratedFiles.push(refreshed);
    }

    await engine.cleanup();
    return { migratedFiles, fileTotals: totals, changes };
  } catch (err) {
    if (engine) await engine.cleanup();
    reporter.warn(`Template upgrade skipped: ${err.message}`);
    reporter.step("Falling back to safe metadata migration only");

    if (!dryRun && metadataBackupDir) {
      // metadata backup was already made above; just refresh metadata
      const refreshed = await refreshMetadata(projectRoot, reporter, cliPkg, cliVersion);
      if (refreshed) migratedFiles.push(refreshed);
    } else if (!dryRun) {
      const refreshed = await refreshMetadata(projectRoot, reporter, cliPkg, cliVersion);
      if (refreshed) migratedFiles.push(refreshed);
    }

    return { migratedFiles, fileTotals: { new: 0, changed: 0, deleted: 0 } };
  }
}

function looksLikeStackloomProject(root) {
  const hasBlueprint = existsSync(path.join(root, ".loom", "blueprint.json"));
  const hasStack =
    existsSync(path.join(root, "backend")) &&
    existsSync(path.join(root, "frontend"));
  return hasBlueprint || hasStack;
}

function usingBuiltinOnly(projectRoot, blueprintSource) {
  const local = path.join(projectRoot, ".loom", "blueprint.json");
  return !existsSync(local) && blueprintSource === blueprintLoader.builtinPath;
}

/**
 * @param {object} [options]
 * @param {string} [options.projectRoot]
 * @param {object} [options.reporter]
 * @param {string} [options.cliVersion] - override for tests
 * @returns {Promise<{ ok: boolean, warnings: number, errors: number }>}
 */
export default async function upgrade(options = {}) {
  const reporter = options.reporter ?? reporterFromOptions(options);
  const projectRoot = options.projectRoot ?? process.cwd();
  const cliPkg = readCliPackage();
  const cliVersion = options.cliVersion ?? cliPkg.version;
  const write = Boolean(options.write);

  let errors = 0;
  let warnings = 0;
  let migrationsApplied = [];

  const bump = (kind) => {
    if (kind === "error") errors++;
    if (kind === "warn") warnings++;
  };

  try {
    if (!looksLikeStackloomProject(projectRoot)) {
      reporter.error(
        "Not a Stackloom project: run from the scaffold root (expect backend/ + frontend/ or .loom/blueprint.json).",
      );
      bump("error");
      reporter.result({ ok: false, reason: "not-a-project", cliVersion });
      reporter.flush();
      process.exitCode = 1;
      return { ok: false, warnings, errors };
    }

    const bp = await blueprintLoader.load(projectRoot);

    if (usingBuiltinOnly(projectRoot, bp.source)) {
      reporter.warn(
        "No .loom/blueprint.json here — version checks use the CLI built-in blueprint only. Prefer running from a scaffolded app with a template contract.",
      );
      bump("warn");
    }

    reporter.step(`CLI: ${cliVersion}`);
    reporter.step(
      `Effective blueprint: ${path.relative(projectRoot, bp.source) || bp.source}`,
    );
    reporter.info(bp.describe());

    const sv = bp.schemaVersion;
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(sv)) {
      reporter.error(
        `Blueprint schemaVersion "${sv}" is not supported (this CLI: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}). Upgrade stackloom or refresh .loom/blueprint.json from the template repo.`,
      );
      bump("error");
    } else {
      reporter.success(`Blueprint schema ${sv} is supported`);
    }

    const minCli = bp.data.engine?.minCliVersion;
    if (minCli) {
      if (!minCliSatisfied(cliVersion, minCli)) {
        const pkgName = cliPkg.name || "stackloom-cli";
        reporter.error(
          `This CLI (${cliVersion}) is below blueprint engine.minCliVersion (${minCli}). Install a newer CLI: pnpm add -g ${pkgName}@latest`,
        );
        bump("error");
      } else {
        reporter.success(`CLI satisfies engine.minCliVersion (>= ${minCli})`);
      }
    }

    const metaPath = path.join(projectRoot, ".loom", "metadata.json");
    if (await fs.pathExists(metaPath)) {
      const meta = await fs.readJSON(metaPath);
      if (meta.engineCompatibility) {
        const compat = parseMetadataCompat(meta.engineCompatibility);
        if (!compat) {
          reporter.warn(
            `Could not parse .loom/metadata.json engineCompatibility: "${meta.engineCompatibility}"`,
          );
          bump("warn");
        } else if (!metadataCompatSatisfied(cliVersion, compat)) {
          reporter.warn(
            `Template metadata expects ${meta.engineCompatibility}; this CLI (${cliVersion}) may be too old for some features.`,
          );
          bump("warn");
        } else {
          reporter.success(
            `Template metadata satisfied: ${meta.engineCompatibility}`,
          );
        }
      }
      if (meta.stack) reporter.info(`Template stack: ${meta.stack}`);
    }

    const ok = errors === 0;
    if (ok && warnings === 0) reporter.success("Compatibility check passed");
    else if (ok)
      reporter.warn(
        `Check finished with ${warnings} warning(s) — review messages above.`,
      );

    migrationsApplied = [];
    if (ok && write) {
      reporter.step("Applying full upgrade from latest template");
      const { migratedFiles, fileTotals } = await applyFullUpgrade(
        projectRoot,
        reporter,
        cliPkg,
        cliVersion,
        {
          dryRun: Boolean(options.dryRun),
          force: Boolean(options.force),
          templateDir: options.templateDir || null,
        },
      );
      migrationsApplied = migratedFiles;
      if (migratedFiles.length) {
        reporter.success(
          `Upgrade applied: ${fileTotals.new} new, ${fileTotals.changed} updated — ${migratedFiles.length} file(s) changed.`,
        );
      } else {
        reporter.info("No upgrade changes were necessary.");
      }
    }

    reporter.result({
      ok,
      cliVersion,
      blueprintSchema: sv,
      blueprintSource: bp.source,
      warnings,
      errors,
      migrationsApplied,
    });
    if (!ok) process.exitCode = 1;
  } catch (err) {
    reporter.error(err.message);
    reporter.result({
      ok: false,
      error: err.message,
      cliVersion,
      migrationsApplied,
    });
    process.exitCode = 1;
    bump("error");
    reporter.flush();
    return { ok: false, warnings, errors, migrationsApplied };
  }

  reporter.flush();
  return { ok: errors === 0, warnings, errors, migrationsApplied };
}
