/**
 * `loom check` — project + environment health check.
 *
 * Verifies the things that silently break generation later: a stale Node, a
 * malformed blueprint, or a blueprint anchor that points at a file the project
 * no longer has. Pure (path + reporter injectable) so it is fully testable.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { blueprintLoader } from "../blueprint/index.js";
import { reporterFromOptions } from "../services/index.js";

const MIN_NODE_MAJOR = 18;

/**
 * Run the health check.
 * @param {object} [options] - global flags (quiet/json/...) plus:
 * @param {string} [options.projectRoot] - defaults to cwd
 * @param {object} [options.reporter] - injected Reporter (tests)
 * @returns {Promise<{ ok: boolean, checks: Array<{name,ok,detail}> }>}
 */
export default async function check(options = {}) {
  const reporter = options.reporter ?? reporterFromOptions(options);
  const projectRoot = options.projectRoot ?? process.cwd();
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok, detail });

  // 1. Node runtime.
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  record(
    "node-version",
    nodeMajor >= MIN_NODE_MAJOR,
    `Node ${process.versions.node} (requires >= ${MIN_NODE_MAJOR})`,
  );

  // 2. Blueprint loads + validates.
  let blueprint = null;
  try {
    blueprint = await blueprintLoader.load(projectRoot);
    record("blueprint", true, blueprint.describe());
  } catch (err) {
    record("blueprint", false, err.message);
  }

  // 3. Anchor integrity — every declared injection point must exist.
  if (blueprint) {
    for (const anchorName of Object.keys(blueprint.data.anchors)) {
      const file = blueprint.resolveAnchorFile(anchorName, projectRoot);
      record(`anchor:${anchorName}`, existsSync(file), path.relative(projectRoot, file));
    }
  }

  // 4. Env file present when an example exists.
  if (existsSync(path.join(projectRoot, ".env.example"))) {
    record("env-file", existsSync(path.join(projectRoot, ".env")), ".env (copy from .env.example)");
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    if (c.ok) reporter.info(`${c.name}: ${c.detail}`);
    else reporter.error(`${c.name}: ${c.detail}`);
  }
  reporter.result({ ok: failed.length === 0, checks });
  if (failed.length === 0) reporter.success(`All ${checks.length} checks passed`);
  else {
    reporter.error(`${failed.length} of ${checks.length} checks failed`);
    process.exitCode = 1;
  }
  reporter.flush();
  return { ok: failed.length === 0, checks };
}
