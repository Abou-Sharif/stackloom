#!/usr/bin/env node
/**
 * Template contract smoke check.
 *
 * Verifies that the MERN template ships every file the CLI contract requires.
 * Pure file-existence + JSON-shape checks — no network, no install, no spawn.
 *
 * Usage:
 *   node test-smoke.js                       # checks ../stackloom-templates/mern
 *   node test-smoke.js <path-to-template>    # checks a specific template root
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT =
  process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "stackloom-templates", "mern");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

let failed = 0;

function pass(msg) {
  console.log(`  ${GREEN}✔${RESET} ${msg}`);
}
function fail(msg) {
  console.error(`  ${RED}✖${RESET} ${msg}`);
  failed += 1;
}
function info(msg) {
  console.log(`${CYAN}▶${RESET} ${msg}`);
}

function safeReadFile(absPath) {
  try {
    return { ok: true, data: fs.readFileSync(absPath, "utf-8") };
  } catch (err) {
    return { ok: false, error: `${err.code || "ERR"}: ${err.message}` };
  }
}

function safeParseJson(absPath) {
  const read = safeReadFile(absPath);
  if (!read.ok) return read;
  try {
    return { ok: true, data: JSON.parse(read.data) };
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err.message}` };
  }
}

function checkExists(rel) {
  const abs = path.join(ROOT, ...rel.split("/"));
  if (!fs.existsSync(abs)) {
    fail(`${rel} — missing`);
    return false;
  }
  pass(`${rel} — present`);
  return true;
}

info(`Template root: ${ROOT}`);
if (!fs.existsSync(ROOT)) {
  console.error(`\n${RED}✖${RESET} template root does not exist: ${ROOT}`);
  console.error(`  ${YELLOW}fix:${RESET} pass a valid path as the first argument`);
  process.exit(1);
}

console.log("\nContract files:");
const required = [
  "frontend/src/config/app-preset.js",
  "frontend/package.json",
  "backend/package.json",
];
for (const rel of required) checkExists(rel);

console.log("\nBlueprint:");
const blueprintAbs = path.join(ROOT, ".loom", "blueprint.json");
if (!fs.existsSync(blueprintAbs)) {
  fail(".loom/blueprint.json — missing");
} else {
  const parsed = safeParseJson(blueprintAbs);
  if (!parsed.ok) {
    fail(`.loom/blueprint.json — ${parsed.error}`);
  } else {
    pass(".loom/blueprint.json — valid JSON");
    const contract = parsed.data && parsed.data.contract;
    if (!contract || typeof contract !== "object") {
      fail(".loom/blueprint.json — missing 'contract' object");
    } else {
      pass(".loom/blueprint.json — contract block present");
      if (typeof contract.navConfigPath === "string" && contract.navConfigPath.length > 0) {
        pass(`.loom/blueprint.json — contract.navConfigPath = ${contract.navConfigPath}`);
      } else {
        fail(".loom/blueprint.json — contract.navConfigPath missing or empty");
      }
    }
  }
}

console.log("\nMetadata:");
const metaAbs = path.join(ROOT, ".loom", "metadata.json");
if (!fs.existsSync(metaAbs)) {
  fail(".loom/metadata.json — missing");
} else {
  const parsed = safeParseJson(metaAbs);
  if (!parsed.ok) {
    fail(`.loom/metadata.json — ${parsed.error}`);
  } else {
    pass(".loom/metadata.json — valid JSON");
    if (parsed.data && typeof parsed.data.engineCompatibility === "string") {
      pass(`.loom/metadata.json — engineCompatibility = ${parsed.data.engineCompatibility}`);
    } else {
      fail(".loom/metadata.json — engineCompatibility missing");
    }
  }
}

console.log("");
if (failed === 0) {
  console.log(`${GREEN}✓ All contract smoke checks passed.${RESET}`);
  process.exit(0);
}
console.error(`${RED}✖ ${failed} check(s) failed.${RESET}`);
process.exit(1);
