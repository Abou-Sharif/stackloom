/**
 * Pipeline — composable generation as an ordered list of small steps.
 *
 * Generation is not a god-class with a dozen methods; it is a sequence of
 * independently testable steps that pass one accumulating context object
 * along. New capabilities are new steps, not new branches. The standard
 * transactional pipeline is:
 *
 *   plan → render → validate → commit
 *
 * render-to-temp, validate-everything, then atomic-commit — so a syntactically
 * broken file is caught before anything touches the project.
 */
import path from "node:path";
import { FileTransaction, realFs } from "./transaction.js";
import { Validator } from "./validator.js";
import { Injector } from "./injector.js";
import { mergeAmendContent, auditAmendSafety, formatAmendSafetyError } from "../core/amend-merge.js";

export class Pipeline {
  constructor(steps = []) {
    this.steps = [...steps];
  }

  /** Append a step. */
  use(step) {
    this.steps.push(step);
    return this;
  }

  /** Run every step in order, threading `context` through. Returns the context. */
  async run(context = {}) {
    for (const step of this.steps) {
      if (!step || typeof step.run !== "function") {
        throw new Error(`Pipeline step "${step?.name ?? "?"}" has no run() method`);
      }
      await step.run(context);
    }
    return context;
  }
}

/** Build a named step. */
export function defineStep(name, run) {
  return { name, run };
}

/** Resolve the recipe manifest into a concrete plan for this invocation. */
export const planStep = defineStep("plan", (context) => {
  const { recipe, blueprint, projectRoot, recipeContext = {}, vars = {} } = context;
  if (!recipe) throw new Error("Generation pipeline: context.recipe is required");
  context.plan = recipe.plan({ context: recipeContext, blueprint, projectRoot, vars });
});

/** Render each planned file and stage it in a transaction — nothing written yet. */
export function createRenderStep({ renderer, fs = realFs }) {
  if (typeof renderer !== "function") {
    throw new Error("createRenderStep requires a renderer(templatePath, context) function");
  }
  return defineStep("render", async (context) => {
    const { projectRoot, plan, templateContext = {} } = context;
    const transaction = new FileTransaction({ projectRoot, fs });
    for (const file of plan.files) {
      const content = await renderer(file.template, templateContext);
      transaction.stage(file.out, content);
    }
    context.transaction = transaction;
  });
}

/**
 * Render each recipe `inject` snippet and splice it into the project's anchor
 * files, staging the modified files into the same transaction. Idempotent.
 */
export function createInjectStep({ renderer, injector }) {
  if (typeof renderer !== "function") {
    throw new Error("createInjectStep requires a renderer(templatePath, context) function");
  }
  const inj = injector ?? new Injector();
  return defineStep("inject", async (context) => {
    const { plan, blueprint, projectRoot, transaction, templateContext = {} } = context;
    context.injections = [];
    for (const entry of plan.inject || []) {
      const snippet = await renderer(entry.template, templateContext);
      context.injections.push(
        inj.inject({ anchorName: entry.anchor, snippet, blueprint, projectRoot, transaction }),
      );
    }
  });
}

/**
 * Estimate generation time based on file count.
 */
function estimateDuration(fileCount) {
  if (fileCount <= 0) return { seconds: 0, label: "instant" };
  const est = Math.ceil(fileCount * 0.5);
  if (est < 60) return { seconds: est, label: `~${est}s` };
  return { seconds: est, label: `~${Math.ceil(est / 60)}m ${est % 60}s` };
}

/**
 * Preview step — counts planned files and estimates duration.
 * Injects preview info into context so the CLI can show it before generation.
 */
export const previewStep = defineStep("preview", (context) => {
  const { plan } = context;
  const files = plan.files || [];
  const injects = plan.inject || [];
  const estimate = estimateDuration(files.length + injects.length);
  context.preview = {
    files: files.map((f) => f.out),
    injects: injects.map((i) => i.anchor),
    total: files.length + injects.length,
    estimate,
  };
});

/**
 * On `--amend`, merge staged outputs with on-disk files (custom zones / markers).
 * Injection targets are handled in the inject step and are not merged here.
 */
export function createAmendMergeStep({ fs = realFs, force = false, resourceName = "" } = {}) {
  return defineStep("amend-merge", (context) => {
    if (!context.amend) return;
    const { projectRoot, transaction, plan } = context;
    const recipePaths = new Set((plan?.files ?? []).map((f) => f.out.replace(/\\/g, "/")));
    const safetyIssues = [];
    const pending = [];

    for (const file of transaction.staged()) {
      const rel = file.relPath.replace(/\\/g, "/");
      if (!recipePaths.has(rel)) continue;

      const abs = path.join(projectRoot, rel);
      const existing = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";

      if (existing && !force) {
        safetyIssues.push(...auditAmendSafety(existing, file.content, rel));
      }

      pending.push({ rel, existing, incoming: file.content });
    }

    if (safetyIssues.length > 0) {
      throw formatAmendSafetyError(safetyIssues);
    }

    for (const { rel, existing, incoming } of pending) {
      const merged = mergeAmendContent({
        existing,
        incoming,
        relPath: rel,
        resourceName,
        force,
      });
      transaction.stage(rel, merged.content);
    }
  });
}

/** Validate every staged file; abort the whole generation on any failure. */
export function createValidateStep({ validator = new Validator() } = {}) {
  return defineStep("validate", (context) => {
    const result = validator.validateAll(context.transaction.staged());
    context.validation = result;
    if (!result.ok) {
      const detail = result.failures.map((f) => `  • ${f.relPath}: ${f.message}`).join("\n");
      throw new Error(
        `Generation aborted — ${result.failures.length} file(s) failed validation:\n${detail}`,
      );
    }
  });
}

/** Commit the transaction — or, in dry-run, just record the plan. */
export const commitStep = defineStep("commit", (context) => {
  const { transaction, dryRun } = context;
  context.result = dryRun
    ? { dryRun: true, files: transaction.plan() }
    : { dryRun: false, files: transaction.commit() };
});

/**
 * Compose the standard transactional generation pipeline:
 *   plan → render → [amend-merge] → inject → validate → commit
 * Rendering is injected so the engine never depends on a specific template
 * library. Pass `withInject: false` to skip anchor injection (e.g. recipes that
 * only emit standalone files, or tests exercising render/commit in isolation).
 * @param {object} args
 * @param {(templatePath:string, context:object) => Promise<string>|string} args.renderer
 * @param {Validator} [args.validator]
 * @param {Injector} [args.injector]
 * @param {typeof realFs} [args.fs]
 * @param {boolean} [args.withInject=true]
 * @param {boolean} [args.amend=false]
 * @param {boolean} [args.force=false]
 * @param {string} [args.resourceName]
 */
export function createGenerationPipeline({
  renderer,
  validator,
  injector,
  fs = realFs,
  withInject = true,
  amend = false,
  force = false,
  resourceName = "",
  preview = false,
} = {}) {
  const steps = [planStep];
  if (preview) steps.push(previewStep);
  steps.push(createRenderStep({ renderer, fs }));
  if (amend) {
    steps.push(createAmendMergeStep({ fs, force, resourceName }));
  }
  if (withInject) {
    steps.push(createInjectStep({ renderer, injector: injector ?? new Injector({ fs }) }));
  }
  steps.push(createValidateStep({ validator }), commitStep);
  return new Pipeline(steps);
}
