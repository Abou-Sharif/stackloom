import ora from "ora";
import {
  getAiConfig,
  buildDescribePrompt,
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

export default async function aiChange(resourceName, changeDescription, options = {}) {
  const reporter = reporterFromOptions(options);

  if (!resourceName || !changeDescription) {
    reporter.error(
      'Usage: loom ai change <ResourceName> "<what to change>"',
    );
    reporter.result({ error: "Missing resource name or change description" });
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
    text: `Planning change for ${resourceName} with ${config.model}...`,
    spinner: "dots",
    color: "cyan",
  });

  try {
    const existingJson = JSON.stringify(definition, null, 2);
    const prompt = `You are StackLoom AI. Output ONLY valid JSON.

## Existing Resource Definition
\`\`\`json
${existingJson}
\`\`\`

## Change Request
${changeDescription}

## Task
Return the COMPLETE UPDATED resource definition as a JSON object with ALL existing fields preserved PLUS the requested changes.
Do NOT omit any existing fields. Only add, remove, or modify fields as the change request specifies.

Important:
- Every field must have: name, type, validation (object), special (object)
- For select/multiselect: set special.options array
- For ref: set special.model to PascalCase target
- ${options.context || ""}

Output just the JSON wrapped in \`\`\`json ... \`\`\` markers.`;

    if (options.debug) {
      reporter.debug(`Prompt:\n${prompt}`);
    }

    spinner.start();
    const response = await callLlm(prompt, config);
    spinner.stop();

    const updatedSpec = parseJsonResponse(response);
    const res = updatedSpec.resources?.[0] || updatedSpec;

    if (!res.name && !res.fields) {
      throw new Error(
        "AI response must be a resource definition with name and fields. Got: " +
          JSON.stringify(res).slice(0, 500),
      );
    }

    const oldFields = definition.fields || [];
    const newFieldList = res.fields || [];
    const existingNames = oldFields.map((f) => f.name);
    const newNames = newFieldList.map((f) => f.name);
    const added = newNames.filter((n) => !existingNames.includes(n));
    const removed = existingNames.filter((n) => !newNames.includes(n));

    // Also detect modified fields (same name, different content)
    const modified = newFieldList.filter((nf) => {
      const old = oldFields.find((of) => of.name === nf.name);
      return old && JSON.stringify(old) !== JSON.stringify(nf);
    }).map((f) => f.name);

    if (added.length === 0 && removed.length === 0 && modified.length === 0) {
      reporter.warn("AI returned no changes");
      reporter.result({ resource: resourceName, status: "no-change" });
      reporter.flush();
      return;
    }

    if (modified.length) {
      reporter.info(`Modifying: ${modified.join(", ")}`);
    }

    const fields = (res.fields || []).map(toFieldSpec).join(";");
    const relations = toRelationsSpec(res);

    reporter.step(
      `${added.length ? "+" + added.join(", ") : ""}${removed.length ? " -" + removed.join(", ") : ""} on ${resourceName}`,
    );

    try {
      const prevCi = process.env.CI;
      process.env.CI = "true";
      try {
        await generateResource("resource", resourceName, {
          ...options,
          projectRoot: options.projectRoot || process.cwd(),
          fields,
          relations: relations || undefined,
          arch: res.options?.arch || options.arch || definition.options?.arch || getProjectArch(),
          amend: true,
          force: true,
          interactive: false,
          brief: options.brief ?? true,
        });
      } finally {
        if (prevCi === undefined) delete process.env.CI;
        else process.env.CI = prevCi;
      }
      reporter.success(`${resourceName} updated`);
      reporter.result({
        resource: resourceName,
        status: "updated",
        added,
        removed,
      });
    } catch (err) {
      reporter.error(`Failed to apply change: ${err.message}`);
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
