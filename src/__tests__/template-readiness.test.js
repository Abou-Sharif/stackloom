import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync, cpSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { cleanupGeneratedProject } from "../commands/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ROOT = path.resolve(__dirname, "../..");
const TEMPLATE_ROOT = path.resolve(CLI_ROOT, "../stackloom-templates/mern");

const FRONTEND = path.join(TEMPLATE_ROOT, "frontend");
const BACKEND = path.join(TEMPLATE_ROOT, "backend");

// ─── Helpers ──────────────────────────────────────────────────────

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

function extractImports(code) {
  const deps = [];
  const esmRe = /(?:import[\s\S]*?from\s+|import\s+)["']([^"']+)["']/g;
  let m;
  while ((m = esmRe.exec(code)) !== null) deps.push(m[1]);
  const cjsRe = /(?:require|require\s*\.\s*resolve)\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = cjsRe.exec(code)) !== null) deps.push(m[1]);
  const dynRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynRe.exec(code)) !== null) deps.push(m[1]);
  return [...new Set(deps)];
}

function parseEnvVars(code) {
  const vars = new Set();
  // process.env.X direct access
  const re1 = /process\.env\.(\w+)/g;
  let m;
  while ((m = re1.exec(code)) !== null) vars.add(m[1]);
  // standalone env.X (destructured: const { env } = require(...))
  // Env vars follow UPPER_CASE naming convention
  const re2 = /(?<![.\w])env\.([A-Z][A-Z_0-9]+)\b/g;
  while ((m = re2.exec(code)) !== null) vars.add(m[1]);
  return vars;
}

/** Parse env var names from the Joi schema in env.js */
function parseJoiEnvVars(code) {
  const vars = new Set();
  const re = /(\w+):\s*Joi\./g;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[1] !== "unknown") vars.add(m[1]);
  }
  return vars;
}

function parseEnvExample(content) {
  const vars = new Set();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) vars.add(trimmed.slice(0, eq));
  }
  return vars;
}

const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants",
  "crypto", "dgram", "dns", "domain", "events", "fs", "http", "http2",
  "https", "inspector", "module", "net", "os", "path", "perf_hooks",
  "process", "punycode", "querystring", "readline", "repl", "stream",
  "string_decoder", "timers", "tls", "trace_events", "tty", "url", "util",
  "v8", "vm", "wasi", "worker_threads", "zlib",
  "node:assert", "node:buffer", "node:child_process", "node:cluster",
  "node:console", "node:constants", "node:crypto", "node:dgram",
  "node:diagnostics_channel", "node:dns", "node:domain", "node:events",
  "node:fs", "node:http", "node:http2", "node:https", "node:inspector",
  "node:module", "node:net", "node:os", "node:path", "node:perf_hooks",
  "node:process", "node:punycode", "node:querystring", "node:readline",
  "node:repl", "node:stream", "node:string_decoder", "node:timers",
  "node:tls", "node:trace_events", "node:tty", "node:url", "node:util",
  "node:v8", "node:vm", "node:wasi", "node:worker_threads", "node:zlib",
  "node:diagnostics_channel",
]);

/** Resolve a relative or @/-aliased import spec to an absolute path (or null). */
function resolveImport(spec, importerDir, root) {
  const srcDir = path.join(root, "src");
  if (spec.startsWith("@/")) {
    const rest = spec.slice(2);
    for (const ext of [".jsx", ".js", ".mjs", ".cjs"]) {
      const c = path.join(srcDir, rest + ext);
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    // directory/index pattern
    for (const idx of ["index.jsx", "index.js", "index.mjs", "index.cjs"]) {
      const ic = path.join(srcDir, rest, idx);
      if (existsSync(ic) && statSync(ic).isFile()) return ic;
    }
    return null;
  }
  if (!spec.startsWith(".")) return null; // npm or built-in
  const abs = path.resolve(importerDir, spec);
  for (const ext of [".jsx", ".js", ".mjs", ".cjs"]) {
    const c = abs + ext;
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  // directory/index pattern
  for (const idx of ["index.jsx", "index.js", "index.mjs", "index.cjs"]) {
    const ic = path.join(abs, idx);
    if (existsSync(ic) && statSync(ic).isFile()) return ic;
  }
  return null;
}

/** BFS from entry points: return set of all reachable files, or throw on broken import. */
function traceImportChain(entryPoints, root, label) {
  const visited = new Set();
  const queue = [...entryPoints];
  const errors = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    if (!existsSync(current)) {
      errors.push(`${label}: file not found: ${current}`);
      continue;
    }
    visited.add(current);
    const code = readFileSync(current, "utf-8");
    const imports = extractImports(code);
    const dir = path.dirname(current);

    for (const spec of imports) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      // Skip non-JS/JSX imports (CSS, images, etc.)
      const nonJsExts = [".css", ".scss", ".less", ".svg", ".png", ".jpg", ".gif", ".webp", ".json", ".wasm"];
      if (nonJsExts.some((ext) => spec.endsWith(ext))) continue;
      // Determine correct root based on importer path (not strict equality)
      const resolved = resolveImport(spec, dir, root);
      if (!resolved) {
        errors.push(`${label}: unresolved import in ${path.relative(root, current)}: "${spec}"`);
        continue;
      }
      queue.push(resolved);
    }
  }

  return { visited, errors };
}

/** Check if a file uses ESM syntax (import/export). */
function isEsm(code) {
  return /^\s*import\s|^\s*export\s|^\s*import\s*\{/m.test(code);
}

/** Check if a file uses CJS syntax (require/module.exports). */
function isCjs(code) {
  return /require\s*\(/.test(code) || /module\.exports\s*=/.test(code);
}

// ─── Real Syntax Validation ──────────────────────────────────────

describe("Real JS/JSX syntax validation", () => {
  // Every JS/JSX file parsed through TypeScript to catch real syntax errors
  const allCodeFiles = [...walk(TEMPLATE_ROOT)].filter(
    (f) =>
      (f.endsWith(".js") || f.endsWith(".jsx")) &&
      !f.includes("node_modules") &&
      !f.includes("/__tests__/") &&
      !f.includes("tests/performance/") &&
      !f.startsWith(".loom") &&
      (f.startsWith("frontend/") || f.startsWith("backend/")),
  );

  const failed = [];

  for (const rel of allCodeFiles) {
    it(`parses without error: ${rel}`, () => {
      const abs = path.join(TEMPLATE_ROOT, rel);
      const code = readFileSync(abs, "utf-8");
      const isJSX = rel.endsWith(".jsx");

      const result = ts.transpileModule(code, {
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: isJSX ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
          allowJs: true,
          allowNonTsExtensions: true,
          strict: false,
          noEmit: true,
        },
      });

      if (result.diagnostics && result.diagnostics.length > 0) {
        const msgs = result.diagnostics.map((d) =>
          typeof d.messageText === "string" ? d.messageText : d.messageText.messageText,
        );
        failed.push(`${rel}: ${msgs.join("; ")}`);
        expect(msgs).toEqual([]);
      }
    });
  }

  afterAll(() => {
    if (failed.length > 0) {
      console.warn(`\n⚠ ${failed.length} syntax error(s) found:`);
      for (const msg of failed.slice(0, 10)) {
        console.warn(`  • ${msg}`);
      }
    }
  });
});

// ─── Module System Consistency ───────────────────────────────────

describe("Module system consistency", () => {
  const frontendPkg = JSON.parse(readFileSync(path.join(FRONTEND, "package.json"), "utf-8"));
  const backendPkg = JSON.parse(readFileSync(path.join(BACKEND, "package.json"), "utf-8"));

  it("frontend uses ESM (type: module)", () => {
    expect(frontendPkg.type).toBe("module");
  });

  it("backend uses CJS (type: commonjs or no type field)", () => {
    expect(backendPkg.type).toBe("commonjs");
  });

  // Check all frontend source files use ESM syntax
  const frontendSrcFiles = [...walk(path.join(FRONTEND, "src"))].filter(
    (f) => (f.endsWith(".js") || f.endsWith(".jsx")) && !f.includes("/__tests__/"),
  );

  for (const rel of frontendSrcFiles) {
    it(`frontend/${rel} uses ESM (import/export)`, () => {
      const code = readFileSync(path.join(FRONTEND, "src", rel), "utf-8");
      if (code.trim().length === 0) return;
      // Skip CSS files and non-module utility files
      if (rel.endsWith(".js")) {
        // Some .js files in frontend/src may be config-like or pure functions, allow either
        return;
      }
      // .jsx files must use ESM
      if (rel.endsWith(".jsx")) {
        const hasImport = /import\s/.test(code);
        const hasExport = /export\s/.test(code);
        expect(hasImport || hasExport).toBe(true);
      }
    });
  }

  // Check all backend source files use CJS syntax
  const backendSrcFiles = [...walk(path.join(BACKEND, "src"))].filter(
    (f) => f.endsWith(".js") && !f.includes("/__tests__/"),
  );

  for (const rel of backendSrcFiles) {
    it(`backend/src/${rel} uses CJS (require/module.exports)`, () => {
      const code = readFileSync(path.join(BACKEND, "src", rel), "utf-8");
      if (code.trim().length === 0) return;
      // Must not use ESM import/export
      expect(code).not.toMatch(/^\s*import\s/m);
      expect(code).not.toMatch(/^\s*export\s/m);
      // Must use require or module.exports at least once
      const hasCjs = /require\s*\(/.test(code) || /module\.exports\s*=/.test(code);
      expect(hasCjs).toBe(true);
    });
  }

  const frontendConfigFiles = [...walk(FRONTEND)].filter(
    (f) => f.endsWith(".js") && !f.startsWith("src/") && !f.includes("node_modules"),
  );

  for (const rel of frontendConfigFiles) {
    it(`frontend/${rel} is valid ESM config`, () => {
      const code = readFileSync(path.join(FRONTEND, rel), "utf-8");
      if (code.trim().length === 0) return;
      // Vite/ESLint configs in frontend should use ESM (type: module in package.json)
      const hasImport = /import\s/.test(code);
      const hasExport = /export\s/.test(code);
      // Should not use CJS in ESM package
      expect(code).not.toMatch(/module\.exports\s*=/);
    });
  }
});

// ─── Import Chain Integrity ──────────────────────────────────────

describe("Import chain integrity from entry points", () => {
  const frontendEntry = path.join(FRONTEND, "src", "main.jsx");
  const backendEntry = path.join(BACKEND, "src", "app.js");

  it("frontend entry point exists", () => {
    expect(existsSync(frontendEntry)).toBe(true);
  });

  it("backend entry point exists", () => {
    expect(existsSync(backendEntry)).toBe(true);
  });

  it("frontend import chain is fully resolvable", () => {
    const { errors } = traceImportChain([frontendEntry], FRONTEND, "frontend");
    expect(errors).toEqual([]);
  });

  it("backend import chain is fully resolvable", () => {
    const { errors, visited } = traceImportChain([backendEntry], BACKEND, "backend");
    expect(errors).toEqual([]);
  });
});

// ─── Generation Flow ─────────────────────────────────────────────

describe("Generated project flow (cleanup + integrity)", () => {
  // Simulate what cleanupGeneratedProject does: clone a temp copy and run cleanup
  let tmpProjectRoot;

  beforeAll(async () => {
    tmpProjectRoot = path.join(os.tmpdir(), "loom-test-gen-" + Date.now());
    execSync(`cp -r "${TEMPLATE_ROOT}" "${tmpProjectRoot}"`, { stdio: "pipe" });
    await cleanupGeneratedProject(tmpProjectRoot, { preset: "saas" });
  }, 15000);

  afterAll(() => {
    if (tmpProjectRoot) {
      rmSync(tmpProjectRoot, { recursive: true, force: true });
    }
  });

  it("generated project keeps only active variant files (removes inactive)", () => {
    const variantRoot = path.join(tmpProjectRoot, "frontend", "src", "variants");
    // Active variants for saas preset: Sidebar/default, Navbar/default, Footer/default,
    // Card/elevated, Button/solid. Inactive variants like ghost, outline, flat, etc. removed.
    const activeFiles = [
      path.join(variantRoot, "Button", "solid.jsx"),
      path.join(variantRoot, "Card", "elevated.jsx"),
      path.join(variantRoot, "Sidebar", "default.jsx"),
      path.join(variantRoot, "Navbar", "default.jsx"),
      path.join(variantRoot, "Footer", "default.jsx"),
    ];
    for (const fp of activeFiles) {
      expect(existsSync(fp)).toBe(true);
    }
    // Inactive variant files should be removed
    const removedFiles = [
      path.join(variantRoot, "Button", "ghost.jsx"),
      path.join(variantRoot, "Button", "outline.jsx"),
      path.join(variantRoot, "Card", "glass.jsx"),
      path.join(variantRoot, "Card", "flat.jsx"),
      path.join(variantRoot, "Sidebar", "mini.jsx"),
      path.join(variantRoot, "Navbar", "floating.jsx"),
    ];
    for (const fp of removedFiles) {
      expect(existsSync(fp)).toBe(false);
    }
  });

  it("generated project has no Docker/nginx deploy files", () => {
    expect(existsSync(path.join(tmpProjectRoot, "backend", "Dockerfile"))).toBe(false);
    expect(existsSync(path.join(tmpProjectRoot, "frontend", "Dockerfile"))).toBe(false);
    expect(existsSync(path.join(tmpProjectRoot, "frontend", "nginx.conf"))).toBe(false);
  });

  it("generated project has no products module", () => {
    expect(existsSync(path.join(tmpProjectRoot, "backend", "src", "modules", "products"))).toBe(false);
  });

  // Validate the cleaned project's syntax
  const allJsFiles = [...walk(tmpProjectRoot)].filter(
    (f) =>
      (f.endsWith(".js") || f.endsWith(".jsx")) &&
      !f.includes("node_modules") &&
      !f.includes("/__tests__/") &&
      (f.startsWith("frontend/") || f.startsWith("backend/")),
  );

  for (const rel of allJsFiles) {
    it(`generated ${rel} parses correctly`, () => {
      const abs = path.join(tmpProjectRoot, rel);
      const code = readFileSync(abs, "utf-8");
      const isJSX = rel.endsWith(".jsx");
      const result = ts.transpileModule(code, {
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: isJSX ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
          allowJs: true,
          allowNonTsExtensions: true,
          strict: false,
          noEmit: true,
        },
      });
      const errs = result.diagnostics || [];
      if (errs.length > 0) {
        const msgs = errs.map((d) => d.messageText);
        expect(msgs).toEqual([]);
      }
    });
  }

  // Cleaned project import chain
  it("generated frontend import chain resolves after cleanup", () => {
    const entry = path.join(tmpProjectRoot, "frontend", "src", "main.jsx");
    const { errors } = traceImportChain([entry], path.join(tmpProjectRoot, "frontend"), "generated-frontend");
    expect(errors).toEqual([]);
  });

  it("generated backend import chain resolves after cleanup", () => {
    const entry = path.join(tmpProjectRoot, "backend", "src", "app.js");
    const { errors } = traceImportChain([entry], path.join(tmpProjectRoot, "backend"), "generated-backend");
    expect(errors).toEqual([]);
  });
});

// ─── Environment Vars ────────────────────────────────────────────

describe("Environment variable completeness", () => {
  const envExamplePath = path.join(BACKEND, ".env.example");
  const envExample = readFileSync(envExamplePath, "utf-8");
  const documented = parseEnvExample(envExample);

  const backendFiles = [...walk(BACKEND)].filter(
    (f) => f.endsWith(".js") && !f.includes("/__tests__/") && !f.includes("node_modules") && !f.includes("tests/performance/"),
  );

  const usedInCode = new Set();
  for (const rel of backendFiles) {
    const code = readFileSync(path.join(BACKEND, rel), "utf-8");
    for (const v of parseEnvVars(code)) usedInCode.add(v);
  }
  // Also parse env.js Joi schema keys (env vars defined there but not always used as process.env.X)
  const envJsCode = readFileSync(path.join(BACKEND, "src", "config", "env.js"), "utf-8");
  for (const v of parseJoiEnvVars(envJsCode)) usedInCode.add(v);

  it("every process.env var used in code is documented in .env.example", () => {
    const undocumented = [...usedInCode].filter((v) => !documented.has(v) && v !== "NODE_ENV");
    expect(undocumented).toEqual([]);
  });

  it("every .env.example variable is used somewhere in code", () => {
    const unused = [...documented].filter((v) => !usedInCode.has(v));
    expect(unused).toEqual([]);
  });

  it("no hardcoded secrets in .env.example values", () => {
    for (const line of envExample.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const val = trimmed.slice(eq + 1);
      expect(val.toLowerCase()).not.toMatch(/^(your_|change_me|secret|password123|admin)/);
      if (trimmed.startsWith("JWT_")) {
        expect(val).toMatch(/^replace-with-/);
      }
    }
  });
});

// ─── Security Best Practices ─────────────────────────────────────

describe("Security best practices", () => {
  const appCode = readFileSync(path.join(BACKEND, "src", "app.js"), "utf-8");

  it("helmet is mounted", () => {
    expect(appCode).toMatch(/app\.use\(\s*helmet\s*\(/);
  });

  it("cookie-parser is mounted", () => {
    expect(appCode).toMatch(/cookieParser/);
  });

  it("CORS uses env-based allowlist with credentials", () => {
    expect(appCode).toMatch(/corsOrigins/);
    expect(appCode).not.toMatch(/origin:\s*['"]\*/);
    expect(appCode).toMatch(/credentials:\s*true/);
  });

  it("auth routes use rate limiter", () => {
    const code = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.routes.js"), "utf-8");
    expect(code).toMatch(/router\.use\(\s*authRateLimiter\s*\)/);
  });

  it("no console.log in production code", () => {
    const files = [...walk(TEMPLATE_ROOT)].filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".jsx")) &&
        !f.includes("/__tests__/") &&
        !f.includes("node_modules") &&
        !f.includes("tests/performance/") &&
        (f.startsWith("frontend/") || f.startsWith("backend/")),
    );
    for (const rel of files) {
      const code = readFileSync(path.join(TEMPLATE_ROOT, rel), "utf-8");
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        expect(trimmed).not.toMatch(/console\.log\(/);
      }
    }
  });

  it("CORS config matches .env.example", () => {
    const envExample = readFileSync(path.join(BACKEND, ".env.example"), "utf-8");
    expect(envExample).toMatch(/CORS_ORIGINS/);
  });
});

// ─── Error Handling ──────────────────────────────────────────────

describe("Error handling chain", () => {
  const appCode = readFileSync(path.join(BACKEND, "src", "app.js"), "utf-8");

  it("notFound middleware is mounted before error middleware in app.use chain", () => {
    const useLines = appCode.split("\n").filter((l) => l.includes("app.use("));
    const notFoundLine = useLines.findIndex((l) => l.includes("notFoundMiddleware"));
    const errorLine = useLines.findIndex((l) => l.includes("errorMiddleware"));
    expect(notFoundLine).toBeGreaterThanOrEqual(0);
    expect(errorLine).toBeGreaterThan(notFoundLine);
    expect(errorLine).toBe(useLines.length - 1); // error middleware is last
  });

  it("auth controller uses asyncHandler for all async handlers", () => {
    const code = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.controller.js"), "utf-8");
    const handlers = code.match(/(?:const|let|var)\s+\w+\s*=\s*asyncHandler/g);
    expect(handlers ? handlers.length : 0).toBe(5);
  });

  it("products controller wraps async handlers with try/catch + next(err)", () => {
    const code = readFileSync(path.join(BACKEND, "src", "modules", "products", "products.controller.js"), "utf-8");
    const catches = (code.match(/catch\s*\(/g) || []).length;
    expect(catches).toBe(5); // one per CRUD method
  });

  it("error middleware returns consistent shape", () => {
    const code = readFileSync(path.join(BACKEND, "src", "middlewares", "error.middleware.js"), "utf-8");
    expect(code).toMatch(/success:\s*false/);
    expect(code).toMatch(/message/);
    expect(code).toMatch(/statusCode/);
    expect(code).toMatch(/development/);
  });

  it("notFound middleware throws ApiError(404)", () => {
    const code = readFileSync(path.join(BACKEND, "src", "middlewares", "notFound.middleware.js"), "utf-8");
    expect(code).toMatch(/ApiError/);
    expect(code).toMatch(/404/);
  });

  it("validate middleware returns ApiError(400) and strips unknown", () => {
    const code = readFileSync(path.join(BACKEND, "src", "middlewares", "validate.js"), "utf-8");
    expect(code).toMatch(/400/);
    expect(code).toMatch(/stripUnknown/);
  });
});

// ─── Auth Flow ──────────────────────────────────────────────────

describe("Auth flow completeness", () => {
  const ctrlCode = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.controller.js"), "utf-8");
  const routeCode = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.routes.js"), "utf-8");
  const srvCode = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.service.js"), "utf-8");
  const modelCode = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.model.js"), "utf-8");
  const midCode = readFileSync(path.join(BACKEND, "src", "middlewares", "auth.middleware.js"), "utf-8");

  it("controller exports register, login, refreshToken, logout, getMe", () => {
    const m = ctrlCode.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/register/);
    expect(m[1]).toMatch(/login/);
    expect(m[1]).toMatch(/refreshToken/);
    expect(m[1]).toMatch(/logout/);
    expect(m[1]).toMatch(/getMe/);
  });

  it("routes mount all 5 auth endpoints", () => {
    expect(routeCode).toMatch(/router\.post\(["']\/register["']/);
    expect(routeCode).toMatch(/router\.post\(["']\/login["']/);
    expect(routeCode).toMatch(/router\.post\(["']\/refresh-token["']/);
    expect(routeCode).toMatch(/router\.post\(["']\/logout["']/);
    expect(routeCode).toMatch(/router\.get\(["']\/me["']/);
  });

  it("service exports register, login, refresh, getMe", () => {
    const m = srvCode.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/register/);
    expect(m[1]).toMatch(/login/);
    expect(m[1]).toMatch(/refresh/);
    expect(m[1]).toMatch(/getMe/);
  });

  it("model has bcrypt, comparePassword, toSafeObject, pre-save hook", () => {
    expect(modelCode).toMatch(/bcrypt/);
    expect(modelCode).toMatch(/comparePassword/);
    expect(modelCode).toMatch(/toSafeObject/);
    expect(modelCode).toMatch(/pre\(["']save["']/);
    expect(modelCode).toMatch(/\.hash\(/);
  });

  it("auth middleware exports authenticate, authenticateSession, requireRole", () => {
    const m = midCode.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/authenticate/);
    expect(m[1]).toMatch(/authenticateSession/);
    expect(m[1]).toMatch(/requireRole/);
  });

  it("auth routes use rate limiter and validation", () => {
    expect(routeCode).toMatch(/authRateLimiter/);
    expect(routeCode).toMatch(/validate\(/);
  });
});

// ─── Dependency Completeness ────────────────────────────────────

describe("Dependency completeness", () => {
  const backendPkg = JSON.parse(readFileSync(path.join(BACKEND, "package.json"), "utf-8"));
  const frontendPkg = JSON.parse(readFileSync(path.join(FRONTEND, "package.json"), "utf-8"));

  function getUsedNpmPkgs(rootDir) {
    const pkgs = new Set();
    for (const rel of walk(rootDir)) {
      if (!rel.endsWith(".js") && !rel.endsWith(".jsx")) continue;
      if (rel.includes("node_modules") || rel.includes("/__tests__/")) continue;
      const code = readFileSync(path.join(rootDir, rel), "utf-8");
      for (const spec of extractImports(code)) {
        if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("/")) continue;
        if (NODE_BUILTINS.has(spec)) continue;
        const pkgName = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (NODE_BUILTINS.has(pkgName)) continue;
        pkgs.add(pkgName);
      }
    }
    return pkgs;
  }

  it("all backend npm imports are declared in package.json", () => {
    const used = getUsedNpmPkgs(BACKEND);
    const allDeps = new Set([...Object.keys(backendPkg.dependencies || {}), ...Object.keys(backendPkg.devDependencies || {})]);
    const undeclared = [...used].filter((p) => !allDeps.has(p));
    expect(undeclared).toEqual([]);
  });

  it("all frontend npm imports are declared in package.json", () => {
    const used = getUsedNpmPkgs(FRONTEND);
    const allDeps = new Set([...Object.keys(frontendPkg.dependencies || {}), ...Object.keys(frontendPkg.devDependencies || {})]);
    const undeclared = [...used].filter((p) => !allDeps.has(p));
    expect(undeclared).toEqual([]);
  });
});

// ─── Vite Config ─────────────────────────────────────────────────

describe("Vite config validity", () => {
  const viteConfig = path.join(FRONTEND, "vite.config.js");

  it("vite.config.js exists", () => {
    expect(existsSync(viteConfig)).toBe(true);
  });

  it("vite.config.js has valid syntax", () => {
    const code = readFileSync(viteConfig, "utf-8");
    const result = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
        allowNonTsExtensions: true,
        strict: false,
        noEmit: true,
      },
    });
    const errs = result.diagnostics || [];
    expect(errs.length).toBe(0);
  });

  it("vite config has react plugin and proxy", () => {
    const code = readFileSync(viteConfig, "utf-8");
    expect(code).toMatch(/@vitejs\/plugin-react/);
    expect(code).toMatch(/react\(\)/);
    expect(code).toMatch(/proxy/);
    expect(code).toMatch(/api/);
  });
});

// ─── Backend Config Validation ───────────────────────────────────

describe("Backend config validation", () => {
  const envCode = readFileSync(path.join(BACKEND, "src", "config", "env.js"), "utf-8");

  it("validates MONGODB_URI as required", () => {
    expect(envCode).toMatch(/MONGODB_URI.*required/);
  });

  it("validates JWT secrets with min length 24", () => {
    expect(envCode).toMatch(/JWT_ACCESS_SECRET/);
    expect(envCode).toMatch(/JWT_REFRESH_SECRET/);
    expect(envCode).toMatch(/\.min\(24\)/);
  });

  it("validates NODE_ENV against enum", () => {
    expect(envCode).toMatch(/NODE_ENV.*valid\(/);
  });

  it("parses CORS_ORIGINS into array in env.js", () => {
    const envCode = readFileSync(path.join(BACKEND, "src", "config", "env.js"), "utf-8");
    expect(envCode).toMatch(/\.split\(/);
    expect(envCode).toMatch(/corsOrigins/);
  });
});

// ─── API Shape Consistency ───────────────────────────────────────

describe("API response consistency", () => {
  it("ApiResponse has success, message, data, meta fields", () => {
    const code = readFileSync(path.join(BACKEND, "src", "utils", "ApiResponse.js"), "utf-8");
    expect(code).toMatch(/success:\s*true/);
    expect(code).toMatch(/message/);
    expect(code).toMatch(/data/);
  });

  it("ApiError has statusCode, message, isOperational", () => {
    const code = readFileSync(path.join(BACKEND, "src", "utils", "ApiError.js"), "utf-8");
    expect(code).toMatch(/statusCode/);
    expect(code).toMatch(/isOperational/);
  });

  it("auth controller uses ApiResponse for all responses", () => {
    const code = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.controller.js"), "utf-8");
    const apiResponseUses = (code.match(/ApiResponse/g) || []).length;
    expect(apiResponseUses).toBeGreaterThanOrEqual(5);
  });

  it("auth service uses ApiError for all error cases", () => {
    const code = readFileSync(path.join(BACKEND, "src", "modules", "auth", "auth.service.js"), "utf-8");
    expect(code).toMatch(/ApiError/);
    expect(code).not.toMatch(/throw new Error\(/);
  });
});

// ─── Frontend Quality ────────────────────────────────────────────

describe("Frontend quality", () => {
  const mainCode = readFileSync(path.join(FRONTEND, "src", "main.jsx"), "utf-8");

  it("main.jsx wraps in BrowserRouter, AppPresetProvider, ThemeProvider, AuthProvider", () => {
    expect(mainCode).toMatch(/BrowserRouter/);
    expect(mainCode).toMatch(/AuthProvider/);
    expect(mainCode).toMatch(/AppPresetProvider/);
    expect(mainCode).toMatch(/ThemeProvider/);
  });

  it("Sonner Toaster is included", () => {
    expect(mainCode).toMatch(/Toaster/);
    expect(mainCode).toMatch(/sonner/);
  });

  it("App.jsx uses ErrorBoundary", () => {
    const code = readFileSync(path.join(FRONTEND, "src", "App.jsx"), "utf-8");
    expect(code).toMatch(/ErrorBoundary/);
  });

  it("axios instance has withCredentials and 401 interceptor", () => {
    const code = readFileSync(path.join(FRONTEND, "src", "api", "axiosInstance.js"), "utf-8");
    expect(code).toMatch(/withCredentials:\s*true/);
    expect(code).toMatch(/VITE_API_URL/);
    expect(code).toMatch(/interceptors\.response\.use/);
    expect(code).toMatch(/401/);
  });

  it("ProtectedRoute redirects with Navigate", () => {
    const code = readFileSync(path.join(FRONTEND, "src", "components", "common", "ProtectedRoute.jsx"), "utf-8");
    expect(code).toMatch(/Navigate/);
  });

  it("useAuth throws if used outside provider", () => {
    const code = readFileSync(path.join(FRONTEND, "src", "hooks", "useAuth.js"), "utf-8");
    expect(code).toMatch(/must be used inside AuthProvider/);
  });
});

// ─── Token Utils ─────────────────────────────────────────────────

describe("tokenUtils exports", () => {
  const code = readFileSync(path.join(BACKEND, "src", "utils", "tokenUtils.js"), "utf-8");

  it("exports access and refresh token utilities", () => {
    const m = code.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/generateAccessToken/);
    expect(m[1]).toMatch(/generateRefreshToken/);
    expect(m[1]).toMatch(/verifyAccessToken/);
    expect(m[1]).toMatch(/verifyRefreshToken/);
  });
});
