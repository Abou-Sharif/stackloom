import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import {
  getAiConfig,
  buildScaffoldPrompt,
  callLlm,
  parseJsonResponse,
  getProjectArch,
} from "./index.js";
import { reporterFromOptions } from "../../services/index.js";
import generateResource from "../generate-resource.js";

function toFieldSpec(field) {
  const rules = [];
  const v = field.validation || {};
  if (v.required) rules.push("required");
  if (v.unique) rules.push("unique");
  if (v.minLength != null) rules.push(`minLength=${v.minLength}`);
  if (v.maxLength != null) rules.push(`maxLength=${v.maxLength}`);
  if (v.min != null) rules.push(`min=${v.min}`);
  if (v.max != null) rules.push(`max=${v.max}`);
  if (v.pattern) rules.push(`pattern=${v.pattern}`);
  const isRef = field.type === "ref" || field.type === "reference";
  const refModel = field.special?.model;
  if (isRef && refModel) {
    const base = `${field.name}:ref[${refModel}]`;
    return rules.length ? `${base}:${rules.join("|")}` : base;
  }
  const isSelect = field.type === "select" || field.type === "multiselect";
  if (isSelect && field.special?.options?.length) {
    const base = `${field.name}:${field.type}[${field.special.options.join(",")}]`;
    return rules.length ? `${base}:${rules.join("|")}` : base;
  }
  return rules.length
    ? `${field.name}:${field.type}:${rules.join("|")}`
    : `${field.name}:${field.type}`;
}

function toRelationsSpec(resource) {
  const parts = [];
  const seen = new Set();
  const rel = resource.relations || {};
  if (Array.isArray(rel.belongsTo)) {
    for (const bt of rel.belongsTo) {
      const key = `bt:${bt.field}:${bt.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        parts.push(`${bt.field}:belongsTo:${bt.model}`);
      }
    }
  }
  if (Array.isArray(rel.hasMany)) {
    for (const hm of rel.hasMany) {
      const key = `hm:${hm.field}:${hm.model}:${hm.foreignKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        parts.push(`${hm.field}:hasMany:${hm.model}:${hm.foreignKey}`);
      }
    }
  }
  return parts.join(";");
}

function toTitle(str) {
  return str
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Load existing blueprint architecture default.
 */
function projectArch() {
  try {
    const bp = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), ".loom", "blueprint.json"), "utf-8"),
    );
    return bp.architecture?.name || getProjectArch();
  } catch {
    return getProjectArch();
  }
}

export default async function aiScaffold(scenarioName, options = {}) {
  const reporter = reporterFromOptions(options);

  if (!scenarioName) {
    reporter.error(
      'Usage: loom ai scaffold "<description of the system to build>"',
    );
    reporter.result({ error: "Missing scenario description" });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const config = getAiConfig();
  const spinner = ora({
    text: `Designing ${scenarioName} with ${config.model}...`,
    spinner: "dots",
    color: "cyan",
  });

  try {
    const projectContext = `Architecture level: ${options.arch || projectArch()}`;
    const prompt = buildScaffoldPrompt(scenarioName, projectContext);

    if (options.dryRun || options.debug) {
      reporter.debug(`Prompt:\n${prompt}`);
    }

    if (options.dryRun) {
      reporter.info("Dry run — prompt built, not sending to LLM");
      reporter.result({ dryRun: true, scenario: scenarioName });
      reporter.flush();
      return;
    }

    spinner.start();
    const response = await callLlm(prompt, config);
    spinner.stop();

    const spec = parseJsonResponse(response);

    if (spec.error) {
      reporter.error(`AI could not design this: ${spec.error}`);
      reporter.result({ error: spec.error });
      reporter.flush();
      process.exitCode = 1;
      return;
    }

    const resources = spec.resources || [];
    if (resources.length === 0) {
      reporter.error("AI returned no resources. Try a more specific description.");
      reporter.result({ error: "No resources in AI response" });
      reporter.flush();
      process.exitCode = 1;
      return;
    }

    reporter.step(
      `Design complete — ${resources.length} resource(s) identified`,
    );

    // Show plan
    for (const res of resources) {
      const fields = (res.fields || []).map((f) => `${f.name}:${f.type}`).join(", ");
      const relParts = [];
      if (res.relations?.belongsTo) {
        relParts.push(...res.relations.belongsTo.map((r) => `→ ${r.model}`));
      }
      if (res.relations?.hasMany) {
        relParts.push(...res.relations.hasMany.map((r) => `→ ${r.model} (${r.field})`));
      }
      const relStr = relParts.length ? ` [${relParts.join(", ")}]` : "";
      reporter.info(`  ${res.name}: ${fields}${relStr}`);
    }

    if (!options.yes) {
      const inquirer = await import("inquirer");
      const { proceed } = await inquirer.default.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: `Generate all ${resources.length} resource(s)?`,
          default: true,
        },
      ]);
      if (!proceed) {
        reporter.info("Scaffold cancelled.");
        reporter.result({ cancelled: true });
        reporter.flush();
        return;
      }
    }

    // Generate each resource sequentially
    const results = [];
    for (const res of resources) {
      if (!res.name) {
        reporter.warn("Skipping resource without a name");
        continue;
      }

      const fields = (res.fields || []).map(toFieldSpec).join(";");
      const relations = toRelationsSpec(res);

      reporter.step(`Generating ${res.name}...`);

      try {
        const prevCi = process.env.CI;
        process.env.CI = "true";
        try {
          await generateResource("resource", res.name, {
            ...options,
            projectRoot: options.projectRoot || process.cwd(),
            fields: fields || undefined,
            relations: relations || undefined,
            arch: res.options?.arch || options.arch || projectArch(),
            crud: res.options?.crud || options.crud || "full",
            formMode: res.options?.formMode || options.formMode || "page",
            interactive: false,
            brief: true,
            frontend: options.frontend !== false,
            amend: false,
          });
        } finally {
          if (prevCi === undefined) delete process.env.CI;
          else process.env.CI = prevCi;
        }
        results.push({ name: res.name, ok: true });
        reporter.success(`  ✓ ${res.name}`);
      } catch (err) {
        results.push({ name: res.name, ok: false, error: err.message });
        reporter.warn(`  ✗ ${res.name}: ${err.message}`);
      }
    }

    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    console.log("");
    reporter.result({ results, ok, fail });
    if (fail === 0) {
      reporter.success(
        `Scaffolded ${ok} resource(s) — run "loom explain" to see the project`,
      );
    } else {
      reporter.warn(`${ok} ok, ${fail} failed`);
    }
  } catch (err) {
    spinner.stop();
    reporter.error(err.message);
    reporter.result({ error: err.message });
    reporter.flush();
    process.exitCode = 1;
    return;
  }
  reporter.flush();
}
