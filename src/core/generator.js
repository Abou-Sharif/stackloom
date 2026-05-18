import fs from "fs-extra";
import path from "path";
import { TemplateLoader } from "./template-loader.js";
import { MarkerStrategy } from "./marker-strategy.js";
import { ResourceDefinition } from "./resource-definition.js";
import { StateTracker } from "./state-tracker.js";
import { blueprintLoader } from "../blueprint/index.js";
import chalk from "chalk";

export class Generator {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.arch = options.architecture || "moderate";
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.force = options.force || false;
    this.withFrontend = options.withFrontend !== false;
    this.withTests = options.withTests || false;

    // Architecture contract — resolved lazily, never hardcoded. See blueprint/.
    this.blueprint = options.blueprint || null;

    this.templates = new TemplateLoader();
    this.templates.projectRoot = this.projectRoot;

    this.tracker = new StateTracker(this.projectRoot);

    this.resource = null;
    this.generatedFiles = [];
    this.issues = [];
  }

  /**
   * Main entry: generate resource from definition object or file
   */
  async generateFromDefinition(resourceDef) {
    this.resource =
      resourceDef instanceof ResourceDefinition
        ? resourceDef
        : new ResourceDefinition(resourceDef);

    await this.validateProject();
    const context = await this.buildContext();
    await this.generateBackend(context);
    await this.ensureBackendDeps(context);

    if (this.withFrontend) {
      await this.generateFrontend(context);
    }

    await this.updateProjectFiles(context);

    // Record for rollback
    if (!this.dryRun && this.resource) {
      await this.tracker.recordEvent({
        action: "generate",
        resource: this.resource.name,
        files: this.generatedFiles
          .filter((f) => f.action !== "SKIP")
          .map((f) => ({ path: f.output, action: f.action })),
      });
    }

    return {
      files: this.generatedFiles,
      issues: this.issues,
      resource: this.resource,
    };
  }

  /**
   * Load + cache the architecture blueprint for this project.
   * Falls back to the CLI's built-in MERN blueprint when a project has none.
   */
  async getBlueprint() {
    if (!this.blueprint) {
      this.blueprint = await blueprintLoader.load(this.projectRoot);
    }
    return this.blueprint;
  }

  /**
   * Validate we're in a project the blueprint recognizes.
   */
  async validateProject() {
    const blueprint = await this.getBlueprint();
    const modulesDir = blueprint.resolvePath(
      "backend.modules",
      this.projectRoot,
    );
    if (!(await fs.pathExists(modulesDir))) {
      throw new Error(
        "Not a MERN Starter Kit backend. Run from project root where backend/ exists.",
      );
    }
  }

  /**
   * Build context object for templates
   */
  async buildContext() {
    const blueprint = await this.getBlueprint();
    const backendDir = blueprint.resolveRoot("backend", this.projectRoot);
    const frontendDir = blueprint.resolveRoot("frontend", this.projectRoot);
    const usesTS = blueprint.usesTypeScript(this.projectRoot);

    return {
      resource: this.resource,
      blueprint,
      options: {
        architecture: this.arch,
        force: this.force,
        withTests: this.withTests,
        withFrontend: this.withFrontend,
        timestamp: new Date().toISOString(),
      },
      project: {
        root: this.projectRoot,
        backendDir,
        frontendDir,
        usesTypeScript: usesTS,
      },
      utils: {
        pascal: (s) => s.charAt(0).toUpperCase() + s.slice(1),
        camel: (s) => s.charAt(0).toLowerCase() + s.slice(1),
        snake: (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()),
        kebab: (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()),
        quote: (str) => JSON.stringify(str),
        indent: (str, n) =>
          str
            .split("\n")
            .map((l) => " ".repeat(n) + l)
            .join("\n"),
      },
    };
  }

  // Directory + language detection now lives in the Blueprint (blueprint/),
  // resolved via getBlueprint() — no architecture assumptions hardcoded here.

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKEND GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  async generateBackend(context) {
    if (!this.resource) return;
    const { name, kebabName } = this.resource;

    const templates = [
      {
        tpl: "resource/model.js.ejs",
        out: `backend/src/modules/${kebabName}/models/${name}.js`,
      },
      {
        tpl: "resource/service.js.ejs",
        out: `backend/src/modules/${kebabName}/services/${name}.service.js`,
      },
      {
        tpl: "resource/controller.js.ejs",
        out: `backend/src/modules/${kebabName}/controllers/${name}.controller.js`,
      },
      {
        tpl: "resource/routes.js.ejs",
        out: `backend/src/modules/${kebabName}/routes/${name}.routes.js`,
      },
      {
        tpl: "resource/validator.js.ejs",
        out: `backend/src/utils/validators/${name}.validator.js`,
      },
    ];

    if (this.arch === "advanced" || this.withTests) {
      templates.push({
        tpl: "resource/test.ejs",
        out: `backend/src/modules/${kebabName}/tests/${name}.test.js`,
      });
    }

    for (const job of templates) {
      await this.generateFile(job.tpl, job.out, context);
    }

    await this.injectIntoRoutesIndex(context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRONTEND GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  async generateFrontend(context) {
    if (!this.resource) return;
    const { name, kebabName } = this.resource;

    // Legacy path: the modal shell is the closest match to the old ListPage.
    // New work should prefer the engine-backed `loom generate resource`.
    const templates = [
      {
        tpl: "resource/page-modal.jsx.ejs",
        out: `frontend/src/pages/admin/${kebabName}/ListPage.jsx`,
      },
      {
        tpl: "resource/page-detail.jsx.ejs",
        out: `frontend/src/pages/admin/${kebabName}/DetailPage.jsx`,
      },
      {
        tpl: "resource/page-form.jsx.ejs",
        out: `frontend/src/pages/admin/${kebabName}/FormPage.jsx`,
      },
      {
        tpl: "resource/components/table.jsx.ejs",
        out: `frontend/src/components/tables/${name}Table.jsx`,
      },
      {
        tpl: "resource/components/form.jsx.ejs",
        out: `frontend/src/components/forms/${name}Form.jsx`,
      },
      {
        tpl: "resource/api.js.ejs",
        out: `frontend/src/api/${kebabName}.api.js`,
      },
      { tpl: "resource/hooks.js.ejs", out: `frontend/src/hooks/use${name}.js` },
    ];

    if (context.project.usesTypeScript) {
      templates.push({
        tpl: "resource/types.ts.ejs",
        out: `frontend/src/types/${kebabName}.types.ts`,
      });
    }

    for (const job of templates) {
      await this.generateFile(job.tpl, job.out, context);
    }

    await this.injectIntoFrontendRouter(context);
    await this.injectIntoNavigation(context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE GENERATION (with dry-run, force, markers)
  // ═══════════════════════════════════════════════════════════════════════════

  async generateFile(templatePath, outputPath, context) {
    const fullOut = path.join(this.projectRoot, outputPath);
    const exists = await fs.pathExists(fullOut);

    if (exists && !this.force) {
      this.log(`[SKIP] ${outputPath} exists (use --force to overwrite)`);
      this.generatedFiles.push({
        template: templatePath,
        output: outputPath,
        action: "SKIP",
        reason: "exists",
      });
      return;
    }

    if (this.dryRun) {
      this.generatedFiles.push({
        template: templatePath,
        output: outputPath,
        action: exists ? "UPDATE" : "CREATE",
        reason: "dry-run",
      });
      return;
    }

    await fs.ensureDir(path.dirname(fullOut));

    let content;
    try {
      content = await this.templates.render(
        templatePath,
        context,
        this.projectRoot,
      );
    } catch (err) {
      this.issues.push({
        type: "error",
        file: outputPath,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (exists) {
      try {
        const existing = await fs.readFile(fullOut, "utf-8");
        const parsed = MarkerStrategy.parse(existing);
        if (parsed.hasMarkers) {
          const newAuto = MarkerStrategy.extractAutoBlock(content);
          content = MarkerStrategy.compose(parsed, newAuto);
        } else {
          content = MarkerStrategy.ensureMarkers(
            content,
            context.resource?.name || "",
          );
        }
      } catch (err) {
        this.issues.push({
          type: "warn",
          file: outputPath,
          message: `Marker strategy failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      content = MarkerStrategy.ensureMarkers(
        content,
        context.resource?.name || "",
      );
    }

    try {
      await fs.writeFile(fullOut, content, "utf-8");
      this.log(`[${exists ? "UPDATE" : "CREATE"}] ${outputPath}`);
      this.generatedFiles.push({
        template: templatePath,
        output: outputPath,
        action: exists ? "UPDATE" : "CREATE",
      });
    } catch (err) {
      this.issues.push({
        type: "error",
        file: outputPath,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT FILE UPDATES (routes, navigation, etc)
  // ═══════════════════════════════════════════════════════════════════════════

  async injectIntoRoutesIndex(context) {
    const indexPath = path.join(
      this.projectRoot,
      "backend",
      "src",
      "routes",
      "index.js",
    );
    if (!(await fs.pathExists(indexPath))) {
      this.log("[SKIP] backend/src/routes/index.js not found");
      return;
    }

    let code = await fs.readFile(indexPath, "utf-8");
    const mountLine = `router.use("/${context.resource.pluralKebab}", require("../modules/${context.resource.kebabName}/routes/${context.resource.name}.routes"));`;
    const singularMountLine = `router.use("/${context.resource.kebabName}", require("../modules/${context.resource.kebabName}/routes/${context.resource.name}.routes"));`;

    // If the exact desired mount already exists, skip.
    if (code.includes(mountLine)) {
      this.log("[SKIP] Route already mounted in index.js");
      return;
    }

    // If there is an existing mount for the same path but pointing to a different
    // module (e.g. leftover `../modules/products/...`), replace it so the newly
    // generated module takes precedence. This prevents older modules from
    // capturing requests intended for the new resource.
    const anyMountRegex = new RegExp(
      `router\\.use\("/${context.resource.pluralKebab}",\\s*require\\((?:'|\")\\.\\.\\/modules\\\/[\\w-\\/]+\\/routes\\\/[\\w-\\.]+\\.routes\\"\)\\)\\s*;?`,
      "g",
    );
    if (anyMountRegex.test(code)) {
      code = code.replace(anyMountRegex, mountLine);
      await fs.writeFile(indexPath, code, "utf-8");
      this.generatedFiles.push({
        output: "backend/src/routes/index.js",
        action: "UPDATE",
        reason: "replace-conflicting-mount",
      });
      this.log(
        `[UPDATE] backend/src/routes/index.js (replaced conflicting mount)`,
      );
      return;
    }

    // If there is a singular-style mount (older template), upgrade it to plural.
    if (code.includes(singularMountLine)) {
      code = code.replace(singularMountLine, mountLine);
      await fs.writeFile(indexPath, code, "utf-8");
      this.generatedFiles.push({
        output: "backend/src/routes/index.js",
        action: "UPDATE",
        reason: "upgrade-route-path",
      });
      this.log(`[UPDATE] backend/src/routes/index.js`);
      return;
    }

    if (code.includes("module.exports = router")) {
      code = code.replace(
        "module.exports = router;",
        `${mountLine}\nmodule.exports = router;`,
      );
      await fs.writeFile(indexPath, code, "utf-8");
      this.generatedFiles.push({
        output: "backend/src/routes/index.js",
        action: "UPDATE",
        reason: "mount-route",
      });
      this.log(`[UPDATE] backend/src/routes/index.js`);
    } else {
      this.issues.push({
        type: "warn",
        file: "routes/index.js",
        message: "Could not find module.exports line to mount route",
      });
    }
  }

  async injectIntoFrontendRouter(context) {
    if (!this.withFrontend) return;

    const routerPath = path.join(
      this.projectRoot,
      "frontend",
      "src",
      "routes",
      "AppRouter.jsx",
    );
    if (!(await fs.pathExists(routerPath))) {
      this.log("[SKIP] frontend/src/routes/AppRouter.jsx not found");
      return;
    }

    let code = await fs.readFile(routerPath, "utf-8");
    const pageName = context.resource.pascalName;
    const kebabName = context.resource.kebabName;

    const importLine = `const ${pageName}List = lazy(() => import("@/pages/admin/${kebabName}/ListPage"));`;
    let changed = false;

    if (!code.includes(importLine)) {
      const importRegex = /^const \w+Page = lazy\(.*?\);/gm;
      const imports = code.match(importRegex);

      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        code = code.replace(lastImport, `${lastImport}\n${importLine}`);
      } else {
        code = code.replace(
          "export function AppRouter()",
          `${importLine}\nexport function AppRouter()`,
        );
      }
      changed = true;
    }

    const routePath = `/admin/${context.resource.pluralKebab}`;
    const oldRoutePath = `/admin/${kebabName}`;
    const routeBlock = `${pageName}List`;
    const routeInsert = `\n      {/* ${pageName} */}
      <Route
        path="${routePath}"
        element={<AppShell secure><${routeBlock} /></AppShell>}
      />`;

    if (!code.includes(`path="${routePath}"`)) {
      if (code.includes(`path="${oldRoutePath}"`)) {
        code = code.replace(`path="${oldRoutePath}"`, `path="${routePath}"`);
        changed = true;
      } else {
        const wildcardRegex = /^(\s*)<Route\s+path="\*"\s+element=.*?\/>/m;
        const match = code.match(wildcardRegex);

        if (match) {
          const indent = match[1];
          const indentedInsert = routeInsert.replace(/\n/g, "\n" + indent);
          code = code.replace(wildcardRegex, indentedInsert + "\n" + match[0]);
        } else {
          code = code.replace("</Routes>", `${routeInsert}\n      </Routes>`);
        }
        changed = true;
      }
    }

    if (changed) {
      await fs.writeFile(routerPath, code, "utf-8");
      this.generatedFiles.push({
        output: "frontend/src/routes/AppRouter.jsx",
        action: "UPDATE",
        reason: "add-route",
      });
      this.log(`[UPDATE] frontend/src/routes/AppRouter.jsx`);
    }
  }

  async injectIntoNavigation(context) {
    if (!this.withFrontend) return;

    const presetPath = path.join(
      this.projectRoot,
      "frontend",
      "src",
      "config",
      "app-preset.js",
    );
    if (!(await fs.pathExists(presetPath))) {
      this.log("[SKIP] frontend/src/config/app-preset.js not found");
      return;
    }

    let presetCode = await fs.readFile(presetPath, "utf-8");
    const routePath = `/admin/${context.resource.pluralKebab}`;
    const navLabel = context.resource.name.replace(/([A-Z])/g, " $1").trim();
    const navEntry = `{ label: "${navLabel}", href: "${routePath}", icon: "layout" },`;

    const oldRoutePath = `/admin/${context.resource.kebabName}`;
    if (presetCode.includes(`href: "${routePath}"`)) {
      this.log("[SKIP] Navigation entry already exists");
      return;
    }

    if (presetCode.includes(`href: "${oldRoutePath}"`)) {
      presetCode = presetCode.replace(
        `href: "${oldRoutePath}"`,
        `href: "${routePath}"`,
      );
      await fs.writeFile(presetPath, presetCode, "utf-8");
      this.generatedFiles.push({
        output: "frontend/src/config/app-preset.js",
        action: "UPDATE",
        reason: "upgrade-navigation-path",
      });
      this.log(`[UPDATE] frontend/src/config/app-preset.js (navigation)`);
      return;
    }

    const navMatch = presetCode.match(/navigation\s*:\s*\[([^\]]*)\]/s);
    if (!navMatch) {
      this.issues.push({
        type: "warn",
        file: "app-preset.js",
        message: "Could not find navigation array",
      });
      return;
    }

    let existingItems = navMatch[1].trim();
    existingItems = existingItems.replace(/,\s*$/, "");

    const newItems = existingItems
      ? `${existingItems},\n      ${navEntry}`
      : navEntry;
    const replacement = `navigation: [\n      ${newItems}\n    ]`;

    presetCode = presetCode.replace(
      /navigation\s*:\s*\[[^\]]*\]/s,
      replacement,
    );
    await fs.writeFile(presetPath, presetCode, "utf-8");
    this.generatedFiles.push({
      output: "frontend/src/config/app-preset.js",
      action: "UPDATE",
      reason: "add-nav",
    });
    this.log(`[UPDATE] frontend/src/config/app-preset.js (navigation)`);
  }

  async ensureBackendDeps(context) {
    const backendDir = context.project.backendDir;
    const pkgPath = path.join(this.projectRoot, backendDir, "package.json");
    if (!fs.existsSync(pkgPath)) return;

    const pkg = await fs.readJSON(pkgPath);
    const required = {};

    // slugify needed if resource has slug, code, or sku field
    if (
      this.resource.fields.some((f) => ["slug", "code", "sku"].includes(f.name))
    ) {
      required.slugify = "^1.6.6";
    }

    // No express-validator needed for resource generator (uses Joi)

    if (Object.keys(required).length === 0) return;

    let changed = false;
    const deps = pkg.dependencies || (pkg.dependencies = {});
    for (const [name, version] of Object.entries(required)) {
      if (!deps[name]) {
        deps[name] = version;
        changed = true;
      }
    }
    if (changed) {
      await fs.writeJSON(pkgPath, pkg, { spaces: 2 });
      this.log(
        chalk.green(
          "✓ Added backend dependencies: " + Object.keys(required).join(", "),
        ),
      );
    }
  }

  async updateProjectFiles(context) {
    // future logic
  }

  log(msg) {
    if (this.verbose) console.log(msg);
  }
}
