#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';

/**
 * Doctor Command — checks environment and project health
 */
export default async function doctorCmd() {
  const spinner = ora();
  const projectRoot = process.cwd();
  // Track hard failures so the command exits non-zero — a doctor that always
  // exits 0 is useless in CI and scripts.
  let failures = 0;

  console.log(chalk.cyan.bold('\n🏥 Stackloom Doctor — System Health Check\n'));

  // 1. Environment Checks
  spinner.start('Checking Node.js version...');
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major < 18) {
    spinner.fail(`Node.js version ${nodeVersion} is too old. Required: >=18.0.0`);
    failures++;
  } else {
    spinner.succeed(`Node.js ${nodeVersion} detected`);
  }

  spinner.start('Checking pnpm...');
  try {
    const pnpmVersion = execSync('pnpm -v').toString().trim();
    spinner.succeed(`pnpm ${pnpmVersion} detected`);
  } catch {
    spinner.warn('pnpm not found. It is recommended for this starter kit.');
  }

  // 2. Project Checks
  spinner.start('Checking project structure...');
  const isProject = await fs.pathExists(path.join(projectRoot, 'backend')) && 
                    await fs.pathExists(path.join(projectRoot, 'frontend'));
  
  if (!isProject) {
    spinner.fail('Not a MERN Starter Kit project. Run this inside the project root.');
    failures++;
  } else {
    spinner.succeed('Project structure valid');
  }

  // 3. Dependencies
  if (isProject) {
    spinner.start('Checking backend dependencies...');
    if (await fs.pathExists(path.join(projectRoot, 'backend/node_modules'))) {
      spinner.succeed('Backend dependencies installed');
    } else {
      spinner.warn('Backend dependencies missing. Run `pnpm install`');
    }

    spinner.start('Checking frontend dependencies...');
    if (await fs.pathExists(path.join(projectRoot, 'frontend/node_modules'))) {
      spinner.succeed('Frontend dependencies installed');
    } else {
      spinner.warn('Frontend dependencies missing. Run `pnpm install`');
    }

    // 4. Configuration
    spinner.start('Checking environment files...');
    const hasBackendEnv = await fs.pathExists(path.join(projectRoot, 'backend/.env'));
    if (hasBackendEnv) {
      spinner.succeed('Backend .env found');
    } else {
      spinner.warn('Backend .env missing (use .env.example)');
    }
  }

  if (failures > 0) {
    console.log(chalk.red(`\n✖ Health check found ${failures} issue(s).\n`));
    process.exitCode = 1;
  } else {
    console.log(chalk.green('\n✓ Health check complete — all good.\n'));
  }
}
