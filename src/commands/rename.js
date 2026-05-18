/**
 * `loom rename <new-name>` — rebrand the CLI tool itself.
 *
 * Updates branding.json (the runtime source of truth) and package.json's `bin`
 * key so the binary is exposed under the new name after the next install/link.
 * One command, no manual find-and-replace.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { branding, brandingPath, saveBrandingTo } from "../branding/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.join(__dirname, "..", "..", "package.json");

/** A valid CLI/bin command name: lowercase, digits, hyphens, starts with a letter. */
const VALID_NAME = /^[a-z][a-z0-9-]*$/;

export default async function rename(newName, options = {}) {
  if (!newName || !VALID_NAME.test(newName)) {
    console.error(
      `Invalid CLI name "${newName ?? ""}". Use lowercase letters, digits and hyphens, starting with a letter.`,
    );
    process.exit(1);
  }

  const oldBin = branding.binName;
  if (newName === oldBin) {
    console.log(`CLI is already named "${newName}". Nothing to do.`);
    return;
  }

  const displayName = options.displayName || newName.toUpperCase();
  const description = options.description || branding.description;

  // 1. Re-point package.json's bin key, preserving the existing target script.
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
  } catch (err) {
    console.error(`Could not read ${PKG_PATH}: ${err.message}`);
    process.exit(1);
  }
  const binTarget =
    (pkg.bin && (pkg.bin[oldBin] || Object.values(pkg.bin)[0])) || "./bin/cli.js";
  pkg.bin = { [newName]: binTarget };
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");

  // 2. Persist the new identity to branding.json.
  saveBrandingTo(brandingPath, { binName: newName, displayName, description }, branding);

  console.log(`Renamed CLI: ${oldBin} → ${newName}  (display name "${displayName}")`);
  console.log(`Re-link the binary with 'pnpm install' (or 'npm link') to use '${newName}'.`);
}
