import ora from "ora";
import {
  getAiConfig,
  buildFixPrompt,
  callLlm,
  parseJsonResponse,
  loadResourceDefinition,
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

export default async function aiFix(resourceName, issue, options = {}) {
  const reporter = reporterFromOptions(options);

  if (!resourceName || !issue) {
    reporter.error(
      'Usage: loom ai fix <ResourceName> "<description of what\'s wrong>"',
    );
    reporter.result({ error: "Missing resource name or issue description" });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const definition = loadResourceDefinition(resourceName);
  if (!definition) {
    reporter.error(
      `No stored definition found for ${resourceName}. Generate it first:\n  loom generate resource ${resourceName} --fields "..."`,
    );
    reporter.result({ error: `Resource ${resourceName} not found` });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const config = getAiConfig();
  const spinner = ora({
    text: `Analyzing ${resourceName} with ${config.model}...`,
    spinner: "dots",
    color: "cyan",
  });

  try {
    const prompt = buildFixPrompt(resourceName, definition, issue);

    if (options.debug) {
      reporter.debug(`Prompt:\n${prompt}`);
    }

    spinner.start();
    const response = await callLlm(prompt, config);
    spinner.stop();

    const correctedSpec = parseJsonResponse(response);

    if (correctedSpec.error) {
      reporter.error(`AI could not analyze this: ${correctedSpec.error}`);
      reporter.result({ error: correctedSpec.error });
      reporter.flush();
      process.exitCode = 1;
      return;
    }

    const target = correctedSpec.name || correctedSpec.resources?.[0]?.name;
    const res = correctedSpec.resources?.[0] || correctedSpec;

    reporter.step(`Applying fix to ${target || resourceName}...`);

    const fields = (res.fields || []).map(toFieldSpec).join(";");
    const relations = toRelationsSpec(res);

    try {
      const prevCi = process.env.CI;
      process.env.CI = "true";
      try {
        await generateResource("resource", res.name || resourceName, {
          ...options,
          projectRoot: options.projectRoot || process.cwd(),
          fields: fields || undefined,
          relations: relations || undefined,
          arch: res.options?.arch || options.arch || getProjectArch(),
          amend: true,
          force: true,
          interactive: false,
          brief: options.brief ?? true,
        });
      } finally {
        if (prevCi === undefined) delete process.env.CI;
        else process.env.CI = prevCi;
      }
      reporter.success(`${res.name || resourceName} fixed`);
      reporter.result({ resource: res.name || resourceName, status: "fixed" });
    } catch (err) {
      reporter.error(`Failed to apply fix: ${err.message}`);
      reporter.result({ error: err.message });
      reporter.flush();
      process.exitCode = 1;
      return;
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
