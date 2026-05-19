import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Reporter } from "../../services/index.js";
import upgrade from "../upgrade.js";
import { blueprintLoader } from "../../blueprint/index.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);

const silent = () =>
  new Reporter({ stdout: { write() {}, isTTY: false }, stderr: { write() {} }, env: {} });

afterEach(() => {
  process.exitCode = 0;
});

describe("loom upgrade", () => {
  it("fails outside a project", async () => {
    const root = tmp("up-empty");
    mkdirSync(root, { recursive: true });
    const r = await upgrade({ projectRoot: root, reporter: silent() });
    expect(r.ok).toBe(false);
    expect(r.errors).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("passes when CLI satisfies blueprint and metadata", async () => {
    const root = tmp("up-ok");
    const builtin = readFileSync(blueprintLoader.builtinPath, "utf-8");
    mkdirSync(path.join(root, ".loom"), { recursive: true });
    writeFileSync(path.join(root, ".loom", "blueprint.json"), builtin);
    writeFileSync(
      path.join(root, ".loom", "metadata.json"),
      JSON.stringify({ engineCompatibility: "stackloom-cli@>=0.1.0", stack: "mern" }),
    );
    mkdirSync(path.join(root, "backend"), { recursive: true });
    mkdirSync(path.join(root, "frontend"), { recursive: true });

    const r = await upgrade({
      projectRoot: root,
      reporter: silent(),
      cliVersion: "99.0.0",
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("errors when CLI is below engine.minCliVersion", async () => {
    const root = tmp("up-oldcli");
    const data = JSON.parse(readFileSync(blueprintLoader.builtinPath, "utf-8"));
    data.engine = { minCliVersion: "99.0.0" };
    mkdirSync(path.join(root, ".loom"), { recursive: true });
    writeFileSync(path.join(root, ".loom", "blueprint.json"), JSON.stringify(data));
    mkdirSync(path.join(root, "backend"), { recursive: true });
    mkdirSync(path.join(root, "frontend"), { recursive: true });

    const r = await upgrade({
      projectRoot: root,
      reporter: silent(),
      cliVersion: "1.0.0",
    });
    expect(r.ok).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});
