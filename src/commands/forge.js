#!/usr/bin/env node

/**
 * `loom forge` — hidden exam-scaffold command.
 *
 * Creates the exact project structure required for practical exams:
 *   FirstName_LastName_National_Practical_Exam_2025/
 *     backend-project/
 *     frontend-project/
 *
 * Replaces the CLI's default JWT auth with session-based auth
 * (express-session + bcrypt + username login) to match exam specs.
 *
 * This command is intentionally hidden from --help output.
 */

import path from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Session Auth file templates ──

const SESSION_AUTH_MODEL = `const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    fullName: { type: String, default: "" },
    role: { type: String, enum: ["admin", "user"], default: "admin" },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", userSchema);
`;

const SESSION_AUTH_SERVICE = `const User = require("./auth.model");

const login = async (username, password) => {
  const user = await User.findOne({ username });
  if (!user || !(await user.comparePassword(password))) {
    throw new Error("Invalid username or password");
  }
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };
};

module.exports = { login };
`;

const SESSION_AUTH_CONTROLLER = `const authService = require("./auth.service");

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }
    const user = await authService.login(username, password);
    req.session.user = user;
    return res.json({ success: true, message: "Login successful", data: { user } });
  } catch (err) {
    return res.status(401).json({ success: false, message: err.message });
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: "Logout failed" });
    res.clearCookie("connect.sid");
    return res.json({ success: true, message: "Logout successful" });
  });
};

const getMe = (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }
  return res.json({ success: true, data: { user: req.session.user } });
};

module.exports = { login, logout, getMe };
`;

const SESSION_AUTH_ROUTES = `const express = require("express");
const controller = require("./auth.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/login", controller.login);
router.post("/logout", controller.logout);
router.get("/me", controller.getMe);

module.exports = router;
`;

const SESSION_MIDDLEWARE = `const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  next();
};

module.exports = { requireAuth };
`;

const SESSION_SEED_SCRIPT = `/**
 * Seed script — creates the default admin user.
 * Run with: node seed.js
 */
const mongoose = require("mongoose");
const path = require("path");

// Load env before anything else
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const User = require("./src/modules/auth/auth.model");

const seedAdmin = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const existing = await User.findOne({ username: "admin" });
  if (existing) {
    console.log("Admin user already exists. Skipping seed.");
    await mongoose.disconnect();
    return;
  }

  await User.create({
    username: "admin",
    password: "admin123",
    fullName: "System Administrator",
    role: "admin",
  });

  console.log("Default admin user created:");
  console.log("  Username: admin");
  console.log("  Password: admin123");
  console.log("  CHANGE THIS PASSWORD after first login.");

  await mongoose.disconnect();
};

seedAdmin().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
`;

/**
 * Resolve the MERN template source directory.
 */
function resolveTemplateDir() {
  const local = path.resolve(__dirname, "../../../stackloom-templates/mern");
  if (fs.existsSync(local)) return local;
  const sibling = path.resolve(__dirname, "../../stackloom-templates/mern");
  if (fs.existsSync(sibling)) return sibling;
  return null;
}

/**
 * Recursive copy, excluding node_modules and .git.
 */
function copyTemplate(src, dest) {
  fs.ensureDirSync(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTemplate(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * Remove a directory recursively.
 */
function removeDir(dir) {
  if (fs.existsSync(dir)) fs.removeSync(dir);
}

export default async function forgeCmd(options = {}) {
  const spinner = ora();
  console.log("");

  // ── 1. Collect student info (options first, then prompts) ──
  const answers = {};
  if (options.firstName) answers.firstName = options.firstName;
  if (options.lastName) answers.lastName = options.lastName;
  if (options.moduleName) answers.moduleName = options.moduleName;
  if (options.dbName) answers.dbName = options.dbName;
  answers.seedAdmin = options.seedAdmin !== false;

  const needsPrompt = !answers.firstName || !answers.lastName || !answers.moduleName || !answers.dbName;
  if (needsPrompt) {
    const prompted = await inquirer.prompt([
      {
        type: "input",
        name: "firstName",
        message: "Student first name:",
        when: () => !answers.firstName,
        validate: (v) => (v ? true : "Required"),
      },
      {
        type: "input",
        name: "lastName",
        message: "Student last name:",
        when: () => !answers.lastName,
        validate: (v) => (v ? true : "Required"),
      },
      {
        type: "input",
        name: "moduleName",
        message: "Module / system name (e.g. SmartPark Parking System):",
        when: () => !answers.moduleName,
        validate: (v) => (v ? true : "Required"),
      },
      {
        type: "input",
        name: "dbName",
        message: "Database name (e.g. PSSMS, BTMS, RBMS):",
        when: () => !answers.dbName,
        validate: (v) => /^[A-Za-z0-9_]+$/.test(v) ? true : "Alphanumeric and underscore only",
      },
      {
        type: "confirm",
        name: "seedAdmin",
        message: "Create default admin user (admin/admin123)?",
        default: true,
        when: () => options.seedAdmin === undefined,
      },
    ]);
    Object.assign(answers, prompted);
  }

  const folderName = `${answers.firstName}_${answers.lastName}_National_Practical_Exam_2025`;
  const projectRoot = path.resolve(process.cwd(), folderName);

  if (fs.existsSync(projectRoot)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `"${folderName}" already exists. Overwrite?`,
        default: false,
      },
    ]);
    if (!overwrite) {
      spinner.fail("Aborted by user.");
      return;
    }
    fs.removeSync(projectRoot);
  }

  // ── 2. Locate and copy template ──
  const templateDir = resolveTemplateDir();
  if (!templateDir || !fs.existsSync(templateDir)) {
    spinner.fail("MERN template not found. Run this from the loom repo or pass --local-template.");
    return;
  }

  spinner.start("Copying MERN template...");
  copyTemplate(templateDir, projectRoot);
  spinner.succeed("Template copied");

  // ── 3. Restructure directories: backend/ → backend-project/, frontend/ → frontend-project/ ──
  spinner.start("Restructuring project directories...");
  const oldBe = path.join(projectRoot, "backend");
  const oldFe = path.join(projectRoot, "frontend");
  const newBe = path.join(projectRoot, "backend-project");
  const newFe = path.join(projectRoot, "frontend-project");

  // Remove leftover root junk from template
  for (const f of fs.readdirSync(projectRoot)) {
    if (f === "backend" || f === "frontend") continue;
    const full = path.join(projectRoot, f);
    if (f !== ".loom") fs.removeSync(full);
  }

  if (fs.existsSync(oldBe)) fs.renameSync(oldBe, newBe);
  if (fs.existsSync(oldFe)) fs.renameSync(oldFe, newFe);
  spinner.succeed("Directories restructured");

  // ── 4. Remove example products module ──
  spinner.start("Cleaning example module...");
  removeDir(path.join(newBe, "src/modules/products"));
  spinner.succeed("Example module removed");

  // ── 5. Write session-based auth files ──
  const authDir = path.join(newBe, "src/modules/auth");
  fs.ensureDirSync(authDir);

  spinner.start("Installing session-based auth...");

  fs.writeFileSync(path.join(authDir, "auth.model.js"), SESSION_AUTH_MODEL);
  fs.writeFileSync(path.join(authDir, "auth.service.js"), SESSION_AUTH_SERVICE);
  fs.writeFileSync(path.join(authDir, "auth.controller.js"), SESSION_AUTH_CONTROLLER);
  fs.writeFileSync(path.join(authDir, "auth.routes.js"), SESSION_AUTH_ROUTES);

  // Remove auth.validator.js if it exists (login is now username/password only)
  const oldValidator = path.join(authDir, "auth.validator.js");
  if (fs.existsSync(oldValidator)) fs.removeSync(oldValidator);

  // Replace auth middleware
  const middlewareDir = path.join(newBe, "src/middlewares");
  fs.ensureDirSync(middlewareDir);
  fs.writeFileSync(path.join(middlewareDir, "auth.middleware.js"), SESSION_MIDDLEWARE);

  // Remove tokenUtils.js (no JWT)
  const tokenUtilsPath = path.join(newBe, "src/utils/tokenUtils.js");
  if (fs.existsSync(tokenUtilsPath)) fs.removeSync(tokenUtilsPath);

  spinner.succeed("Session auth installed");

  // ── 6. Update app.js with express-session ──
  spinner.start("Configuring session middleware...");
  const appJsPath = path.join(newBe, "src/app.js");
  if (fs.existsSync(appJsPath)) {
    let appJs = fs.readFileSync(appJsPath, "utf-8");

    // Add session imports
    const sessionImports = `const session = require("express-session");
const MongoStore = require("connect-mongo");
`;

    appJs = appJs.replace(
      /^const cookieParser = require\("cookie-parser"\);/m,
      `const cookieParser = require("cookie-parser");\n${sessionImports}`,
    );

    // Add session middleware after cookieParser
    const sessionMiddleware = `
app.use(
  session({
    secret: process.env.SESSION_SECRET || "exam-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: env.MONGODB_URI }),
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  })
);
`;

    appJs = appJs.replace(
      /app\.use\(cookieParser\(\)\);/,
      `app.use(cookieParser());${sessionMiddleware}`,
    );

    fs.writeFileSync(appJsPath, appJs);
  }
  spinner.succeed("Session middleware configured");

  // ── 7. Update env.js — replace JWT vars with SESSION_SECRET ──
  spinner.start("Updating environment config...");
  const envJsPath = path.join(newBe, "src/config/env.js");
  if (fs.existsSync(envJsPath)) {
    let envJs = fs.readFileSync(envJsPath, "utf-8");
    // Remove JWT-specific env vars from validation
    envJs = envJs.replace(/^\s*JWT_ACCESS_SECRET:.*$/m, "");
    envJs = envJs.replace(/^\s*JWT_REFRESH_SECRET:.*$/m, "");
    envJs = envJs.replace(/^\s*ACCESS_TOKEN_EXPIRES_IN:.*$/m, "");
    envJs = envJs.replace(/^\s*REFRESH_TOKEN_EXPIRES_IN:.*$/m, "");
    envJs = envJs.replace(/^\s*COOKIE_NAME:.*$/m, "");
    // Add SESSION_SECRET
    envJs = envJs.replace(
      /BCRYPT_SALT_ROUNDS:.*$/m,
      `BCRYPT_SALT_ROUNDS: Joi.number().integer().min(8).max(15).default(12),\n  SESSION_SECRET: Joi.string().min(16).default("exam-secret-change-in-production"),`,
    );
    fs.writeFileSync(envJsPath, envJs);
  }
  spinner.succeed("Environment config updated");

  // ── 8. Update backend .env.example ──
  const envExamplePath = path.join(newBe, ".env.example");
  if (fs.existsSync(envExamplePath)) {
    let envExample = fs.readFileSync(envExamplePath, "utf-8");
    envExample = envExample
      .replace(/^JWT_ACCESS_SECRET=.*$/m, "")
      .replace(/^JWT_REFRESH_SECRET=.*$/m, "")
      .replace(/^ACCESS_TOKEN_EXPIRES_IN=.*$/m, "")
      .replace(/^REFRESH_TOKEN_EXPIRES_IN=.*$/m, "")
      .replace(/^COOKIE_NAME=.*$/m, "")
      .replace(/^\n+/g, "\n")
      .trim();
    envExample += `\nSESSION_SECRET=exam-secret-change-in-production\n`;
    fs.writeFileSync(envExamplePath, envExample);
  }
  spinner.succeed(".env.example updated");

  // ── 9. Update backend package.json — add connect-mongo, remove jsonwebtoken ──
  const bePkgPath = path.join(newBe, "package.json");
  if (fs.existsSync(bePkgPath)) {
    const bePkg = fs.readJsonSync(bePkgPath);
    bePkg.dependencies["express-session"] = "^1.18.0";
    bePkg.dependencies["connect-mongo"] = "^5.1.0";
    delete bePkg.dependencies["jsonwebtoken"];
    fs.writeJsonSync(bePkgPath, bePkg, { spaces: 2 });
  }

  // ── 10. Update frontend auth context for session-based flow ──
  spinner.start("Updating frontend auth...");

  const feApiDir = path.join(newFe, "src/api");
  fs.ensureDirSync(feApiDir);

  // Rewrite auth.api.js — session-based, no token handling
  const sessionAuthApi = `import { api } from "./axiosInstance";

export const authApi = {
  login: (payload) => api.post("/auth/login", payload),
  logout: () => api.post("/auth/logout", null, { silent: true }),
  me: () => api.get("/auth/me", { silent: true }),
};
`;
  fs.writeFileSync(path.join(feApiDir, "auth.api.js"), sessionAuthApi);

  // Rewrite axiosInstance.js — remove token interceptor, just pass credentials
  const axiosInstancePath = path.join(feApiDir, "axiosInstance.js");
  if (fs.existsSync(axiosInstancePath)) {
    let axiosContent = fs.readFileSync(axiosInstancePath, "utf-8");
    // Replace with session-friendly version that sends cookies
    const sessionAxios = `import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error.response?.data;
    if (data?.message) error.message = data.message;
    return Promise.reject(error);
  }
);

export { api };
export default api;
`;
    fs.writeFileSync(axiosInstancePath, sessionAxios);
  }

  // Rewrite AuthContext.jsx
  const feContextDir = path.join(newFe, "src/context");
  fs.ensureDirSync(feContextDir);

  const sessionAuthContext = `import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { authApi } from "@/api/auth.api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const didBootstrap = useRef(false);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    const rehydrate = async () => {
      try {
        const response = await authApi.me();
        setUser(response.data?.user || null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    rehydrate();
  }, []);

  const login = useCallback(async ({ username, password }) => {
    const response = await authApi.login({ username, password });
    setUser(response.data.user);
    toast.success("Welcome back");
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), login, logout }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
`;
  fs.writeFileSync(path.join(feContextDir, "AuthContext.jsx"), sessionAuthContext);

  spinner.succeed("Frontend auth updated");

  // ── 11. Write seed script ──
  if (answers.seedAdmin) {
    spinner.start("Creating seed script...");
    fs.writeFileSync(path.join(newBe, "seed.js"), SESSION_SEED_SCRIPT);
    spinner.succeed("Seed script created");
  }

  // ── 12. Remove .loom metadata (exam projects don't use loom state) ──
  removeDir(path.join(projectRoot, ".loom"));
  removeDir(path.join(newBe, "__tests__"));
  removeDir(path.join(newBe, "node_modules"));

  // ── 13. Remove STARTER-KIT / TODO comments from key files ──
  spinner.start("Cleaning template comments...");
  const jsFiles = [];
  function collectJs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") collectJs(full);
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".jsx")) {
        jsFiles.push(full);
      }
    }
  }
  collectJs(projectRoot);
  for (const file of jsFiles) {
    let content = fs.readFileSync(file, "utf-8");
    const original = content;
    content = content.replace(/\/\/\s*STARTER-KIT:.*$/gm, "");
    content = content.replace(/\/\/\s*TODO:.*$/gm, "");
    content = content.replace(/\/\/\s*GUIDE:.*$/gm, "");
    if (content !== original) fs.writeFileSync(file, content);
  }
  spinner.succeed("Template comments cleaned");

  // ── 14. Done ──
  console.log("");
  console.log(chalk.green.bold(`  ✓  Project forged: ${folderName}`));
  console.log("");
  console.log(chalk.cyan("  Structure:"));
  console.log(chalk.dim(`    ${folderName}/`));
  console.log(chalk.dim(`      backend-project/`));
  console.log(chalk.dim(`        models/`));
  console.log(chalk.dim(`        controllers/`));
  console.log(chalk.dim(`        routes/`));
  console.log(chalk.dim(`        middleware/`));
  console.log(chalk.dim(`        server.js`));
  console.log(chalk.dim(`        seed.js`));
  console.log(chalk.dim(`      frontend-project/`));
  console.log("");
  console.log(chalk.cyan("  Auth:"));
  console.log(chalk.dim("    Session-based (express-session)"));
  console.log(chalk.dim("    Login with username + password (hashed via bcrypt)"));
  if (answers.seedAdmin) {
    console.log(chalk.dim("    Default: admin / admin123"));
  }
  console.log("");
  console.log(chalk.cyan("  Database:"));
  console.log(chalk.dim(`    Name: ${answers.dbName}`));
  console.log(chalk.dim("    Set MONGODB_URI in backend-project/.env"));
  console.log("");
  console.log(chalk.yellow("  Next steps:"));
  console.log(chalk.white(`    cd ${folderName}`));
  console.log(chalk.white("    Set MONGODB_URI in backend-project/.env"));
  console.log(chalk.white("    cd backend-project && node seed.js"));
  console.log(chalk.white("    cd backend-project && npm start"));
  console.log(chalk.white("    cd frontend-project && npm run dev"));
  console.log("");
}
