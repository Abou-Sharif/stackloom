/**
 * Branding — the single source of truth for the CLI's own identity.
 *
 * Every place that would otherwise hardcode "loom" (the bin name, help text,
 * output prefixes, the state-dir name) reads from here instead, so the whole
 * tool can be rebranded by editing one JSON file or running `loom rename`.
 *
 * `loadBrandingFrom` / `saveBrandingTo` are pure (path-injected) so they can be
 * tested without touching the real config.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** branding.json lives at the CLI package root (two levels up from src/branding/). */
export const brandingPath = path.join(__dirname, "..", "..", "branding.json");

/** Shipped defaults — also the fallback when branding.json is missing or invalid. */
export const defaultBranding = Object.freeze({
  binName: "loom",
  displayName: "Stackloom",
  description: "Stackloom — weave production-ready full-stack apps from a single command",
  tagline: "Weave full-stack apps from a single command",
  stateDirName: ".loom",
  packageName: "stackloom",
});

/** Load branding from a file, layered over the shipped defaults. Never throws. */
export function loadBrandingFrom(file) {
  if (!existsSync(file)) return { ...defaultBranding };
  try {
    return { ...defaultBranding, ...JSON.parse(readFileSync(file, "utf-8")) };
  } catch {
    return { ...defaultBranding };
  }
}

/** Persist branding updates to a file, layered over `base`. Returns the written object. */
export function saveBrandingTo(file, updates, base = defaultBranding) {
  const next = { ...base, ...updates };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
}

/** The effective branding for this CLI install. */
export const branding = loadBrandingFrom(brandingPath);
