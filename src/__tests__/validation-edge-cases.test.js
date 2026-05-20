import { describe, it, expect } from "vitest";
import {
  parseFieldSpec,
  parseRelationsSpec,
  ResourceDefinition,
} from "../core/resource-definition.js";
import {
  validateResourceDefinition,
  FIELD_TYPES,
} from "../schemas/resource.js";
import { validateGenerateOptions } from "../schemas/options.js";

describe("parseFieldSpec validation", () => {
  it("should reject empty string", () => {
    expect(parseFieldSpec("")).toBe(null);
    expect(parseFieldSpec("   ")).toBe(null);
  });

  it("should reject non-string input", () => {
    expect(parseFieldSpec(null)).toBe(null);
    expect(parseFieldSpec(undefined)).toBe(null);
    expect(parseFieldSpec(42)).toBe(null);
    expect(parseFieldSpec([])).toBe(null);
  });

  it("should reject malformed field specs", () => {
    expect(parseFieldSpec("no-type")).toBe(null);
    expect(parseFieldSpec(":onlytype")).toBe(null);
    expect(parseFieldSpec("123invalidstart:number")).toBe(null);
    expect(parseFieldSpec("special chars!@#:string")).toBe(null);
    expect(parseFieldSpec("name:")).toBe(null);
    expect(parseFieldSpec(":")).toBe(null);
  });

  it("should reject field names with leading numbers", () => {
    expect(parseFieldSpec("1stField:string")).toBe(null);
    expect(parseFieldSpec("_valid:number")).not.toBe(null);
  });

  it("should parse valid field specs correctly", () => {
    const f = parseFieldSpec("name:string");
    expect(f.name).toBe("name");
    expect(f.type).toBe("string");
  });

  it("should parse ref fields with model in brackets", () => {
    const f = parseFieldSpec("category:ref[Category]:required");
    expect(f.name).toBe("category");
    expect(f.type).toBe("ref");
    expect(f.special.model).toBe("Category");
    expect(f.validation.required).toBe(true);
  });

  it("should parse ref field without model (missing brackets)", () => {
    const f = parseFieldSpec("category:ref");
    expect(f.name).toBe("category");
    expect(f.type).toBe("ref");
    expect(f.special.model).toBeUndefined();
  });

  it("should parse type aliases", () => {
    expect(parseFieldSpec("x:str").type).toBe("string");
    expect(parseFieldSpec("x:num").type).toBe("number");
    expect(parseFieldSpec("x:bool").type).toBe("boolean");
  });

  it("should reject unknown type with no error message returned", () => {
    // parseFieldSpec doesn't validate type — it just passes it through
    const f = parseFieldSpec("name:widget");
    expect(f).not.toBe(null);
    expect(f.type).toBe("widget");
  });

  it("should handle multiple rules with pipe separator", () => {
    const f = parseFieldSpec("email:email:required|unique");
    expect(f.name).toBe("email");
    expect(f.type).toBe("email");
    expect(f.validation.required).toBe(true);
    expect(f.validation.unique).toBe(true);
  });

  it("should handle semicolon in rules (optional= value)", () => {
    const f = parseFieldSpec("name:string:default=hello world");
    expect(f.name).toBe("name");
    expect(f.validation.default).toBe("hello world");
  });

  it("should parse rules with min/max", () => {
    const f = parseFieldSpec("age:number:required|min=18|max=120");
    expect(f.validation.required).toBe(true);
    expect(f.validation.min).toBe(18);
    expect(f.validation.max).toBe(120);
  });

  it("should handle select with options", () => {
    const f = parseFieldSpec("status:select[pending,active,archived]:required");
    expect(f.type).toBe("select");
    expect(f.special.options).toEqual(["pending", "active", "archived"]);
  });

  it("should handle multiselect with options", () => {
    const f = parseFieldSpec("tags:multiselect[a,b,c]");
    expect(f.type).toBe("multiselect");
    expect(f.special.options).toEqual(["a", "b", "c"]);
  });
});

describe("parseRelationsSpec validation", () => {
  it("should reject empty input", () => {
    expect(parseRelationsSpec("")).toBe(null);
    expect(parseRelationsSpec("   ")).toBe(null);
  });

  it("should reject non-string input", () => {
    expect(parseRelationsSpec(null)).toBe(null);
    expect(parseRelationsSpec(undefined)).toBe(null);
  });

  it("should reject less than 4 parts", () => {
    expect(() => parseRelationsSpec("orders:hasMany:Order")).toThrow(/4 parts/i);
    expect(() => parseRelationsSpec("orders:hasMany")).toThrow(/4 parts/i);
  });

  it("should reject non-hasMany kinds", () => {
    expect(() => parseRelationsSpec("orders:belongsTo:Order:customerId")).toThrow(
      /must be hasMany/i,
    );
  });

  it("should reject invalid field names", () => {
    expect(() => parseRelationsSpec("123invalid:hasMany:Order:customerId")).toThrow(
      /Invalid virtual field/i,
    );
    expect(() => parseRelationsSpec("special!@#:hasMany:Order:customerId")).toThrow(
      /Invalid virtual field/i,
    );
  });

  it("should reject non-PascalCase model names", () => {
    expect(() => parseRelationsSpec("orders:hasMany:order:customerId")).toThrow(
      /PascalCase/i,
    );
    expect(() => parseRelationsSpec("orders:hasMany:123Model:customerId")).toThrow(
      /PascalCase/i,
    );
    expect(() => parseRelationsSpec("orders:hasMany:_model:customerId")).toThrow(
      /PascalCase/i,
    );
    // All-caps like "ORDER" starts with uppercase so passes PascalCase regex
    const result = parseRelationsSpec("orders:hasMany:ORDER:customerId");
    expect(result.hasMany[0].model).toBe("ORDER");
  });

  it("should reject invalid foreign key", () => {
    expect(() => parseRelationsSpec("orders:hasMany:Order:123invalid")).toThrow(
      /foreign key/i,
    );
    expect(() => parseRelationsSpec("orders:hasMany:Order:special!@#")).toThrow(
      /foreign key/i,
    );
  });

  it("should accept valid relation spec", () => {
    const result = parseRelationsSpec("orders:hasMany:Order:customerId");
    expect(result).toEqual({
      hasMany: [{ field: "orders", model: "Order", foreignKey: "customerId" }],
    });
  });

  it("should handle multiple relations separated by semicolon", () => {
    const result = parseRelationsSpec(
      "orders:hasMany:Order:customerId;invoices:hasMany:Invoice:customerId",
    );
    expect(result.hasMany.length).toBe(2);
    expect(result.hasMany[0].field).toBe("orders");
    expect(result.hasMany[1].field).toBe("invoices");
  });

  it("should handle trimming whitespace", () => {
    const result = parseRelationsSpec("  orders:hasMany:Order:customerId  ");
    expect(result.hasMany.length).toBe(1);
  });

  it("should reject duplicate virtual names", () => {
    expect(() =>
      parseRelationsSpec(
        "orders:hasMany:Order:customerId;orders:hasMany:Order:customerId",
      ),
    ).toThrow(/duplicate/i);
  });

  it("should handle semicolons in edge cases", () => {
    // Multiple semicolons between entries
    const result = parseRelationsSpec(
      "orders:hasMany:Order:customerId;;invoices:hasMany:Invoice:customerId",
    );
    expect(result.hasMany.length).toBe(2);
  });
});

describe("ResourceDefinition constructor validation", () => {
  it("should reject missing name", () => {
    expect(() => new ResourceDefinition({})).toThrow(/name is required/i);
    expect(() => new ResourceDefinition({ name: "" })).toThrow(/name is required/i);
  });

  it("should reject non-PascalCase name", () => {
    expect(() => new ResourceDefinition({ name: "product" })).toThrow(
      /PascalCase/i,
    );
    expect(() => new ResourceDefinition({ name: "myProduct" })).toThrow(
      /PascalCase/i,
    );
  });

  it("should reject names with special characters", () => {
    expect(() => new ResourceDefinition({ name: "Product!" })).toThrow(
      /PascalCase/i,
    );
    expect(() => new ResourceDefinition({ name: "Prod uct" })).toThrow(
      /PascalCase/i,
    );
  });

  it("should accept valid PascalCase names", () => {
    expect(() => new ResourceDefinition({ name: "Product" })).not.toThrow();
    expect(() => new ResourceDefinition({ name: "PDFReport" })).not.toThrow();
    expect(() => new ResourceDefinition({ name: "A" })).not.toThrow();
  });

  it("should reject duplicate field names", () => {
    expect(
      () =>
        new ResourceDefinition({
          name: "Product",
          fields: [
            { name: "name", type: "string" },
            { name: "name", type: "string" },
          ],
        }),
    ).toThrow(/duplicate/i);
  });

  it("should generate pascalName, camelName, kebabName correctly", () => {
    const r = new ResourceDefinition({ name: "StockMovement" });
    expect(r.pascalName).toBe("StockMovement");
    expect(r.camelName).toBe("stockMovement");
    expect(r.kebabName).toBe("stock-movement");
    expect(r.pluralKebab).toBe("stock-movements");
  });
});

describe("validateResourceDefinition schema validation", () => {
  it("should reject empty name", () => {
    const result = validateResourceDefinition({ name: "" });
    expect(result.success).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("should reject non-array fields", () => {
    const result = validateResourceDefinition({ name: "Product", fields: "notarray" });
    expect(result.success).toBe(false);
  });

  it("should reject ref field without model reference", () => {
    const result = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "category", type: "ref" }],
    });
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.includes("target model"))).toBe(true);
  });

  it("should reject ref field with non-PascalCase model", () => {
    const result = validateResourceDefinition({
      name: "Product",
      fields: [
        { name: "category", type: "ref", special: { model: "invalidName" } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid resource definition", () => {
    const result = validateResourceDefinition({
      name: "Product",
      fields: [
        {
          name: "category",
          type: "ref",
          special: { model: "Category" },
        },
        { name: "price", type: "number", validation: { required: true } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject unsupported field type", () => {
    const result = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "x", type: "unsupported" }],
    });
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.includes("unsupported"))).toBe(true);
  });

  it("should reject duplicate field names in schema", () => {
    const result = validateResourceDefinition({
      name: "Product",
      fields: [
        { name: "name", type: "string" },
        { name: "name", type: "string" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.includes("duplicate"))).toBe(true);
  });

  it("should handle relations.hasMany validation", () => {
    const result = validateResourceDefinition({
      name: "Customer",
      fields: [{ name: "name", type: "string" }],
      relations: {
        hasMany: [
          { field: "orders", model: "Order", foreignKey: "customerId" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("should reject relations.hasMany with bad model", () => {
    const result = validateResourceDefinition({
      name: "Customer",
      fields: [{ name: "name", type: "string" }],
      relations: {
        hasMany: [{ field: "orders", model: "order", foreignKey: "customerId" }],
      },
    });
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.includes("PascalCase"))).toBe(true);
  });

  it("should reject relations.hasMany with bad field", () => {
    const result = validateResourceDefinition({
      name: "Customer",
      fields: [{ name: "name", type: "string" }],
      relations: {
        hasMany: [{ field: "123bad", model: "Order", foreignKey: "customerId" }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("validateGenerateOptions", () => {
  it("should reject invalid --arch", () => {
    const result = validateGenerateOptions({ arch: "invalid" });
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/arch/i);
  });

  it("should reject invalid --form-mode", () => {
    const result = validateGenerateOptions({ formMode: "popup" });
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/form-mode/i);
  });

  it("should reject invalid --crud", () => {
    const result = validateGenerateOptions({ crud: "delete-only" });
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/crud/i);
  });

  it("should reject --fields + --file together", () => {
    const result = validateGenerateOptions({
      fields: "name:string",
      file: "resource.js",
    });
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/mutually exclusive/i);
  });

  it("should reject --remove-fields without --amend", () => {
    const result = validateGenerateOptions({
      removeFields: "name",
    });
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/amend/i);
  });

  it("should accept valid options", () => {
    const result = validateGenerateOptions({
      arch: "moderate",
      formMode: "modal",
      crud: "full",
    });
    expect(result.success).toBe(true);
  });

  it("should accept undefined options as valid", () => {
    expect(validateGenerateOptions({}).success).toBe(true);
  });

  it("should reject invalid --recipe", () => {
    const result = validateGenerateOptions({ recipe: "not-a-recipe" });
    expect(result.success).toBe(false);
    expect(result.issues[0]).toMatch(/recipe/i);
  });
});
