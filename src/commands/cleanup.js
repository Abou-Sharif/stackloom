#!/usr/bin/env node

/**
 * `loom cleanup` — prepare a generated project for handoff.
 *
 * The `production` preset performs a *full de-brand*: after it runs, nothing in
 * the project reveals that it started life as the starter kit — no `.loom/`
 * metadata, no STARTER-KIT/TODO-Customize comments, no AUTO-GENERATED marker
 * blocks, no starter meta-docs, no bundled CLI package, generic package names.
 *
 * Safety: cleanup refuses to run unless the working directory looks like a
 * project root (has both `backend/` and `frontend/`). It is destructive — it
 * must never run against an arbitrary directory.
 */
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { normalizePm, installCmd, runCmd } from "../utils/package-manager.js";

const CLEANUP_PRESETS = {
  minimal: {
    description: "Remove demo content and obvious branding",
    actions: ["removeDemoContent", "replaceBranding", "resetPackageIdentity"],
  },
  production: {
    description: "Full de-brand — no trace of the starter kit remains",
    // removeStarterMetadata runs first so later steps never walk the bundled CLI.
    actions: [
      "removeStarterMetadata",
      "removeDemoContent",
      "stripSourceComments",
      "replaceBranding",
      "resetPackageIdentity",
      "rewriteReadme",
    ],
  },
  template: {
    description: "Extract reusable parts into a .template/ archive",
    actions: ["createTemplateArchive", "resetPackageIdentity"],
  },
};

// Files / dirs that exist only because this is the starter kit. Relative to root.
const STARTER_METADATA = [
  ".loom",
  ".fsk",
  "packages",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SPLIT.md",
  "CLI_USAGE.md",
  "frontend/src/config/DESIGN_PRESETS.md",
];

// Branding tokens, assembled from parts so this source file never contains the
// contiguous strings it searches for (it cannot corrupt itself if ever walked).
const KIT = ["MERN Fullstack", "Fullstack", "MERN"]
  .map((prefix) => [new RegExp(`${prefix} Starter Kit`, "g"), "Project"])
  .concat([
    [/MERN Starter/g, "Project"],
    [new RegExp(["Starter", "Kit"].join(" "), "g"), "Project"],
  ]);
const BRANDING_REPLACEMENTS = [
  ...KIT,
  [/fullstack-starter-kit/g, "my-project"],
  [/mern-starter-backend/g, "backend"],
  [/mern-starter-frontend/g, "frontend"],
  [new RegExp("@fullstack-starter\\/cli", "g"), "my-project-cli"],
  [/\bstackloom\b/g, "my-project-cli"],
  [/\bStackloom\b/g, "Project"],
];

// Comment lines that should never ship to a handed-off project.
const STARTER_COMMENT_PATTERNS = [
  /^\s*\/\/\s*STARTER-KIT:.*$/gm,
  /^\s*\/\/\s*TODO:\s*Customize.*$/gm,
  /^\s*\/\/\s*fsk:anchor.*$/gm,
  /^\s*\{\/\*\s*fsk:anchor.*?\*\/\}\s*$/gm,
  /^\s*\/\/\s*loom:anchor.*$/gm,
  /^\s*\{\/\*\s*loom:anchor.*?\*\/\}\s*$/gm,
];

const TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".yaml", ".yml", ".env", ".html", ".css",
]);

/** Guard: a destructive command must only run at a real project root. */
async function assertProjectRoot(projectRoot) {
  const hasBackend = await fs.pathExists(path.join(projectRoot, "backend"));
  const hasFrontend = await fs.pathExists(path.join(projectRoot, "frontend"));
  if (!hasBackend || !hasFrontend) {
    console.log(
      chalk.red(
        `✖ cleanup must run from a project root (with backend/ and frontend/).\n  Current directory: ${projectRoot}`,
      ),
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

export default async function cleanupCmd(preset) {
  const spinner = ora();
  const projectRoot = process.cwd();

  if (!(await assertProjectRoot(projectRoot))) return;

  if (!preset || !CLEANUP_PRESETS[preset]) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "preset",
        message: "Select cleanup mode:",
        choices: Object.entries(CLEANUP_PRESETS).map(([key, val]) => ({
          name: `${key} — ${val.description}`,
          value: key,
        })),
      },
    ]);
    preset = answers.preset;
  }

  const config = CLEANUP_PRESETS[preset];
  if (!config) {
    console.log(
      chalk.red(
        `✖ Unknown cleanup preset: "${preset}". Use one of: ${Object.keys(CLEANUP_PRESETS).join(", ")}`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (preset === "production") {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message:
          "Production cleanup permanently removes .loom/, the bundled CLI, and starter docs. Continue?",
        default: false,
      },
    ]);
    if (!confirm) {
      console.log(chalk.gray("✖ cancelled."));
      return;
    }
  }

  spinner.start(`Running ${preset} cleanup...`);
  let processed = 0;
  for (const action of config.actions) {
    processed += await runCleanupAction(projectRoot, action, spinner);
  }
  spinner.succeed(`Cleanup complete — ${processed} item(s) processed`);
  console.log(chalk.green("\n✓ Project cleaned successfully"));
  printNextSteps(preset);
}

async function runCleanupAction(projectRoot, action, spinner) {
  const actions = {
    removeDemoContent,
    replaceBranding,
    resetPackageIdentity,
    removeStarterMetadata,
    stripSourceComments,
    rewriteReadme,
    createTemplateArchive,
  };
  const fn = actions[action];
  if (!fn) return 0;
  spinner.text = `Running ${action}...`;
  return fn(projectRoot);
}

/** Recursively collect files matching a predicate, skipping node_modules / .git. */
async function findFiles(dir, predicate) {
  const results = [];
  if (!(await fs.pathExists(dir))) return results;
  for (const entry of await fs.readdir(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = path.join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) results.push(...(await findFiles(full, predicate)));
    else if (predicate(full)) results.push(full);
  }
  return results;
}

/** Remove demo pages, example components, and the demo `products` module. */
async function removeDemoContent(projectRoot) {
  const targets = [
    "frontend/src/pages/demo",
    "frontend/src/pages/examples",
    "frontend/src/components/demo",
    "backend/src/modules/products",
    "frontend/src/api/products.api.js",
  ];
  let count = 0;
  for (const rel of targets) {
    const full = path.join(projectRoot, rel);
    if (await fs.pathExists(full)) {
      await fs.remove(full);
      count++;
    }
  }
  return count;
}

/** Replace every starter-kit branding string across all text files. */
async function replaceBranding(projectRoot) {
  const files = await findFiles(projectRoot, (f) => TEXT_EXTENSIONS.has(path.extname(f)));
  let count = 0;
  for (const file of files) {
    let content = await fs.readFile(file, "utf-8");
    const original = content;
    for (const [pattern, replacement] of BRANDING_REPLACEMENTS) {
      content = content.replace(pattern, replacement);
    }
    if (content !== original) {
      await fs.writeFile(file, content);
      count++;
    }
  }
  return count;
}

/** Reset package.json `name` fields (and remove descriptions) to generic values. */
async function resetPackageIdentity(projectRoot) {
  const pkgFiles = [
    ["package.json", "my-project"],
    ["backend/package.json", "backend"],
    ["frontend/package.json", "frontend"],
  ];
  let count = 0;
  for (const [rel, name] of pkgFiles) {
    const full = path.join(projectRoot, rel);
    if (!(await fs.pathExists(full))) continue;
    const pkg = await fs.readJson(full);
    if (pkg.name !== name || pkg.description) {
      pkg.name = name;
      delete pkg.description;
      await fs.writeJson(full, pkg, { spaces: 2 });
      count++;
    }
  }
  return count;
}

/** Delete everything that only exists because this is the starter kit. */
async function removeStarterMetadata(projectRoot) {
  let count = 0;
  for (const rel of STARTER_METADATA) {
    const full = path.join(projectRoot, rel);
    if (await fs.pathExists(full)) {
      await fs.remove(full);
      count++;
    }
  }
  return count;
}

/** Strip STARTER-KIT / TODO-Customize / loom:anchor (legacy fsk:anchor) comments and marker blocks. */
async function stripSourceComments(projectRoot) {
  const roots = [path.join(projectRoot, "backend", "src"), path.join(projectRoot, "frontend", "src")];
  let count = 0;
  for (const root of roots) {
    const files = await findFiles(root, (f) =>
      [".js", ".jsx", ".ts", ".tsx"].includes(path.extname(f)),
    );
    for (const file of files) {
      let content = await fs.readFile(file, "utf-8");
      const original = content;
      for (const pattern of STARTER_COMMENT_PATTERNS) {
        content = content.replace(pattern, "");
      }
      // Remove AUTO-GENERATED marker rules/headers (keep the code between them).
      content = content
        .replace(/^\s*\/\/═+\s*$/gm, "")
        .replace(/^\s*\/\/\s*AUTO-GENERATED.*$/gm, "")
        .replace(/^\s*\/\/\s*END AUTO-GENERATED.*$/gm, "")
        .replace(/^\s*\/\/\s*✎ CUSTOM CODE ZONE.*$/gm, "")
        .replace(/\n{3,}/g, "\n\n");
      if (content !== original) {
        await fs.writeFile(file, content);
        count++;
      }
    }
  }
  return count;
}

/** Replace the starter-kit README with a minimal project README. */
async function rewriteReadme(projectRoot) {
  const readmePath = path.join(projectRoot, "README.md");
  const pkgPath = path.join(projectRoot, "package.json");

  // Read package manager from metadata
  let pm = "pnpm";
  try {
    const meta = fs.readJSONSync(path.join(projectRoot, ".loom", "metadata.json"));
    if (meta.packageManager) pm = normalizePm(meta.packageManager);
  } catch { /* use default */ }

  let name = "My Project";
  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath);
    if (pkg.name) name = pkg.name;
  }
  const content = `# ${name}

A full-stack web application.

## Getting started

\`\`\`bash
${installCmd(pm)}
${runCmd(pm, "dev")}
\`\`\`

## Structure

- \`backend/\` — Express + MongoDB API
- \`frontend/\` — React + Vite client
`;
  await fs.writeFile(readmePath, content);
  return 1;
}

/** Extract reusable building blocks into a .template/ archive directory. */
async function createTemplateArchive(projectRoot) {
  const templateDir = path.join(projectRoot, ".template");
  await fs.ensureDir(templateDir);
  for (const rel of ["frontend/src/components/ui", "frontend/src/lib", "backend/src/utils"]) {
    const src = path.join(projectRoot, rel);
    if (await fs.pathExists(src)) {
      await fs.copy(src, path.join(templateDir, rel), { overwrite: true });
    }
  }
  return 1;
}

function printNextSteps(preset) {
  // Try to read package manager from metadata
  let pm = "pnpm";
  try {
    const meta = fs.readJSONSync(path.join(process.cwd(), ".loom", "metadata.json"));
    if (meta.packageManager) pm = normalizePm(meta.packageManager);
  } catch { /* use default */ }

  console.log(chalk.cyan("\nNext steps:"));
  if (preset === "template") {
    console.log(chalk.gray("  1. Review .template/ for reusable components"));
    console.log(chalk.gray("  2. Distribute the archive to your team"));
  } else {
    console.log(chalk.gray("  1. Review remaining files for any customizations"));
    console.log(chalk.gray(`  2. Run '${installCmd(pm)}' to refresh dependencies`));
    console.log(chalk.gray("  3. Commit — the project is now fully your own"));
  }
}
