import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import os from "node:os";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { extract } from "tar";
import { MarkerStrategy } from "./marker-strategy.js";

const FALLBACK_REPO = "Abou-Sharif/stackloom-templates";
const FALLBACK_BRANCH = "main";

const CONTRACT_FILES = new Set([
  "backend/src/app.js",
  "backend/server.js",
  "backend/src/routes/index.js",
  "backend/src/config/db.js",
  "backend/src/config/env.js",
  "backend/src/config/swagger.js",
  "frontend/src/main.jsx",
  "frontend/src/App.jsx",
  "frontend/index.html",
  "frontend/src/routes/AppRouter.jsx",
  "frontend/src/config/app-preset.js",
]);

const SCAFFOLD_DIRS = [
  "backend/src/middlewares",
  "backend/src/utils",
  "frontend/src/components/common",
  "frontend/src/components/layout",
  "frontend/src/components/ui",
  "frontend/src/context",
  "frontend/src/lib",
  "frontend/src/store",
  "frontend/src/styles",
];

const BUILTIN_MODULES = new Set(["auth", "products"]);

const PACKAGE_FILES = new Set([
  "backend/package.json",
  "frontend/package.json",
]);

const PROJECT_SPECIFIC_FILES = new Set([
  "README.md",
  "LICENSE",
  ".gitignore",
  "frontend/.gitignore",
  "frontend/CUSTOMIZATION.md",
  "frontend/.env",
  "backend/.env",
  "node_modules",
]);

const GENERATED_PREFIXES = [
  "backend/src/modules/",
  "frontend/src/pages/admin/",
  "frontend/src/components/tables/",
  "frontend/src/components/forms/",
  "frontend/src/api/",
  "frontend/src/types/",
];

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next"]);

function isGeneratedFile(relPath) {
  return GENERATED_PREFIXES.some((p) => relPath.startsWith(p));
}

function isBuiltinModule(relPath) {
  for (const mod of BUILTIN_MODULES) {
    if (relPath.startsWith(`backend/src/modules/${mod}/`)) return true;
  }
  return false;
}

function isScaffoldFile(relPath) {
  for (const dir of SCAFFOLD_DIRS) {
    if (relPath.startsWith(dir + "/")) return true;
  }
  return false;
}

function isContractFile(relPath) {
  return CONTRACT_FILES.has(relPath);
}

function isPackageFile(relPath) {
  return PACKAGE_FILES.has(relPath);
}

function isProjectSpecificFile(relPath) {
  for (const p of PROJECT_SPECIFIC_FILES) {
    if (relPath === p || relPath.startsWith(p + "/")) return true;
  }
  return false;
}

function classifyFile(relPath) {
  relPath = relPath.replace(/\\/g, "/");
  if (isGeneratedFile(relPath) && !isBuiltinModule(relPath)) return "generated";
  if (isProjectSpecificFile(relPath)) return "skip";
  if (isContractFile(relPath)) return "contract";
  if (isPackageFile(relPath)) return "package";
  if (isScaffoldFile(relPath)) return "scaffold";
  if (isBuiltinModule(relPath)) return "builtin-module";
  if (relPath.startsWith("backend/") || relPath.startsWith("frontend/")) {
    return "scaffold";
  }
  if (relPath.startsWith(".loom/")) return "contract";
  if (relPath.startsWith(".env")) return "contract";
  if (relPath.endsWith(".env.example")) return "contract";
  if (relPath.endsWith("Dockerfile")) return "scaffold";
  if (relPath.endsWith("eslint.config.js")) return "scaffold";
  if (relPath.endsWith("vite.config.js")) return "scaffold";
  if (relPath.endsWith("tailwind.config.js")) return "scaffold";
  if (relPath.endsWith("postcss.config.js")) return "scaffold";
  if (relPath.endsWith("jsconfig.json")) return "scaffold";
  if (relPath.endsWith("components.json")) return "scaffold";
  if (relPath.endsWith("nginx.conf")) return "scaffold";
  if (relPath.endsWith("pnpm-workspace.yaml")) return "scaffold";
  if (relPath.endsWith("pnpm-lock.yaml")) return "skip";
  return "scaffold";
}

const DOWNLOAD_TIMEOUT_MS = 30_000;

async function downloadTemplate(url, destDir, redirectsLeft = 5) {
  const https = await import("node:https");
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      req.destroy();
      reject(new Error(`Template download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s: ${url}`));
    }, DOWNLOAD_TIMEOUT_MS);

    const req = https.get(url, (res) => {
      if (timedOut) return;
      clearTimeout(timer);
      const status = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (!res.headers.location) {
          res.resume();
          return reject(new Error(`HTTP ${status} redirect without Location header (${url})`));
        }
        if (redirectsLeft <= 0) {
          res.resume();
          return reject(new Error(`Too many redirects following ${url}`));
        }
        res.resume();
        return downloadTemplate(res.headers.location, destDir, redirectsLeft - 1).then(resolve, reject);
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status} from ${url}`));
      }
      pipeline(
        res,
        createGunzip(),
        extract({ cwd: destDir, strip: 1 }),
      ).then(resolve, reject);
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      reject(err);
    });
  });
}

function resolveTemplateSource(reporter) {
  const cfgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", "..", "config", "templates.json",
  );
  let config = null;
  if (fs.existsSync(cfgPath)) {
    try {
      config = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    } catch (err) {
      if (reporter) {
        reporter.warn(
          `config/templates.json is malformed: ${err.message}. Using fallback template source.`,
        );
      }
    }
  }
  const envPath = process.env.STACKLOOM_TEMPLATES_PATH;
  if (envPath) {
    const subdir = config?.templates?.mern?.dir || "mern";
    const abs = path.resolve(envPath, subdir);
    if (fs.existsSync(abs)) {
      return { type: "local", path: abs };
    }
    if (reporter) {
      reporter.warn(
        `STACKLOOM_TEMPLATES_PATH is set to "${envPath}" but "${subdir}" was not found. Falling back to remote template.`,
      );
    }
  }
  if (config?.defaultRepo && config?.defaultBranch) {
    const url = `https://github.com/${config.defaultRepo}/archive/refs/heads/${config.defaultBranch}.tar.gz`;
    return { type: "remote", url };
  }
  const url = `https://github.com/${FALLBACK_REPO}/archive/refs/heads/${FALLBACK_BRANCH}.tar.gz`;
  return { type: "remote", url };
}

function listFilesRecursive(dir, prefix = "") {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;

  // Normalise separators so path prefix checks work cross-platform
  const norm = (p) => p.replace(/\\/g, "/");
  for (const name of fs.readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${norm(prefix)}/${norm(name)}` : norm(name);
    try {
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        entries.push(...listFilesRecursive(abs, rel));
      } else {
        entries.push(rel);
      }
    } catch {
      continue;
    }
  }
  return entries;
}

async function fetchTemplate(reporter) {
  const source = resolveTemplateSource(reporter);
  const tempDir = path.join(os.tmpdir(), `loom-upgrade-${Date.now()}`);
  await fs.ensureDir(tempDir);

  try {
    if (source.type === "local") {
      await fs.copy(source.path, tempDir, {
        overwrite: true,
        filter: (src) => !src.split(path.sep).includes("node_modules"),
      });
      return tempDir;
    }

    await downloadTemplate(source.url, tempDir);
    return tempDir;
  } catch (err) {
    await fs.remove(tempDir).catch(() => {});
    throw err;
  }
}

function safeParseJSON(content, label) {
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${label}: ${err.message}. Fix the file and try again.`,
    );
  }
}

function mergePackageJson(existingPath, templateContent) {
  if (!fs.existsSync(existingPath)) return templateContent;

  let existing, template;
  try {
    existing = safeParseJSON(
      fs.readFileSync(existingPath, "utf-8"),
      existingPath,
    );
    template = safeParseJSON(templateContent, "template package.json");
  } catch (err) {
    throw err;
  }

  const merged = { ...existing };
  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (template[section]) {
      merged[section] = merged[section] || {};
      for (const [name, version] of Object.entries(template[section])) {
        if (!merged[section][name]) {
          merged[section][name] = version;
        }
      }
    }
  }
  for (const key of ["scripts", "engines", "type"]) {
    if (template[key] && !existing[key]) {
      merged[key] = template[key];
    }
  }
  try {
    return JSON.stringify(merged, null, 2) + "\n";
  } catch (err) {
    throw new Error(
      `Failed to serialize merged package.json: ${err.message}`,
    );
  }
}

function mergeEnvExample(existing, incoming) {
  if (!existing) return incoming;
  const existingKeys = new Set(
    existing.split("\n").map((l) => l.split("=")[0].trim()).filter(Boolean),
  );
  const existingLines = new Set(existing.split("\n").map((l) => l.trim()));
  const lines = incoming.split("\n");
  const merged = lines.map((line) => {
    const key = line.split("=")[0].trim();
    if (key && !existingKeys.has(key)) {
      existingKeys.add(key);
      return line;
    }
    return existingLines.has(line.trim()) ? line : null;
  }).filter((l) => l !== null);
  return merged.join("\n");
}

export class UpgradeEngine {
  constructor({ projectRoot, reporter, dryRun = false, force = false, templateDir = null }) {
    this.projectRoot = projectRoot;
    this.reporter = reporter;
    this.dryRun = dryRun;
    this.force = force;
    this._templateDir = templateDir;
    this.changes = [];
    this.templateDir = null;
    this.backupDir = null;
  }

  async ensureTemplate() {
    if (this._templateDir) {
      this.templateDir = this._templateDir;
      this.reporter.debug(`Using provided template dir: ${this._templateDir}`);
      return;
    }
    this.reporter.step("Fetching latest template...");
    this.templateDir = await fetchTemplate(this.reporter);
    this.reporter.success("Template fetched");
  }

  async analyze() {
    await this.ensureTemplate();

    const templateFiles = listFilesRecursive(this.templateDir);
    const projectFiles = listFilesRecursive(this.projectRoot);

    const projectFileSet = new Set(projectFiles);
    const templateFileSet = new Set(templateFiles);

    const newFiles = [];
    const changedFiles = [];
    const deletedFiles = [];
    const skippedFiles = [];

    for (const rel of templateFiles) {
      const category = classifyFile(rel);
      if (category === "skip") {
        skippedFiles.push(rel);
        continue;
      }

      const templateAbs = path.join(this.templateDir, rel);
      const projectAbs = path.join(this.projectRoot, rel);

      if (!projectFileSet.has(rel)) {
        newFiles.push({ rel, category, templateAbs, projectAbs });
        continue;
      }

      const templateContent = fs.readFileSync(templateAbs, "utf-8");
      const projectContent = fs.readFileSync(projectAbs, "utf-8");

      if (templateContent !== projectContent) {
        changedFiles.push({ rel, category, templateContent, projectContent, templateAbs, projectAbs });
      }
    }

    for (const rel of projectFiles) {
      if (!templateFileSet.has(rel) && classifyFile(rel) === "generated") {
        continue;
      }
      if (!templateFileSet.has(rel) && !isGeneratedFile(rel) && !isProjectSpecificFile(rel) && !rel.startsWith(".loom/resources/")) {
        deletedFiles.push(rel);
      }
    }

    return { newFiles, changedFiles, deletedFiles, skippedFiles };
  }

  hasAutoGeneratedMarkers(content) {
    return MarkerStrategy.parse(content).hasMarkers;
  }

  generateBackupDirName() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return path.join(this.projectRoot, ".loom", `upgrade-backup-${suffix}`);
  }

  async apply({ newFiles, changedFiles, deletedFiles }) {
    this.backupDir = this.generateBackupDirName();
    await fs.ensureDir(this.backupDir);

    const writtenFiles = [];

    const backupFile = async (relPath) => {
      const abs = path.join(this.projectRoot, relPath);
      if (!fs.existsSync(abs)) return;
      const dest = path.join(this.backupDir, relPath);
      await fs.ensureDir(path.dirname(dest));
      await fs.copy(abs, dest, { overwrite: false });
    };

    const toWrite = [];

    for (const file of newFiles) {
      const content = fs.readFileSync(file.templateAbs, "utf-8");
      toWrite.push({ rel: file.rel, content, action: "create", category: file.category });
    }

    for (const file of changedFiles) {
      await backupFile(file.rel);

      if (file.category === "package") {
        const merged = mergePackageJson(file.projectAbs, file.templateContent);
        toWrite.push({ rel: file.rel, content: merged, action: "merge", category: file.category });
        continue;
      }

      if (file.rel.endsWith(".env.example")) {
        const merged = mergeEnvExample(file.projectContent, file.templateContent);
        toWrite.push({ rel: file.rel, content: merged, action: "merge", category: file.category });
        continue;
      }

      if (this.hasAutoGeneratedMarkers(file.projectContent)) {
        const parsed = MarkerStrategy.parse(file.projectContent);
        const newAuto = MarkerStrategy.extractAutoBlock(file.templateContent);
        const merged = MarkerStrategy.compose(parsed, newAuto, {
          resourceName: "upgrade",
          stealth: false,
        });
        toWrite.push({ rel: file.rel, content: merged, action: "merge-markers", category: file.category });
        continue;
      }

      if (this.force) {
        toWrite.push({ rel: file.rel, content: file.templateContent, action: "update", category: file.category });
      } else {
        const sidecarRel = file.rel + ".upgrade-new";
        toWrite.push({ rel: sidecarRel, content: file.templateContent, action: "sidecar", category: file.category });
        this.reporter.warn(
          `${file.rel} has been modified — saving new template version as ${sidecarRel}. ` +
          "Review changes and merge manually, or re-run with --force to overwrite.",
        );
      }
    }

    this.changes = toWrite;

    if (this.dryRun) {
      this.reporter.step("Dry-run — files that would change:");
      for (const w of toWrite) {
        this.reporter.info(`${w.action === "create" ? "+" : w.action === "merge" ? "~" : ">"} ${w.rel} (${w.category})`);
      }
      return this.changes;
    }

    this.reporter.step(`Applying ${toWrite.length} file change(s)...`);

    if (toWrite.length > 0) {
      this.reporter.info(`Backup saved to .loom/${path.basename(this.backupDir)}`);
    }

    let written = 0;
    let writeFailed = false;
    for (const w of toWrite) {
      const abs = path.join(this.projectRoot, w.rel);
      try {
        await fs.ensureDir(path.dirname(abs));
        await fs.writeFile(abs, w.content, "utf-8");
        this.reporter.info(`${w.action === "create" ? "+" : w.action === "merge" ? "~" : ">"} ${w.rel}`);
        written++;
        writtenFiles.push(w.rel);
      } catch (err) {
        writeFailed = true;
        this.reporter.error(`Failed to write ${w.rel}: ${err.message}`);
      }
    }

    if (writeFailed && writtenFiles.length > 0) {
      this.reporter.warn(
        "Some files failed to write. Your project may be in an inconsistent state. " +
        `Use 'loom backup restore' to revert. Backup: .loom/${path.basename(this.backupDir)}`,
      );
    }

    if (deletedFiles.length > 0) {
        this.reporter.info(`Note: ${deletedFiles.length} file(s) in project but not in template (skipped)`);
    }

    return this.changes;
  }

  async cleanup() {
    if (this.templateDir && fs.existsSync(this.templateDir)) {
      await fs.remove(this.templateDir).catch(() => {});
      this.templateDir = null;
    }
  }

  async rollback() {
    if (!this.backupDir || !fs.existsSync(this.backupDir)) {
      this.reporter.warn("No backup found to roll back from");
      return;
    }

    const files = listFilesRecursive(this.backupDir);
    let restored = 0;
    let restoreFailed = false;
    for (const rel of files) {
      const backupAbs = path.join(this.backupDir, rel);
      const projectAbs = path.join(this.projectRoot, rel);
      try {
        await fs.ensureDir(path.dirname(projectAbs));
        await fs.copy(backupAbs, projectAbs, { overwrite: true });
        restored++;
      } catch (err) {
        restoreFailed = true;
        this.reporter.error(`Failed to restore ${rel}: ${err.message}`);
      }
    }
    const ok = !restoreFailed;
    if (ok) {
      await fs.remove(this.backupDir).catch(() => {});
      this.reporter.success(`Rolled back — restored ${restored} file(s)`);
    } else {
      this.reporter.warn(
        `Partial restore (${restored}/${files.length} files). Backup preserved at .loom/${path.basename(this.backupDir)} so you can retry with 'loom backup restore'.`,
      );
    }
  }
}
