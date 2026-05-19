/**
 * Minimal semver helpers for CLI ↔ blueprint compatibility (no dependency).
 * Compares dotted numeric versions; ignores pre-release suffixes for the core triple.
 */

function coreParts(version) {
  const core = String(version ?? "")
    .trim()
    .split(/[-+]/)[0];
  return core.split(".").map((p) => parseInt(p, 10) || 0);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareSemver(a, b) {
  const pa = coreParts(a);
  const pb = coreParts(b);
  const n = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/** True if `cliVersion` is >= `minCliVersion`. */
export function minCliSatisfied(cliVersion, minCliVersion) {
  if (!minCliVersion) return true;
  return compareSemver(cliVersion, minCliVersion) >= 0;
}

/**
 * Parse `engineCompatibility` from `.loom/metadata.json`, e.g. `stackloom-cli@>=1.0.0`.
 * @returns {{ op: string, version: string } | null}
 */
export function parseMetadataCompat(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/stackloom-cli@\s*(>=|>|=)?\s*v?([\d.]+)/i);
  if (!m) return null;
  return { op: (m[1] || ">=").trim(), version: m[2] };
}

export function metadataCompatSatisfied(cliVersion, compat) {
  if (!compat) return true;
  const c = compareSemver(cliVersion, compat.version);
  if (compat.op === ">=") return c >= 0;
  if (compat.op === ">") return c > 0;
  if (compat.op === "=") return c === 0;
  return true;
}
