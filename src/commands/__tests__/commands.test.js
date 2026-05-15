import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Reporter } from "../../services/index.js";
import check from "../check.js";
import env, { parseEnvKeys } from "../env.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);
// A Reporter that swallows output — commands stay silent under test.
const silent = () =>
  new Reporter({ stdout: { write() {}, isTTY: false }, stderr: { write() {} }, env: {} });

// Commands legitimately set process.exitCode to signal CI failures; reset between tests.
afterEach(() => {
  process.exitCode = 0;
});

describe("loom check", () => {
  it("passes on a well-formed project", async () => {
    const root = tmp("chk-ok");
    const write = (rel, content) => {
      const abs = path.join(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    };
    write("backend/package.json", "{}");
    write("backend/src/routes/index.js", "module.exports = router;\n");
    write("frontend/src/main.jsx", "");
    write("frontend/src/routes/AppRouter.jsx", 'const X = lazy(() => 0);\n<Route path="*" />\n');
    write("frontend/src/config/app-preset.js", "const p = { navigation: [] };\n");

    const result = await check({ projectRoot: root, reporter: silent() });
    expect(result.ok).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("fails when a blueprint anchor file is missing", async () => {
    const root = tmp("chk-bad");
    mkdirSync(path.join(root, "backend"), { recursive: true });
    writeFileSync(path.join(root, "backend", "package.json"), "{}");
    const result = await check({ projectRoot: root, reporter: silent() });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.name.startsWith("anchor:") && !c.ok)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("loom env", () => {
  it("parseEnvKeys ignores comments and blank lines", () => {
    expect(parseEnvKeys("# c\n\nPORT=3000\nDB_URL=mongodb://x\n  \n")).toEqual(["PORT", "DB_URL"]);
  });

  it("reports missing keys and appends them with --sync", async () => {
    const root = tmp("env-sync");
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, ".env.example"), "PORT=3000\nDB_URL=\nJWT_SECRET=\n");
    writeFileSync(path.join(root, ".env"), "PORT=4000\n");

    const before = await env({ projectRoot: root, reporter: silent() });
    expect(before.missing).toEqual(["DB_URL", "JWT_SECRET"]);
    expect(before.synced).toBe(false);

    const after = await env({ projectRoot: root, sync: true, reporter: silent() });
    expect(after.synced).toBe(true);
    const envText = readFileSync(path.join(root, ".env"), "utf-8");
    expect(envText).toMatch(/DB_URL=/);
    expect(envText).toMatch(/JWT_SECRET=/);

    const final = await env({ projectRoot: root, reporter: silent() });
    expect(final.missing).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it("is a graceful no-op when there is no .env.example", async () => {
    const root = tmp("env-none");
    mkdirSync(root, { recursive: true });
    const result = await env({ projectRoot: root, reporter: silent() });
    expect(result.missing).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
