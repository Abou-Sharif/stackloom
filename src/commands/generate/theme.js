#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import process from 'process';

export default async function generateThemeCmd(options) {
  const spinner = ora();
  const projectRoot = process.cwd();

  // Validate project
  if (!fs.existsSync(path.join(projectRoot, 'frontend/src/config/app-preset.js'))) {
    console.log(chalk.red('✖  Not a MERN Starter Kit project (missing app-preset.js).'));
    process.exit(1);
  }

  let cssContent = '';

  if (options.file) {
    const filePath = path.resolve(projectRoot, options.file);
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`✖  File not found: ${filePath}`));
      process.exit(1);
    }
    cssContent = await fs.readFile(filePath, 'utf-8');
  } else if (options.paste) {
    cssContent = options.paste;
  } else {
    console.log(chalk.yellow('⚠  No CSS provided. Use --file path/to/theme.css or --paste "css string".'));
    process.exit(1);
  }

  // Basic validation
  if (!cssContent.includes(':root') && !cssContent.includes('.dark')) {
    console.log(chalk.yellow('⚠  CSS does not contain :root or .dark blocks.'));
  }

  // Persist the raw CSS in the project for reference (non-destructive, new file)
  const cssOutPath = path.join(projectRoot, 'frontend/src/config/imported-shadcn-theme.css');
  await fs.writeFile(cssOutPath, cssContent);
  spinner.succeed(`CSS saved to ${cssOutPath}`);

  // Print the code snippet to paste into app-preset.js
  const fallbackTheme = options.fallback || 'designTokens.calmBlue';
  const appearance = options.appearance || 'appearanceRecipes.elevated';

  console.log('');
  console.log(chalk.green('✓  Theme CSS saved. Add this to your app-preset.js:'));
  console.log('');
  console.log(chalk.white(`import { installShadcnDesignPreset } from "@/lib/shadcn-theme";
import { ${fallbackTheme} } from "./design-themes";
import { ${appearance} } from "./design-themes";

export const appPreset = {
  ...presetVariants.saas, // or your chosen base
  theme: installShadcnDesignPreset(\`${cssContent.replace(/`/g, '\\`')}\`, {
    fallbackTheme: ${fallbackTheme},
    appearance: ${appearance},
  }),
  // optional: override other fields (brand, navigation, landing)
};`));
  console.log('');
  console.log(chalk.gray('Alternatively, use designThemes object directly with parsed cssVars.'));
  console.log('');
}
