#!/usr/bin/env node

import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import generators directly (they are plain async functions)
import { default as pageGenerator } from './generate/page.js';
import { default as moduleGenerator } from './generate/module.js';
import { default as themeGenerator } from './generate/theme.js';
import { default as deployGenerator } from './generate/deploy.js';
import { default as removeCommand } from './remove.js';

export default async function wizardCmd(options) {
  const spinner = ora({ discardStdin: false });
  const projectRoot = process.cwd();

  // Verify we're in a MERN Starter project
  if (!fs.existsSync(path.join(projectRoot, 'frontend/src/App.jsx'))) {
    console.log(chalk.red('✖  Not a MERN Starter Kit project. Run this inside your project directory.'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n🚀 MERN Starter Kit Wizard'));
  console.log(chalk.gray('Interactive guide to extend your project.\n'));

  const steps = [];

  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '➕ Add a backend module', value: 'add_module' },
          { name: '➕ Add a frontend page', value: 'add_page' },
          { name: '🎨 Import a shadcn theme', value: 'add_theme' },
          { name: '📦 Generate deploy configs', value: 'add_deploy' },
          { name: '🗑️  Remove something', value: 'remove' },
          { name: '✅ Done — exit wizard', value: 'done' },
        ],
      },
    ]);

    if (action === 'done') break;

    if (action === 'add_module') {
      const { moduleName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'moduleName',
          message: 'Module name (e.g., products, invoices, appointments):',
          validate: (input) => /^[a-z0-9-_]+$/i.test(input) || 'Use only letters, numbers, dashes, underscores',
        },
      ]);
      steps.push({ type: 'generate', subtype: 'module', name: moduleName });
    }

    if (action === 'add_page') {
      const { pageName, route, icon, addNav } = await inquirer.prompt([
        {
          type: 'input',
          name: 'pageName',
          message: 'Page name (e.g., settings, reports, team):',
          validate: (input) => /^[a-z0-9-_]+$/i.test(input) || 'Use only letters, numbers, dashes, underscores',
        },
        {
          type: 'input',
          name: 'route',
          message: 'Route path (leave blank for /<page>):',
        },
        {
          type: 'input',
          name: 'icon',
          message: 'Lucide icon name (e.g., layout, settings, users):',
          default: 'layout',
        },
        {
          type: 'confirm',
          name: 'addNav',
          message: 'Add to navigation?',
          default: true,
        },
      ]);
      steps.push({
        type: 'generate',
        subtype: 'page',
        name: pageName,
        options: {
          route: route || `/${pageName}`,
          icon,
          noNav: !addNav,
          force: false,
        },
      });
    }

    if (action === 'add_theme') {
      const { method } = await inquirer.prompt([
        {
          type: 'list',
          name: 'method',
          message: 'How would you like to provide the theme CSS?',
          choices: [
            { name: 'From a file', value: 'file' },
            { name: 'Paste CSS directly', value: 'paste' },
          ],
        },
      ]);

      let filePath, pasteContent;
      if (method === 'file') {
        const res = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: 'Path to CSS file (must contain :root and .dark):',
          },
        ]);
        filePath = res.filePath;
      } else {
        const res = await inquirer.prompt([
          {
            type: 'editor',
            name: 'pasteContent',
            message: 'Paste your CSS variables (Ctrl+D to finish):',
          },
        ]);
        pasteContent = res.pasteContent;
      }

      steps.push({
        type: 'generate',
        subtype: 'theme',
        options: {
          file: filePath,
          paste: pasteContent,
          fallback: 'executiveBlue',
          appearance: 'quiet',
        },
      });
      console.log(chalk.green('✓ Will import shadcn theme'));
    }

    if (action === 'add_deploy') {
      const { targets } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'targets',
          message: 'Select deployment targets:',
          choices: [
            { name: '🐳 Docker (Dockerfile + docker-compose)', value: 'docker' },
            { name: '▲ Vercel (vercel.json)', value: 'vercel' },
            { name: '🚂 Railway (railway.yaml)', value: 'railway' },
          ],
        },
      ]);
      if (targets.length) {
        steps.push({
          type: 'generate',
          subtype: 'deploy',
          options: {
            target: targets.join(','),
            force: false,
          },
        });
        console.log(chalk.green(`✓ Will generate: ${targets.join(', ')}`));
      }
    }

    if (action === 'remove') {
      const { resourceType, resourceName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'resourceType',
          message: 'Remove what type?',
          choices: ['page', 'module'],
        },
        {
          type: 'input',
          name: 'resourceName',
          message: 'Name of the resource to remove:',
        },
      ]);
      steps.push({
        type: 'remove',
        resourceType,
        name: resourceName,
      });
      console.log(chalk.yellow(`⚠ Will remove ${resourceType}: ${resourceName}`));
    }
  }

  if (steps.length === 0) {
    console.log(chalk.gray('No actions selected. Bye!'));
    process.exit(0);
  }

  // Summary + confirmation
  console.log(chalk.cyan('\n📋 Summary of actions:'));
  for (const step of steps) {
    if (step.type === 'generate') {
      const labelMap = {
        module: 'Backend module',
        page: 'Frontend page',
        theme: 'Shadcn theme',
        deploy: 'Deploy configs',
      };
      const label = labelMap[step.subtype] || step.subtype;
      let detail = '';
      if (step.subtype === 'page' && step.options) {
        detail = ` → ${step.options.route}`;
      }
      if (step.subtype === 'deploy' && step.options) {
        detail = ` → ${step.options.target}`;
      }
      console.log(chalk.white(`  • Generate ${label}: "${step.name}"${detail}`));
    } else if (step.type === 'remove') {
      console.log(chalk.yellow(`  • Remove ${step.resourceType} "${step.name}"`));
    }
  }

  const skipConfirm = options.skipConfirm;
  let confirmed = skipConfirm;
  if (!skipConfirm) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed?',
        default: true,
      },
    ]);
    confirmed = confirm;
  }

  if (!confirmed) {
    console.log(chalk.gray('✖  Cancelled.'));
    process.exit(0);
  }

  // Execute steps sequentially
  console.log('');
  const originalCwd = process.cwd();

  for (const step of steps) {
    if (step.type === 'generate') {
      spinner.start(`Generating ${step.subtype}: ${step.name || ''}`);

      try {
        process.chdir(projectRoot); // Ensure correct cwd for generators

        switch (step.subtype) {
          case 'module': {
            // moduleGenerator(name, options)
            await moduleGenerator(step.name, { force: false });
            break;
          }
          case 'page': {
            // pageGenerator(name, options)
            await pageGenerator(step.name, step.options);
            break;
          }
          case 'deploy': {
            // deployGenerator(options)
            await deployGenerator(step.options);
            break;
          }
          case 'theme': {
            // themeGenerator(options)
            await themeGenerator(step.options);
            break;
          }
        }

        spinner.succeed(`${step.subtype.charAt(0).toUpperCase() + step.subtype.slice(1)} "${step.name}" generated`);
        process.chdir(originalCwd);
      } catch (err) {
        process.chdir(originalCwd);
        spinner.fail(`Failed to generate ${step.subtype} "${step.name || ''}": ${err.message}`);
      }
    }

    if (step.type === 'remove') {
      spinner.start(`Removing ${step.resourceType}: ${step.name}`);
      try {
        await removeCommand(step.resourceType, step.name, { force: false });
        spinner.succeed(`${step.resourceType} "${step.name}" removed`);
      } catch (err) {
        spinner.fail(`Failed to remove ${step.resourceType} "${step.name}": ${err.message}`);
      }
    }
  }

  console.log(chalk.green.bold('\n✨ Wizard complete!\n'));
}
