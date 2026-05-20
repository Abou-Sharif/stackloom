import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Reporter } from "../../services/index.js";
import upgrade from "../upgrade.js";
import { blueprintLoader } from "../../blueprint/index.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);

function createMinimalTemplate(dir) {
  mkdirSync(path.join(dir, ".loom"), { recursive: true });
  writeFileSync(path.join(dir, ".loom", "blueprint.json"), JSON.stringify({
    schemaVersion: "1.0",
    architecture: { id: "mern", name: "Test" },
    roots: { backend: { detect: ["backend"], marker: "package.json", default: "backend" }, frontend: { detect: ["frontend"], marker: "src/main.jsx", default: "frontend" } },
    conventions: {},
    paths: { "backend.modules": "{backend}/src/modules", "frontend.pages": "{frontend}/src/pages" },
    anchors: {},
  }));
  mkdirSync(path.join(dir, "backend", "src", "routes"), { recursive: true });
  writeFileSync(path.join(dir, "backend", "package.json"), JSON.stringify({ name: "backend" }));
  writeFileSync(path.join(dir, "backend", "src", "app.js"), "// template app.js\n");
  writeFileSync(path.join(dir, "backend", "server.js"), "// template server.js\n");
  writeFileSync(path.join(dir, "backend", "src", "routes", "index.js"), "// template routes index\n");
  mkdirSync(path.join(dir, "frontend", "src", "routes"), { recursive: true });
  mkdirSync(path.join(dir, "frontend", "src", "config"), { recursive: true });
  writeFileSync(path.join(dir, "frontend", "package.json"), JSON.stringify({ name: "frontend" }));
  writeFileSync(path.join(dir, "frontend", "index.html"), "<html>template</html>\n");
  writeFileSync(path.join(dir, "frontend", "src", "main.jsx"), "// template main.jsx\n");
  writeFileSync(path.join(dir, "frontend", "src", "App.jsx"), "// template App.jsx\n");
  writeFileSync(path.join(dir, "frontend", "src", "routes", "AppRouter.jsx"), "// template AppRouter.jsx\n");
  writeFileSync(path.join(dir, "frontend", "src", "config", "app-preset.js"), "// template app-preset.js\n");
}
const silent = () =>
  new Reporter({
    stdout: { write() {}, isTTY: false },
    stderr: { write() {} },
    env: {},
  });

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
      JSON.stringify({
        engineCompatibility: "stackloom-cli@>=0.1.0",
        stack: "mern",
      }),
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

  it("creates or refreshes metadata when upgrade --write is requested", async () => {
    const root = tmp("up-write");
    const builtin = readFileSync(blueprintLoader.builtinPath, "utf-8");
    mkdirSync(path.join(root, ".loom"), { recursive: true });
    writeFileSync(path.join(root, ".loom", "blueprint.json"), builtin);
    mkdirSync(path.join(root, "backend"), { recursive: true });
    writeFileSync(path.join(root, "backend", "package.json"), JSON.stringify({ name: "backend", dependencies: {} }));
    mkdirSync(path.join(root, "frontend"), { recursive: true });
    writeFileSync(path.join(root, "frontend", "package.json"), JSON.stringify({ name: "frontend", dependencies: {} }));

    const templateDir = tmp("upgrade-template");
    createMinimalTemplate(templateDir);

    const r = await upgrade({
      projectRoot: root,
      reporter: silent(),
      cliVersion: "99.0.0",
      write: true,
      templateDir,
    });

    expect(r.ok).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.migrationsApplied.length).toBeGreaterThan(0);
    const metadata = JSON.parse(
      readFileSync(path.join(root, ".loom", "metadata.json"), "utf-8"),
    );
    expect(metadata.engineCompatibility).toBe("stackloom-cli@>=99.0.0");
    // Verify some contract files were synced to the project
    expect(readFileSync(path.join(root, "backend", "src", "app.js"), "utf-8")).toBe("// template app.js\n");
    expect(readFileSync(path.join(root, "frontend", "src", "main.jsx"), "utf-8")).toBe("// template main.jsx\n");
    rmSync(root, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
  });

  it("errors when CLI is below engine.minCliVersion", async () => {
    const root = tmp("up-oldcli");
    const data = JSON.parse(readFileSync(blueprintLoader.builtinPath, "utf-8"));
    data.engine = { minCliVersion: "99.0.0" };
    mkdirSync(path.join(root, ".loom"), { recursive: true });
    writeFileSync(
      path.join(root, ".loom", "blueprint.json"),
      JSON.stringify(data),
    );
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
