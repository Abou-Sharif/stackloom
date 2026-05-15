/**
 * `loom generate resource|module|page <name>` — the unified, engine-backed
 * generation command.
 *
 * Replaces the divergent code paths (string-template page generator vs the EJS
 * generator) with one flow: blueprint + recipe → transactional pipeline. It
 * decides *nothing* about what files exist or where they go — the recipe and
 * blueprint do — it only wires the pieces and reports.
 */
import path from "node:path";
import { ResourceDefinition, parseFieldSpec } from "../core/resource-definition.js";
import { TemplateLoader } from "../core/template-loader.js";
import { blueprintLoader } from "../blueprint/index.js";
import { recipeLoader } from "../recipes/index.js";
import { createGenerationPipeline } from "../engine/index.js";
import { reporterFromOptions } from "../services/index.js";
import { validateGenerateOptions, validateResourceDefinition } from "../schemas/index.js";

const NAMING = {
  pascal: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  camel: (s) => s.charAt(0).toLowerCase() + s.slice(1),
  kebab: (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase(),
};

/** Build a validated ResourceDefinition from --fields / --file / a bare name. */
async function resolveResource(name, options) {
  let raw;
  if (options.file) {
    const mod = await import(path.resolve(process.cwd(), options.file));
    raw = mod.default || mod;
  } else {
    const fields = options.fields
      ? options.fields
          .split(";")
          .map((spec) => parseFieldSpec(spec.trim()))
          .filter(Boolean)
      : [];
    raw = { name: NAMING.pascal(name), fields };
  }

  // Schema-validate before construction — typed errors, not a thrown stack trace.
  const validated = validateResourceDefinition(raw);
  if (!validated.success) {
    throw new Error(`Invalid resource definition:\n  - ${validated.issues.join("\n  - ")}`);
  }
  return new ResourceDefinition(validated.data);
}

/**
 * @param {string} type - recipe name: "resource" | "module" | "page"
 * @param {string} name - resource name
 * @param {object} options - merged command + global options
 */
export default async function generateResource(type, name, options = {}) {
  const reporter = reporterFromOptions(options);
  const projectRoot = process.cwd();

  try {
    if (!name) throw new Error(`A name is required: loom generate ${type} <Name>`);

    const optionCheck = validateGenerateOptions(options);
    if (!optionCheck.success) {
      throw new Error(`Invalid options:\n  - ${optionCheck.issues.join("\n  - ")}`);
    }

    const resource = await resolveResource(name, options);
    const blueprint = await blueprintLoader.load(projectRoot);
    const recipe = await recipeLoader.load(options.recipe || type, blueprint);

    reporter.step(`Generating ${recipe.name} "${resource.name}" (${blueprint.architecture.name})`);

    // The recipe's `when` evaluation context: params + derived flags.
    const recipeContext = {
      withFrontend: options.frontend !== false,
      withTests: Boolean(options.withTests),
      architecture: options.arch || "moderate",
      formMode: options.formMode || "page",
      usesTypeScript: blueprint.usesTypeScript(projectRoot),
    };
    for (const field of resource.fields) recipeContext[`hasField:${field.name}`] = true;

    // Template-path tokens ({kebab}, {Name}) used by recipe `out`/`template`.
    const vars = { kebab: resource.kebabName, Name: resource.pascalName };

    // EJS rendering bridged to the engine's injected-renderer contract.
    const templates = new TemplateLoader();
    templates.projectRoot = projectRoot;
    const templateContext = {
      resource,
      blueprint,
      options: recipeContext,
      project: { root: projectRoot, usesTypeScript: recipeContext.usesTypeScript },
      utils: NAMING,
    };
    const renderer = (templatePath) => templates.render(templatePath, templateContext, projectRoot);

    const pipeline = createGenerationPipeline({ renderer });
    const ctx = await pipeline.run({
      projectRoot,
      recipe,
      blueprint,
      recipeContext,
      vars,
      templateContext,
      dryRun: Boolean(options.dryRun),
    });

    const { files, dryRun } = ctx.result;
    for (const file of files) {
      reporter.event("file", { action: file.action, path: file.relPath });
      reporter.info(`${file.action === "create" ? "+" : "~"} ${file.relPath}`);
    }
    reporter.result({
      recipe: recipe.name,
      resource: resource.name,
      dryRun,
      files,
      injections: ctx.injections || [],
    });
    reporter.success(
      dryRun
        ? `Dry run — ${files.length} file(s) would change`
        : `Generated ${resource.name} — ${files.length} file(s)`,
    );
  } catch (err) {
    reporter.error(err.message);
    reporter.result({ error: err.message });
    reporter.flush();
    process.exitCode = err.name === "BlueprintLoadError" || err.name === "RecipeLoadError" ? 1 : 2;
    return;
  }
  reporter.flush();
}
