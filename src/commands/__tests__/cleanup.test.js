import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  cleanupGeneratedProject,
  COMPONENT_DIR_MAP,
  BASE_COMPONENT_LAYOUTS,
  PRESET_LAYOUT_OVERRIDES,
  variantValueToFilename,
} from "../init.js";

const tmp = () =>
  path.join(os.tmpdir(), `cleanup-test-${Math.random().toString(36).slice(2)}`);

const DIRS = ["frontend", "backend"];
const COMPONENTS = ["Button", "Card", "DataDisplay", "Footer", "FormLayout", "Modal", "Navbar", "Sidebar"];

const ALL_VARIANTS = {
  Button:      ["ghost.jsx", "gradient.jsx", "outline.jsx", "pill.jsx", "solid.jsx"],
  Card:        ["bordered.jsx", "elevated.jsx", "flat.jsx", "glass.jsx", "stat.jsx"],
  DataDisplay: ["card-view.jsx", "dense.jsx", "standard.jsx", "striped.jsx"],
  Footer:      ["default.jsx", "detailed.jsx", "minimal.jsx"],
  FormLayout:  ["floating.jsx", "inline.jsx", "multi-column.jsx", "stacked.jsx"],
  Modal:       ["centered.jsx", "compact.jsx", "sheet.jsx", "wide.jsx"],
  Navbar:      ["centered.jsx", "default.jsx", "floating.jsx", "minimal.jsx"],
  Sidebar:     ["default.jsx", "drawer.jsx", "floating.jsx", "mini.jsx"],
};

const DEFERRED_UI = ["form.jsx", "label.jsx", "checkbox.jsx", "dropdown-menu.jsx"];
const CORE_UI = ["button.jsx", "card.jsx", "input.jsx", "dialog.jsx", "sheet.jsx", "skeleton.jsx", "table.jsx", "select.jsx"];

const ALL_PRESETS = ["saas", "clinic", "studio", "operations", "commerce", "custom"];
const PRESET_NAMES = ["saas", "clinic", "studio", "operations", "commerce", "shadcnPaste"];

const UNNEEDED_FILES = [
  "backend/Dockerfile",
  "frontend/Dockerfile",
  "frontend/nginx.conf",
  "backend/tests/performance/load-test.js",
  "backend/src/modules/products/products.controller.js",
  "backend/src/modules/products/products.model.js",
  "backend/src/modules/products/products.routes.js",
  "backend/src/modules/products/products.service.js",
  "backend/src/modules/products/products.validator.js",
];

function scaffoldProject(root) {
  // Create all directories first
  mkdirSync(path.join(root, "backend", "src", "routes"), { recursive: true });
  mkdirSync(path.join(root, "backend", "src", "modules", "products"), { recursive: true });
  mkdirSync(path.join(root, "backend", "tests", "performance"), { recursive: true });
  mkdirSync(path.join(root, "frontend", "src", "variants"), { recursive: true });
  mkdirSync(path.join(root, "frontend", "src", "components", "ui"), { recursive: true });
  mkdirSync(path.join(root, "frontend", "src", "config"), { recursive: true });
  writeFileSync(path.join(root, "backend", "src", "routes", "index.js"),
    'const express = require("express");\n' +
    'const authRoutes = require("../modules/auth/auth.routes");\n' +
    'const router = express.Router();\n' +
    'router.get("/health", (_req, res) => res.json({ ok: true }));\n' +
    'router.use("/auth", authRoutes);\n' +
    'router.use("/products", require("../modules/products/products.routes"));\n' +
    "module.exports = router;\n"
  );
  writeFileSync(path.join(root, "backend", "package.json"), JSON.stringify({
    dependencies: { "express": "^4.18.0", "express-validator": "^7.0.0", "joi": "^17.0.0" },
    devDependencies: { "k6": "^0.0.0", "snyk": "^1.0.0" },
  }));

  // Backend products scaffold
  for (const f of ["products.controller.js", "products.model.js", "products.routes.js", "products.service.js", "products.validator.js"]) {
    writeFileSync(path.join(root, "backend", "src", "modules", "products", f), "module.exports = {};\n");
  }
  writeFileSync(path.join(root, "backend", "tests", "performance", "load-test.js"), "// load test\n");

  // Deployment files
  writeFileSync(path.join(root, "backend", "Dockerfile"), "FROM node:20\n");
  mkdirSync(path.join(root, "frontend"), { recursive: true });
  writeFileSync(path.join(root, "frontend", "Dockerfile"), "FROM node:20\n");
  writeFileSync(path.join(root, "frontend", "nginx.conf"), "server {}\n");

  // Frontend variants
  const variantsRoot = path.join(root, "frontend", "src", "variants");
  for (const comp of COMPONENTS) {
    const dir = path.join(variantsRoot, comp);
    mkdirSync(dir, { recursive: true });
    for (const v of ALL_VARIANTS[comp]) {
      writeFileSync(path.join(dir, v), `// ${comp}/${v}\n`);
    }
  }

  // Frontend UI components
  const uiRoot = path.join(root, "frontend", "src", "components", "ui");
  for (const f of [...CORE_UI, ...DEFERRED_UI]) {
    writeFileSync(path.join(uiRoot, f), `// ${f}\n`);
  }

  // Frontend package.json
  writeFileSync(path.join(root, "frontend", "package.json"), JSON.stringify({
    dependencies: {
      react: "^19.0.0",
      "@tanstack/react-query": "^5.0.0",
      "@radix-ui/react-dropdown-menu": "^2.0.0",
      "@radix-ui/react-dialog": "^1.0.0",
    },
  }));

  // app-preset.js
  const configRoot = path.join(root, "frontend", "src", "config");
  let presetCode = 'import { designLayouts } from "./design-layouts";\n';
  presetCode += 'import { designThemes, designTokens } from "./design-themes";\n';
  presetCode += 'import { componentLayouts } from "./component-layouts";\n';
  presetCode += 'import { dataDisplayTemplates } from "./data-display-templates";\n';
  presetCode += 'import { uiVariants } from "./ui-variants";\n';
  presetCode += 'import { installShadcnDesignPreset } from "@/lib/shadcn-theme";\n';
  presetCode += 'import { ROUTES } from "@/utils/constants";\n\n';
  presetCode += "const nav = { dashboard: { label: 'Dashboard', href: '/', icon: 'layout' } };\n\n";
  presetCode += "const baseContent = {\n  auth: { loginTitle: 'Sign in', loginDescription: '' },\n  navigation: [nav.dashboard],\n  componentLayouts: {\n    sidebar: 'default', navbar: 'default', footer: 'default',\n    card: 'elevated', modal: 'centered', button: 'solid',\n    formLayout: 'stacked', dataDisplay: 'standard',\n  },\n};\n\n";
  presetCode += "const demoShadcnCss = `:root {}`;\n\n";
  presetCode += "export const presetVariants = {\n";
  for (const name of PRESET_NAMES) {
    presetCode += `  ${name}: { ...baseContent, brand: { name: "${name}" }, layout: designLayouts.hybridSaas, theme: designThemes.executiveBlue, dataDisplay: dataDisplayTemplates.dashboard, ui: uiVariants.refined, landing: { title: "${name}" }, dashboardCards: [] },\n`;
  }
  presetCode += "};\n\n";
  presetCode += "export const appPreset = presetVariants.saas;\n";
  writeFileSync(path.join(configRoot, "app-preset.js"), presetCode);
}

function dirFiles(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".jsx"));
  } catch {
    return [];
  }
}

function fileExists(...parts) {
  return existsSync(path.join(...parts));
}

function readFile(...parts) {
  return readFileSync(path.join(...parts), "utf-8");
}

describe("variantValueToFilename", () => {
  it("converts camelCase to kebab-case", () => {
    expect(variantValueToFilename("multiColumn")).toBe("multi-column.jsx");
    expect(variantValueToFilename("cardView")).toBe("card-view.jsx");
  });
  it("passes simple values through", () => {
    expect(variantValueToFilename("default")).toBe("default.jsx");
    expect(variantValueToFilename("elevated")).toBe("elevated.jsx");
    expect(variantValueToFilename("solid")).toBe("solid.jsx");
    expect(variantValueToFilename("outline")).toBe("outline.jsx");
  });
});

describe("PRESET_LAYOUT_OVERRIDES", () => {
  for (const preset of ALL_PRESETS) {
    it(`${preset} has all component keys`, () => {
      const layouts = { ...BASE_COMPONENT_LAYOUTS, ...(PRESET_LAYOUT_OVERRIDES[preset] || {}) };
      for (const comp of Object.keys(COMPONENT_DIR_MAP)) {
        expect(layouts[comp]).toBeDefined();
        const filename = variantValueToFilename(layouts[comp]);
        const dirName = COMPONENT_DIR_MAP[comp];
        expect(ALL_VARIANTS[dirName]).toContain(filename);
      }
    });
  }
});

describe("cleanupGeneratedProject", () => {
  let root;

  beforeEach(() => {
    root = tmp();
    scaffoldProject(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("variant pruning", () => {
    for (const preset of ALL_PRESETS) {
      it(`${preset}: keeps only the active variant per component`, async () => {
        await cleanupGeneratedProject(root, { preset });

        const overrides = PRESET_LAYOUT_OVERRIDES[preset] || {};
        const activeLayouts = { ...BASE_COMPONENT_LAYOUTS, ...overrides };

        for (const [compKey, dirName] of Object.entries(COMPONENT_DIR_MAP)) {
          const dir = path.join(root, "frontend", "src", "variants", dirName);
          const remaining = dirFiles(dir);

          const expectedFile = variantValueToFilename(activeLayouts[compKey]);
          expect(remaining).toEqual([expectedFile]);
        }
      });
    }
  });

  describe("deferred UI components", () => {
    it("removes all deferred components", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });

      const uiDir = path.join(root, "frontend", "src", "components", "ui");
      const remaining = dirFiles(uiDir);

      for (const f of DEFERRED_UI) {
        expect(remaining).not.toContain(f);
      }
    });

    it("keeps all core components", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });

      const uiDir = path.join(root, "frontend", "src", "components", "ui");
      const remaining = dirFiles(uiDir);

      for (const f of CORE_UI) {
        expect(remaining).toContain(f);
      }
    });
  });

  describe("deployment & scaffold removal", () => {
    it("removes Dockerfiles and nginx.conf", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      expect(fileExists(root, "backend", "Dockerfile")).toBe(false);
      expect(fileExists(root, "frontend", "Dockerfile")).toBe(false);
      expect(fileExists(root, "frontend", "nginx.conf")).toBe(false);
    });

    it("removes the products module", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      for (const f of ["products.controller.js", "products.model.js", "products.routes.js", "products.service.js", "products.validator.js"]) {
        expect(fileExists(root, "backend", "src", "modules", "products", f)).toBe(false);
      }
    });

    it("removes load-test.js", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      expect(fileExists(root, "backend", "tests", "performance", "load-test.js")).toBe(false);
    });

    it("strips products route from index.js", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      const idx = readFile(root, "backend", "src", "routes", "index.js");
      expect(idx).not.toContain("products");
      expect(idx).toContain("auth");
      expect(idx).toContain("health");
    });
  });

  describe("app-preset.js stripping", () => {
    for (const preset of ["saas", "clinic", "studio", "operations", "commerce"]) {
      it(`${preset}: keeps only its own preset block`, async () => {
        await cleanupGeneratedProject(root, { preset });
        const code = readFile(root, "frontend", "src", "config", "app-preset.js");

        // Should contain the active preset's definition
        expect(code).toContain(`${preset}: {`);

        // Should NOT contain other preset blocks
        const others = ALL_PRESETS.filter((p) => p !== preset);
        for (const other of others) {
          expect(code).not.toContain(`${other}: {`);
        }

        // shadcnPaste block removed
        expect(code).not.toContain("shadcnPaste");
        // demoShadcnCss removed
        expect(code).not.toContain("demoShadcnCss");
        // installShadcnDesignPreset import removed
        expect(code).not.toContain("installShadcnDesignPreset");
      });
    }
  });

  describe("package.json cleanup", () => {
    it("removes @tanstack/react-query and @radix-ui/react-dropdown-menu from frontend", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      const pkg = JSON.parse(readFile(root, "frontend", "package.json"));
      expect(pkg.dependencies["@tanstack/react-query"]).toBeUndefined();
      expect(pkg.dependencies["@radix-ui/react-dropdown-menu"]).toBeUndefined();
      expect(pkg.dependencies["react"]).toBeDefined();
    });

    it("removes express-validator, k6, snyk from backend", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      const pkg = JSON.parse(readFile(root, "backend", "package.json"));
      expect(pkg.dependencies["express-validator"]).toBeUndefined();
      expect(pkg.dependencies["joi"]).toBeDefined();
      expect(pkg.devDependencies["k6"]).toBeUndefined();
      expect(pkg.devDependencies["snyk"]).toBeUndefined();
    });
  });

  describe("import integrity", () => {
    it("no remaining file imports a deleted component", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });

      const uiDir = path.join(root, "frontend", "src", "components", "ui");
      const remaining = new Set(dirFiles(uiDir));

      // Check all remaining variant files don't import deleted UI components
      const variantsRoot = path.join(root, "frontend", "src", "variants");
      for (const comp of COMPONENTS) {
        const dir = path.join(variantsRoot, comp);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
          if (!f.endsWith(".jsx")) continue;
          const content = readFileSync(path.join(dir, f), "utf-8");
          const imports = content.match(/from "@\/components\/ui\/([^"]+)"/g) || [];
          for (const imp of imports) {
            const part = imp.match(/ui\/([^"]+)"/)[1] + ".jsx";
            if (DEFERRED_UI.includes(part)) {
              expect(remaining.has(part)).toBe(
                false,
                `${comp}/${f} imports deferred ${part} which was removed`,
              );
            }
          }
        }
      }
    });
  });

  describe("idempotent — running twice is safe", () => {
    it("does not error on second run", async () => {
      await cleanupGeneratedProject(root, { preset: "saas" });
      await expect(cleanupGeneratedProject(root, { preset: "saas" })).resolves.toBeUndefined();
    });
  });
});
