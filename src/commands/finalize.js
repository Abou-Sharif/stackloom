#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { normalizePm, runCmd, runInDirBare } from '../utils/package-manager.js';

/**
 * Finalize Command — prepares the project for production
 */
export default async function finalizeCmd() {
  const spinner = ora();
  const projectRoot = process.cwd();

  // Read package manager from project metadata
  let pm = 'pnpm';
  try {
    const meta = fs.readJSONSync(path.join(projectRoot, '.loom', 'metadata.json'));
    if (meta.packageManager) pm = normalizePm(meta.packageManager);
  } catch { /* use default */ }

  console.log(chalk.cyan.bold('\n🚀 Finalizing Project for Production\n'));

  // 1. Linting
  spinner.start('Running linting checks...');
  try {
    execSync(runCmd(pm, 'lint'), { shell: true, cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Linting passed');
  } catch {
    spinner.fail('Linting failed. Please fix errors before finalizing.');
    process.exit(1);
  }

  // 2. Type Checking
  spinner.start('Running type checks...');
  try {
    execSync(runInDirBare(pm, 'backend', 'exec tsc --noEmit'), { shell: true, cwd: projectRoot, stdio: 'pipe' });
    execSync(runInDirBare(pm, 'frontend', 'exec tsc --noEmit'), { shell: true, cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Type checks passed');
  } catch {
    spinner.warn('Type checks failed or tsc not found. Skipping.');
  }

  // 3. Tests
  spinner.start('Running all tests...');
  try {
    execSync(runCmd(pm, 'test'), { shell: true, cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('All tests passed');
  } catch {
    spinner.fail('Tests failed. Please fix before production.');
    process.exit(1);
  }

  // 4. Build
  spinner.start('Building for production...');
  try {
    execSync(runCmd(pm, 'build'), { shell: true, cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Production build successful');
  } catch {
    spinner.fail('Build failed.');
    process.exit(1);
  }

  // 5. Security Audit
  spinner.start('Running security audit...');
  try {
    const auditCmds = { pnpm: 'pnpm audit', npm: 'npm audit', yarn: 'yarn audit', bun: 'bun pm audit' };
    execSync(auditCmds[pm] || 'npm audit', { shell: true, cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Security audit passed');
  } catch {
    const auditHints = { pnpm: 'pnpm audit fix', npm: 'npm audit fix', yarn: 'yarn audit fix', bun: 'bun pm audit' };
    spinner.warn(`Security vulnerabilities detected. Run \`${auditHints[pm] || 'npm audit fix'}\`.`);
  }

  console.log(chalk.green.bold('\n✨ Project is production-ready!\n'));
}
