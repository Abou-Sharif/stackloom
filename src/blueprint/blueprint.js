/**
 * Blueprint — a validated architecture contract with behavior.
 *
 * Wraps the parsed `.loom/blueprint.json` data and exposes the operations the
 * generation engine needs: resolving named roots/paths against a concrete
 * project, looking up injection anchors, and detecting the project language.
 *
 * The engine talks only to this object — never to hardcoded "backend"/"frontend"
 * strings — which is what lets a single engine serve many architectures.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export class Blueprint {
  /**
   * @param {import('./schema.js').BlueprintData} data - validated blueprint data
   * @param {string} source - absolute path the blueprint was loaded from
   */
  constructor(data, source = "unknown") {
    this.data = data;
    this.source = source;
    this._rootCache = new Map();
  }

  get schemaVersion() {
    return this.data.schemaVersion;
  }

  get architecture() {
    return this.data.architecture;
  }

  /** Short architecture id, e.g. "mern". */
  get id() {
    return this.data.architecture.id;
  }

  get conventions() {
    return this.data.conventions;
  }

  /**
   * Resolve a named root directory (e.g. "backend") to its concrete folder name
   * within `projectRoot`. Walks `detect` candidates, confirms each with the
   * root's `marker` file, and falls back to `default`.
   * @returns {string} the resolved directory name (relative to projectRoot)
   */
  resolveRoot(name, projectRoot) {
    const cacheKey = `${projectRoot}::${name}`;
    if (this._rootCache.has(cacheKey)) return this._rootCache.get(cacheKey);

    const root = this.data.roots[name];
    if (!root) {
      throw new Error(
        `Blueprint "${this.id}" has no root named "${name}". ` +
          `Known roots: ${Object.keys(this.data.roots).join(", ") || "(none)"}.`,
      );
    }

    let resolved = root.default;
    for (const candidate of root.detect) {
      if (existsSync(path.join(projectRoot, candidate, root.marker))) {
        resolved = candidate;
        break;
      }
    }

    this._rootCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Expand `{token}` placeholders in a template string. A token resolves from
   * `vars` first, then from the blueprint's named roots.
   */
  expand(template, projectRoot, vars = {}) {
    return template.replace(/\{([\w.]+)\}/g, (_match, token) => {
      if (Object.prototype.hasOwnProperty.call(vars, token)) return vars[token];
      if (this.data.roots[token]) return this.resolveRoot(token, projectRoot);
      throw new Error(
        `Unknown token "{${token}}" in blueprint template "${template}". ` +
          `Provide it via vars or declare a root named "${token}".`,
      );
    });
  }

  /**
   * Render a free-form template that may reference named blueprint paths as
   * `{@path.name}`, directory roots as `{root}`, and caller-supplied `{vars}`.
   * Returns a project-relative string (recipes join it onto the project root).
   *
   * Lets recipes say `{@backend.modules}/{kebab}/{Name}.js` instead of
   * re-spelling `src/modules` — the blueprint stays the single source of truth.
   */
  renderTemplate(template, projectRoot, vars = {}) {
    const withPaths = template.replace(/\{@([\w.-]+)\}/g, (_match, name) => {
      const pathTemplate = this.data.paths[name];
      if (!pathTemplate) {
        throw new Error(
          `Unknown blueprint path "@${name}" in template "${template}". ` +
            `Known paths: ${Object.keys(this.data.paths).join(", ") || "(none)"}.`,
        );
      }
      return pathTemplate;
    });
    return this.expand(withPaths, projectRoot, vars);
  }

  /**
   * Resolve a named path template (e.g. "backend.modules") to an absolute path
   * within `projectRoot`. Extra `vars` are substituted into `{token}` slots.
   */
  resolvePath(name, projectRoot, vars = {}) {
    const template = this.data.paths[name];
    if (!template) {
      throw new Error(
        `Blueprint "${this.id}" has no path named "${name}". ` +
          `Known paths: ${Object.keys(this.data.paths).join(", ") || "(none)"}.`,
      );
    }
    return path.join(projectRoot, this.expand(template, projectRoot, vars));
  }

  hasPath(name) {
    return Boolean(this.data.paths[name]);
  }

  /** Look up a named injection anchor; throws if it is not declared. */
  getAnchor(name) {
    const anchor = this.data.anchors[name];
    if (!anchor) {
      throw new Error(
        `Blueprint "${this.id}" has no anchor named "${name}". ` +
          `Known anchors: ${Object.keys(this.data.anchors).join(", ") || "(none)"}.`,
      );
    }
    return anchor;
  }

  hasAnchor(name) {
    return Boolean(this.data.anchors[name]);
  }

  /** Resolve a named anchor's target file to an absolute path. */
  resolveAnchorFile(name, projectRoot, vars = {}) {
    return path.join(projectRoot, this.expand(this.getAnchor(name).file, projectRoot, vars));
  }

  /** Path to a named recipe manifest (relative to project root), or null. */
  getRecipe(name) {
    return this.data.recipes[name] || null;
  }

  /**
   * Detect the language a project is written in, per the blueprint's
   * `conventions.language` policy. Looks for a `tsconfig.json` in any root.
   * @returns {"javascript"|"typescript"}
   */
  detectLanguage(projectRoot) {
    const { detect, default: fallback } = this.data.conventions.language;
    if (detect === "typescript") {
      for (const name of Object.keys(this.data.roots)) {
        const rootDir = this.resolveRoot(name, projectRoot);
        if (existsSync(path.join(projectRoot, rootDir, "tsconfig.json"))) {
          return "typescript";
        }
      }
    }
    return fallback;
  }

  /** True when the project resolved to TypeScript. */
  usesTypeScript(projectRoot) {
    return this.detectLanguage(projectRoot) === "typescript";
  }

  /** A compact, log-friendly summary. */
  describe() {
    return `${this.architecture.name} (id: ${this.id}, schema: ${this.schemaVersion}) from ${this.source}`;
  }
}
