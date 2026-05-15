#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { StateTracker } from '../core/state-tracker.js';

/**
 * Rollback Command — undoes the last generation action
 */
export default async function rollbackCmd(options) {
  const spinner = ora();
  const projectRoot = process.cwd();
  const tracker = new StateTracker(projectRoot);

  const lastEvent = await tracker.getLastEvent();

  if (!lastEvent) {
    console.log(chalk.yellow('⚠ No generation history found to rollback.'));
    return;
  }

  console.log(chalk.cyan(`\nReverting last action: ${lastEvent.action} ${lastEvent.resource || ''}`));
  console.log(chalk.gray(`Timestamp: ${lastEvent.timestamp}`));
  console.log(chalk.gray(`Files affected: ${lastEvent.files.length}`));

  if (!options.force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to revert these changes? Files created will be deleted, and updates may be lost.',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.gray('✖ Rollback cancelled.'));
      return;
    }
  }

  spinner.start('Rolling back changes...');

  try {
    let revertedCount = 0;
    for (const file of lastEvent.files) {
      const fullPath = path.join(projectRoot, file.path);
      
      if (file.action === 'CREATE') {
        if (await fs.pathExists(fullPath)) {
          await fs.remove(fullPath);
          revertedCount++;
          if (options.verbose) console.log(chalk.gray(`  - Deleted ${file.path}`));
        }
      } else if (file.action === 'UPDATE') {
        // For updates, we can't easily revert without backups
        // In a real production CLI, we'd have .loom/backups/
        spinner.warn(`Cannot fully revert update to ${file.path} without backup. Please check manually.`);
      }
    }

    // Clean up empty directories
    await cleanupEmptyDirs(projectRoot, lastEvent.files.map(f => f.path));

    await tracker.removeEvent(lastEvent.id);
    spinner.succeed(`Rollback complete. ${revertedCount} files removed.`);
  } catch (err) {
    spinner.fail('Rollback failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

async function cleanupEmptyDirs(projectRoot, filePaths) {
  const dirs = [...new Set(filePaths.map(fp => path.dirname(path.join(projectRoot, fp))))];
  // Sort by depth (deepest first)
  dirs.sort((a, b) => b.length - a.length);

  for (const dir of dirs) {
    if (await fs.pathExists(dir)) {
      const files = await fs.readdir(dir);
      if (files.length === 0) {
        await fs.remove(dir);
      }
    }
  }
}
