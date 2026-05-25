#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { normalizePm, runCmd } from '../utils/package-manager.js';

const PRESETS = ['saas', 'clinic', 'studio', 'operations', 'commerce'];

/**
 * Preset Command — applies a predefined configuration preset
 */
export default async function presetCmd(presetName) {
  const spinner = ora();
  const projectRoot = process.cwd();

  const presetPath = path.join(projectRoot, 'frontend/src/config/app-preset.js');
  if (!(await fs.pathExists(presetPath))) {
    console.log(chalk.red('✖ Not a MERN Starter Kit project (missing app-preset.js).'));
    return;
  }

  let selectedPreset = presetName;

  if (!selectedPreset || !PRESETS.includes(selectedPreset)) {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Select a preset to apply:',
        choices: PRESETS,
      },
    ]);
    selectedPreset = choice;
  }

  spinner.start(`Applying ${selectedPreset} preset...`);

  try {
    let presetCode = await fs.readFile(presetPath, 'utf-8');
    
    // Replace the export line
    presetCode = presetCode.replace(
      /export const appPreset = .+;/,
      `export const appPreset = presetVariants.${selectedPreset};`
    );

    await fs.writeFile(presetPath, presetCode, 'utf-8');
    // Read package manager from metadata
    let pm = 'pnpm';
    try {
      const meta = await fs.readJSON(path.join(projectRoot, '.loom', 'metadata.json'));
      if (meta.packageManager) pm = normalizePm(meta.packageManager);
    } catch { /* use default */ }

    spinner.succeed(`Preset "${selectedPreset}" applied successfully.`);
    
    console.log(chalk.gray(`\nNote: This changed your UI configuration. Run \`${runCmd(pm, "dev")}\` to see changes.`));
  } catch (err) {
    spinner.fail('Failed to apply preset');
    console.error(chalk.red(err.message));
  }
}
