#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';

const COMMON_FIELD_ALIASES = {
  name: ['name', 'fullName', 'firstName', 'lastName', 'title', 'label'],
  email: ['email', 'mail', 'eMail'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'phoneNumber', 'phoneNo'],
  address: ['address', 'addr', 'location', 'place'],
  description: ['description', 'desc', 'details', 'notes', 'remark'],
  status: ['status', 'state', 'isActive', 'active', 'enabled'],
  date: ['date', 'createdAt', 'updatedAt', 'entryDate', 'exitDate', 'paymentDate', 'hiredDate'],
  code: ['code', 'sku', 'slug', 'reference', 'ref', 'trackingNumber'],
  amount: ['amount', 'total', 'totalAmount', 'price', 'fee', 'grossSalary', 'netSalary', 'netPay', 'grossPay'],
  quantity: ['quantity', 'qty', 'count', 'stock', 'stockInQuantity', 'stockOutQuantity'],
};

function normalizeField(name) {
  return name.replace(/[\s_-]/g, '').toLowerCase();
}

function fieldMatches(expected, actual) {
  const e = normalizeField(expected);
  const a = normalizeField(actual);
  if (e === a) return true;
  for (const [, aliases] of Object.entries(COMMON_FIELD_ALIASES)) {
    if (aliases.some(alias => normalizeField(alias) === e)) {
      return aliases.some(alias => normalizeField(alias) === a);
    }
  }
  return false;
}

function findBackendRoot(root) {
  for (const dir of ['backend', 'api', 'server', 'be']) {
    const p = path.join(root, dir);
    if (fs.existsSync(path.join(p, 'package.json'))) return p;
  }
  return null;
}

function findFrontendRoot(root) {
  for (const dir of ['frontend', 'client', 'web', 'app']) {
    const p = path.join(root, dir);
    if (fs.existsSync(path.join(p, 'src', 'main.jsx')) || fs.existsSync(path.join(p, 'src', 'App.jsx'))) return p;
  }
  return null;
}

function scanModelFiles(backendRoot) {
  const models = [];
  const modulesDir = path.join(backendRoot, 'src', 'modules');
  if (!fs.existsSync(modulesDir)) return models;

  for (const moduleName of fs.readdirSync(modulesDir)) {
    const modelsDir = path.join(modulesDir, moduleName, 'models');
    if (!fs.existsSync(modelsDir)) continue;
    for (const file of fs.readdirSync(modelsDir)) {
      if (!file.endsWith('.js')) continue;
      const filePath = path.join(modelsDir, file);
      const modelName = path.basename(file, '.js');
      const content = fs.readFileSync(filePath, 'utf-8');
      const fields = extractMongooseFields(content);
      const relations = extractRelations(content);
      models.push({ name: modelName, file: filePath, module: moduleName, fields, relations });
    }
  }
  return models;
}

const SKIP_FIELDS = new Set(['_id', 'id', '__v', 'createdAt', 'updatedAt', 'deletedAt']);
const SCHEMA_OPTIONS = ['timestamps', 'toJSON', 'toObject', 'virtuals', 'strict', 'id', '_id'];

function extractMongooseFields(content) {
  const fields = [];
  // Match any indentation pattern from generated code (2-8 spaces)
  const fieldRegex = /^\s{2,8}(\w+):\s*\{/gm;
  let match;
  while ((match = fieldRegex.exec(content)) !== null) {
    const name = match[1];
    if (!SKIP_FIELDS.has(name) && !SCHEMA_OPTIONS.includes(name)) fields.push(name);
  }
  return [...new Set(fields)];
}

function extractRelations(content) {
  const relations = [];
  const refRegex = /(\w+):\s*\{[^}]*ref:\s*['"](\w+)['"]/gm;
  let match;
  while ((match = refRegex.exec(content)) !== null) {
    relations.push({ field: match[1], ref: match[2], type: 'belongsTo' });
  }
  const virtualRegex = /Schema\.virtual\(['"](\w+)['"]/gm;
  while ((match = virtualRegex.exec(content)) !== null) {
    relations.push({ field: match[1], type: 'hasMany' });
  }
  return relations;
}

function fileExists(...parts) {
  return fs.existsSync(path.join(...parts));
}

function matchEntities(checklistEntities, discoveredModels) {
  const results = [];
  for (const expected of checklistEntities) {
    const expectedFields = expected.fields || [];
    let bestMatch = null;
    let bestScore = 0;

    for (const model of discoveredModels) {
      if (expectedFields.length === 0) {
        const nameScore = model.name.toLowerCase().includes(expected.name.toLowerCase()) ? 0.5 : 0;
        if (nameScore > bestScore) { bestScore = nameScore; bestMatch = model; }
        continue;
      }
      let matchCount = 0;
      for (const ef of expectedFields) {
        if (model.fields.some(mf => fieldMatches(ef, mf))) matchCount++;
      }
      const score = matchCount / expectedFields.length;
      if (score > bestScore) { bestScore = score; bestMatch = model; }
    }

    results.push({
      name: expected.name,
      expectedFields,
      match: bestMatch,
      matchScore: bestScore,
      matched: bestScore >= 0.4,
      missingFields: bestMatch
        ? expectedFields.filter(ef => !bestMatch.fields.some(mf => fieldMatches(ef, mf)))
        : expectedFields,
    });
  }
  return results;
}

const SCENARIO_CHECKLISTS = {
  parking: {
    description: 'Parking management system — slots, vehicles, tickets',
    entities: [
      { name: 'ParkingSlot', fields: ['slotNumber', 'floor', 'rate', 'status'] },
      { name: 'Vehicle', fields: ['plateNumber', 'type', 'ownerName', 'ownerPhone', 'ownerEmail'] },
      { name: 'Ticket', fields: ['entryTime', 'exitTime', 'totalAmount', 'status', 'slot', 'vehicle'] },
    ],
  },
  payroll: {
    description: 'Payroll management system — departments, employees, timesheets, payroll',
    entities: [
      { name: 'Department', fields: ['name', 'code', 'description'] },
      { name: 'Employee', fields: ['firstName', 'lastName', 'email', 'position', 'salary', 'hireDate', 'department'] },
      { name: 'Timesheet', fields: ['date', 'hoursWorked', 'overtime', 'description', 'status', 'employee'] },
      { name: 'Payroll', fields: ['period', 'grossPay', 'deductions', 'netPay', 'status', 'paymentDate', 'employee'] },
    ],
  },
  inventory: {
    description: 'Inventory management system — categories, products, suppliers, stock movements',
    entities: [
      { name: 'Category', fields: ['name', 'description', 'slug'] },
      { name: 'Product', fields: ['name', 'description', 'price', 'sku', 'stock', 'category'] },
      { name: 'Supplier', fields: ['name', 'contactPerson', 'email', 'phone', 'address'] },
      { name: 'StockMovement', fields: ['type', 'quantity', 'reference', 'notes', 'date', 'product', 'supplier'] },
    ],
  },
  booking: {
    description: 'Booking management system — customers, services, bookings',
    entities: [
      { name: 'Customer', fields: ['name', 'email', 'phone', 'address', 'notes'] },
      { name: 'Service', fields: ['name', 'description', 'duration', 'price', 'color'] },
      { name: 'Booking', fields: ['date', 'time', 'status', 'duration', 'notes', 'totalAmount', 'customer', 'service'] },
    ],
  },
  delivery: {
    description: 'Delivery management system — drivers, routes, packages, orders',
    entities: [
      { name: 'Driver', fields: ['name', 'email', 'phone', 'vehicleType', 'licenseNumber', 'status'] },
      { name: 'Route', fields: ['name', 'origin', 'destination', 'estimatedTime', 'distance', 'description'] },
      { name: 'Package', fields: ['trackingNumber', 'description', 'weight', 'status', 'estimatedDelivery'] },
      { name: 'Order', fields: ['orderDate', 'status', 'deliveryDate', 'notes', 'deliveryFee', 'totalAmount', 'package', 'driver', 'route'] },
    ],
  },
};

function loadChecklist(name) {
  return SCENARIO_CHECKLISTS[name] || null;
}

export default async function validateCmd(scenarioName, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const reporter = options.reporter || console;

  const checklist = loadChecklist(scenarioName);
  if (!checklist) {
    reporter.error(`Unknown checklist "${scenarioName}".`);
    process.exitCode = 2;
    return;
  }

  reporter.log(chalk.cyan.bold(`\n✓ Validating project against: ${scenarioName}`));
  reporter.log(chalk.dim(checklist.description || ''));
  reporter.log('');

  const backendRoot = findBackendRoot(projectRoot);
  const frontendRoot = findFrontendRoot(projectRoot);

  if (!backendRoot) reporter.log(chalk.yellow('⚠ Backend not detected (no backend/package.json)'));
  if (!frontendRoot) reporter.log(chalk.yellow('⚠ Frontend not detected (no frontend/src/main.jsx)'));

  const discoveredModels = backendRoot ? scanModelFiles(backendRoot) : [];
  reporter.log(chalk.dim(`Found ${discoveredModels.length} model(s) in project\n`));

  let totalChecks = 0;
  let passed = 0;
  let failed = 0;
  let partial = 0;

  const entityResults = matchEntities(checklist.entities, discoveredModels);

  for (const entity of entityResults) {
    const label = entity.matched
      ? chalk.green(`✔ ${entity.name}`)
      : chalk.red(`✘ ${entity.name}`);
    reporter.log(`\n${label}`);

    if (entity.match) {
      reporter.log(chalk.dim(`  Model: ${path.relative(projectRoot, entity.match.file)}`));
      reporter.log(chalk.dim(`  Fields: ${entity.match.fields.join(', ')}`));

      const checks = runEntityChecks(entity, backendRoot, frontendRoot, projectRoot);
      for (const check of checks) {
        totalChecks++;
        const icon = check.ok ? chalk.green('✔') : check.warn ? chalk.yellow('○') : chalk.red('✘');
        reporter.log(`  ${icon} ${check.label}${check.detail ? chalk.dim(` — ${check.detail}`) : ''}`);
        if (check.ok) passed++;
        else if (check.warn) partial++;
        else failed++;
      }
    } else {
      totalChecks++;
      failed++;
      reporter.log(chalk.dim(`  ✘ No matching model found (best score: ${(entity.matchScore * 100).toFixed(0)}%)`));
      reporter.log(chalk.dim(`  Expected fields: ${entity.expectedFields.join(', ')}`));
      for (const ef of entity.expectedFields) {
        reporter.log(chalk.dim(`    ○ ${ef} — not found`));
      }
    }
  }

  const globalChecks = await runGlobalChecks(backendRoot, frontendRoot);
  if (globalChecks.length > 0) {
    reporter.log(`\n${chalk.cyan.bold('Global Requirements')}`);
    for (const check of globalChecks) {
      totalChecks++;
      const icon = check.ok ? chalk.green('✔') : check.warn ? chalk.yellow('○') : chalk.red('✘');
      reporter.log(`  ${icon} ${check.label}${check.detail ? chalk.dim(` — ${check.detail}`) : ''}`);
      if (check.ok) passed++;
      else if (check.warn) partial++;
      else failed++;
    }
  }

  reporter.log(`\n${chalk.bold('Summary')}`);
  reporter.log(`  ${chalk.green(`✔ ${passed} passed`)}  ${chalk.yellow(`○ ${partial} partial`)}  ${chalk.red(`✘ ${failed} failed`)}  (${totalChecks} total)`);

  if (failed > 0) process.exitCode = 1;
  return { passed, failed, partial, totalChecks, entityResults };
}

function runEntityChecks(entity, backendRoot, frontendRoot, projectRoot) {
  const checks = [];
  const model = entity.match;
  if (!model) return checks;

  const kebab = model.module;

  // Backend files
  if (backendRoot) {
    const moduleDir = path.join(backendRoot, 'src', 'modules', model.module);
    checks.push({
      ok: fileExists(path.join(moduleDir, 'controllers', `${model.name}.controller.js`)),
      label: 'Controller',
      detail: fileExists(path.join(moduleDir, 'controllers', `${model.name}.controller.js`)) ? '' : `${model.name}.controller.js not found`,
    });
    checks.push({
      ok: fileExists(path.join(backendRoot, 'src', 'utils', 'validators', `${model.name}.validator.js`)),
      label: 'Validator',
      detail: fileExists(path.join(backendRoot, 'src', 'utils', 'validators', `${model.name}.validator.js`)) ? '' : `validator not found`,
    });
    checks.push({
      ok: fileExists(path.join(moduleDir, 'routes', `${model.name}.routes.js`)),
      label: 'Routes',
      detail: fileExists(path.join(moduleDir, 'routes', `${model.name}.routes.js`)) ? '' : `routes not found`,
    });
  }

  // Frontend files
  if (frontendRoot) {
    const pageDir = path.join(frontendRoot, 'src', 'pages', 'admin', kebab);
    checks.push({
      ok: fileExists(path.join(pageDir, 'ListPage.jsx')),
      label: 'Frontend List Page',
      detail: fileExists(path.join(pageDir, 'ListPage.jsx')) ? '' : 'ListPage.jsx not found',
    });
    checks.push({
      ok: fileExists(path.join(frontendRoot, 'src', 'components', 'tables', `${model.name}Table.jsx`)),
      label: 'Frontend Table Component',
      detail: fileExists(path.join(frontendRoot, 'src', 'components', 'tables', `${model.name}Table.jsx`)) ? '' : 'Table component not found',
    });
    checks.push({
      ok: fileExists(path.join(frontendRoot, 'src', 'components', 'forms', `${model.name}Form.jsx`)),
      label: 'Frontend Form Component',
      detail: fileExists(path.join(frontendRoot, 'src', 'components', 'forms', `${model.name}Form.jsx`)) ? '' : 'Form component not found',
    });
    checks.push({
      ok: fileExists(path.join(frontendRoot, 'src', 'api', `${kebab}.api.js`)),
      label: 'Frontend API Client',
      detail: fileExists(path.join(frontendRoot, 'src', 'api', `${kebab}.api.js`)) ? '' : 'API client not found',
    });
    checks.push({
      ok: fileExists(path.join(frontendRoot, 'src', 'hooks', `use${model.name}.js`)),
      label: 'Frontend Hook',
      warn: true,
      detail: fileExists(path.join(frontendRoot, 'src', 'hooks', `use${model.name}.js`)) ? '' : 'Hook not found (optional)',
    });
  }

  return checks;
}

async function runGlobalChecks(backendRoot, frontendRoot) {
  const checks = [];

  if (backendRoot) {
    checks.push({
      ok: fileExists(backendRoot, '.env') || fileExists(backendRoot, '.env.example'),
      label: 'Backend configuration (.env)',
      warn: true,
      detail: fileExists(backendRoot, '.env') ? '.env found' : '.env.example found (copy to .env)',
    });
    checks.push({
      ok: fileExists(backendRoot, 'src', 'config', 'db.js') || fileExists(backendRoot, 'src', 'db.js'),
      label: 'Database configuration',
      detail: '',
    });

    const serverEntry = ['server.js', 'app.js', 'index.js'].find(f => fileExists(backendRoot, f));
    checks.push({
      ok: !!serverEntry,
      label: 'Server entry point',
      detail: serverEntry || 'server.js/app.js not found',
    });

    const authExists =
      fileExists(backendRoot, 'src', 'middlewares', 'auth.js') ||
      fileExists(backendRoot, 'src', 'middlewares', 'authenticate.js') ||
      fileExists(backendRoot, 'src', 'middlewares', 'auth.middleware.js');
    checks.push({
      ok: authExists,
      label: 'Authentication middleware',
      warn: true,
      detail: authExists ? '' : 'auth middleware not found (optional)',
    });
  }

  if (frontendRoot) {
    checks.push({
      ok: fileExists(frontendRoot, 'tailwind.config.js') || fileExists(frontendRoot, 'tailwind.config.ts'),
      label: 'Tailwind CSS',
      detail: '',
    });
    checks.push({
      ok: fileExists(frontendRoot, 'src', 'routes', 'AppRouter.jsx'),
      label: 'App Router',
      detail: '',
    });

    const loginExists =
      fileExists(frontendRoot, 'src', 'pages', 'Login.jsx') ||
      fileExists(frontendRoot, 'src', 'pages', 'login.jsx') ||
      fileExists(frontendRoot, 'src', 'pages', 'auth', 'Login.jsx');
    checks.push({
      ok: loginExists,
      label: 'Login page',
      warn: true,
      detail: loginExists ? '' : 'Login page not found',
    });
  }

  return checks;
}
