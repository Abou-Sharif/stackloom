/**
 * Stackloom Programmatic API
 *
 * Exports every CLI command as an async function that returns a structured
 * `{ ok, data, error }` result instead of calling `process.exit()`.
 * Captures console output and allows event listeners for progress.
 *
 * Usage:
 *   import { doctor, validate, generateResource } from "stackloom-cli/api";
 *   const result = await doctor({ cwd: "/my/project" });
 *   console.log(result.ok, result.data);
 */

import { EventEmitter } from "node:events";

// ── Command wrappers ──

// Most commands use process.exit(1) for errors. We override it during
// execution so the caller gets a result object instead.

let _exitOverridden = false;
const _exitQueue = [];

function overrideExit() {
  if (_exitOverridden) return;
  _exitOverridden = true;
  const origExit = process.exit;
  const origExitCode = Object.getOwnPropertyDescriptor(process, "exitCode");
  process.exit = (code) => {
    throw new CommandExitError(code || 1);
  };
  _exitQueue.push(() => {
    process.exit = origExit;
    _exitOverridden = false;
  });
}

function restoreExit() {
  while (_exitQueue.length > 0) _exitQueue.pop()();
}

class CommandExitError extends Error {
  constructor(code) {
    super(`Command exited with code ${code}`);
    this.code = code;
    this.name = "CommandExitError";
  }
}

/**
 * Capture console output during a command run.
 */
function captureConsole() {
  const chunks = { stdout: [], stderr: [] };
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    chunks.stdout.push(args.map(String).join(" "));
    origLog(...args);
  };
  console.error = (...args) => {
    chunks.stderr.push(args.map(String).join(" "));
    origError(...args);
  };
  console.warn = (...args) => {
    chunks.stderr.push(args.map(String).join(" "));
    origWarn(...args);
  };

  return {
    output: chunks,
    restore: () => {
      console.log = origLog;
      console.error = origError;
      console.warn = origWarn;
    },
  };
}

/**
 * Run a command function with structured result capture.
 * @param {Function} fn - async command function
 * @param  {...any} args - arguments to pass
 * @returns {Promise<{ok: boolean, data?: any, error?: string, output: {stdout: string[], stderr: string[]}}>}
 */
export async function run(fn, ...args) {
  const captured = captureConsole();
  overrideExit();

  try {
    const data = await fn(...args);
    return {
      ok: true,
      data: data ?? undefined,
      output: {
        stdout: captured.output.stdout,
        stderr: captured.output.stderr,
      },
    };
  } catch (err) {
    if (err instanceof CommandExitError) {
      return {
        ok: false,
        error: captured.output.stderr.join("\n").trim() || `Command failed with exit code ${err.code}`,
        code: err.code,
        output: {
          stdout: captured.output.stdout,
          stderr: captured.output.stderr,
        },
      };
    }
    return {
      ok: false,
      error: err.message || String(err),
      output: {
        stdout: captured.output.stdout,
        stderr: [...captured.output.stderr, err.message || String(err)],
      },
    };
  } finally {
    restoreExit();
    captured.restore();
  }
}

// ── Lazy imports for each command ──

let _commands = {};

async function loadCommands() {
  if (Object.keys(_commands).length > 0) return;

  const [
    { default: doctorCmd },
    { default: checkCmd },
    { default: explainCmd },
    { default: validateCmd },
    { default: usageCmd },
    { default: generateResource },
    { default: scaffoldCmd },
    { default: addReportCmd },
    { default: wizardCmd },
    { default: customize },
    { default: cleanupCmd },
    { default: rollbackCmd },
    { default: finalizeCmd },
    { default: envCmd },
    { default: presetCmd },
    { default: initCmd },
  ] = await Promise.all([
    import("./commands/doctor.js"),
    import("./commands/check.js"),
    import("./commands/explain.js"),
    import("./commands/validate.js"),
    import("./commands/usage.js"),
    import("./commands/generate-resource.js"),
    import("./commands/scaffold.js"),
    import("./commands/add-report.js"),
    import("./commands/wizard.js"),
    import("./commands/customize.js"),
    import("./commands/cleanup.js"),
    import("./commands/rollback.js"),
    import("./commands/finalize.js"),
    import("./commands/env.js"),
    import("./commands/preset.js"),
    import("./commands/init.js"),
  ]);

  _commands = {
    doctor: doctorCmd,
    check: checkCmd,
    explain: explainCmd,
    validate: validateCmd,
    usage: usageCmd,
    generateResource,
    scaffold: scaffoldCmd,
    addReport: addReportCmd,
    wizard: wizardCmd,
    customize,
    cleanup: cleanupCmd,
    rollback: rollbackCmd,
    finalize: finalizeCmd,
    env: envCmd,
    preset: presetCmd,
    init: initCmd,
  };
}

/**
 * Run any command by name with args.
 * @param {string} name - command name (e.g. "doctor", "validate")
 * @param  {...any} args - arguments to pass to the command function
 */
export async function command(name, ...args) {
  await loadCommands();
  const fn = _commands[name];
  if (!fn) {
    return {
      ok: false,
      error: `Unknown command "${name}"`,
      output: { stdout: [], stderr: [] },
    };
  }
  return run(fn, ...args);
}

// ── Named exports (lazy-loading wrappers) ──

export async function doctor(...args) {
  await loadCommands();
  return run(_commands.doctor, ...args);
}

export async function check(...args) {
  await loadCommands();
  return run(_commands.check, ...args);
}

export async function explain(...args) {
  await loadCommands();
  return run(_commands.explain, ...args);
}

export async function validate(...args) {
  await loadCommands();
  return run(_commands.validate, ...args);
}

export async function usage(...args) {
  await loadCommands();
  return run(_commands.usage, ...args);
}

export async function generateResource(name, options = {}) {
  await loadCommands();
  return run(() => _commands.generateResource(name, options));
}

export async function scaffold(scenario, options = {}) {
  await loadCommands();
  return run(() => _commands.scaffold(scenario, options));
}

export async function addReport(name, options = {}) {
  await loadCommands();
  return run(() => _commands.addReport(name, options));
}

export async function wizard(options = {}) {
  await loadCommands();
  return run(() => _commands.wizard(options));
}

export async function customizeTheme(action, ...args) {
  await loadCommands();
  const fn = _commands.customize[`customizeTheme${action}`];
  if (!fn) return { ok: false, error: `Unknown theme action "${action}"`, output: { stdout: [], stderr: [] } };
  return run(fn, ...args);
}

export async function cleanup(preset, options = {}) {
  await loadCommands();
  return run(() => _commands.cleanup(preset, options));
}

export async function rollback(options = {}) {
  await loadCommands();
  return run(() => _commands.rollback(options));
}

export async function finalize() {
  await loadCommands();
  return run(_commands.finalize);
}

export async function env(options = {}) {
  await loadCommands();
  return run(() => _commands.env(options));
}

export async function preset(name, options = {}) {
  await loadCommands();
  return run(() => _commands.preset(name, options));
}

export async function init(name, options = {}) {
  await loadCommands();
  return run(() => _commands.init(name, options));
}

export default {
  run,
  command,
  doctor,
  check,
  explain,
  validate,
  usage,
  generateResource,
  scaffold,
  addReport,
  wizard,
  customizeTheme,
  cleanup,
  rollback,
  finalize,
  env,
  preset,
  init,
};
