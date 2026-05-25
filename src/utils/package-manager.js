/**
 * Package manager abstraction — maps a normalized PM name to its CLI syntax.
 *
 * Supported: pnpm, npm, yarn, bun
 * Default:   pnpm (the template's canonical PM)
 */

const PM_NAMES = ["pnpm", "npm", "yarn", "bun"];

/** Normalise a user-supplied PM name to canonical form. */
export function normalizePm(pm) {
  if (!pm || typeof pm !== "string") return "pnpm";
  const lower = pm.trim().toLowerCase();
  return PM_NAMES.includes(lower) ? lower : "pnpm";
}

/** Install command (without flags). */
export function installCmd(pm) {
  const map = { pnpm: "pnpm install", npm: "npm install", yarn: "yarn install", bun: "bun install" };
  return map[normalizePm(pm)];
}

/** Add a package command. */
export function addCmd(pm) {
  const map = { pnpm: "pnpm add", npm: "npm install", yarn: "yarn add", bun: "bun add" };
  return map[normalizePm(pm)];
}

/** Remove a package command. */
export function removeCmd(pm) {
  const map = { pnpm: "pnpm remove", npm: "npm uninstall", yarn: "yarn remove", bun: "bun remove" };
  return map[normalizePm(pm)];
}

/** Run a script in the current directory. */
export function runCmd(pm, script) {
  pm = normalizePm(pm);
  if (pm === "npm") return `npm run ${script}`;
  return `${pm} ${script}`;
}

/** Run a script in a subdirectory. */
export function runInDir(pm, dir, script) {
  pm = normalizePm(pm);
  if (pm === "pnpm") return `pnpm -C "${dir}" ${script}`;
  if (pm === "npm") return `npm --prefix "${dir}" run ${script}`;
  return `${pm} --cwd "${dir}" ${script}`; // yarn, bun
}

/** Run a script in a subdirectory (unquoted — for package.json scripts). */
export function runInDirBare(pm, dir, script) {
  pm = normalizePm(pm);
  if (pm === "pnpm") return `pnpm -C ${dir} ${script}`;
  if (pm === "npm") return `npm --prefix ${dir} run ${script}`;
  return `${pm} --cwd ${dir} ${script}`;
}

/**
 * Rewrite the root package.json scripts so they use the target PM instead of pnpm.
 * Matches the template's specific pnpm -C pattern and replaces it.
 */
export function convertRootScripts(pm, scripts) {
  pm = normalizePm(pm);
  if (pm === "pnpm") return scripts; // no conversion needed

  const out = {};
  for (const [key, val] of Object.entries(scripts)) {
    let s = val;
    const prefixCmd = pm === "npm" ? "npm --prefix" : `${pm} --cwd`;
    const runInsert = pm === "npm" ? " run " : " ";

    // pnpm -C "quoted dir" script → target syntax
    s = s.replace(
      /pnpm -C "([^"]+)" (\S+)/g,
      (_, dir, script) => `${prefixCmd} "${dir}"${runInsert}${script}`,
    );
    // pnpm -C dir script → target syntax (unquoted)
    s = s.replace(
      /pnpm -C (\S+) /g,
      (_, dir) => `${prefixCmd} ${dir}${runInsert}`,
    );
    // pnpm install → target install
    s = s.replace(/\bpnpm install\b/g, installCmd(pm));
    // pnpm add → target add
    s = s.replace(/\bpnpm add\b/g, addCmd(pm));
    // leftover bare pnpm calls like "pnpm lint"
    s = s.replace(/\bpnpm\b(?!\s*:)/g, pm);
    out[key] = s;
  }
  return out;
}

/** Rewrite the packageManager field in package.json */
export function packageManagerField(pm) {
  pm = normalizePm(pm);
  const versions = { pnpm: "pnpm@10.12.4", npm: "npm@11.6.0", yarn: "yarn@4.9.1", bun: "bun@1.4.0" };
  return versions[pm];
}
