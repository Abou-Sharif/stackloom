/**
 * BlueprintLoader — resolves, reads, and validates a blueprint for a project.
 *
 * Resolution is three-tier, highest priority first:
 *   1. <project>/.loom/blueprint.json   — the template's own contract
 *   2. ~/.loom/blueprint.json           — a user-global override
 *   3. <cli>/default.blueprint.json    — the shipped MERN fallback
 *
 * Every blueprint is schema-validated before use, so a malformed manifest fails
 * fast with a path-pointed error instead of producing broken code downstream.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { blueprintSchema, SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";
import { Blueprint } from "./blueprint.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const BUILTIN = path.join(__dirname, "default.blueprint.json");

/** Raised when a blueprint cannot be read, fails schema validation, or is incompatible. */
export class BlueprintLoadError extends Error {
  constructor(message, { source, issues } = {}) {
    super(message);
    this.name = "BlueprintLoadError";
    this.source = source;
    this.issues = issues;
  }
}

export class BlueprintLoader {
  /** Candidate blueprint locations for a project, highest priority first. */
  locations(projectRoot) {
    return [
      path.join(projectRoot, ".loom", "blueprint.json"),
      path.join(HOME, ".loom", "blueprint.json"),
      BUILTIN,
    ];
  }

  /** Absolute path to the CLI's built-in fallback blueprint. */
  get builtinPath() {
    return BUILTIN;
  }

  /** First existing blueprint file for a project. Built-in is the guaranteed floor. */
  resolve(projectRoot = process.cwd()) {
    for (const loc of this.locations(projectRoot)) {
      if (existsSync(loc)) return loc;
    }
    throw new BlueprintLoadError(
      `No blueprint found and the built-in default is missing (expected at ${BUILTIN}).`,
    );
  }

  /** Load + validate the effective blueprint for a project. */
  async load(projectRoot = process.cwd()) {
    return this.loadFile(this.resolve(projectRoot));
  }

  /** Load + validate a blueprint from an explicit file path. */
  async loadFile(source) {
    let raw;
    try {
      raw = JSON.parse(await readFile(source, "utf-8"));
    } catch (err) {
      throw new BlueprintLoadError(
        `Could not read blueprint JSON at ${source}: ${err.message}`,
        { source },
      );
    }

    const parsed = blueprintSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`,
      );
      throw new BlueprintLoadError(
        `Invalid blueprint at ${source}:\n${issues.join("\n")}`,
        { source, issues: parsed.error.issues },
      );
    }

    if (!SUPPORTED_SCHEMA_VERSIONS.includes(parsed.data.schemaVersion)) {
      throw new BlueprintLoadError(
        `Blueprint at ${source} declares schemaVersion "${parsed.data.schemaVersion}", ` +
          `but this CLI supports: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}. ` +
          `Upgrade the CLI or the project's blueprint.`,
        { source },
      );
    }

    return new Blueprint(parsed.data, source);
  }
}

/** Shared loader instance for convenience. */
export const blueprintLoader = new BlueprintLoader();
