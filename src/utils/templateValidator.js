/**
 * Template structure validator.
 *
 * Used by `loom init` after copy/extract, before any install — to refuse to
 * spend time on a template that is missing files the CLI contract requires.
 *
 * All functions are pure (path-injected) and return result objects rather than
 * exiting the process, so they can be composed and tested independently.
 *
 * FIX: previously the CLI just trusted the downloaded tarball — a broken or
 * empty template would surface as an opaque "pnpm install failed" error at the
 * tail of the run.
 */

import path from "node:path";
import fs from "fs-extra";

/**
 * Required files for the MERN starter contract. Either `.loom/blueprint.json`,
 * `.loom/blueprint.yaml`, or top-level `blueprint.json` is accepted — the first
 * one found is treated as canonical.
 */
const MERN_REQUIRED = [
  "frontend/src/config/app-preset.js",
  "frontend/package.json",
  "frontend/src/main.jsx",
  "frontend/index.html",
  "backend/package.json",
  "backend/src/app.js",
  "backend/server.js",
];

const MERN_RECOMMENDED = [
  "backend/.env.example",
  "frontend/.env.example",
  "README.md",
];

const BLUEPRINT_CANDIDATES = [
  ".loom/blueprint.json",
  ".loom/blueprint.yaml",
  "blueprint.json",
];

const METADATA_CANDIDATE = ".loom/metadata.json";

/**
 * Resolve the first existing file from a list of candidate relative paths.
 * Returns the absolute path or null.
 */
async function firstExisting(rootPath, candidates) {
  for (const rel of candidates) {
    const abs = path.join(rootPath, ...rel.split("/"));
    try {
      if (await fs.pathExists(abs)) return abs;
    } catch {
      // FIX: never let an fs probe throw an unhandled rejection — treat
      // unreadable paths as "not found" and let the caller surface a clear
      // missing-file error.
    }
  }
  return null;
}

/**
 * Generic helper — given an array of relative paths, return the ones that are
 * missing under `rootPath`. Pure: never throws on a missing path.
 *
 * @param {string} rootPath absolute root of the scaffolded project
 * @param {string[]} pathsArray relative POSIX-style paths (e.g. "frontend/package.json")
 * @returns {Promise<string[]>} relative paths that do not exist
 */
export async function listMissingFiles(rootPath, pathsArray) {
  if (!rootPath || typeof rootPath !== "string") {
    throw new Error(
      `listMissingFiles: rootPath must be a non-empty string (got ${typeof rootPath})`,
    );
  }
  if (!Array.isArray(pathsArray)) {
    throw new Error("listMissingFiles: pathsArray must be an array of strings");
  }

  const missing = [];
  for (const rel of pathsArray) {
    // FIX: split on "/" then path.join so Windows backslash separators are
    // honoured (forward slashes in source array stay portable).
    const abs = path.join(rootPath, ...String(rel).split("/"));
    let exists = false;
    try {
      exists = await fs.pathExists(abs);
    } catch {
      exists = false;
    }
    if (!exists) missing.push(rel);
  }
  return missing;
}

/**
 * Parse a blueprint JSON file safely. Returns { ok, data, error }.
 */
async function safeReadJson(absPath) {
  let raw;
  try {
    raw = await fs.readFile(absPath, "utf-8");
  } catch (err) {
    return { ok: false, error: `cannot read ${absPath}: ${err.message}` };
  }
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `invalid JSON in ${absPath}: ${err.message}` };
  }
}

/**
 * Validate a MERN-shaped template at `rootPath`.
 *
 * @param {string} rootPath absolute path to a scaffolded project root
 * @returns {Promise<{ ok: boolean, errors: string[], warnings: string[] }>}
 */
export async function validateMernTemplate(rootPath) {
  const errors = [];
  const warnings = [];

  if (!rootPath || typeof rootPath !== "string") {
    return {
      ok: false,
      errors: ["validateMernTemplate: rootPath must be a non-empty string"],
      warnings: [],
    };
  }

  // FIX: an entirely missing rootPath used to bubble up as a generic ENOENT
  // from the first fs call. Detect it once, with a clear message.
  let rootExists = false;
  try {
    rootExists = await fs.pathExists(rootPath);
  } catch {
    rootExists = false;
  }
  if (!rootExists) {
    return {
      ok: false,
      errors: [`template root does not exist: ${rootPath}`],
      warnings: [],
    };
  }

  const missingRequired = await listMissingFiles(rootPath, MERN_REQUIRED);
  for (const rel of missingRequired) errors.push(`missing required file: ${rel}`);

  const missingRecommended = await listMissingFiles(rootPath, MERN_RECOMMENDED);
  for (const rel of missingRecommended) warnings.push(`missing recommended file: ${rel}`);

  // Blueprint — at least one of the candidates must exist.
  const blueprintPath = await firstExisting(rootPath, BLUEPRINT_CANDIDATES);
  if (!blueprintPath) {
    errors.push(
      `missing template contract: expected one of ${BLUEPRINT_CANDIDATES.join(", ")}`,
    );
  } else if (blueprintPath.endsWith(".json")) {
    const parsed = await safeReadJson(blueprintPath);
    if (!parsed.ok) {
      errors.push(parsed.error);
    } else if (!parsed.data || typeof parsed.data !== "object") {
      errors.push(`blueprint at ${blueprintPath} must be a JSON object`);
    }
    // FIX: do not require `contract.navConfigPath` at the engine-blueprint
    // level — older blueprints don't have it. The contract-shape validator
    // (validateTemplateContract) enforces it where present.
  }

  // metadata.json is recommended for engine-compat checks, not strictly required.
  const metaAbs = path.join(rootPath, ...METADATA_CANDIDATE.split("/"));
  let metaExists = false;
  try {
    metaExists = await fs.pathExists(metaAbs);
  } catch {
    metaExists = false;
  }
  if (!metaExists) {
    warnings.push(`missing recommended file: ${METADATA_CANDIDATE}`);
  } else {
    const parsed = await safeReadJson(metaAbs);
    if (!parsed.ok) {
      warnings.push(parsed.error);
    } else if (parsed.data && typeof parsed.data === "object") {
      if (!parsed.data.engineCompatibility) {
        warnings.push(
          `${METADATA_CANDIDATE}: missing 'engineCompatibility' field — cannot verify CLI compatibility`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate any template via its `.loom/blueprint.json` contract block.
 * This is the future-proof entry point — works for any stack as long as the
 * template declares its own contract.
 *
 * @param {string} rootPath
 * @returns {Promise<{ ok: boolean, errors: string[], warnings: string[] }>}
 */
export async function validateTemplateContract(rootPath) {
  const errors = [];
  const warnings = [];

  if (!rootPath || typeof rootPath !== "string") {
    return {
      ok: false,
      errors: ["validateTemplateContract: rootPath must be a non-empty string"],
      warnings: [],
    };
  }

  const blueprintPath = await firstExisting(rootPath, BLUEPRINT_CANDIDATES);
  if (!blueprintPath) {
    return {
      ok: false,
      errors: [
        `missing template contract: expected one of ${BLUEPRINT_CANDIDATES.join(", ")}`,
      ],
      warnings: [],
    };
  }

  if (!blueprintPath.endsWith(".json")) {
    // FIX: yaml support not bundled — skip strict contract validation rather
    // than introducing a yaml dependency.
    warnings.push(`blueprint at ${blueprintPath} is not JSON — skipping contract checks`);
    return { ok: true, errors, warnings };
  }

  const parsed = await safeReadJson(blueprintPath);
  if (!parsed.ok) return { ok: false, errors: [parsed.error], warnings };

  const bp = parsed.data;
  const contract = bp && typeof bp === "object" ? bp.contract : null;

  if (!contract || typeof contract !== "object") {
    warnings.push(
      `${path.relative(rootPath, blueprintPath)}: no 'contract' block — skipping contract file checks`,
    );
    return { ok: true, errors, warnings };
  }

  // navConfigPath: file the CLI will rewrite for preset selection.
  if (contract.navConfigPath) {
    const missing = await listMissingFiles(rootPath, [contract.navConfigPath]);
    if (missing.length > 0) {
      errors.push(
        `contract.navConfigPath does not exist: ${contract.navConfigPath}`,
      );
    }
  } else {
    warnings.push("contract.navConfigPath is not declared");
  }

  // entryPoints: { frontend, backend } — recommended.
  if (contract.entryPoints && typeof contract.entryPoints === "object") {
    const ep = contract.entryPoints;
    const list = [ep.frontend, ep.backend].filter(Boolean);
    const missing = await listMissingFiles(rootPath, list);
    for (const m of missing) errors.push(`contract.entryPoints missing file: ${m}`);
  }

  // requiredEnvFiles: env example files we will copy into .env later.
  if (Array.isArray(contract.requiredEnvFiles)) {
    const missing = await listMissingFiles(rootPath, contract.requiredEnvFiles);
    for (const m of missing) warnings.push(`contract.requiredEnvFiles missing: ${m}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
