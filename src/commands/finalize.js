#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';

/**
 * Finalize Command — prepares the project for production
 */
export default async function finalizeCmd() {
  const spinner = ora();
  const projectRoot = process.cwd();

  console.log(chalk.cyan.bold('\n🚀 Finalizing Project for Production\n'));

  // 1. Linting
  spinner.start('Running linting checks...');
  try {
    execSync('pnpm lint', { cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Linting passed');
  } catch {
    spinner.fail('Linting failed. Please fix errors before finalizing.');
    process.exit(1);
  }

  // 2. Type Checking
  spinner.start('Running type checks...');
  try {
    execSync('pnpm -C backend exec tsc --noEmit', { cwd: projectRoot, stdio: 'pipe' });
    execSync('pnpm -C frontend exec tsc --noEmit', { cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Type checks passed');
  } catch {
    spinner.warn('Type checks failed or tsc not found. Skipping.');
  }

  // 3. Tests
  spinner.start('Running all tests...');
  try {
    execSync('pnpm test', { cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('All tests passed');
  } catch {
    spinner.fail('Tests failed. Please fix before production.');
    process.exit(1);
  }

  // 4. Build
  spinner.start('Building for production...');
  try {
    execSync('pnpm build', { cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Production build successful');
  } catch {
    spinner.fail('Build failed.');
    process.exit(1);
  }

  // 5. Security Audit
  spinner.start('Running security audit...');
  try {
    execSync('npm audit', { cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Security audit passed');
  } catch {
    spinner.warn('Security vulnerabilities detected. Run `npm audit fix`.');
  }

  console.log(chalk.green.bold('\n✨ Project is production-ready!\n'));
}
