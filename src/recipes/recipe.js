/**
 * Recipe — a validated generation manifest with behavior.
 *
 * `plan()` turns the declarative manifest into a concrete, resolved plan for a
 * specific invocation: param defaults applied, `when` conditions evaluated,
 * output paths rendered against the blueprint. The engine then just executes
 * the plan — it never decides *what* to generate, only *how*.
 */
import { evaluateCondition } from "./condition.js";

/** Substitute `{token}` placeholders from `values`; unknown tokens are left intact. */
function interpolate(str, values) {
  return str.replace(/\{([\w.-]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export class Recipe {
  /**
   * @param {object} data - validated recipe data
   * @param {string} source - absolute path the recipe was loaded from
   */
  constructor(data, source = "unknown") {
    this.data = data;
    this.source = source;
  }

  get name() {
    return this.data.name;
  }

  get description() {
    return this.data.description || "";
  }

  get params() {
    return this.data.params;
  }

  /**
   * Merge declared param defaults under a caller-supplied context. Caller values
   * win; any param the caller omitted falls back to its declared default.
   */
  applyParamDefaults(context = {}) {
    const out = { ...context };
    for (const [key, spec] of Object.entries(this.data.params)) {
      if (out[key] === undefined) out[key] = spec.default;
    }
    return out;
  }

  /**
   * Resolve the manifest into a concrete plan for one invocation.
   * @param {object} args
   * @param {Record<string, unknown>} args.context - eval context (params + derived flags)
   * @param {import('../blueprint/blueprint.js').Blueprint} [args.blueprint] - resolves `out` path tokens
   * @param {string} [args.projectRoot] - project root for path resolution
   * @param {Record<string, string>} [args.vars] - extra `{token}` substitutions (kebab, Name, ...)
   * @returns {{ recipe: string, context: object, files: Array, inject: Array, requires: Array }}
   */
  plan({ context = {}, blueprint, projectRoot, vars = {} } = {}) {
    const ctx = this.applyParamDefaults(context);
    const keep = (entry) => evaluateCondition(entry.when, ctx);
    const renderOut = (template) =>
      blueprint ? blueprint.renderTemplate(template, projectRoot, vars) : template;
    // Template *paths* may also carry `{token}`s — notably `{formMode}`, so one
    // recipe entry resolves to the right page-shell variant per invocation.
    const tokens = { ...ctx, ...vars };
    const renderTemplatePath = (template) => interpolate(template, tokens);

    const files = this.data.files.filter(keep).map((file) => ({
      template: renderTemplatePath(file.template),
      out: renderOut(file.out),
    }));

    const inject = this.data.inject.filter(keep).map((entry) => ({
      anchor: entry.anchor,
      template: renderTemplatePath(entry.template),
    }));

    const requires = this.data.requires.filter(keep).map((req) => ({
      scope: req.scope,
      package: req.package,
      version: req.version,
    }));

    return { recipe: this.name, context: ctx, files, inject, requires };
  }
}
