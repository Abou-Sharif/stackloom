import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  FileTransaction,
  Validator,
  scanDelimiters,
  Injector,
  InjectionError,
  Pipeline,
  defineStep,
  createGenerationPipeline,
} from "../index.js";
import { blueprintLoader } from "../../blueprint/index.js";
import { recipeLoader } from "../../recipes/index.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);

/** A minimal project carrying the four MERN anchor files. */
function scaffold(root) {
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  write("backend/package.json", "{}");
  write(
    "backend/src/routes/index.js",
    'const router = require("express").Router();\nrouter.use("/auth", authRoutes);\nmodule.exports = router;\n',
  );
  write("frontend/src/main.jsx", "");
  write(
    "frontend/src/routes/AppRouter.jsx",
    'import { lazy } from "react";\n' +
      'const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));\n' +
      "export function AppRouter() {\n  return (\n    <Routes>\n" +
      '      <Route path="*" element={<NotFound />} />\n' +
      "    </Routes>\n  );\n}\n",
  );
  write(
    "frontend/src/config/app-preset.js",
    'export const preset = {\n  navigation: [\n    { label: "Dashboard", href: "/dashboard" },\n  ],\n};\n',
  );
  return root;
}

/** Fake renderer: sensible, balanced output keyed by template path. */
const fakeRenderer = (templatePath) => {
  if (templatePath === "snippets/route-mount.ejs") return 'router.use("/order", r);\n';
  if (templatePath === "snippets/lazy-import.ejs") return "const OrderList = lazy(() => 0);\n";
  if (templatePath === "snippets/route-entry.ejs") return '<Route path="/admin/order" />\n';
  if (templatePath === "snippets/nav-entry.ejs") return '{ label: "Order" },\n';
  return `// ${templatePath}\nmodule.exports = {};\n`;
};

describe("scanDelimiters", () => {
  it("accepts balanced code, strings, regex, template literals and JSX", () => {
    expect(scanDelimiters("function f() { return [1, 2]; }").balanced).toBe(true);
    expect(scanDelimiters("const s = '})]'; const o = {};").balanced).toBe(true);
    expect(scanDelimiters("const re = /[(]/; f();").balanced).toBe(true);
    expect(scanDelimiters("const t = `a ${b} c`; g();").balanced).toBe(true);
    expect(scanDelimiters("return (<div><Routes></Routes></div>);").balanced).toBe(true);
  });

  it("rejects unbalanced delimiters and unterminated literals", () => {
    expect(scanDelimiters("function broken( {").balanced).toBe(false);
    expect(scanDelimiters("return 1; }").balanced).toBe(false);
    expect(scanDelimiters("const s = 'unterminated").balanced).toBe(false);
  });
});

describe("Validator", () => {
  it("gates code and JSON, lets unknown file types pass", () => {
    const v = new Validator();
    expect(v.validateFile({ relPath: "a.js", content: "module.exports = {};" }).ok).toBe(true);
    expect(v.validateFile({ relPath: "a.js", content: "module.exports = {" }).ok).toBe(false);
    expect(v.validateFile({ relPath: "a.js", content: "   " }).ok).toBe(false);
    expect(v.validateFile({ relPath: "a.json", content: '{"x":1}' }).ok).toBe(true);
    expect(v.validateFile({ relPath: "a.json", content: "{bad}" }).ok).toBe(false);
    expect(v.validateFile({ relPath: "readme.md", content: "# unbalanced ]" }).ok).toBe(true);
  });

  it("validateAll reports every failing file", () => {
    const result = new Validator().validateAll([
      { relPath: "ok.js", content: "f();" },
      { relPath: "bad.jsx", content: "<div>{" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.relPath)).toEqual(["bad.jsx"]);
  });
});

describe("FileTransaction", () => {
  it("stages without writing, then commits atomically", () => {
    const root = tmp("tx");
    mkdirSync(root, { recursive: true });
    const tx = new FileTransaction({ projectRoot: root });
    tx.stage("src/a.js", "// a\n").stage("src/nested/b.js", "// b\n");
    expect(existsSync(path.join(root, "src/a.js"))).toBe(false);
    expect(tx.commit()).toHaveLength(2);
    expect(readFileSync(path.join(root, "src/a.js"), "utf-8")).toBe("// a\n");
    rmSync(root, { recursive: true, force: true });
  });

  it("upserts: re-staging a path replaces it", () => {
    const tx = new FileTransaction({ projectRoot: tmp("tx-upsert") });
    tx.stage("a.js", "first").stage("a.js", "second");
    expect(tx.get("a.js")).toBe("second");
    expect(tx.staged()).toHaveLength(1);
  });

  it("rolls back fully when a write fails mid-commit", () => {
    const root = tmp("tx-rollback");
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "existing.js"), "ORIGINAL");

    let writes = 0;
    const fs = {
      existsSync,
      readFileSync,
      mkdirSync,
      rmSync,
      writeFileSync(file, data) {
        if (++writes === 2) throw new Error("disk full (simulated)");
        writeFileSync(file, data);
      },
    };
    const tx = new FileTransaction({ projectRoot: root, fs });
    tx.stage("existing.js", "MODIFIED").stage("fresh.js", "NEW");
    expect(() => tx.commit()).toThrow(/disk full/);
    expect(readFileSync(path.join(root, "existing.js"), "utf-8")).toBe("ORIGINAL");
    expect(existsSync(path.join(root, "fresh.js"))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("Injector", () => {
  it("splices each strategy at its anchor", async () => {
    const root = scaffold(tmp("inj"));
    const blueprint = await blueprintLoader.load(root);
    const injector = new Injector();
    const tx = new FileTransaction({ projectRoot: root });
    const run = (anchorName, snippet) =>
      injector.inject({ anchorName, snippet, blueprint, projectRoot: root, transaction: tx });

    run("backend.routes", 'router.use("/order", orderRoutes);');
    run("frontend.lazyImports", 'const OrderList = lazy(() => import("@/pages/admin/order/ListPage"));');
    run("frontend.routes", '<Route path="/admin/order" element={<OrderList />} />');
    run("frontend.nav", '{ label: "Order", href: "/admin/order" },');

    const routes = tx.get("backend/src/routes/index.js");
    expect(routes.indexOf('router.use("/order"')).toBeLessThan(routes.indexOf("module.exports = router;"));

    const router = tx.get("frontend/src/routes/AppRouter.jsx");
    expect(router).toContain("const OrderList = lazy(");
    expect(router.indexOf("/admin/order")).toBeLessThan(router.indexOf('path="*"'));

    expect(tx.get("frontend/src/config/app-preset.js")).toContain(
      '{ label: "Order", href: "/admin/order" },',
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("is idempotent — re-injecting the same snippet is a no-op", async () => {
    const root = scaffold(tmp("inj-idem"));
    const blueprint = await blueprintLoader.load(root);
    const injector = new Injector();
    const tx = new FileTransaction({ projectRoot: root });
    const args = {
      anchorName: "backend.routes",
      snippet: 'router.use("/order", orderRoutes);',
      blueprint,
      projectRoot: root,
      transaction: tx,
    };
    expect(injector.inject(args).action).toBe("inject");
    const second = injector.inject(args);
    expect(second.action).toBe("skip");
    expect(second.reason).toBe("already-present");
    const count = tx.get("backend/src/routes/index.js").split('router.use("/order"').length - 1;
    expect(count).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("throws InjectionError when the anchor file is missing", async () => {
    const root = tmp("inj-missing");
    mkdirSync(root, { recursive: true });
    const blueprint = await blueprintLoader.load(root);
    expect(() =>
      new Injector().inject({
        anchorName: "backend.routes",
        snippet: "x",
        blueprint,
        projectRoot: root,
        transaction: new FileTransaction({ projectRoot: root }),
      }),
    ).toThrow(InjectionError);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("Pipeline", () => {
  it("runs steps in order, threading the context", async () => {
    const trail = [];
    const out = await new Pipeline([
      defineStep("one", (ctx) => {
        trail.push("one");
        ctx.a = 1;
      }),
      defineStep("two", (ctx) => {
        trail.push("two");
        ctx.b = ctx.a + 1;
      }),
    ]).run({});
    expect(trail).toEqual(["one", "two"]);
    expect(out.b).toBe(2);
  });
});

describe("createGenerationPipeline", () => {
  const setup = async (root) => {
    scaffold(root);
    return {
      blueprint: await blueprintLoader.load(root),
      recipe: await recipeLoader.load("resource"),
    };
  };
  const invoke = (root, blueprint, recipe, extra = {}) => ({
    projectRoot: root,
    recipe,
    blueprint,
    recipeContext: { withFrontend: true },
    vars: { kebab: "order", Name: "Order" },
    templateContext: {},
    ...extra,
  });

  it("plan → render → inject → validate → commit writes files and anchors", async () => {
    const root = tmp("gen-ok");
    const { blueprint, recipe } = await setup(root);
    const ctx = await createGenerationPipeline({ renderer: fakeRenderer }).run(
      invoke(root, blueprint, recipe),
    );
    // 12 generated files (full-stack, no tests, no TS) + 3 modified anchor files.
    expect(ctx.result.files.length).toBe(15);
    expect(ctx.injections.filter((i) => i.action === "inject")).toHaveLength(4);
    expect(existsSync(path.join(root, "backend/src/modules/order/models/Order.js"))).toBe(true);
    expect(readFileSync(path.join(root, "backend/src/routes/index.js"), "utf-8")).toContain(
      'router.use("/order"',
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("commits nothing when any file fails validation", async () => {
    const root = tmp("gen-bad");
    const { blueprint, recipe } = await setup(root);
    const pipeline = createGenerationPipeline({ renderer: () => "function broken( {\n" });
    await expect(pipeline.run(invoke(root, blueprint, recipe))).rejects.toThrow(/failed validation/);
    expect(existsSync(path.join(root, "backend/src/modules/order/models/Order.js"))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("a bad inject snippet aborts the whole commit, leaving anchor files untouched", async () => {
    const root = tmp("gen-inj-bad");
    const { blueprint, recipe } = await setup(root);
    const renderer = (t) =>
      t === "snippets/nav-entry.ejs" ? "{ label: broken (\n" : "module.exports = {};\n";
    await expect(
      createGenerationPipeline({ renderer }).run(invoke(root, blueprint, recipe)),
    ).rejects.toThrow(/failed validation/);
    expect(readFileSync(path.join(root, "frontend/src/config/app-preset.js"), "utf-8")).not.toContain(
      "broken",
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("dry-run reports the plan without writing", async () => {
    const root = tmp("gen-dry");
    const { blueprint, recipe } = await setup(root);
    const ctx = await createGenerationPipeline({ renderer: fakeRenderer }).run(
      invoke(root, blueprint, recipe, { dryRun: true }),
    );
    expect(ctx.result.dryRun).toBe(true);
    expect(existsSync(path.join(root, "backend/src/modules/order/models/Order.js"))).toBe(false);
    expect(readFileSync(path.join(root, "backend/src/routes/index.js"), "utf-8")).not.toContain(
      "/order",
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("withInject: false runs render → validate → commit only", async () => {
    const root = tmp("gen-noinject");
    const { blueprint, recipe } = await setup(root);
    const ctx = await createGenerationPipeline({ renderer: fakeRenderer, withInject: false }).run(
      invoke(root, blueprint, recipe, { recipeContext: { withFrontend: false } }),
    );
    expect(ctx.result.files).toHaveLength(5);
    expect(ctx.injections).toBeUndefined();
    expect(readFileSync(path.join(root, "backend/src/routes/index.js"), "utf-8")).not.toContain(
      "/order",
    );
    rmSync(root, { recursive: true, force: true });
  });
});
