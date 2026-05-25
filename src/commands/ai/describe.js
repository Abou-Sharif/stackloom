import ora from "ora";
import {
  getAiConfig,
  buildDescribePrompt,
  callLlm,
  parseJsonResponse,
} from "./index.js";
import { reporterFromOptions } from "../../services/index.js";

export default async function aiDescribe(userInput, options = {}) {
  const reporter = reporterFromOptions(options);

  if (!userInput) {
    reporter.error("Usage: loom ai describe \"<natural language description>\"");
    reporter.result({ error: "Missing description" });
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

  try {
    const prompt = buildDescribePrompt(userInput);

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

    const json = JSON.stringify(spec, null, 2);
    const resourceNames = (spec.resources || [spec])
      .filter((r) => r.name)
      .map((r) => r.name);

    if (options.output) {
      const fs = await import("node:fs");
      fs.writeFileSync(options.output, json, "utf-8");
      reporter.success(`Spec written to ${options.output}`);
    } else {
      console.log(json);
    }

    reporter.result({
      resources: resourceNames,
      count: resourceNames.length,
      file: options.output || null,
    });
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
