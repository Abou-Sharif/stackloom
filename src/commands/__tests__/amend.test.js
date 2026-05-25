import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Reporter } from "../../services/index.js";
import generateResource from "../generate-resource.js";
import { StateTracker } from "../../core/state-tracker.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);

const silent = () =>
  new Reporter({ stdout: { write() {}, isTTY: false }, stderr: { write() {} }, env: {} });

function scaffold(root) {
  const write = (rel, content) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  write("backend/package.json", "{}");
  write(
    "backend/src/routes/index.js",
    'const router = require("express").Router();\nmodule.exports = router;\n',
  );
  write("backend/src/utils/ApiResponse.js", "class ApiResponse {}\nmodule.exports = ApiResponse;\n");
  write("backend/src/utils/ApiError.js", "class ApiError {}\nmodule.exports = ApiError;\n");
  write("frontend/src/main.jsx", "");
  write(
    "frontend/src/routes/AppRouter.jsx",
    'import { lazy } from "react";\nconst LoginPage = lazy(() => import("@/pages/auth/LoginPage"));\nexport function AppRouter() {\n  return (<Routes><Route path="*" element={<div />} /></Routes>);\n}\n',
  );
  write(
    "frontend/src/config/app-preset.js",
    'export const preset = { navigation: [{ label: "Dashboard", href: "/dashboard" }] };\n',
  );
}

afterEach(() => {
  process.exitCode = 0;
});

describe("loom generate resource --amend", () => {
  it("merges new fields and preserves model custom zone", async () => {
    const root = tmp("amend-flow");
    scaffold(root);
    const cwd = process.cwd();
    process.chdir(root);

    try {
      await generateResource("resource", "Product", {
        fields: "name:string:required",
        arch: "minimal",
        noFrontend: true,
        frontend: false,
        reporter: silent(),
        brief: true,
      });

      const modelPath = path.join(
        root,
        "backend/src/modules/product/models/Product.js",
      );
      expect(existsSync(modelPath)).toBe(true);

      let model = readFileSync(modelPath, "utf-8");
      model = model.replace(
        "// ✎ CUSTOM CODE ZONE — YOUR CODE HERE",
        "// ✎ CUSTOM CODE ZONE — YOUR CODE HERE\nProductSchema.methods.tag = function () { return this.name; };",
      );
      writeFileSync(modelPath, model);

      const tracker = new StateTracker(root);
      const stored = await tracker.loadResourceDefinition("Product");
      expect(stored?.fields?.some((f) => f.name === "name")).toBe(true);

      await generateResource("resource", "Product", {
        amend: true,
        fields: "sku:string:required",
        arch: "minimal",
        noFrontend: true,
        frontend: false,
        force: true,
        reporter: silent(),
        brief: true,
      });

      const amended = readFileSync(modelPath, "utf-8");
      expect(amended).toContain("sku:");
      expect(amended).toContain("ProductSchema.methods.tag");
      expect(amended).toContain("name:");

      const stored2 = await tracker.loadResourceDefinition("Product");
      expect(stored2.fields.map((f) => f.name).sort()).toEqual(["name", "sku"]);
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  it("remove-fields drops a field on amend", async () => {
    const root = tmp("amend-rm");
    scaffold(root);
    const cwd = process.cwd();
    process.chdir(root);

    try {
      await generateResource("resource", "Item", {
        fields: "name:string;qty:number",
        arch: "minimal",
        frontend: false,
        reporter: silent(),
        brief: true,
      });

      await generateResource("resource", "Item", {
        amend: true,
        removeFields: "qty",
        arch: "minimal",
        frontend: false,
        force: true,
        reporter: silent(),
        brief: true,
      });

      const model = readFileSync(
        path.join(root, "backend/src/modules/item/models/Item.js"),
        "utf-8",
      );
      expect(model).toContain("name:");
      expect(model).not.toMatch(/\bqty\b/);
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  it("blocks amend when manual code exists outside safe zones", async () => {
    const root = tmp("amend-safe");
    scaffold(root);
    const cwd = process.cwd();
    process.chdir(root);

    try {
      await generateResource("resource", "Widget", {
        fields: "name:string",
        arch: "minimal",
        frontend: false,
        reporter: silent(),
        brief: true,
      });

      const modelPath = path.join(
        root,
        "backend/src/modules/widget/models/Widget.js",
      );
      let model = readFileSync(modelPath, "utf-8");
      model = model.replace(
        "const mongoose = require('mongoose');",
        "const mongoose = require('mongoose');\nconst manualHelper = () => true;",
      );
      writeFileSync(modelPath, model);

      await generateResource("resource", "Widget", {
        amend: true,
        fields: "code:string",
        arch: "minimal",
        frontend: false,
        reporter: silent(),
        brief: true,
      });

      expect(process.exitCode).toBe(1);
      const after = readFileSync(modelPath, "utf-8");
      expect(after).toContain("manualHelper");
      expect(after).not.toContain("code:");
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
});
