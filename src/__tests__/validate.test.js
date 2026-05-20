import { describe, it, expect } from "vitest";
import validateCmd from "../commands/validate.js";

describe("validate command", () => {
  it("should handle unknown scenario", async () => {
    let output = "";
    const reporter = {
      log: (m) => { output += m + "\n"; },
      error: (m) => { output += m + "\n"; },
    };
    const result = await validateCmd("nonexistent", { reporter, projectRoot: "/tmp" });
    expect(output).toMatch(/Unknown checklist/i);
  });

  it("should handle empty project directory", async () => {
    let output = "";
    const reporter = {
      log: (m) => { output += m + "\n"; },
      error: (m) => { output += m + "\n"; },
    };
    const result = await validateCmd("payroll", { reporter, projectRoot: "/tmp" });
    expect(output).toMatch(/Backend not detected/i);
    expect(output).toMatch(/Frontend not detected/i);
    expect(result).toBeDefined();
  });

  it("should handle project with backend only", async () => {
    const projectRoot = "/tmp/validate-test-backend";
    const fs = await import("fs");
    const path = await import("path");

    fs.mkdirSync(path.join(projectRoot, "backend"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "backend", "package.json"), JSON.stringify({ name: "test" }));
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "employee", "models"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "employee", "controllers"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "employee", "routes"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "utils", "validators"), { recursive: true });

    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "employee", "models", "Employee.js"),
      [
        "const mongoose = require('mongoose');",
        "const EmployeeSchema = new mongoose.Schema({",
        "  firstName: { type: String, required: true },",
        "  lastName: { type: String, required: true },",
        "  email: { type: String, required: true, unique: true },",
        "  position: { type: String },",
        "  salary: { type: Number, required: true },",
        "  hireDate: { type: Date },",
        "  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },",
        "}, { timestamps: true, toJSON: { virtuals: true } });",
        "module.exports = mongoose.model('Employee', EmployeeSchema);",
      ].join("\n"),
    );

    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "employee", "controllers", "Employee.controller.js"),
      "module.exports = {};",
    );
    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "employee", "routes", "Employee.routes.js"),
      "module.exports = {};",
    );
    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "utils", "validators", "Employee.validator.js"),
      "module.exports = {};",
    );

    let output = "";
    const reporter = {
      log: (m) => { output += m + "\n"; },
      error: (m) => { output += m + "\n"; },
    };
    const result = await validateCmd("payroll", { reporter, projectRoot });
    expect(output).toMatch(/Found 1 model/);
    const empEntity = result.entityResults.find((e) => e.name === "Employee");
    expect(empEntity.matched).toBe(true);
    expect(empEntity.missingFields.length).toBe(0);
    expect(output).toMatch(/Controller/);
  });

  it("should handle malformed model files gracefully", async () => {
    const projectRoot = "/tmp/validate-test-malformed";
    const fs = await import("fs");
    const path = await import("path");

    fs.mkdirSync(path.join(projectRoot, "backend"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "backend", "package.json"), JSON.stringify({ name: "test" }));
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "x", "models"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "x", "models", "Broken.js"),
      "this is not valid javascript {{{",
    );

    let output = "";
    const reporter = {
      log: (m) => { output += m + "\n"; },
      error: (m) => { output += m + "\n"; },
    };
    const result = await validateCmd("payroll", { reporter, projectRoot });
    expect(result.entityResults.length).toBe(4);
    expect(result.entityResults.every((e) => !e.matched)).toBe(true);
    expect(result.entityResults[0].missingFields.length).toBeGreaterThan(0);
  });

  it("should match entities with loosely equivalent field names", async () => {
    const projectRoot = "/tmp/validate-test-aliases";
    const fs = await import("fs");
    const path = await import("path");

    fs.mkdirSync(path.join(projectRoot, "backend"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "backend", "package.json"), JSON.stringify({ name: "test" }));
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "staff", "models"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "staff", "models", "Staff.js"),
      [
        "const mongoose = require('mongoose');",
        "const StaffSchema = new mongoose.Schema({",
        "  fullName: { type: String, required: true },",
        "  mail: { type: String, required: true },",
        "  telephone: { type: String },",
        "  role: { type: String },",
        "  totalPay: { type: Number },",
        "  startDate: { type: Date },",
        "  dept: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },",
        "}, { timestamps: true });",
        "module.exports = mongoose.model('Staff', StaffSchema);",
      ].join("\n"),
    );

    let output = "";
    const reporter = {
      log: (m) => { output += m + "\n"; },
      error: (m) => { output += m + "\n"; },
    };
    const result = await validateCmd("payroll", { reporter, projectRoot });
    const empEntity = result.entityResults.find((e) => e.name === "Employee");
    expect(empEntity.matched).toBe(true);
    // 4 of 7 Employee fields match via aliases (fullName↔firstName/lastName, mail↔email, role↔position, totalPay↔salary)
    // Some fields like hireDate/startDate and department/dept need closer naming
    expect(empEntity.missingFields.length).toBeLessThanOrEqual(5);
    expect(empEntity.matchScore).toBeGreaterThanOrEqual(0.4);
  });

  it("should handle project with all backend and frontend files", async () => {
    const projectRoot = "/tmp/validate-test-complete";
    const fs = await import("fs");
    const path = await import("path");

    fs.mkdirSync(path.join(projectRoot, "backend"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "backend", "package.json"), JSON.stringify({ name: "test" }));
    fs.mkdirSync(path.join(projectRoot, "frontend", "src"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "frontend", "src", "main.jsx"), "import React from 'react';");

    const entity = { name: "Timesheet", fields: ["date", "hoursWorked", "overtime", "description", "status", "employee"] };
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "timesheet", "models"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "timesheet", "controllers"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "modules", "timesheet", "routes"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "backend", "src", "utils", "validators"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "frontend", "src", "pages", "admin", "timesheet"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "frontend", "src", "components", "tables"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "frontend", "src", "components", "forms"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "frontend", "src", "api"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "frontend", "src", "hooks"), { recursive: true });

    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "timesheet", "models", "Timesheet.js"),
      [
        "const mongoose = require('mongoose');",
        "const TimesheetSchema = new mongoose.Schema({",
        "  date: { type: Date, required: true },",
        "  hoursWorked: { type: Number, required: true },",
        "  overtime: { type: Number },",
        "  description: { type: String },",
        "  status: { type: String },",
        "  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },",
        "}, { timestamps: true });",
        "module.exports = mongoose.model('Timesheet', TimesheetSchema);",
      ].join("\n"),
    );

    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "timesheet", "controllers", "Timesheet.controller.js"),
      "x",
    );
    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "modules", "timesheet", "routes", "Timesheet.routes.js"),
      "x",
    );
    fs.writeFileSync(
      path.join(projectRoot, "backend", "src", "utils", "validators", "Timesheet.validator.js"),
      "x",
    );
    fs.writeFileSync(
      path.join(projectRoot, "frontend", "src", "pages", "admin", "timesheet", "ListPage.jsx"),
      "x",
    );
    fs.writeFileSync(
      path.join(projectRoot, "frontend", "src", "components", "tables", "TimesheetTable.jsx"),
      "x",
    );
    fs.writeFileSync(
      path.join(projectRoot, "frontend", "src", "components", "forms", "TimesheetForm.jsx"),
      "x",
    );
    fs.writeFileSync(
      path.join(projectRoot, "frontend", "src", "api", "timesheet.api.js"),
      "x",
    );

    let output = "";
    const reporter = {
      log: (m) => { output += m + "\n"; },
      error: (m) => { output += m + "\n"; },
    };
    const result = await validateCmd("payroll", { reporter, projectRoot });
    expect(result.entityResults.length).toBe(4);
    const tsEntity = result.entityResults.find((e) => e.name === "Timesheet");
    expect(tsEntity.matched).toBe(true);
    expect(tsEntity.missingFields.length).toBe(0);
  });
});
