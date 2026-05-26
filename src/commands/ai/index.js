import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ROOT = path.resolve(__dirname, "..", "..", "..");

export function getAiConfig() {
  // Read config file from project .loom/ai/config.json
  let fileConfig = {};
  try {
    const cfgPath = path.join(process.cwd(), ".loom", "ai", "config.json");
    if (existsSync(cfgPath)) {
      fileConfig = JSON.parse(readFileSync(cfgPath, "utf-8"));
    }
  } catch {}

  // Env vars override file config
  const provider = process.env.STACKLOOM_AI_PROVIDER || fileConfig.provider || "opencode";
  const apiKey = process.env.STACKLOOM_AI_API_KEY || fileConfig.apiKey || "";
  const model = process.env.STACKLOOM_AI_MODEL || fileConfig.model || "deepseek-v4-flash-free";
  const baseUrl =
    process.env.STACKLOOM_AI_BASE_URL ||
    fileConfig.baseUrl ||
    "https://opencode.ai/zen/v1";

  return { provider, apiKey, model, baseUrl };
}

export function hasAiConfig() {
  const cfg = getAiConfig();
  return Boolean(cfg.apiKey || cfg.provider === "ollama");
}

export function getProjectArch() {
  try {
    const cfgPath = path.join(process.cwd(), ".loom", "config.json");
    if (existsSync(cfgPath)) {
      const loomCfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      return loomCfg.architecture || "lightweight";
    }
  } catch {}
  return "lightweight";
}

const ARCH_ORDER = { lightweight: 0, moderate: 1, advanced: 2 };
export function archLevelIndex(arch) {
  return ARCH_ORDER[arch] ?? 0;
}

export const AI_COMMAND_TIERS = {
  lightweight: ["configure", "describe", "scaffold", "feedback"],
  moderate: ["generate", "fix", "change"],
  advanced: [],
};

export function loadMasterPrompt() {
  const bundled = path.join(CLI_ROOT, "src", "commands", "ai", "prompts", "master-prompt.md");
  const cwdPrompt = path.join(process.cwd(), ".loom", "ai", "master-prompt.md");
  const file = existsSync(cwdPrompt) ? cwdPrompt : bundled;
  return readFileSync(file, "utf-8");
}

export function buildDescribePrompt(userInput, context = "") {
  const master = loadMasterPrompt();
  const arch = getProjectArch();
  let prompt = master + "\n\n";
  prompt += `## Current Project Architecture: ${arch.toUpperCase()}\n`;
  prompt += `Default to "${arch}" in the options.arch field. Only use a higher level if the user explicitly asks for it.\n\n`;
  if (context) {
    prompt += `## Current Project Context\n${context}\n\n`;
  }
  prompt += `## User Request\n${userInput}\n\n`;
  prompt +=
    "Output only the JSON spec wrapped in ```json ... ``` markers.";
  return prompt;
}

export function buildFixPrompt(resourceName, definition, issue) {
  const master = loadMasterPrompt();
  const arch = getProjectArch();
  const defJson = JSON.stringify(definition, null, 2);
  return `${master}

## Current Project Architecture: ${arch.toUpperCase()}
Default to "${arch}" in the options.arch field.

## Existing Resource Definition
\`\`\`json
${defJson}
\`\`\`

## Issue Reported
${issue}

## Task
Analyze the issue above. It may refer to:
- A missing field that should exist
- An incorrect field type or validation rule
- A missing relation (belongsTo/hasMany)
- An architecture or CRUD mode that doesn't fit

Output the corrected full resource definition JSON wrapped in \`\`\`json ... \`\`\` markers.
Only change what needs fixing. Preserve everything else.`;
}

export function buildScaffoldPrompt(userInput, projectContext) {
  const master = loadMasterPrompt();
  const arch = getProjectArch();
  let prompt = master + "\n\n";
  prompt += `## Current Project Architecture: ${arch.toUpperCase()}\n`;
  prompt += `Default to "${arch}" in the options.arch field for each resource. Only use a higher level if the description explicitly calls for it.\n\n`;
  prompt += `## This is a multi-resource scaffold request.\n`;
  prompt += `Output an array of resource definitions (the "resources" array in the spec).\n`;
  prompt += `Wire relations between resources where it makes business sense.\n\n`;
  if (projectContext) {
    prompt += `## Current Project Context\n${projectContext}\n\n`;
  }
  prompt += `## User Request\n${userInput}\n\n`;
  prompt += "Output only the JSON wrapped in ```json ... ``` markers.";
  return prompt;
}

export async function callLlm(prompt, config) {
  const cfg = config || getAiConfig();

  if (!cfg.apiKey && cfg.provider !== "ollama") {
    throw new Error(
      "No AI API key configured.\n" +
      "Run:  loom ai configure\n" +
      "Or set:  export STACKLOOM_AI_API_KEY=your-key",
    );
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) {
    headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  }

  const body = {
    model: cfg.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 4096,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("LLM request timed out after 120s");
    }
    throw new Error(`LLM request failed: ${err.message}`);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  return content;
}

export function parseJsonResponse(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();

  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {}

  // Try with greedy match (find last ``` pair)
  const greedyMatch = text.match(/```json\s*([\s\S]*?)```[\s\S]*$/);
  if (greedyMatch) {
    try {
      return JSON.parse(greedyMatch[1].trim());
    } catch {}
  }

  // Try without closing marker (truncated response) — find ```json and grab until end
  const openOnly = text.match(/```json\s*([\s\S]*?)$/);
  if (openOnly) {
    try {
      return JSON.parse(openOnly[1].trim());
    } catch {}
  }

  // Last resort: try to parse the entire text
  try {
    return JSON.parse(text.trim());
  } catch {}

  throw new Error(
    "AI response was not valid JSON.\nRaw output:\n" + text.slice(0, 1000),
  );
}

export function loadResourceDefinition(resourceName) {
  const resourcesDir = path.join(process.cwd(), ".loom", "resources");
  const kebab = resourceName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  const file = path.join(resourcesDir, `${kebab}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

const FIELD_TYPE_CHOICES = [
  "string", "text", "number", "range", "boolean", "date", "datetime",
  "time", "email", "password", "phone", "url", "color", "ref",
  "reference", "select", "multiselect", "file", "image",
];

export function suggestFieldFromName(name) {
  const lower = name.toLowerCase();
  if (/email|e-?mail/.test(lower)) return "email";
  if (/phone|telephone|mobile|tel/.test(lower)) return "phone";
  if (/password|passwd|pwd/.test(lower)) return "password";
  if (/url|website|link/.test(lower)) return "url";
  if (/age|count|qty|quantity|price|amount|total|rate|score|rating|cost|fee|tax|salary/.test(lower)) return "number";
  if (/date|dob|birth|startdate|enddate|duedate/.test(lower)) return "date";
  if (/is[A-Z]|has[A-Z]|can[A-Z]|enabled?|disabled?|active|visible|published/.test(lower)) return "boolean";
  if (/color|colour|hex/.test(lower)) return "color";
  if (/image|avatar|photo|picture|thumbnail/.test(lower)) return "image";
  if (/description|desc|notes|comment|content|bio|message/.test(lower)) return "text";
  if (/file|attachment|document|upload|resume/.test(lower)) return "file";
  if (/status|state|type|category|tag|role|priority/.test(lower)) return "select";
  return "string";
}
