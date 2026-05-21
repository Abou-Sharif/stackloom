import { describe, it, expect } from "vitest";
import {
  parseFieldSpec,
  parseRelationsSpec,
  ResourceDefinition,
  FieldDefinition,
} from "../core/resource-definition.js";
import { validateResourceDefinition } from "../schemas/resource.js";
import { validateGenerateOptions } from "../schemas/options.js";
import { pluralize } from "../utils/namingUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// PLURALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("pluralize", () => {
  it("handles regular nouns: add s", () => {
    expect(pluralize("Employee")).toBe("Employees");
    expect(pluralize("Department")).toBe("Departments");
    expect(pluralize("Product")).toBe("Products");
    expect(pluralize("Ticket")).toBe("Tickets");
    expect(pluralize("Route")).toBe("Routes");
    expect(pluralize("Service")).toBe("Services");
  });

  it("handles nouns ending in s, x, z, ch, sh: add es", () => {
    expect(pluralize("Address")).toBe("Addresses");
    expect(pluralize("Box")).toBe("Boxes");
    expect(pluralize("Quiz")).toBe("Quizzes");
    expect(pluralize("Church")).toBe("Churches");
    expect(pluralize("Bush")).toBe("Bushes");
    expect(pluralize("Status")).toBe("Statuses");
  });

  it("handles consonant + y -> ies", () => {
    expect(pluralize("salary")).toBe("salaries");
    expect(pluralize("category")).toBe("categories");
    expect(pluralize("company")).toBe("companies");
    expect(pluralize("query")).toBe("queries");
    expect(pluralize("history")).toBe("histories");
    expect(pluralize("Salary")).toBe("Salaries");
    expect(pluralize("Category")).toBe("Categories");
  });

  it("preserves PascalCase in irregular plurals", () => {
    expect(pluralize("Salary")).toBe("Salaries");
    expect(pluralize("Person")).toBe("People");
    expect(pluralize("Child")).toBe("Children");
    expect(pluralize("Woman")).toBe("Women");
    expect(pluralize("Analysis")).toBe("Analyses");
  });

  it("handles irregular plurals", () => {
    expect(pluralize("person")).toBe("people");
    expect(pluralize("child")).toBe("children");
    expect(pluralize("woman")).toBe("women");
    expect(pluralize("man")).toBe("men");
    expect(pluralize("mouse")).toBe("mice");
    expect(pluralize("goose")).toBe("geese");
    expect(pluralize("ox")).toBe("oxen");
  });

  it("handles f/fe -> ves", () => {
    expect(pluralize("leaf")).toBe("leaves");
    expect(pluralize("knife")).toBe("knives");
    expect(pluralize("life")).toBe("lives");
    expect(pluralize("half")).toBe("halves");
    expect(pluralize("shelf")).toBe("shelves");
    expect(pluralize("wolf")).toBe("wolves");
  });

  it("handles uncountable nouns", () => {
    expect(pluralize("equipment")).toBe("equipment");
    expect(pluralize("information")).toBe("information");
    expect(pluralize("rice")).toBe("rice");
    expect(pluralize("money")).toBe("money");
    expect(pluralize("species")).toBe("species");
    expect(pluralize("fish")).toBe("fish");
    expect(pluralize("sheep")).toBe("sheep");
    expect(pluralize("data")).toBe("data");
  });

  it("handles compound words", () => {
    expect(pluralize("StockMovement")).toBe("StockMovements");
    expect(pluralize("stock-movement")).toBe("stock-movements");
  });

  it("handles vowel+o -> s", () => {
    expect(pluralize("studio")).toBe("studios");
    expect(pluralize("portfolio")).toBe("portfolios");
  });

  it("handles consonant+o -> es (heroes)", () => {
    expect(pluralize("hero")).toBe("heroes");
    expect(pluralize("echo")).toBe("echoes");
  });

  it("handles common o-ending exceptions", () => {
    expect(pluralize("photo")).toBe("photos");
    expect(pluralize("piano")).toBe("pianos");
    expect(pluralize("memo")).toBe("memos");
  });

  it("handles is -> es (analysis -> analyses)", () => {
    expect(pluralize("analysis")).toBe("analyses");
    expect(pluralize("thesis")).toBe("theses");
    expect(pluralize("crisis")).toBe("crises");
    expect(pluralize("axis")).toBe("axes");
  });

  it("handles um -> a (datum -> data)", () => {
    expect(pluralize("datum")).toBe("data");
    expect(pluralize("medium")).toBe("media");
    expect(pluralize("addendum")).toBe("addenda");
  });

  it("handles on -> a (criterion -> criteria)", () => {
    expect(pluralize("criterion")).toBe("criteria");
    expect(pluralize("phenomenon")).toBe("phenomena");
  });

  it("handles ix -> ices (index -> indices)", () => {
    expect(pluralize("index")).toBe("indices");
    expect(pluralize("appendix")).toBe("appendices");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BELONGSTO RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseRelationsSpec — belongsTo", () => {
  it("parses a single belongsTo relation (3 parts)", () => {
    const r = parseRelationsSpec("employee:belongsTo:Employee");
    expect(r).not.toBeNull();
    expect(r.belongsTo).toHaveLength(1);
    expect(r.belongsTo[0]).toEqual({ field: "employee", model: "Employee" });
    expect(r.hasMany).toBeUndefined();
  });

  it("parses multiple belongsTo relations", () => {
    const r = parseRelationsSpec("employee:belongsTo:Employee;department:belongsTo:Department");
    expect(r.belongsTo).toHaveLength(2);
    expect(r.belongsTo[0].field).toBe("employee");
    expect(r.belongsTo[1].field).toBe("department");
  });

  it("parses mixed belongsTo + hasMany", () => {
    const r = parseRelationsSpec("employee:belongsTo:Employee;orders:hasMany:Order:customerId");
    expect(r.belongsTo).toHaveLength(1);
    expect(r.hasMany).toHaveLength(1);
    expect(r.belongsTo[0].field).toBe("employee");
    expect(r.hasMany[0].field).toBe("orders");
  });

  it("rejects belongsTo with wrong number of parts", () => {
    expect(() => parseRelationsSpec("employee:belongsTo:Employee:extra")).toThrow(/belongsTo|4 parts/i);
  });

  it("rejects belongsTo with invalid field name", () => {
    expect(() => parseRelationsSpec("123employee:belongsTo:Employee")).toThrow(/Invalid field name/i);
  });

  it("rejects belongsTo with non-PascalCase model", () => {
    expect(() => parseRelationsSpec("employee:belongsTo:employee")).toThrow(/PascalCase/i);
  });

  it("rejects belongsTo with unknown kind", () => {
    expect(() => parseRelationsSpec("employee:owns:Employee")).toThrow(/belongsTo|hasMany/i);
  });

  it("detects duplicate field names across belongsTo and hasMany", () => {
    expect(() =>
      parseRelationsSpec("employee:belongsTo:Employee;employee:hasMany:Task:employeeId"),
    ).toThrow(/Duplicate/i);
  });
});

describe("ResourceDefinition with belongsTo", () => {
  it("stores belongsTo relations", () => {
    const rd = new ResourceDefinition({
      name: "Salary",
      fields: [{ name: "amount", type: "number" }],
      relations: { belongsTo: [{ field: "employee", model: "Employee" }] },
    });
    expect(rd.relations.belongsTo).toHaveLength(1);
    expect(rd.relations.belongsTo[0].field).toBe("employee");
  });

  it("stores both belongsTo and hasMany", () => {
    const rd = new ResourceDefinition({
      name: "Employee",
      fields: [{ name: "name", type: "string" }],
      relations: {
        belongsTo: [{ field: "department", model: "Department" }],
        hasMany: [{ field: "tasks", model: "Task", foreignKey: "employeeId" }],
      },
    });
    expect(rd.relations.belongsTo).toHaveLength(1);
    expect(rd.relations.hasMany).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD DEFINITION — REF FIELDS
// ═══════════════════════════════════════════════════════════════════════════════

describe("FieldDefinition — ref fields", () => {
  it("generates ObjectId mongoose type for ref", () => {
    const f = new FieldDefinition({
      name: "employee",
      type: "ref",
      special: { model: "Employee" },
    });
    expect(f.mongooseType).toBe("mongoose.Schema.Types.ObjectId");
    expect(f.mongooseDef).toContain("ref: 'Employee'");
  });

  it("generates ObjectId mongoose type for reference", () => {
    const f = new FieldDefinition({
      name: "department",
      type: "reference",
      special: { model: "Department" },
    });
    expect(f.mongooseType).toBe("mongoose.Schema.Types.ObjectId");
    expect(f.mongooseDef).toContain("ref: 'Department'");
  });

  it("generates required Joi rule for ref", () => {
    const f = new FieldDefinition({
      name: "employee",
      type: "ref",
      validation: { required: true },
      special: { model: "Employee" },
    });
    expect(f.joiRule).toContain("hex().length(24)");
    expect(f.joiRule).toContain("required()");
  });

  it("generates optional Joi rule for ref", () => {
    const f = new FieldDefinition({
      name: "employee",
      type: "ref",
      special: { model: "Employee" },
    });
    expect(f.joiRule).toContain("allow(null, '').optional()");
  });

  it("form input type is select for ref", () => {
    const f = new FieldDefinition({ name: "e", type: "ref" });
    expect(f.formInputType).toBe("select");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE DEFINITION — NAMING & DERIVED PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════════

describe("ResourceDefinition — naming", () => {
  const cases = [
    { name: "Salary", pascal: "Salary", camel: "salary", kebab: "salary", pluralKebab: "salaries", pluralPascal: "Salaries" },
    { name: "Person", pascal: "Person", camel: "person", kebab: "person", pluralKebab: "people", pluralPascal: "People" },
    { name: "Address", pascal: "Address", camel: "address", kebab: "address", pluralKebab: "addresses", pluralPascal: "Addresses" },
    { name: "Category", pascal: "Category", camel: "category", kebab: "category", pluralKebab: "categories", pluralPascal: "Categories" },
    { name: "StockMovement", pascal: "StockMovement", camel: "stockMovement", kebab: "stock-movement", pluralKebab: "stock-movements", pluralPascal: "StockMovements" },
    { name: "Employee", pascal: "Employee", camel: "employee", kebab: "employee", pluralKebab: "employees", pluralPascal: "Employees" },
    { name: "Child", pascal: "Child", camel: "child", kebab: "child", pluralKebab: "children", pluralPascal: "Children" },
    { name: "Analysis", pascal: "Analysis", camel: "analysis", kebab: "analysis", pluralKebab: "analyses", pluralPascal: "Analyses" },
  ];

  cases.forEach(({ name, pascal, camel, kebab, pluralKebab, pluralPascal }) => {
    it(`${name}: pascal=${pascal}, camel=${camel}, kebab=${kebab}, plural=${pluralKebab}`, () => {
      const r = new ResourceDefinition({ name });
      expect(r.pascalName).toBe(pascal);
      expect(r.camelName).toBe(camel);
      expect(r.kebabName).toBe(kebab);
      expect(r.pluralKebab).toBe(pluralKebab);
      expect(r.pluralPascal).toBe(pluralPascal);
    });
  });

  it("snakeName converts camelCase to snake_case", () => {
    const r = new ResourceDefinition({ name: "StockMovement" });
    expect(r.snakeName).toBe("stock_movement");
  });

  it("hasTimestamps is always true", () => {
    const r = new ResourceDefinition({ name: "Test" });
    expect(r.hasTimestamps).toBe(true);
  });

  it("hasSoftDelete reflects feature flag", () => {
    const without = new ResourceDefinition({ name: "Test" });
    expect(without.hasSoftDelete).toBe(false);
    const withSd = new ResourceDefinition({ name: "Test", features: { softDelete: true } });
    expect(withSd.hasSoftDelete).toBe(true);
  });

  it("hasAuth defaults to true", () => {
    const r = new ResourceDefinition({ name: "Test" });
    expect(r.hasAuth).toBe(true);
    const r2 = new ResourceDefinition({ name: "Test", features: { auth: false } });
    expect(r2.hasAuth).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE VALIDATION — CROSS-FIELD CONTRADICTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateResourceDefinition — cross-field contradictions", () => {
  it("rejects min > max on number fields", () => {
    const r = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "age", type: "number", validation: { min: 50, max: 10 } }],
    });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("min") && i.includes("max"))).toBe(true);
  });

  it("rejects minLength > maxLength on string fields", () => {
    const r = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "code", type: "string", validation: { minLength: 20, maxLength: 5 } }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts valid min/max constraints", () => {
    const r = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "age", type: "number", validation: { min: 10, max: 50 } }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts min without max", () => {
    const r = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "age", type: "number", validation: { min: 18 } }],
    });
    expect(r.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCAFFOLD SCENARIO VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("scaffold scenarios — full validation", () => {
  const scenarios = {
    payroll: [
      { name: "Department", fields: "name:string:required;code:string:required|unique;description:text;budget:number;head:ref[Employee];isActive:boolean" },
      { name: "Employee", fields: "firstName:string:required;lastName:string:required;email:email:required|unique;position:string;salary:number:required;hireDate:date;department:ref[Department]:required" },
      { name: "Timesheet", fields: "employee:ref[Employee]:required;date:date:required;hoursWorked:number:required;overtimeHours:number;description:text" },
      { name: "Payroll", fields: "employee:ref[Employee]:required;periodStart:date:required;periodEnd:date:required;grossPay:number:required;deductions:number;netPay:number:required;status:select[pending,processed,paid];processedDate:date;notes:text" },
    ],
    parking: [
      { name: "Slot", fields: "label:string:required;floor:number;type:select[standard,vip,ev,disabled];rate:number:required;isAvailable:boolean;features:text" },
      { name: "Vehicle", fields: "licensePlate:string:required|unique;make:string;model:string;color:string;type:select[car,motorcycle,suv,truck];ownerName:string;ownerPhone:phone;ownerEmail:email" },
      { name: "Ticket", fields: "slot:ref[Slot]:required;vehicle:ref[Vehicle]:required;entryTime:datetime:required;exitTime:datetime;totalAmount:number;status:select[active,completed,cancelled];notes:text" },
      { name: "Payment", fields: "ticket:ref[Ticket]:required;amount:number:required;method:select[cash,card,mobile];reference:string;paidAt:datetime;status:select[pending,completed,failed]" },
    ],
    inventory: [
      { name: "Category", fields: "name:string:required;description:text;slug:string:required|unique;image:image;isActive:boolean" },
      { name: "Product", fields: "name:string:required;description:text;price:number:required;category:ref[Category]:required;sku:string:required|unique;stock:number;image:image;isActive:boolean" },
      { name: "Supplier", fields: "name:string:required;contactName:string;email:email;phone:phone;address:text;isActive:boolean" },
      { name: "StockMovement", fields: "product:ref[Product]:required;supplier:ref[Supplier];type:select[in,out,adjustment]:required;quantity:number:required;reason:text;reference:string" },
    ],
    booking: [
      { name: "Customer", fields: "name:string:required;email:email:required;phone:phone;preferences:text;isVIP:boolean" },
      { name: "Service", fields: "name:string:required;description:text;duration:number:required;price:number:required;category:string;isActive:boolean" },
      { name: "Booking", fields: "customer:ref[Customer]:required;service:ref[Service]:required;date:datetime:required;status:select[pending,confirmed,cancelled,completed]:required;notes:text;totalAmount:number" },
    ],
    delivery: [
      { name: "Driver", fields: "name:string:required;email:email:required;phone:phone:required;licenseNumber:string:required|unique;isActive:boolean" },
      { name: "Route", fields: "name:string:required;description:text;stops:number;totalDistance:number;isActive:boolean" },
      { name: "Package", fields: "trackingNumber:string:required|unique;weight:number;dimensions:text;contents:text;status:select[pending,in_transit,delivered,failed]" },
      { name: "Order", fields: "driver:ref[Driver];route:ref[Route];package:ref[Package]:required;pickupAddress:text:required;deliveryAddress:text:required;scheduledDate:datetime;status:select[pending,assigned,in_transit,delivered,cancelled]" },
    ],
  };

  Object.entries(scenarios).forEach(([scenario, resources]) => {
    describe(scenario, () => {
      resources.forEach(({ name, fields }) => {
        it(`${name} validates successfully`, () => {
          const parsed = fields.split(";").map((s) => s.trim()).filter(Boolean).map((f) => parseFieldSpec(f));
          const raw = { name, fields: parsed };
          const r = validateResourceDefinition(raw);
          if (!r.success) {
            console.log(`  ${name} issues:`, r.issues);
          }
          expect(r.success).toBe(true);
        });
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE DEFINITION — INDEX GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("ResourceDefinition — indexes", () => {
  it("generates text index for text fields", () => {
    const rd = new ResourceDefinition({
      name: "Product",
      fields: [
        { name: "name", type: "string" },
        { name: "description", type: "text" },
        { name: "body", type: "richtext" },
      ],
    });
    const idxs = rd.indexes;
    const textIndexes = idxs.filter((i) => Object.values(i).includes("text"));
    expect(textIndexes.length).toBe(2);
  });

  it("generates unique index for unique fields", () => {
    const rd = new ResourceDefinition({
      name: "Product",
      fields: [
        { name: "sku", type: "string", validation: { unique: true } },
        { name: "email", type: "email", validation: { unique: true } },
      ],
    });
    const idxs = rd.indexes;
    expect(idxs.filter((i) => i.unique === true).length).toBe(2);
  });

  it("generates no indexes for basic fields", () => {
    const rd = new ResourceDefinition({
      name: "Product",
      fields: [{ name: "name", type: "string" }],
    });
    expect(rd.indexes).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIONS VALIDATION — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("validateGenerateOptions — edge cases", () => {
  it("accepts --preview flag", () => {
    const r = validateGenerateOptions({ preview: true });
    expect(r.success).toBe(true);
  });

  it("accepts --dry-run flag", () => {
    const r = validateGenerateOptions({ dryRun: true });
    expect(r.success).toBe(true);
  });

  it("accepts --json flag", () => {
    const r = validateGenerateOptions({ json: true });
    expect(r.success).toBe(true);
  });

  it("accepts --quiet flag", () => {
    const r = validateGenerateOptions({ quiet: true });
    expect(r.success).toBe(true);
  });

  it("accepts --yes flag", () => {
    const r = validateGenerateOptions({ yes: true });
    expect(r.success).toBe(true);
  });

  it("validates belongsTo in --relations", () => {
    const r = validateGenerateOptions({ relations: "employee:belongsTo:Employee" });
    expect(r.success).toBe(true);
  });

  it("validates mixed belongsTo + hasMany in --relations", () => {
    const r = validateGenerateOptions({
      relations: "employee:belongsTo:Employee;tasks:hasMany:Task:employeeId",
    });
    expect(r.success).toBe(true);
  });

  it("rejects --relations with only 2 parts", () => {
    const r = validateGenerateOptions({ relations: "employee:belongsTo" });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD DEFINITION — ALL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe("FieldDefinition — all field types", () => {
  const types = [
    { type: "string", mongoose: "String", formInput: "text" },
    { type: "text", mongoose: "String", formInput: "textarea" },
    { type: "number", mongoose: "Number", formInput: "number" },
    { type: "boolean", mongoose: "Boolean", formInput: "checkbox" },
    { type: "date", mongoose: "Date", formInput: "date" },
    { type: "datetime", mongoose: "Date", formInput: "datetime-local" },
    { type: "email", mongoose: "String", formInput: "email" },
    { type: "phone", mongoose: "String", formInput: "tel" },
    { type: "url", mongoose: "String", formInput: "url" },
    { type: "password", mongoose: "String", formInput: "password" },
    { type: "color", mongoose: "String", formInput: "color" },
    { type: "image", mongoose: "String", formInput: "image-upload" },
    { type: "file", mongoose: "String", formInput: "file" },
    { type: "select", mongoose: "String", formInput: "select" },
    { type: "multiselect", mongoose: "Array", formInput: "multiselect" },
    { type: "ref", mongoose: "mongoose.Schema.Types.ObjectId", formInput: "select" },
    { type: "range", mongoose: "Number", formInput: "range" },
    { type: "time", mongoose: "String", formInput: "time" },
  ];

  types.forEach(({ type, mongoose, formInput }) => {
    it(`${type}: mongoose=${mongoose}, formInput=${formInput}`, () => {
      const f = new FieldDefinition({ name: "field", type });
      expect(f.mongooseType).toBe(mongoose);
      expect(f.formInputType).toBe(formInput);
    });
  });
});

describe("FieldDefinition — validation rules", () => {
  it("generates min/max for number", () => {
    const f = new FieldDefinition({
      name: "age",
      type: "number",
      validation: { min: 18, max: 120 },
    });
    expect(f.mongooseDef).toContain("min: 18");
    expect(f.mongooseDef).toContain("max: 120");
    expect(f.joiRule).toContain(".min(18)");
    expect(f.joiRule).toContain(".max(120)");
  });

  it("generates minLength/maxLength for string", () => {
    const f = new FieldDefinition({
      name: "code",
      type: "string",
      validation: { minLength: 2, maxLength: 50 },
    });
    expect(f.mongooseDef).toContain("minLength: 2");
    expect(f.mongooseDef).toContain("maxLength: 50");
  });

  it("generates pattern for string", () => {
    const f = new FieldDefinition({
      name: "code",
      type: "string",
      validation: { pattern: "/^[A-Z]{3}$/" },
    });
    expect(f.mongooseDef).toContain("match: /^[A-Z]{3}$/");
  });

  it("generates default values", () => {
    const f = new FieldDefinition({
      name: "status",
      type: "string",
      validation: { default: "active" },
    });
    expect(f.mongooseDef).toContain("default: 'active'");
  });

  it("generates numeric defaults", () => {
    const f = new FieldDefinition({
      name: "count",
      type: "number",
      validation: { default: 0 },
    });
    expect(f.mongooseDef).toContain("default: 0");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE FIELD SPEC — EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseFieldSpec — edge cases", () => {
  it("parses ref field with model from bracketed spec", () => {
    const f = parseFieldSpec("employee:ref[Employee]:required");
    expect(f.name).toBe("employee");
    expect(f.type).toBe("ref");
    expect(f.special.model).toBe("Employee");
    expect(f.validation.required).toBe(true);
  });

  it("parses reference as alias for ref", () => {
    const f = parseFieldSpec("dept:reference[Department]");
    expect(f.type).toBe("reference");
    expect(f.special.model).toBe("Department");
  });

  it("parses select with options", () => {
    const f = parseFieldSpec("status:select[active,inactive,pending]:required|default=active");
    expect(f.special.options).toEqual(["active", "inactive", "pending"]);
    expect(f.validation.required).toBe(true);
    expect(f.validation.default).toBe("active");
  });

  it("parses multiselect with options", () => {
    const f = parseFieldSpec("tags:multiselect[node,vue,react]");
    expect(f.special.options).toEqual(["node", "vue", "react"]);
  });

  it("parses image with upload config", () => {
    const f = parseFieldSpec("avatar:image[avatars;max=2mb]");
    expect(f.type).toBe("image");
    expect(f.special.upload).toBe("avatars");
    expect(f.special.maxSize).toBe("2mb");
  });

  it("parses image without max size", () => {
    const f = parseFieldSpec("avatar:image[photos]");
    expect(f.type).toBe("image");
    expect(f.special.upload).toBe("photos");
    expect(f.special.maxSize).toBeUndefined();
  });

  it("parses file with upload config", () => {
    const f = parseFieldSpec("resume:file[docs;max=10mb]");
    expect(f.type).toBe("file");
    expect(f.special.upload).toBe("docs");
    expect(f.special.maxSize).toBe("10mb");
  });

  it("parses rules from bracketed options with key=value", () => {
    const f = parseFieldSpec("price:number[min=0,max=9999]");
    expect(f.validation.min).toBe(0);
    expect(f.validation.max).toBe(9999);
  });

  it("parses pattern from bracketed options", () => {
    const f = parseFieldSpec("code:string[pattern=/^[A-Z]+$/]");
    expect(f.validation.pattern).toBe("/^[A-Z]+$/");
  });

  it("handles underscores in field names", () => {
    const f = parseFieldSpec("first_name:string:required");
    expect(f.name).toBe("first_name");
    expect(f.type).toBe("string");
  });

  it("handles dollar sign in field names", () => {
    const f = parseFieldSpec("$amount:number");
    expect(f.name).toBe("$amount");
  });

  it("returns null for completely empty input", () => {
    expect(parseFieldSpec()).toBeNull();
    expect(parseFieldSpec(null)).toBeNull();
    expect(parseFieldSpec(undefined)).toBeNull();
  });
});
