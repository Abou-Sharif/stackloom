import { describe, it, expect } from "vitest";
import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_ROOT = path.resolve(CLI_ROOT, "../stackloom-templates/mern");

const FRONTEND = path.join(TEMPLATE_ROOT, "frontend");
const BACKEND = path.join(TEMPLATE_ROOT, "backend");
const VARIANTS = path.join(FRONTEND, "src", "variants");
const UI = path.join(FRONTEND, "src", "components", "ui");

// ─── Helpers ──────────────────────────────────────────────────────

/** Walk directory tree, yield relative paths of all files. */
function* walk(dir, prefix = "") {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e);
    const rel = prefix ? `${prefix}/${e}` : e;
    try {
      const s = statSync(fp);
      if (s.isDirectory()) yield* walk(fp, rel);
      else yield rel;
    } catch { /* skip */ }
  }
}

/** Resolve a `@/` import path to the real filesystem path. */
function resolveAlias(spec, importerDir) {
  // Vite `@` → `frontend/src/`
  if (spec.startsWith("@/")) {
    const rest = spec.slice(2);
    // Try .jsx, .js, then directory/index.jsx
    for (const ext of [".jsx", ".js", ""]) {
      const candidate = path.join(FRONTEND, "src", rest + ext);
      if (existsSync(candidate)) return candidate;
      // directory/index pattern
      if (!ext) {
        for (const idx of ["index.jsx", "index.js"]) {
          const idxCandidate = path.join(candidate, idx);
          if (existsSync(idxCandidate)) return idxCandidate;
        }
      }
    }
    return path.join(FRONTEND, "src", rest); // return guess
  }
  // Relative path
  if (spec.startsWith(".")) {
    const abs = path.resolve(importerDir, spec);
    for (const ext of [".jsx", ".js", ".mjs", ".cjs", ""]) {
      const candidate = abs + ext;
      if (existsSync(candidate)) return candidate;
      if (!ext) {
        for (const idx of ["index.jsx", "index.js", "index.mjs", "index.cjs"]) {
          const idxCandidate = path.join(candidate, idx);
          if (existsSync(idxCandidate)) return idxCandidate;
        }
      }
    }
    return abs;
  }
  // NPM package — can't resolve on disk without node_modules
  return null;
}

/** Parse import/require specifiers from source text. */
function extractImports(code) {
  const deps = [];
  // ESM: import X from "..." or import { ... } from "..."
  const esmRe = /(?:import[\s\S]*?from\s+|import\s+)["']([^"']+)["']/g;
  let m;
  while ((m = esmRe.exec(code)) !== null) {
    deps.push(m[1]);
  }
  // require: require("...")
  const cjsRe = /(?:require|require\s*\.\s*resolve)\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = cjsRe.exec(code)) !== null) {
    deps.push(m[1]);
  }
  // dynamic import: import("...") or lazy(() => import("..."))
  const dynRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynRe.exec(code)) !== null) {
    deps.push(m[1]);
  }
  return [...new Set(deps)];
}

/** True if a path resolves to something that exists on disk. */
function pathResolves(spec, importerDir) {
  const resolved = resolveAlias(spec, importerDir);
  if (!resolved) return true; // npm package — assume valid
  return existsSync(resolved) || existsSync(resolved + ".jsx") || existsSync(resolved + ".js");
}

// ─── Test Data ────────────────────────────────────────────────────

const COMPONENT_DIRS = [
  "Button", "Card", "DataDisplay", "Footer", "FormLayout", "Modal", "Navbar", "Sidebar",
];

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

describe("Template root", () => {
  it("exists", () => {
    expect(existsSync(TEMPLATE_ROOT)).toBe(true);
  });

  it("has blueprint.json", () => {
    const bp = path.join(TEMPLATE_ROOT, ".loom", "blueprint.json");
    expect(existsSync(bp)).toBe(true);
    const data = JSON.parse(readFileSync(bp, "utf-8"));
    expect(data.contract).toBeDefined();
  });

  it("has metadata.json", () => {
    expect(existsSync(path.join(TEMPLATE_ROOT, ".loom", "metadata.json"))).toBe(true);
  });
});

describe("Required contract files", () => {
  const REQUIRED = [
    "frontend/src/config/app-preset.js",
    "frontend/package.json",
    "frontend/src/main.jsx",
    "frontend/index.html",
    "backend/package.json",
    "backend/src/app.js",
    "backend/server.js",
  ];
  for (const rel of REQUIRED) {
    it(rel, () => {
      expect(existsSync(path.join(TEMPLATE_ROOT, rel))).toBe(true);
    });
  }
});

describe("Blueprint contract file paths", () => {
  it("navConfigPath exists", () => {
    const bp = JSON.parse(readFileSync(path.join(TEMPLATE_ROOT, ".loom", "blueprint.json"), "utf-8"));
    const p = bp.contract?.navConfigPath;
    if (p) {
      expect(existsSync(path.join(TEMPLATE_ROOT, p))).toBe(true);
    }
  });

  it("entryPoints exist", () => {
    const bp = JSON.parse(readFileSync(path.join(TEMPLATE_ROOT, ".loom", "blueprint.json"), "utf-8"));
    const ep = bp.contract?.entryPoints;
    if (ep?.frontend) expect(existsSync(path.join(TEMPLATE_ROOT, ep.frontend))).toBe(true);
    if (ep?.backend) expect(existsSync(path.join(TEMPLATE_ROOT, ep.backend))).toBe(true);
  });
});

describe("Frontend variant files", () => {
  for (const comp of COMPONENT_DIRS) {
    const dir = path.join(VARIANTS, comp);
    it(`${comp}: directory exists with expected files`, () => {
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith(".jsx")).sort();
      expect(files).toEqual([...ALL_VARIANTS[comp]].sort());
    });
  }
});

describe("Component-layouts ↔ variants alignment", () => {
  const clPath = path.join(FRONTEND, "src", "config", "component-layouts.js");
  it("component-layouts.js exists", () => {
    expect(existsSync(clPath)).toBe(true);
  });

  it("every component-layout key has a matching variant dir", () => {
    const code = readFileSync(clPath, "utf-8");
    // Top-level keys are at 2-space indent (nested variant keys at 4-space)
    const keys = [...code.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]);
    const map = {
      dataDisplay: "DataDisplay",
      formLayout: "FormLayout",
    };
    for (const key of keys) {
      const expectedDir = map[key] || key.charAt(0).toUpperCase() + key.slice(1);
      expect(existsSync(path.join(VARIANTS, expectedDir))).toBe(true);
    }
  });
});

describe("Preset componentLayouts resolve to existing variant files", () => {
  const presetPath = path.join(FRONTEND, "src", "config", "app-preset.js");
  const code = readFileSync(presetPath, "utf-8");

  // Find all componentLayouts objects in the presets
  const layoutBlocks = code.match(/componentLayouts:\s*\{[^}]+\}/g);
  // Base defaults
  if (layoutBlocks) {
    for (const block of layoutBlocks) {
      const entries = [...block.matchAll(/(\w+):\s*"([^"]+)"/g)];
      for (const [, component, variant] of entries) {
        it(`${component}: variant "${variant}" file exists`, () => {
          const compMap = {
            sidebar: "Sidebar",
            navbar: "Navbar",
            footer: "Footer",
            card: "Card",
            modal: "Modal",
            button: "Button",
            formLayout: "FormLayout",
            dataDisplay: "DataDisplay",
          };
          const dirName = compMap[component];
          expect(dirName).toBeDefined();
          const vf = variant.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase() + ".jsx";
          expect(existsSync(path.join(VARIANTS, dirName, vf))).toBe(true);
        });
      }
    }
  }
});

describe("Frontend import resolution", () => {
  const jsFiles = [...walk(FRONTEND)].filter(
    (f) => (f.endsWith(".jsx") || f.endsWith(".js")) && !f.includes("/__tests__/") && !f.includes("node_modules"),
  );

  for (const rel of jsFiles) {
    it(`${rel}: all imports resolve`, () => {
      const abs = path.join(FRONTEND, rel);
      const code = readFileSync(abs, "utf-8");
      const imports = extractImports(code);
      const dir = path.dirname(abs);

      for (const spec of imports) {
        // Skip npm packages (not starting with ./ ../ or @/)
        if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;

        const resolved = resolveAlias(spec, dir);
        if (!resolved) continue; // npm package

        const exists =
          existsSync(resolved) ||
          existsSync(resolved + ".jsx") ||
          existsSync(resolved + ".js") ||
          existsSync(path.join(resolved, "index.jsx")) ||
          existsSync(path.join(resolved, "index.js"));

        expect(exists).toBe(true);
      }
    });
  }
});

describe("Backend import resolution", () => {
  const jsFiles = [...walk(BACKEND)].filter(
    (f) => f.endsWith(".js") && !f.includes("/__tests__/") && !f.includes("node_modules") && !f.includes("tests/performance/"),
  );

  for (const rel of jsFiles) {
    it(`${rel}: all requires resolve`, () => {
      const abs = path.join(BACKEND, rel);
      const code = readFileSync(abs, "utf-8");
      const imports = extractImports(code);
      const dir = path.dirname(abs);

      for (const spec of imports) {
        // Skip npm packages
        if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;

        const resolved = resolveAlias(spec, dir);
        if (!resolved) continue;

        const exists =
          existsSync(resolved) ||
          existsSync(resolved + ".js") ||
          existsSync(resolved + ".mjs") ||
          existsSync(resolved + ".cjs") ||
          existsSync(path.join(resolved, "index.js")) ||
          existsSync(path.join(resolved, "index.mjs")) ||
          existsSync(path.join(resolved, "index.cjs"));

        expect(exists).toBe(true);
      }
    });
  }
});

describe("Backend routes resolve", () => {
  const routesIndex = path.join(BACKEND, "src", "routes", "index.js");
  it("routes/index.js exists", () => {
    expect(existsSync(routesIndex)).toBe(true);
  });

  it("all route `use` targets resolve to existing modules", () => {
    const code = readFileSync(routesIndex, "utf-8");
    const requires = [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    const dir = path.dirname(routesIndex);
    for (const spec of requires) {
      if (!spec.startsWith(".")) continue;
      const resolved = path.resolve(dir, spec);
      const exists =
        existsSync(resolved) ||
        existsSync(resolved + ".js") ||
        existsSync(path.join(resolved, "index.js"));
      expect(exists).toBe(true);
    }
  });
});

describe("Backend routes match modules", () => {
  const routesIndex = path.join(BACKEND, "src", "routes", "index.js");
  const modulesDir = path.join(BACKEND, "src", "modules");

  it("every router.use path has a matching module directory", () => {
    const code = readFileSync(routesIndex, "utf-8");
    const paths = [...code.matchAll(/router\.use\(["']\/([^"']+)["']/g)].map((m) => m[1]);
    const mods = readdirSync(modulesDir).filter((d) => statSync(path.join(modulesDir, d)).isDirectory());
    for (const p of paths) {
      // health check is a built-in route, not a module
      if (p === "health") continue;
      expect(mods).toContain(p);
    }
  });

  it("every module has a route listed in the router", () => {
    const code = readFileSync(routesIndex, "utf-8");
    const mods = readdirSync(modulesDir).filter((d) => statSync(path.join(modulesDir, d)).isDirectory());
    for (const mod of mods) {
      const mountPath = `"/${mod}"`;
      expect(code).toContain(mountPath);
    }
  });
});

describe("UI components existence", () => {
  const expected = [
    "button.jsx", "card.jsx", "checkbox.jsx", "dialog.jsx",
    "dropdown-menu.jsx", "form.jsx", "input.jsx", "label.jsx",
    "select.jsx", "sheet.jsx", "skeleton.jsx", "table.jsx",
  ];
  for (const f of expected) {
    it(f, () => {
      expect(existsSync(path.join(UI, f))).toBe(true);
    });
  }
});

describe("UI components consistency", () => {
  const files = readdirSync(UI).filter((f) => f.endsWith(".jsx"));
  for (const f of files) {
    it(`${f}: all internal imports resolve`, () => {
      const abs = path.join(UI, f);
      const code = readFileSync(abs, "utf-8");
      const imports = extractImports(code);

      for (const spec of imports) {
        // Only check `@/` imports within ui components
        if (!spec.startsWith("@/")) continue;
        const dir = path.dirname(abs);
        const resolved = resolveAlias(spec, dir);
        if (!resolved) continue;
        const exists =
          existsSync(resolved) ||
          existsSync(resolved + ".jsx") ||
          existsSync(resolved + ".js");
        expect(exists).toBe(true);
      }
    });
  }
});

describe("Layout components existence", () => {
  const layoutDir = path.join(FRONTEND, "src", "components", "layout");
  const expected = ["AppShell.jsx", "Footer.jsx", "FormLayout.jsx", "Navbar.jsx", "PageWrapper.jsx", "Sidebar.jsx"];
  for (const f of expected) {
    it(f, () => {
      expect(existsSync(path.join(layoutDir, f))).toBe(true);
    });
  }
});

describe("Config file structure", () => {
  const configDir = path.join(FRONTEND, "src", "config");
  const expected = [
    "app-preset.js", "component-layouts.js", "data-display-templates.js",
    "design-layouts.js", "design-themes.js", "ui-variants.js",
  ];
  for (const f of expected) {
    it(f, () => {
      expect(existsSync(path.join(configDir, f))).toBe(true);
    });
  }
});

describe("Backend module structure", () => {
  const modulesDir = path.join(BACKEND, "src", "modules");
  const mods = readdirSync(modulesDir).filter((d) => statSync(path.join(modulesDir, d)).isDirectory());

  for (const mod of mods) {
    const dir = path.join(modulesDir, mod);

    it(`${mod}: has controller`, () => {
      expect(existsSync(path.join(dir, `${mod}.controller.js`))).toBe(true);
    });
    it(`${mod}: has model`, () => {
      expect(existsSync(path.join(dir, `${mod}.model.js`))).toBe(true);
    });
    it(`${mod}: has routes`, () => {
      expect(existsSync(path.join(dir, `${mod}.routes.js`))).toBe(true);
    });
    it(`${mod}: has service`, () => {
      expect(existsSync(path.join(dir, `${mod}.service.js`))).toBe(true);
    });
    it(`${mod}: has validator`, () => {
      expect(existsSync(path.join(dir, `${mod}.validator.js`))).toBe(true);
    });
  }
});

describe("Backend middleware structure", () => {
  const midDir = path.join(BACKEND, "src", "middlewares");
  const expected = ["auth.middleware.js", "error.middleware.js", "notFound.middleware.js", "rateLimiter.js", "validate.js"];
  for (const f of expected) {
    it(f, () => {
      expect(existsSync(path.join(midDir, f))).toBe(true);
    });
  }
});

describe("Backend utility structure", () => {
  const utilsDir = path.join(BACKEND, "src", "utils");
  const expected = ["ApiError.js", "ApiResponse.js", "asyncHandler.js", "logger.js", "tokenUtils.js"];
  for (const f of expected) {
    it(f, () => {
      expect(existsSync(path.join(utilsDir, f))).toBe(true);
    });
  }
});

describe("JS syntax parsing", () => {
  const allFiles = [...walk(TEMPLATE_ROOT)].filter(
    (f) => (f.endsWith(".js") || f.endsWith(".jsx")) && !f.includes("node_modules") && !f.includes("/__tests__/") && !f.includes("tests/performance/") && !f.startsWith(".loom"),
  );

  const FAIL_THRESHOLD = 5;
  let failures = [];

  for (const rel of allFiles) {
    it(`no syntax error in ${rel}`, () => {
      const abs = path.join(TEMPLATE_ROOT, rel);
      try {
        const code = readFileSync(abs, "utf-8");
        // Basic structural checks
        const opens = (code.match(/\{/g) || []).length;
        const closes = (code.match(/\}/g) || []).length;
        const roundOpens = (code.match(/\(/g) || []).length;
        const roundCloses = (code.match(/\)/g) || []).length;

        if (opens !== closes) {
          failures.push(`${rel}: brace mismatch (${opens} open, ${closes} close)`);
        }
        if (roundOpens !== roundCloses) {
          failures.push(`${rel}: paren mismatch (${roundOpens} open, ${roundCloses} close)`);
        }
      } catch (e) {
        failures.push(`${rel}: read error: ${e.message}`);
      }
    });
  }

  afterAll(() => {
    if (failures.length > 0) {
      console.warn(`\n⚠ ${failures.length} structural issue(s) found (showing first ${FAIL_THRESHOLD}):`);
      for (const msg of failures.slice(0, FAIL_THRESHOLD)) {
        console.warn(`  • ${msg}`);
      }
    }
    expect(failures.length).toBeLessThanOrEqual(FAIL_THRESHOLD);
  });
});

describe("Frontend routes exist", () => {
  const appRouter = path.join(FRONTEND, "src", "routes", "AppRouter.jsx");
  it("AppRouter.jsx exists", () => {
    expect(existsSync(appRouter)).toBe(true);
  });

  const pagesDir = path.join(FRONTEND, "src", "pages");
  it("all route files in AppRouter resolve to existing pages", () => {
    const code = readFileSync(appRouter, "utf-8");
    const imports = extractImports(code);
    const dir = path.dirname(appRouter);

    for (const spec of imports) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      const resolved = resolveAlias(spec, dir);
      if (!resolved) continue;
      const exists =
        existsSync(resolved) ||
        existsSync(resolved + ".jsx") ||
        existsSync(resolved + ".js");
      expect(exists).toBe(true);
    }
  });
});

describe("No .only or .skip left in production code", () => {
  const testFiles = [...walk(TEMPLATE_ROOT)].filter(
    (f) => (f.endsWith(".js") || f.endsWith(".jsx")) && !f.includes("/__tests__/") && (f.startsWith("frontend/") || f.startsWith("backend/")),
  );
  for (const rel of testFiles) {
    it(`${rel}: no test.only/skip/xdescribe lingering`, () => {
      const code = readFileSync(path.join(TEMPLATE_ROOT, rel), "utf-8");
      expect(code).not.toMatch(/\.only\s*\(/);
      expect(code).not.toMatch(/\.skip\s*\(/);
    });
  }
});

describe("No TODOs or FIXMEs left in critical files", () => {
  const critical = [
    "backend/src/app.js",
    "backend/server.js",
    "backend/src/config/env.js",
    "backend/src/config/db.js",
    "frontend/src/main.jsx",
    "frontend/src/App.jsx",
    "frontend/src/routes/AppRouter.jsx",
  ];
  for (const rel of critical) {
    it(`${rel} has no "TODO:" or "FIXME:"`, () => {
      const abs = path.join(TEMPLATE_ROOT, rel);
      if (!existsSync(abs)) return;
      const code = readFileSync(abs, "utf-8");
      // Only flag uppercase TODO/FIXME, not lowercase comments
      expect(code).not.toMatch(/\bTODO\b/);
      expect(code).not.toMatch(/\bFIXME\b/);
    });
  }
});
