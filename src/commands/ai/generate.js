import ora from "ora";
import path from "node:path";
import fs from "node:fs";
import {
  getAiConfig,
  buildDescribePrompt,
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
  if (isSelect && field.special?.options) {
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

async function generateResourceFromSpec(resource, options) {
  const fields = (resource.fields || []).map(toFieldSpec).join(";");
  const relations = toRelationsSpec(resource);

  const genOptions = {
    ...options,
    fields: fields || undefined,
    relations: relations || undefined,
    arch: resource.options?.arch || options.arch || getProjectArch(),
    crud: resource.options?.crud || options.crud || "full",
    formMode: resource.options?.formMode || options.formMode || "page",
    interactive: false,
    brief: options.brief ?? true,
    frontend: options.frontend !== false,
    amend: false,
  };

  const prevCi = process.env.CI;
  process.env.CI = "true";
  try {
    return await generateResource("resource", resource.name, genOptions);
  } finally {
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
  }
}

export default async function aiGenerate(resourceName, userInput, options = {}) {
  const reporter = reporterFromOptions(options);

  if (!resourceName && !userInput) {
    reporter.error(
      "Usage: loom ai generate <ResourceName> \"<description>\"\n  or: loom ai generate \"<full description>\" (will extract resource name)",
    );
    reporter.result({ error: "Missing arguments" });
    reporter.flush();
    process.exitCode = 1;
    return;
  }

  const config = getAiConfig();
  const spinner = ora({
    text: `Asking ${config.model}...`,
    spinner: "dots",
    color: "cyan",
  });

  let effectiveInput = userInput || resourceName;
  let effectiveName = resourceName;

  // If user gave just one arg like "task management system", treat it as full NL
  if (!userInput) {
    effectiveInput = resourceName;
    effectiveName = "";
  }

  try {
    const prompt = buildDescribePrompt(effectiveInput);

    if (options.debug) {
      reporter.debug(`Prompt:\n${prompt}`);
    }

    spinner.start();
    const response = await callLlm(prompt, config);
    spinner.stop();

    const spec = parseJsonResponse(response);

    if (spec.error) {
      reporter.error(`AI could not process this: ${spec.error}`);
      reporter.result({ error: spec.error });
      reporter.flush();
      process.exitCode = 1;
      return;
    }

    const resources = spec.resources || [spec];
    const results = [];

    for (const res of resources) {
      if (!res.name) {
        reporter.warn("Skipping resource definition without a name");
        continue;
      }

      // If user provided explicit name, filter to match
      if (effectiveName && res.name !== effectiveName) continue;

      reporter.step(`Generating ${res.name} (${res.description || ""})`);
      try {
        await generateResourceFromSpec(res, {
          ...options,
          projectRoot: options.projectRoot || process.cwd(),
        });
        results.push({ name: res.name, ok: true });
      } catch (err) {
        results.push({ name: res.name, ok: false, error: err.message });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    reporter.result({ results, ok, fail });
    if (fail > 0) {
      reporter.warn(`${fail} resource(s) failed`);
    } else {
      reporter.success(`${ok} resource(s) generated`);
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
