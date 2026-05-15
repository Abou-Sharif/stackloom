#!/usr/bin/env node

import inquirer from "inquirer";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import { getConfigPaths } from "./page.js";
import { parseFieldSpec } from "../../utils/fieldValidators.js";

const DEFAULT_FRONTEND_DIR = "frontend";
const DEFAULT_BACKEND_DIR = "backend";

async function ensureBackendDependencies(projectRoot, backendDir, fields, archLevel) {
  // Only standard/advanced modules need these dependencies
  if (archLevel === "lightweight") return;

  const pkgPath = path.join(projectRoot, backendDir, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = await fs.readJSON(pkgPath);
  const required = {
    "express-validator": "^7.2.1",
  };

  // Add slugify if slug/code/sku field exists
  if (fields.some(f => ["slug", "code", "sku"].includes(f.name))) {
    required.slugify = "^1.6.6";
  }

  let changed = false;
  const deps = pkg.dependencies || (pkg.dependencies = {});
  for (const [name, version] of Object.entries(required)) {
    if (!deps[name]) {
      deps[name] = version;
      changed = true;
    }
  }
  if (changed) {
    await fs.writeJSON(pkgPath, pkg, { spaces: 2 });
    console.log(chalk.green("✓ Added backend dependencies: " + Object.keys(required).join(", ")));
  }
}

export default async function generateModuleCmd(name, options) {
  console.warn(
    chalk.yellow(
      "⚠  'generate module' is superseded by 'loom generate resource --recipe module'\n" +
        "   (engine-backed: recipe-driven, transactional, validated). This command still works.",
    ),
  );
  const spinner = ora();
  const projectRoot = process.cwd();
  const { frontendDir, backendDir } = await getConfigPaths(projectRoot);

  const backendCheckPath = path.join(projectRoot, backendDir, "src/modules/auth");
  if (!fs.existsSync(backendCheckPath)) {
    console.log(chalk.red("✖  Not a MERN Starter Kit backend."));
    process.exit(1);
  }

  const moduleName = name.toLowerCase();
  const modDir = path.join(projectRoot, backendDir, "src/modules", moduleName);

  if (fs.existsSync(modDir)) {
    if (options.force) {
      spinner.warn(`${modDir} exists — will overwrite (--force)`);
    } else {
      console.log(chalk.yellow(`⚠  Module ${moduleName} already exists. Use --force to overwrite.`));
      process.exit(1);
    }
  }

  let archLevel = options.architecture || "moderate";
  if (options.interactive) {
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "arch",
        message: "Architecture level for this module:",
        choices: [
          { name: "Lightweight — inline controller, minimal files", value: "lightweight" },
          { name: "Moderate — full layer separation", value: "moderate" },
          { name: "Advanced — with tests, types, domain logic", value: "advanced" },
        ],
        default: "moderate",
      },
    ]);
    archLevel = answers.arch;
  }

  const customFields = await resolveModuleFields(moduleName, options);
  await generateModuleFiles(projectRoot, moduleName, archLevel, customFields, { frontendDir, backendDir });
  spinner.succeed(`Generated module: ${moduleName} (${archLevel})`);

  if (options.withPage || (options.interactive && (await inquirer.prompt([{ type: "confirm", name: "addPage", message: `Create corresponding frontend page for ${moduleName}?`, default: true }])).addPage)) {
    const { default: generatePage } = await import("./page.js");
    const pageOptions = {
      ...options,
      withForm: true,
      formMode: options.formMode || "page",
      force: options.force,
      noNav: options.noNav,
      route: `/${moduleName}`,
      formFields: customFields.map(f => {
        const rules = [];
        if (f.validation?.required) rules.push("required");
        if (f.validation?.unique) rules.push("unique");
        if (f.validation?.minLength !== undefined) rules.push(`minLength=${f.validation.minLength}`);
        if (f.validation?.maxLength !== undefined) rules.push(`maxLength=${f.validation.maxLength}`);
        if (f.validation?.min !== undefined) rules.push(`min=${f.validation.min}`);
        if (f.validation?.max !== undefined) rules.push(`max=${f.validation.max}`);
        if (f.validation?.step !== undefined) rules.push(`step=${f.validation.step}`);
        if (f.validation?.pattern) rules.push(`pattern=${f.validation.pattern}`);
        if (f.validation?.default !== undefined) rules.push(`default=${f.validation.default}`);
        if (f.validation?.accept) rules.push(`accept=${f.validation.accept}`);
        if (f.validation?.multiple) rules.push("multiple");
        
        const baseSpec = `${f.name}:${mapFieldTypeToForm(f.type)}`;
        return rules.length > 0 ? `${baseSpec}:${rules.join("|")}` : baseSpec;
      }).join(";"),
    };
    await generatePage(moduleName, pageOptions);
  }
}

function mapFieldTypeToForm(type) {
  const map = { 
    string: "text", 
    text: "textarea",
    number: "number", 
    boolean: "boolean", 
    date: "date",
    email: "email",
    phone: "tel",
    url: "url",
    datetime: "datetime-local",
    time: "time",
    color: "color",
    file: "file",
    password: "password",
    range: "range",
  };
  return map[type] || "text";
}

function getJoiTypeForModule(type, validation = {}) {
  let base;
  switch (type) {
    case "number": 
      base = "Joi.number().integer()";
      if (validation.min !== undefined) base += `.min(${validation.min})`;
      if (validation.max !== undefined) base += `.max(${validation.max})`;
      break;
    case "boolean": 
      base = "Joi.boolean()"; 
      break;
    case "date": 
    case "datetime":
      base = "Joi.date().iso()"; 
      break;
    case "email":
      base = "Joi.string().email()"; 
      break;
    case "url":
      base = "Joi.string().uri()"; 
      break;
    case "phone":
      base = "Joi.string().pattern(/^[+]?[1-9]\\d{1,14}$/, 'Invalid phone')";
      break;
    case "password":
      base = "Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)/, 'Must contain uppercase, lowercase, digit')";
      break;
    case "text":
      base = "Joi.string()";
      if (validation.minLength) base += `.min(${validation.minLength})`;
      if (validation.maxLength) base += `.max(${validation.maxLength})`;
      break;
    default: base = "Joi.string().trim()";
  }
  if (validation.required) base += ".required()";
  return base;
}

function getMongooseSchemaField(type, validation = {}) {
  let def = "{ type: ";
  
  switch (type) {
    case "string": def += "String"; break;
    case "text": def += "String"; break;
    case "email": def += "String"; break;
    case "phone": def += "String"; break;
    case "url": def += "String"; break;
    case "password": def += "String"; break;
    case "number": def += "Number"; break;
    case "boolean": def += "Boolean"; break;
    case "date": def += "Date"; break;
    case "datetime": def += "Date"; break;
    case "color": def += "String"; break;
    case "range": def += "Number"; break;
    case "file": def += "String"; break;
    default: def += "Mixed";
  }
  
  const constraints = [];
  
  if ((type === "string" || type === "text" || type === "email" || type === "url" || type === "phone" || type === "password")) {
    constraints.push("trim: true");
  }
  
  if (type === "password") constraints.push("minlength: 8");
  if (validation.minLength) constraints.push(`minlength: ${validation.minLength}`);
  if (validation.maxLength) constraints.push(`maxlength: ${validation.maxLength}`);
  if (validation.min !== undefined && type === "number") constraints.push(`min: ${validation.min}`);
  if (validation.max !== undefined && type === "number") constraints.push(`max: ${validation.max}`);
  if (validation.default !== undefined) constraints.push(`default: ${JSON.stringify(validation.default)}`);
  
  // Only add required if explicitly set
  if (validation.required) constraints.push("required: true");
  // unique should be in separate index
  if (validation.unique) constraints.push("unique: true");
  
  if (constraints.length > 0) {
    def += `, ${constraints.join(", ")}`;
  }
  
  return def + " }";
}

async function resolveModuleFields(moduleName, options) {
  if (options.fields) {
    return options.fields.split(";").map((pair) => {
      const field = parseFieldSpec(pair);
      if (!field) return null;
      
      // Auto-add required to first field if no rules
      if (!field.validation || Object.keys(field.validation).length === 0) {
        field.validation = { required: true };
      }
      return field;
    }).filter(Boolean);
  }

  if (options.interactive) {
    const { addCustom } = await inquirer.prompt([
      { type: "confirm", name: "addCustom", message: "Add custom fields beyond default 'name'?", default: false },
    ]);

    if (!addCustom) return [{ 
      name: "name", 
      type: "string", 
      validation: { 
        required: true, 
        minLength: 3, 
        maxLength: 100 
      } 
    }];

    const fields = [{ 
      name: "name", 
      type: "string", 
      validation: { 
        required: true, 
        minLength: 3, 
        maxLength: 100 
      } 
    }];
    
    let more = true;
    while (more) {
      const answers = await inquirer.prompt([
        { 
          type: "input", 
          name: "name", 
          message: "Field name:",
          validate: (v) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v) || "Valid JS identifier" 
        },
        { 
          type: "list", 
          name: "type", 
          message: "Data type:",
          choices: [
            { name: "String (text)", value: "string" },
            { name: "Text (long)", value: "text" },
            { name: "Email", value: "email" },
            { name: "Phone", value: "phone" },
            { name: "URL", value: "url" },
            { name: "Password", value: "password" },
            { name: "Number", value: "number" },
            { name: "Boolean", value: "boolean" },
            { name: "Date", value: "date" },
            { name: "DateTime", value: "datetime" },
            { name: "Color", value: "color" },
            { name: "File", value: "file" },
            { name: "Range", value: "range" },
          ],
          default: "string" 
        },
        {
          type: "checkbox",
          name: "validation",
          message: "Validation:",
          choices: [
            { name: "Required", value: "required", checked: true },
            { name: "Must be unique", value: "unique" },
            { name: "Set min value/length", value: "min" },
            { name: "Set max value/length", value: "max" },
          ]
        },
        {
          type: "input",
          name: "minVal",
          message: "Min (number/date/length):",
          when: (a) => a.validation.includes("min"),
          validate: (v) => !v || !isNaN(v) || "Enter a number/date"
        },
        {
          type: "input",
          name: "maxVal",
          message: "Max (number/date/length):",
          when: (a) => a.validation.includes("max"),
          validate: (v) => !v || !isNaN(v) || "Enter a number/date"
        },
        {
          type: "input",
          name: "placeholder",
          message: "Placeholder text (optional):"
        },
      ]);
      
      const field = {
        name: answers.name,
        type: answers.type,
        validation: {
          required: answers.validation.includes("required"),
          unique: answers.validation.includes("unique"),
        }
      };
      
      if (answers.minVal) {
        const val = parseFloat(answers.minVal);
        if (!isNaN(val)) {
          field.validation.min = val;
          if (answers.type === "string" || answers.type === "text") {
            field.validation.minLength = val;
          }
        }
      }
      if (answers.maxVal) {
        const val = parseFloat(answers.maxVal);
        if (!isNaN(val)) {
          field.validation.max = val;
          if (answers.type === "string" || answers.type === "text") {
            field.validation.maxLength = val;
          }
        }
      }
      
      fields.push(field);
      const { again } = await inquirer.prompt([{ type: "confirm", name: "again", message: "Add another field?", default: false }]);
      more = again;
    }
    return fields;
  }

  return [{ 
    name: "name", 
    type: "string", 
    validation: { required: true, minLength: 3, maxLength: 100 } 
  }];
}

async function generateModuleFiles(projectRoot, moduleName, archLevel, fields, { frontendDir, backendDir }) {
  const modDir = path.join(projectRoot, backendDir, "src/modules", moduleName);
  await fs.ensureDir(modDir);

  const pascalName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

  if (archLevel === "lightweight") {
    const { model, controller, middleware, routes } = generateLightweight(moduleName, pascalName, fields);
    await fs.writeFile(path.join(modDir, `${moduleName}.model.js`), model);
    await fs.writeFile(path.join(modDir, `${moduleName}.controller.js`), controller);
    await fs.writeFile(path.join(modDir, `${moduleName}.middleware.js`), middleware);
    await fs.writeFile(path.join(modDir, `${moduleName}.routes.js`), routes);
  } else {
    const { model, service, controller, routes, validator } = generateStandardModule(moduleName, pascalName, archLevel === "advanced", fields);
    await fs.writeFile(path.join(modDir, `${moduleName}.model.js`), model);
    await fs.writeFile(path.join(modDir, `${moduleName}.service.js`), service);
    await fs.writeFile(path.join(modDir, `${moduleName}.controller.js`), controller);
    await fs.writeFile(path.join(modDir, `${moduleName}.routes.js`), routes);
    await fs.ensureDir(path.join(projectRoot, backendDir, "src/utils/validators"));
    await fs.writeFile(path.join(projectRoot, backendDir, "src/utils/validators", `${moduleName}.validator.js`), validator);

    if (archLevel === "advanced") {
      await fs.ensureDir(path.join(modDir, "tests"));
      await fs.writeFile(path.join(modDir, "tests", `${moduleName}.test.js`), 
        `const { ${moduleName}Model } = require("../${moduleName}.model");\n` +
        `const request = require("supertest");\n` +
        `const app = require("../../app");\n\n` +
        `describe("${moduleName} module", () => {\n` +
        `  beforeAll(async () => {\n    // Connect to test database\n  });\n\n` +
        `  afterAll(async () => {\n    // Clean up\n  });\n\n` +
        `  test("should create ${moduleName}", async () => {\n    const res = await request(app)\n      .post("/api/${moduleName}")\n      .send({ name: "test" })\n      .expect(201);\n    expect(res.body).toHaveProperty("data");\n  });\n});\n`);
    }
  }

   const routesIndexPath = path.join(projectRoot, backendDir, "src/routes/index.js");
   if (fs.existsSync(routesIndexPath)) {
     const routesCode = await fs.readFile(routesIndexPath, "utf-8");
     const mountLine = `router.use("/${moduleName}", require("../modules/${moduleName}/${moduleName}.routes"));`;
     if (!routesCode.includes(mountLine)) {
       await fs.writeFile(routesIndexPath, routesCode.replace("module.exports = router;", `${mountLine}\nmodule.exports = router;`));
     }
   }

   // Ensure required dependencies are present in backend package.json
   await ensureBackendDependencies(projectRoot, backendDir, fields, archLevel);
 }

function generateLightweight(moduleName, pascalName, fields) {
  const schemaFields = fields.map(f => {
    let def = `${f.name}: { type: `;
    
    if (f.type === "number") def += "Number";
    else if (f.type === "boolean") def += "Boolean";
    else if (f.type === "date") def += "Date";
    else def += "String";
    
    const constraints = [];
    if (f.validation?.required) constraints.push("required: true");
    if (f.type === "string" || f.type === "text" || f.type === "email" || f.type === "phone") constraints.push("trim: true");
    if (f.validation?.minLength) constraints.push(`minlength: ${f.validation.minLength}`);
    if (f.validation?.maxLength) constraints.push(`maxlength: ${f.validation.maxLength}`);
    
    if (constraints.length > 0) def += `, ${constraints.join(", ")}`;
    return def + " }";
  }).join(",\n    ");

  const model = `const mongoose = require("mongoose");

const ${moduleName}Schema = new mongoose.Schema(
  {
    ${schemaFields}
  },
  { timestamps: true }
);

module.exports = { ${moduleName}Model: mongoose.model("${pascalName}", ${moduleName}Schema) };
`;

  const middleware = `// ${pascalName} Middleware

const ${pascalName}Middleware = {
  validateId: async (req, res, next) => {
    const { id } = req.params;
    const Model = require("./${moduleName}.model").${pascalName}Model;
    const doc = await Model.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: "${pascalName} not found" });
    req.${moduleName}Doc = doc;
    next();
  },
   sanitizeInput: (req, res, next) => {
     ${fields.filter(f => ["email","tel","url","text","string"].includes(f.type)).map(f => `if (req.body && req.body.${f.name}) req.body.${f.name} = req.body.${f.name}${f.type === "email" ? ".toLowerCase().trim()" : ".trim()"};`).join('\n    ')}
     next();
   }
};
module.exports = ${pascalName}Middleware;
`;

  const sanitizationCode = fields.filter(f => ["email","tel","url","text","string"].includes(f.type))
    .map(f => `if (req.body.${f.name}) req.body.${f.name} = req.body.${f.name}${f.type === "email" ? ".toLowerCase().trim()" : ".trim()"};`).join('\n  ');

   const controller = `// ${pascalName} Controller
const ${pascalName}Model = require("./${moduleName}.model").${moduleName}Model;
const ApiResponse = require("../../utils/ApiResponse");
const ApiError = require("../../utils/ApiError");

const create${pascalName} = async (req, res, next) => {
  try {
    ${sanitizationCode}
    const doc = await ${pascalName}Model.create(req.body);
    return res.status(201).json(new ApiResponse(201, "${pascalName} created", { data: doc }).body);
  } catch (err) { return next(err); }
};

const getAll${pascalName}s = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const docs = await ${pascalName}Model.find({}).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await ${pascalName}Model.countDocuments();
    return res.status(200).json(new ApiResponse(200, "Fetched", { data: docs, page: parseInt(page), total }).body);
  } catch (err) { return next(err); }
};

const get${pascalName}ById = async (req, res, next) => {
  try {
    const doc = await ${pascalName}Model.findById(req.params.id);
    if (!doc) throw new ApiError(404, "${pascalName} not found");
    return res.status(200).json(new ApiResponse(200, "Fetched", { data: doc }).body);
  } catch (err) { return next(err); }
};

const update${pascalName} = async (req, res, next) => {
  try {
    ${sanitizationCode}
    const doc = await ${pascalName}Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) throw new ApiError(404, "${pascalName} not found");
    return res.status(200).json(new ApiResponse(200, "Updated", { data: doc }).body);
  } catch (err) { return next(err); }
};

const delete${pascalName} = async (req, res, next) => {
  try {
    const doc = await ${pascalName}Model.findByIdAndDelete(req.params.id);
    if (!doc) throw new ApiError(404, "${pascalName} not found");
    return res.status(200).json(new ApiResponse(200, "Deleted").body);
  } catch (err) { return next(err); }
};

module.exports = { create${pascalName}, getAll${pascalName}s, get${pascalName}ById, update${pascalName}, delete${pascalName} };
`;

  const routes = `// ${pascalName} Routes
const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware").authenticate;
const requireRole = require("../../middlewares/auth.middleware").requireRole;
const controller = require("./${moduleName}.controller");
const middleware = require("./${moduleName}.middleware");

router.use(middleware.sanitizeInput);
router.post("/", authenticate, controller.create${pascalName});
router.get("/", authenticate, controller.getAll${pascalName}s);
router.get("/:id", authenticate, middleware.validateId, controller.get${pascalName}ById);
router.put("/:id", authenticate, middleware.validateId, controller.update${pascalName});
router.delete("/:id", authenticate, requireRole("admin"), middleware.validateId, controller.delete${pascalName});
module.exports = router;
`;

  return { model, controller, middleware, routes };
}

function generateStandardModule(moduleName, pascalName, advanced, fields) {
  // Model
  const schemaFields = fields.map(f => {
    let def = `    ${f.name}: ${getMongooseSchemaField(f.type, f.validation)}`;
    return def;
  }).join(",\n");

  const model = `const mongoose = require("mongoose");
${advanced ? `// Domain Model: ${pascalName}\n// This model represents core business entity ${moduleName}\n` : ""}

const ${moduleName}Schema = new mongoose.Schema(
  {
    ${schemaFields}
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true, transform: (doc, ret) => { delete ret._id; delete ret.__v; } },
    toObject: { virtuals: true }
  }
);

// Virtuals for computed fields (if needed)
// ${moduleName}Schema.virtual('fullName').get(function() { return this.firstName + ' ' + this.lastName; });

module.exports = mongoose.model("${pascalName}", ${moduleName}Schema);
`;

   // Service
   const service = `const ${moduleName}Model = require("./${moduleName}.model");
const ApiError = require("../../utils/ApiError");
${advanced ? `\n/**
 * ${pascalName} Service
 * Handles business logic for ${moduleName} domain
 */\nclass ${pascalName}Service {\n` : ""}

const create${pascalName} = async (payload) => {
  // Sanitize input
  ${getSanitizationCode(fields, 'payload')}
  
  // Generate code/slug if needed
  ${generateCodeGenerationLogic(fields, 'payload')}
  
  return await ${moduleName}Model.create(payload);
};

const getAll${pascalName}s = async (filters = {}) => {
  const query = ${moduleName}Model.find({});
  ${getFilteringCode(fields, 'filters')}
  return await query.exec();
};

const get${pascalName}ById = async (id) => {
  const doc = await ${moduleName}Model.findById(id);
  if (!doc) throw new ApiError(404, "${moduleName} not found");
  return doc;
};

const get${pascalName}ByUnique = async (field, value) => {
  return await ${moduleName}Model.findOne({ [field]: value });
};

const update${pascalName} = async (id, updates) => {
  ${getSanitizationCode(fields, 'updates')}
  const doc = await ${moduleName}Model.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!doc) throw new ApiError(404, "${moduleName} not found");
  return doc;
};

const delete${pascalName} = async (id) => {
  // Soft delete pattern: set deleted=true, deletedAt timestamp
  // For now hard delete:
  const doc = await ${moduleName}Model.findByIdAndDelete(id);
  if (!doc) throw new ApiError(404, "${moduleName} not found");
  return doc;
};

// Advanced: Batch operations
${advanced ? `const bulkCreate${pascalName}s = async (items) => {
  if (!Array.isArray(items)) throw new ApiError(400, "Items must be an array");
  return await ${moduleName}Model.insertMany(items);
};

const bulkUpdate${pascalName}s = async (updates) => {
  // updates: [{ id, changes }, ...]
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const update of updates) {
      await ${moduleName}Model.findByIdAndUpdate(update.id, update.changes, { session });
    }
    await session.commitTransaction();
    session.endSession();
    return updates.length;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};` : ''}

${advanced ? `}\nmodule.exports = new ${pascalName}Service();` : `module.exports = {
  create${pascalName},
  getAll${pascalName}s,
  get${pascalName}ById,
  get${pascalName}ByUnique,
  update${pascalName},
  delete${pascalName},
  ${advanced ? 'bulkCreate' + pascalName + 's,\n  bulkUpdate' + pascalName + 's,' : ''}
};`}
`;

  // Controller
  const controller = `const service = require("./${moduleName}.service");
const ApiResponse = require("../../utils/ApiResponse");

const create = async (req, res, next) => {
  try {
    const result = await service.create${pascalName}(req.body);
    return res.status(201).json(new ApiResponse(201, "${pascalName} created", { data: result }).body);
  } catch (err) {
    return next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, sort = "createdAt", order = "desc", ...filters } = req.query;
    const result = await service.getAll${pascalName}s({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      filters
    });
    return res.status(200).json(new ApiResponse(200, "Fetched", { data: result }).body);
  } catch (err) {
    return next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const result = await service.get${pascalName}ById(req.params.id);
    return res.status(200).json(new ApiResponse(200, "Fetched", { data: result }).body);
  } catch (err) {
    return next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const result = await service.update${pascalName}(req.params.id, req.body);
    return res.status(200).json(new ApiResponse(200, "Updated", { data: result }).body);
  } catch (err) {
    return next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    await service.delete${pascalName}(req.params.id);
    return res.status(200).json(new ApiResponse(200, "Deleted").body);
  } catch (err) {
    return next(err);
  }
};

module.exports = { create, list, getOne, update, remove };
`;

  // Validator
  const validatorFields = fields.map(f => {
    const joiRule = getJoiTypeForModule(f.type, f.validation);
    return `  ${f.name}: ${joiRule}`;
  }).join(",\n");

  const optionalFields = fields.filter(f => !f.validation.required).map(f => `"${f.name}"`).join(", ");

  const validator = `const Joi = require("joi");

/**
 * ${pascalName} Validation Schemas
 * ================================
 * Keep these in sync with ${moduleName}.model.js schema
 */

const create${pascalName}Schema = Joi.object({
${validatorFields}
});

const update${pascalName}Schema = create${pascalName}Schema.fork(
  [${optionalFields}],
  (schema) => schema.optional()
);

module.exports = {
  create${pascalName}Schema,
  update${pascalName}Schema,
};
`;

  // Routes
  const routes = `const express = require("express");
const controller = require("./${moduleName}.controller");
const validate = require("../../middlewares/validate");
const authenticate = require("../../middlewares/auth.middleware").authenticate;
const requireRole = require("../../middlewares/auth.middleware").requireRole;
const { query } = require("express-validator");

const router = express.Router();

// Create — requires auth
router.post("/", authenticate, 
  validate(require("../../utils/validators/${moduleName}.validator").create${pascalName}Schema), 
  controller.create
);

// List — with pagination & filtering
router.get("/", authenticate,
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("sort").optional().isIn(${fields.map(f => `"${f.name}"`).join(", ")}),
  query("order").optional().isIn(["asc", "desc"]),
  ${fields.map(f => `query("${f.name}").optional().isString(),`).join("\n  ")}
  validate,
  controller.list
);

// Single record
router.get("/:id", authenticate, controller.getOne);

// Update
router.put("/:id", authenticate, 
  validate(require("../../utils/validators/${moduleName}.validator").update${pascalName}Schema), 
  controller.update
);

// Delete — admin only
router.delete("/:id", authenticate, requireRole("admin"), controller.remove);

module.exports = router;
`;

  return { model, service, controller, routes, validator };
}

function getSanitizationCode(fields, objName) {
  return fields.filter(f => ["email", "tel", "url", "text", "string"].includes(f.type))
    .map(f => {
      switch (f.type) {
        case "email":
          return `  if (${objName}.${f.name}) ${objName}.${f.name} = ${objName}.${f.name}.toLowerCase().trim();`;
        case "tel":
          return `  if (${objName}.${f.name}) ${objName}.${f.name} = ${objName}.${f.name}.replace(/[^+0-9]/g, '');`;
        case "url":
          return `  if (${objName}.${f.name}) ${objName}.${f.name} = ${objName}.${f.name}.trim();`;
        default:
          return `  if (${objName}.${f.name} && typeof ${objName}.${f.name} === "string") ${objName}.${f.name} = ${objName}.${f.name}.trim();`;
      }
    }).join('\n');
}

function getFilteringCode(fields, filtersObj) {
  const filters = [];
  
  fields.forEach(f => {
    filters.push(`  if (${filtersObj}.filters.${f.name}) query = query.where('${f.name}', ${filtersObj}.filters.${f.name});`);
  });
  
  return filters.join('\n');
}

function generateCodeGenerationLogic(fields, objName) {
  // If there's a 'slug' or 'code' field, generate it
  const codeField = fields.find(f => f.name === "slug" || f.name === "code" || f.name === "sku");
  if (!codeField) return "// No auto-generated field";
  
  if (codeField.name === "slug" || codeField.name === "code") {
    return `  // Auto-generate ${codeField.name} from name if not provided
  if (!${objName}.${codeField.name} && ${objName}.name) {
    const slugify = require('slugify');
    ${objName}.${codeField.name} = slugify(${objName}.name, { lower: true, strict: true });
  }`;
  }
  
  if (codeField.name === "sku") {
    return `  // Generate SKU if not provided: PROD-XXXXX
  if (!${objName}.sku) {
    ${objName}.sku = "PROD-" + Math.random().toString(36).substr(2, 6).toUpperCase();
  }`;
  }
  
  return "";
}
