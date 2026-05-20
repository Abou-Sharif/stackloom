#!/usr/bin/env node

import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { TemplateLoader } from '../core/template-loader.js';

const NAMING = {
  pascal: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  camel: (s) => s.charAt(0).toLowerCase() + s.slice(1),
  kebab: (s) =>
    s
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase(),
  title: (s) =>
    s
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (m) => m.toUpperCase())
      .trim(),
};

const AGG_FUNCTIONS = [
  { name: 'Sum ($sum)', value: 'sum' },
  { name: 'Count ($count)', value: 'count' },
  { name: 'Average ($avg)', value: 'avg' },
  { name: 'Minimum ($min)', value: 'min' },
  { name: 'Maximum ($max)', value: 'max' },
];

async function promptReportDetails(name) {
  const pascalName = NAMING.pascal(name);
  const kebabName = NAMING.kebab(name);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'title',
      message: 'Report title (human-readable):',
      default: NAMING.title(name),
    },
    {
      type: 'input',
      name: 'description',
      message: 'Short description:',
      default: `${NAMING.title(name)} report`,
    },
    {
      type: 'input',
      name: 'model',
      message: 'Mongoose model name (PascalCase):',
      default: pascalName,
      validate: (v) => /^[A-Z][a-zA-Z0-9]*$/.test(v) || 'Use PascalCase',
    },
    {
      type: 'input',
      name: 'groupBy',
      message: 'Group by field (e.g. status, category — leave blank for raw list):',
    },
    {
      type: 'list',
      name: 'aggFn',
      message: 'Aggregation function:',
      choices: AGG_FUNCTIONS,
      default: 'sum',
      when: (a) => Boolean(a.groupBy),
    },
    {
      type: 'input',
      name: 'aggTarget',
      message: 'Aggregate on field (e.g. amount, quantity — leave blank for count):',
      when: (a) => Boolean(a.groupBy),
    },
    {
      type: 'input',
      name: 'aggFieldName',
      message: 'Result field name (e.g. total, average):',
      default: (a) => a.aggFn === 'sum' ? 'total' : a.aggFn,
      when: (a) => Boolean(a.groupBy),
    },
    {
      type: 'input',
      name: 'sortBy',
      message: 'Sort by field (leave blank for none):',
      default: (a) => a.aggFieldName || undefined,
      when: (a) => Boolean(a.groupBy),
    },
    {
      type: 'list',
      name: 'sortOrder',
      message: 'Sort order:',
      choices: [
        { name: 'Descending (highest first)', value: -1 },
        { name: 'Ascending (lowest first)', value: 1 },
      ],
      default: -1,
      when: (a) => Boolean(a.sortBy),
    },
  ]);

  const aggTarget = answers.aggFn === 'count' ? undefined : (answers.aggTarget || answers.groupBy);

  const aggregations = answers.groupBy
    ? [{
        field: answers.aggFieldName || 'total',
        fn: answers.aggFn,
        target: aggTarget,
      }]
    : [];

  return {
    name,
    pascalName,
    kebabName,
    title: answers.title,
    description: answers.description,
    model: answers.model,
    modelPascal: answers.model,
    groupBy: answers.groupBy || '',
    aggregations,
    sortBy: answers.sortBy || '',
    sortOrder: answers.sortOrder || -1,
    matchConditions: null,
    lookup: null,
    project: null,
  };
}

function buildReportContext(reportDef, projectRoot) {
  return {
    resource: {
      name: reportDef.modelPascal,
      pascalName: reportDef.pascalName,
      kebabName: reportDef.kebabName,
    },
    ...reportDef,
    options: {
      architecture: 'moderate',
    },
    project: {
      root: projectRoot,
      usesTypeScript: false,
    },
    utils: NAMING,
  };
}

async function injectBackendRoute(projectRoot, kebabName) {
  const routesPath = path.join(projectRoot, 'backend', 'src', 'routes', 'index.js');
  if (!fs.existsSync(routesPath)) return;

  let code = await fs.readFile(routesPath, 'utf-8');
  const mountLine = `router.use("/reports/${kebabName}", require("../modules/reports/${kebabName}.routes"));`;

  if (code.includes(mountLine)) return;

  // Create reports module directory if needed
  const reportsDir = path.join(projectRoot, 'backend', 'src', 'modules', 'reports');
  await fs.ensureDir(reportsDir);

  if (code.includes('module.exports = router;')) {
    code = code.replace(
      'module.exports = router;',
      `${mountLine}\nmodule.exports = router;`,
    );
    await fs.writeFile(routesPath, code, 'utf-8');
  }
}

async function injectFrontendRoute(projectRoot, kebabName, pascalName) {
  const routerPath = path.join(projectRoot, 'frontend', 'src', 'routes', 'AppRouter.jsx');
  if (!fs.existsSync(routerPath)) return;

  let code = await fs.readFile(routerPath, 'utf-8');

  const importLine = `const ${pascalName}Report = lazy(() => import("@/pages/reports/${kebabName}/ReportPage"));`;
  const routePath = `/admin/reports/${kebabName}`;

  if (code.includes(importLine)) return;

  const importRegex = /^const \w+Page = lazy\(.*?\);/gm;
  const imports = code.match(importRegex);
  if (imports && imports.length > 0) {
    const lastImport = imports[imports.length - 1];
    code = code.replace(lastImport, `${lastImport}\n${importLine}`);
  } else {
    code = code.replace(
      'export function AppRouter()',
      `${importLine}\nexport function AppRouter()`,
    );
  }

  const routeBlock = `${pascalName}Report`;
  const routeInsert = `\n      {/* ${pascalName} Report */}
      <Route
        path="${routePath}"
        element={<AppShell secure><${routeBlock} /></AppShell>}
      />`;

  if (!code.includes(`path="${routePath}"`)) {
    const wildcardRegex = /^(\s*)<Route\s+path="\*"\s+element=.*?\/>/m;
    const match = code.match(wildcardRegex);
    if (match) {
      const indent = match[1];
      const indentedInsert = routeInsert.replace(/\n/g, '\n' + indent);
      code = code.replace(wildcardRegex, indentedInsert + '\n' + match[0]);
    } else {
      code = code.replace('</Routes>', `${routeInsert}\n      </Routes>`);
    }
  }

  await fs.writeFile(routerPath, code, 'utf-8');
}

async function injectNavEntry(projectRoot, kebabName, pascalName, title) {
  const presetPath = path.join(projectRoot, 'frontend', 'src', 'config', 'app-preset.js');
  if (!fs.existsSync(presetPath)) return;

  let code = await fs.readFile(presetPath, 'utf-8');
  const routePath = `/admin/reports/${kebabName}`;
  const navEntry = `{ label: "${title}", href: "${routePath}", icon: "bar-chart-2" },`;

  if (code.includes(`href: "${routePath}"`)) return;

  const navMatch = code.match(/navigation\s*:\s*\[([^\]]*)\]/s);
  if (!navMatch) return;

  let existingItems = navMatch[1].trim();
  existingItems = existingItems.replace(/,\s*$/, '');

  const newItems = existingItems
    ? `${existingItems},\n      ${navEntry}`
    : navEntry;
  const replacement = `navigation: [\n      ${newItems}\n    ]`;

  code = code.replace(/navigation\s*:\s*\[[^\]]*\]/s, replacement);
  await fs.writeFile(presetPath, code, 'utf-8');
}

export default async function addReportCmd(name, options = {}) {
  const spinner = ora();
  const projectRoot = process.cwd();
  const reporter = { step: (msg) => spinner.start(msg), succeed: (msg) => spinner.succeed(msg), info: (msg) => spinner.info(msg) };

  try {
    // ── Resolve report definition ──────────────────────────────────────────
    let reportDef;
    if (options.interactive || (!name && !options.model)) {
      if (!name) {
        const { reportName } = await inquirer.prompt([
          { type: 'input', name: 'reportName', message: 'Report name:', validate: (v) => /^[a-z0-9-]+$/i.test(v) || 'Use letters, numbers, dashes' },
        ]);
        name = reportName;
      }
      reportDef = await promptReportDetails(name);
    } else {
      const pascalName = NAMING.pascal(name);
      const kebabName = NAMING.kebab(name);
      const model = options.model || pascalName;
      const groupBy = options.groupBy || '';
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
      const aggregations = groupBy
        ? [{ field: options.aggField || 'total', fn: options.aggFn || 'sum', target: options.aggTarget || groupBy }]
        : [];
      reportDef = {
        name,
        pascalName,
        kebabName,
        title: options.title || NAMING.title(name),
        description: options.description || `${NAMING.title(name)} report`,
        model,
        modelPascal: model,
        groupBy,
        aggregations,
        sortBy: options.sortBy || '',
        sortOrder,
        matchConditions: null,
        lookup: null,
        project: null,
      };
    }

    const ctx = buildReportContext(reportDef, projectRoot);
    const templates = new TemplateLoader();
    templates.projectRoot = projectRoot;
    const render = (tpl) => templates.render(tpl, ctx, projectRoot);

    // ── Ensure reports module directory ────────────────────────────────────
    const modDir = path.join(projectRoot, 'backend', 'src', 'modules', 'reports');
    await fs.ensureDir(modDir);
    await fs.ensureDir(path.join(modDir, 'services'));
    await fs.ensureDir(path.join(modDir, 'controllers'));

    // ── Generate backend files ─────────────────────────────────────────────
    reporter.step('Generating report service...');
    const serviceCode = await render('report/service.js.ejs');
    await fs.writeFile(path.join(modDir, 'services', `${reportDef.kebabName}.service.js`), serviceCode);
    reporter.succeed(`Created services/${reportDef.kebabName}.service.js`);

    reporter.step('Generating report controller...');
    const controllerCode = await render('report/controller.js.ejs');
    await fs.writeFile(path.join(modDir, 'controllers', `${reportDef.kebabName}.controller.js`), controllerCode);
    reporter.succeed(`Created controllers/${reportDef.kebabName}.controller.js`);

    reporter.step('Generating report routes...');
    const routeCode = await render('report/routes.js.ejs');
    await fs.writeFile(path.join(modDir, `${reportDef.kebabName}.routes.js`), routeCode);
    reporter.succeed(`Created ${reportDef.kebabName}.routes.js`);

    // ── Inject backend route ───────────────────────────────────────────────
    reporter.step('Mounting backend route...');
    await injectBackendRoute(projectRoot, reportDef.kebabName);
    reporter.succeed('Route mounted in routes/index.js');

    // ── Generate frontend files ────────────────────────────────────────────
    if (options.frontend !== false) {
      const frontendPagesDir = path.join(projectRoot, 'frontend', 'src', 'pages', 'reports', reportDef.kebabName);
      const frontendApiDir = path.join(projectRoot, 'frontend', 'src', 'api');
      await fs.ensureDir(frontendPagesDir);

      reporter.step('Generating report API client...');
      const apiCode = await render('report/api.js.ejs');
      await fs.writeFile(path.join(frontendApiDir, `${reportDef.kebabName}.api.js`), apiCode);
      reporter.succeed(`Created api/${reportDef.kebabName}.api.js`);

      reporter.step('Generating report page...');
      const pageCode = await render('report/page.jsx.ejs');
      await fs.writeFile(path.join(frontendPagesDir, 'ReportPage.jsx'), pageCode);
      reporter.succeed(`Created pages/reports/${reportDef.kebabName}/ReportPage.jsx`);

      // ── Inject frontend route ────────────────────────────────────────────
      reporter.step('Injecting frontend route...');
      await injectFrontendRoute(projectRoot, reportDef.kebabName, reportDef.pascalName);
      reporter.succeed('Route added to AppRouter.jsx');

      // ── Inject nav entry ─────────────────────────────────────────────────
      reporter.step('Adding navigation entry...');
      await injectNavEntry(projectRoot, reportDef.kebabName, reportDef.pascalName, reportDef.title);
      reporter.succeed('Navigation entry added to app-preset.js');
    }

    spinner.succeed(chalk.green(`Report "${reportDef.title}" generated successfully`));

  } catch (err) {
    spinner.fail(chalk.red(err.message));
    process.exitCode = 2;
  }
}
