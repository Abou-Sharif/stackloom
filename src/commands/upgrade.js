/**
 * `loom upgrade` — compare this CLI to the project's blueprint + template metadata.
 *
 * `--write` enables safe, low-risk migrations for older scaffolded projects.
 * Only non-destructive compatibility metadata updates are applied.
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

  reporter.info(`Created backup of existing files at ${path.relative(projectRoot, backupDir)}`);
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

async function applySafeProjectMigrations(projectRoot, reporter, cliPkg, cliVersion) {
  const migratedFiles = [];
  const metadataPath = path.join(projectRoot, ".loom", "metadata.json");

  await createBackup(projectRoot, reporter, [metadataPath]);
  const refreshed = await refreshMetadata(projectRoot, reporter, cliPkg, cliVersion);
  if (refreshed) migratedFiles.push(refreshed);

  return migratedFiles;
}

function looksLikeStackloomProject(root) {
  const hasBlueprint = existsSync(path.join(root, ".loom", "blueprint.json"));
  const hasStack =
    existsSync(path.join(root, "backend")) && existsSync(path.join(root, "frontend"));
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
    reporter.step(`Effective blueprint: ${path.relative(projectRoot, bp.source) || bp.source}`);
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
          reporter.success(`Template metadata satisfied: ${meta.engineCompatibility}`);
        }
      }
      if (meta.stack) reporter.info(`Template stack: ${meta.stack}`);
    }

    reporter.step(
      "Schema migrations and `generate --amend` are planned — see stackloom ROADMAP.md.",
    );

    const ok = errors === 0;
    if (ok && warnings === 0) reporter.success("Compatibility check passed");
    else if (ok)
      reporter.warn(`Check finished with ${warnings} warning(s) — review messages above.`);

    migrationsApplied = [];
    if (ok && write) {
      reporter.step("Applying safe upgrade migrations");
      migrationsApplied = await applySafeProjectMigrations(
        projectRoot,
        reporter,
        cliPkg,
        cliVersion,
      );
      if (migrationsApplied.length) {
        reporter.success(`Applied ${migrationsApplied.length} safe project migration(s).`);
      } else {
        reporter.info("No safe migration changes were necessary.");
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
    reporter.result({ ok: false, error: err.message, cliVersion, migrationsApplied });
    process.exitCode = 1;
    bump("error");
    reporter.flush();
    return { ok: false, warnings, errors, migrationsApplied };
  }

  reporter.flush();
  return { ok: errors === 0, warnings, errors, migrationsApplied };
}
