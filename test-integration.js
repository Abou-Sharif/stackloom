#!/usr/bin/env node
/**
 * CLI smoke test — runs init + all generate subcommands against a fresh project.
 * Usage: cd packages/cli && node test-smoke.js
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT = path.resolve(__dirname, '../test-smoke-project');
const CLI_PATH = path.resolve(__dirname, 'bin/cli.js');

// Cleanup previous run
if (fs.existsSync(PROJECT)) {
  fs.removeSync(PROJECT);
}

function run(cmd, cwd) {
  console.log(`\n\x1b[36m▶\x1b[0m ${cmd}\n`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, PNPM_HOME: '' },
  });
}

try {
  // Step 1 — init
  run(`node ${CLI_PATH} init smoke-project --preset saas --no-install --target ${PROJECT} --force`, __dirname);

  const projPath = path.join(PROJECT, 'smoke-project');

  // Step 2 — generate module
  run(`node ${CLI_PATH} generate module users`, projPath);

  // Step 3 — generate page
  run(`node ${CLI_PATH} generate page reports --route /reports --icon bar-chart`, projPath);

  // Step 4 — overwrite same page with --force
  run(`node ${CLI_PATH} generate page reports --route /reports --force`, projPath);

  // Step 5 — generate deploy configs
  run(`node ${CLI_PATH} generate deploy --target all`, projPath);

  // Step 6 — remove page (cleanup)
  run(`node ${CLI_PATH} remove page reports --force`, projPath);

  // Step 7 — generate module then remove it
  run(`node ${CLI_PATH} generate module tempmod`, projPath);
  run(`node ${CLI_PATH} remove module tempmod --force`, projPath);

  // Step 8 — validation
  console.log('\n\x1b[36m▶ Validating generated files...\x1b[0m\n');

  const jsChecks = [
    'backend/src/routes/index.js',
    'frontend/src/config/app-preset.js',
  ];

  for (const file of jsChecks) {
    const full = path.join(projPath, file);
    if (!fs.existsSync(full)) throw new Error(`Missing: ${file}`);
    try {
      execSync(`node --check "${full}"`, { stdio: 'pipe' });
      console.log(`  \x1b[32m✓\x1b[0m ${file} — syntax OK`);
    } catch (e) {
      console.error(`  \x1b[31m✗\x1b[0m ${file} — syntax error`);
      throw e;
    }
  }

  const deployFiles = ['Dockerfile', 'docker-compose.yml', 'vercel.json', 'railway.yaml'];
  for (const file of deployFiles) {
    const full = path.join(projPath, file);
    if (!fs.existsSync(full)) throw new Error(`Missing: ${file}`);
    console.log(`  \x1b[32m✓\x1b[0m ${file} — present`);
  }

  const jsxChecks = [
    'frontend/src/routes/AppRouter.jsx',
  ];
  for (const file of jsxChecks) {
    const full = path.join(projPath, file);
    if (!fs.existsSync(full)) throw new Error(`Missing: ${file}`);
    const content = fs.readFileSync(full, 'utf-8');
    if (content.length < 10) throw new Error(`Empty: ${file}`);
    console.log(`  \x1b[32m✓\x1b[0m ${file} — present`);
  }

  // Confirm removed items are absent
  const removedAbsent = [
    'frontend/src/pages/reports',
    'backend/src/modules/tempmod',
  ];
  for (const dir of removedAbsent) {
    const full = path.join(projPath, dir);
    if (fs.existsSync(full)) throw new Error(`Should have been removed: ${dir}`);
    console.log(`  \x1b[32m✓\x1b[0m ${dir} — correctly removed`);
  }

  console.log('\n\x1b[32m✓ All smoke tests passed!\x1b[0m\n');
  process.exit(0);
} catch (err) {
  console.error('\x1b[31mSmoke test failed:\x1b[0m', err.message);
  process.exit(1);
}
