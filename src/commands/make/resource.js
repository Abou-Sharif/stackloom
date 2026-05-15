#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ResourceDefinition, parseFieldSpec } from '../../core/resource-definition.js';
import { Generator } from '../../core/generator.js';

export default async function makeResourceCmd(name, options) {
  console.warn(
    chalk.yellow(
      "⚠  'make:resource' is superseded by 'loom generate resource'\n" +
        "   (engine-backed: transactional render→inject→validate→commit). This command still works.",
    ),
  );
  const spinner = ora();
  const projectRoot = process.cwd();

  // Determine resource definition
  let resourceDef;

  if (options.file) {
    // Load from definition file
    const defPath = path.resolve(projectRoot, options.file);
    if (!(await fs.pathExists(defPath))) {
      console.error(chalk.red(`✖  Resource definition file not found: ${defPath}`));
      process.exit(1);
    }
    const mod = await import(defPath);
    const def = mod.default || mod;
    // Validate
    resourceDef = new ResourceDefinition(def);
  } else if (options.fields) {
    // Build from CLI arguments
    const fields = options.fields.split(';').map(spec => {
      const parsed = parseFieldSpec(spec);
      if (!parsed) {
        throw new Error(`Failed to parse field spec: "${spec}"`);
      }
      return parsed;
    });

    resourceDef = new ResourceDefinition({
      name: name,
      fields,
      relations: options.relations ? parseRelations(options.relations) : {},
      features: parseFeatures(options),
      ui: { listView: options.ui || 'table' },
      permissions: parsePermissions(options.permissions),
    });
  } else if (options.interactive) {
    // Interactive mode: ask user
    resourceDef = await interactiveResourceWizard(name);
  } else {
    console.error(chalk.red('✖  You must provide either --fields, --file, or --interactive'));
    console.log(chalk.gray('   Examples:'));
    console.log(chalk.gray(`   loom make:resource Product --fields "name:str,price:num"`));
    console.log(chalk.gray(`   loom make:resource User --file .loom/resources/user.resource.js`));
    process.exit(1);
  }

  // Validate name consistency
  if (name && resourceDef.name !== name) {
    console.warn(chalk.yellow(`⚠  Resource name "${resourceDef.name}" differs from command arg "${name}". Using definition file name.`));
  }

  // Show preview if dry-run
  if (options.dryRun) {
    await showPreview(projectRoot, resourceDef, options);
    return;
  }

  // Confirm if interactive and files would be overwritten
  if (!options.force && !options.nonInteractive) {
    const conflicts = await detectConflicts(projectRoot, resourceDef);
    if (conflicts.length > 0) {
      console.log(chalk.yellow('⚠  The following files would be overwritten:'));
      conflicts.forEach(f => console.log(chalk.gray(`   ${f}`)));
      const { confirm } = await inquirer.prompt([
        { type: 'confirm', name: 'confirm', message: 'Continue?', default: false }
      ]);
      if (!confirm) {
        console.log(chalk.gray('✖  cancelled.'));
        process.exit(0);
      }
    }
  }

  // Generate
  spinner.start(`Generating resource: ${resourceDef.name}`);
  
  try {
    const generator = new Generator({
      projectRoot,
      architecture: options.arch || 'moderate',
      dryRun: false,
      verbose: options.verbose,
      force: options.force,
      withFrontend: options.noFrontend ? false : true,
      withTests: options.withTests || false,
    });

    const result = await generator.generateFromDefinition(resourceDef);
    
    spinner.succeed(`Generated ${resourceDef.name} (${result.files.length} files)`);

    // Show summary
    console.log('');
    console.log(chalk.green('── Summary ──'));
    result.files.forEach(f => {
      const icon = f.action === 'CREATE' ? '+' : f.action === 'UPDATE' ? '~' : '⊘';
      const color = f.action === 'CREATE' ? chalk.green : f.action === 'UPDATE' ? chalk.yellow : chalk.gray;
      console.log(color(`${icon} ${f.output}`));
    });
    
    if (result.issues.length) {
      console.log('');
      console.log(chalk.yellow('Issues:'));
      result.issues.forEach(i => {
        const prefix = i.type === 'error' ? '✖' : '⚠';
        const color = i.type === 'error' ? chalk.red : chalk.yellow;
        console.log(color(`  ${prefix} ${i.message}`));
      });
    }

    console.log('');
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray(`  cd ${projectRoot}`));
    console.log(chalk.gray('  pnpm dev'));
    console.log('');
  } catch (err) {
    spinner.fail('Generation failed');
    console.error(chalk.red(err.message));
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

function parseRelations(str) {
  // Format: "Post:hasMany,Comment:hasMany:through=PostComment"
  // Not fully implemented in v0.2.0 Phase 1 — skip for now
  return { belongsTo: [], hasMany: [] };
}

function parseFeatures(options) {
  const features = {};
  if (options.softDelete) features.softDelete = true;
  if (options.auditLog) features.auditLog = true;
  if (options.auth) features.auth = options.auth;
  if (options.search) features.search = options.search;
  return features;
}

function parsePermissions(str) {
  // Format: "create:admin,manager read:all update:admin,self delete:admin"
  if (!str) return {};
  // Simplified parsing
  const perms = {};
  str.split(' ').forEach(segment => {
    const [action, roles] = segment.split(':');
    if (action && roles) {
      perms[action] = roles.split(',');
    }
  });
  return perms;
}

async function detectConflicts(projectRoot, resourceDef) {
  const conflicts = [];
  const commonFiles = [
    `backend/src/modules/${resourceDef.kebabName}/models/${resourceDef.name}.js`,
    `backend/src/modules/${resourceDef.kebabName}/routes/${resourceDef.name}.routes.js`,
    `frontend/src/pages/admin/${resourceDef.kebabName}/ListPage.jsx`,
  ];
  
  for (const file of commonFiles) {
    const fullPath = path.join(projectRoot, file);
    if (await fs.pathExists(fullPath)) {
      conflicts.push(file);
    }
  }
  return conflicts;
}

async function showPreview(projectRoot, resourceDef, options) {
  console.log('');
  console.log(chalk.cyan.bold(`═══ PREVIEW: ${resourceDef.name} ═══`));
  console.log('');
  
  const generator = new Generator({
    projectRoot,
    architecture: options.arch || 'moderate',
    dryRun: true,
    verbose: false,
  });

  try {
    const result = await generator.generateFromDefinition(resourceDef);
    
    // Group by action
    const creates = result.files.filter(f => f.action === 'CREATE');
    const updates = result.files.filter(f => f.action === 'UPDATE');
    const skips = result.files.filter(f => f.action === 'SKIP');

    if (creates.length) {
      console.log(chalk.green('CREATE:'));
      creates.forEach(f => console.log(chalk.gray(`  ${f.output}`)));
    }
    if (updates.length) {
      console.log(chalk.yellow('UPDATE:'));
      updates.forEach(f => console.log(chalk.gray(`  ${f.output}`)));
    }
    if (skips.length) {
      console.log(chalk.gray('SKIP (already exist):'));
      skips.forEach(f => console.log(chalk.gray(`  ${f.output}`)));
    }

    console.log('');
    console.log(chalk.white(`Total: ${creates.length} new, ${updates.length} updates, ${skips.length} skipped`));
    console.log(chalk.gray('(Use --verbose to see estimated time saved)'));
    console.log('');
  } catch (err) {
    console.error(chalk.red('Preview error:'), err.message);
    if (options.debug) console.error(err.stack);
    process.exit(1);
  }
}

async function interactiveResourceWizard(name) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'resourceName',
      message: 'Resource name (PascalCase):',
      default: name ? name.charAt(0).toUpperCase() + name.slice(1) : 'MyResource',
      validate: (v) => /^[A-Z][a-zA-Z0-9]*$/.test(v) || 'Must be PascalCase',
    },
    {
      type: 'input',
      name: 'fields',
      message: 'Fields (semicolon-separated, e.g., "name:str,email:email,age:num")',
      default: 'name:str',
    },
    {
      type: 'list',
      name: 'arch',
      message: 'Architecture:',
      choices: [
        { name: 'Lightweight — inline controllers, minimal files', value: 'lightweight' },
        { name: 'Moderate — full separation (model/service/controller)', value: 'moderate' },
        { name: 'Advanced — plus tests, DTOs, domain logic', value: 'advanced' },
      ],
      default: 'moderate',
    },
    {
      type: 'confirm',
      name: 'withFrontend',
      message: 'Generate frontend pages and components?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'withTests',
      message: 'Generate test files?',
      default: false,
    },
    {
      type: 'confirm',
      name: 'softDelete',
      message: 'Enable soft delete?',
      default: false,
    },
  ]);

  const fields = answers.fields.split(';').map(spec => {
    const parsed = parseFieldSpec(spec);
    if (!parsed) throw new Error(`Invalid field spec: ${spec}`);
    return parsed;
  });

  return new ResourceDefinition({
    name: answers.resourceName,
    fields,
    features: {
      softDelete: answers.softDelete,
      auditLog: true,
    },
    ui: { listView: 'table' },
  });
}
