#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export default async function removeCmd(resourceType, name, options) {
  const spinner = ora();
  const projectRoot = process.cwd();

  // Validate we're in a MERN Starter project
  if (!fs.existsSync(path.join(projectRoot, 'frontend/src/App.jsx'))) {
    console.log(chalk.red('✖  Not a MERN Starter Kit project.'));
    process.exit(1);
  }

  const type = resourceType.toLowerCase();
  const confirmed = options.force || await confirmRemove(type, name);

  if (!confirmed) {
    console.log(chalk.gray('✖  Cancelled.'));
    process.exit(0);
  }

  switch (type) {
    case 'page':
      await removePage(projectRoot, name, options, spinner);
      break;
    case 'module':
      await removeModule(projectRoot, name, options, spinner);
      break;
    default:
      console.log(chalk.red(`✖  Unknown resource type: ${type}. Use "page" or "module".`));
      process.exit(1);
  }
}

async function confirmRemove(type, name) {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove ${type} "${name}"? This will delete files and clean up references.`,
      default: false,
    },
  ]);
  return confirm;
}

async function removePage(projectRoot, pageName, options, spinner) {
  const pageNameCap = pageName.charAt(0).toUpperCase() + pageName.slice(1);
  const pageDir = path.join(projectRoot, 'frontend/src/pages', pageName);
  const pageFile = path.join(pageDir, `${pageNameCap}Page.jsx`);

  // Delete page directory
  if (fs.existsSync(pageDir)) {
    await fs.remove(pageDir);
    spinner.succeed(`Removed page directory: ${pageDir}`);
  } else {
    spinner.warn(`Page directory not found: ${pageDir}`);
  }

  // Remove lazy import from AppRouter.jsx
  const routerPath = path.join(projectRoot, 'frontend/src/routes/AppRouter.jsx');
  if (fs.existsSync(routerPath)) {
    let routerCode = await fs.readFile(routerPath, 'utf-8');
    const importLine = `const ${pageNameCap}Page = lazy(() => import("@/pages/${pageName}/${pageNameCap}Page"));`;

    if (routerCode.includes(importLine)) {
      routerCode = routerCode.replace(importLine + '\n', '');
      // Also remove empty line left behind
      routerCode = routerCode.replace(/^\s*$\n/m, '');
      await fs.writeFile(routerPath, routerCode);
      spinner.succeed('Removed lazy import from AppRouter.jsx');
    } else {
      spinner.warn(`Lazy import not found in AppRouter.jsx — skipping`);
    }

   // Remove route block from AppRouter.jsx
   // Strategy: find comment line, then skip all lines until we hit a line that is just '/>' (self-closing tag terminator)
   const commentLine = `/* ${pageNameCap} */`;
   const lines = routerCode.split('\n');
   const filtered = [];
   let skipping = false;

   for (let i = 0; i < lines.length; i++) {
     const line = lines[i];

     if (!skipping && line.includes(commentLine)) {
       skipping = true;
       continue;
     }

     if (skipping) {
       // When we encounter a line whose trimmed content is exactly '/>', the route block is closed
       if (line.trim() === '/>') {
         skipping = false;
       }
       // Skip this line (part of route block)
       continue;
     }

     filtered.push(line);
   }

   const newRouterCode = filtered.join('\n');
   if (newRouterCode !== routerCode) {
     await fs.writeFile(routerPath, newRouterCode);
     spinner.succeed('Removed route from AppRouter.jsx');
   } else {
     spinner.warn('Route block not found in AppRouter.jsx — skipping');
   }
  } else {
    spinner.warn('AppRouter.jsx not found — cannot clean imports/routes');
  }

  // Remove navigation entry from app-preset.js
  const presetPath = path.join(projectRoot, 'frontend/src/config/app-preset.js');
  if (fs.existsSync(presetPath)) {
    let presetCode = await fs.readFile(presetPath, 'utf-8');
    const navEntryRegex = new RegExp(`\\{\\s*label:\\s*"${pageNameCap}",\\s*href:\\s*"[^"]*",\\s*icon:\\s*"[^"]*"\\s*\\},?\\s*\\n?`);
    const before = presetCode;
    presetCode = presetCode.replace(navEntryRegex, '');

    if (presetCode !== before) {
      // Clean up trailing comma left behind from navigation array
      presetCode = presetCode.replace(/,\s*\n\s*]/, '\n    ]');
      await fs.writeFile(presetPath, presetCode);
      spinner.succeed('Removed navigation entry from app-preset.js');
    } else {
      spinner.warn('Navigation entry not found in app-preset.js — skipping');
    }
  } else {
    spinner.warn('app-preset.js not found — cannot remove navigation entry');
  }
}

async function removeModule(projectRoot, moduleName, options, spinner) {
  const modDir = path.join(projectRoot, 'backend/src/modules', moduleName);

  // Delete module directory
  if (fs.existsSync(modDir)) {
    await fs.remove(modDir);
    spinner.succeed(`Removed module directory: ${modDir}`);
  } else {
    spinner.warn(`Module directory not found: ${modDir}`);
  }

  // Unmount route from backend/src/routes/index.js
  const routesIndexPath = path.join(projectRoot, 'backend/src/routes/index.js');
  if (fs.existsSync(routesIndexPath)) {
    let routesCode = await fs.readFile(routesIndexPath, 'utf-8');
    const mountLine = `router.use("/${moduleName}", require("../modules/${moduleName}/${moduleName}.routes"));`;

    if (routesCode.includes(mountLine)) {
      // Remove the line and any adjacent blank lines
      const lines = routesCode.split('\n');
      const filtered = lines.filter((line) => !line.trim().startsWith(`router.use("/${moduleName}"`));
      const cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n'); // collapse excessive blank lines
      await fs.writeFile(routesIndexPath, cleaned);
      spinner.succeed(`Unmounted /${moduleName} route from backend/src/routes/index.js`);
    } else {
      spinner.warn(`Mount line not found in routes/index.js — skipping`);
    }
  } else {
    spinner.warn('backend/src/routes/index.js not found — cannot unmount route');
  }
}
