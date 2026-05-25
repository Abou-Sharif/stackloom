import inquirer from "inquirer";
import fs from "node:fs";
import path from "node:path";
import { reporterFromOptions } from "../../services/index.js";

const PROJECT_CHOICES = [
  { name: "Only this project (.loom/ai/config.json)", value: "local" },
];

const MODEL_PRESETS = [
  { name: "deepseek-v4-flash-free (OpenCode Zen, free)", value: "deepseek-v4-flash-free" },
  { name: "qwen3.6-plus (OpenCode Zen)", value: "qwen3.6-plus" },
  { name: "nemotron-3-super-free (OpenCode Zen, free)", value: "nemotron-3-super-free" },
  { name: "big-pickle (OpenCode Zen)", value: "big-pickle" },
  { name: "kimi-k2.5 (OpenCode Zen)", value: "kimi-k2.5" },
  { name: "gpt-5.5 (OpenCode Zen)", value: "gpt-5.5" },
  { name: "Other", value: "other" },
];

export default async function aiConfigure(options = {}) {
  const reporter = reporterFromOptions(options);

  try {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "provider",
        message: "AI provider:",
        choices: [
          { name: "OpenCode Zen (free tier available)", value: "opencode" },
          { name: "OpenAI", value: "openai" },
          { name: "Ollama (local)", value: "ollama" },
          { name: "Other (OpenAI-compatible)", value: "other" },
        ],
        default: "opencode",
      },
      {
        type: "input",
        name: "baseUrl",
        message: "API base URL:",
        default: (a) => {
          if (a.provider === "opencode") return "https://opencode.ai/zen/v1";
          if (a.provider === "openai") return "https://api.openai.com/v1";
          if (a.provider === "ollama") return "http://localhost:11434/v1";
          return "";
        },
        when: (a) => a.provider !== "ollama",
        validate: (v) => (v ? true : "Base URL is required"),
      },
      {
        type: "list",
        name: "model",
        message: "Model:",
        choices: MODEL_PRESETS,
        default: "deepseek-v4-flash-free",
      },
      {
        type: "input",
        name: "customModel",
        message: "Custom model name:",
        when: (a) => a.model === "other",
        validate: (v) => (v ? true : "Model name is required"),
      },
      {
        type: "password",
        name: "apiKey",
        message: "API key (leave blank if using Ollama):",
        when: (a) => a.provider !== "ollama",
        mask: "*",
      },
    ]);

    const model = answers.model === "other" ? answers.customModel : answers.model;
    const scope = "local";

    const config = {
      provider: answers.provider,
      baseUrl: answers.baseUrl || "",
      model: model || "deepseek-v4-flash-free",
      apiKey: answers.apiKey || "",
    };

    // Save to .loom/ai/config.json
    const configDir = path.join(process.cwd(), ".loom", "ai");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );

    const hasKey = config.apiKey || config.provider === "ollama";
    reporter.success(
      `Configuration saved to .loom/ai/config.json${hasKey ? "" : " (no API key set)"}`,
    );

    if (!hasKey) {
      reporter.info(
        "Set your API key with:  loom ai configure\n" +
        "Or via env:  export STACKLOOM_AI_API_KEY=your-key",
      );
    }

    reporter.result({ saved: true, scope, provider: answers.provider, model });
  } catch (err) {
    reporter.error(err.message);
    reporter.result({ error: err.message });
    reporter.flush();
    process.exitCode = 1;
    return;
  }
  reporter.flush();
}
