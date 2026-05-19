import { describe, it, expect } from "vitest";
import { validateResourceDefinition, validateGenerateOptions } from "../index.js";

describe("validateResourceDefinition", () => {
  it("accepts a valid definition and fills defaults", () => {
    const r = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "title", type: "string", validation: { required: true } }],
    });
    expect(r.success).toBe(true);
    expect(r.data.fields[0].type).toBe("string");
    expect(r.data.relations).toEqual({});
  });

  it("rejects a missing name", () => {
    const r = validateResourceDefinition({ fields: [] });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("name"))).toBe(true);
  });

  it("rejects a non-PascalCase name", () => {
    const r = validateResourceDefinition({ name: "product", fields: [] });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("PascalCase"))).toBe(true);
  });

  it("rejects an unknown field type", () => {
    const r = validateResourceDefinition({ name: "Product", fields: [{ name: "x", type: "wormhole" }] });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("type"))).toBe(true);
  });

  it("rejects duplicate field names", () => {
    const r = validateResourceDefinition({
      name: "Product",
      fields: [{ name: "title" }, { name: "title" }],
    });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("duplicate"))).toBe(true);
  });

  it("rejects ref field without target model", () => {
    const r = validateResourceDefinition({
      name: "Order",
      fields: [{ name: "customerId", type: "ref", special: {} }],
    });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("ref[") || i.includes("ref/reference"))).toBe(true);
  });

  it("accepts ref field with model in special", () => {
    const r = validateResourceDefinition({
      name: "Order",
      fields: [{ name: "customerId", type: "ref", special: { model: "Customer" } }],
    });
    expect(r.success).toBe(true);
  });

  it("validates relations.hasMany entries", () => {
    const bad = validateResourceDefinition({
      name: "Customer",
      fields: [{ name: "name", type: "string" }],
      relations: { hasMany: [{ field: "orders", model: "order", foreignKey: "x" }] },
    });
    expect(bad.success).toBe(false);

    const good = validateResourceDefinition({
      name: "Customer",
      fields: [{ name: "name", type: "string" }],
      relations: { hasMany: [{ field: "orders", model: "Order", foreignKey: "customerId" }] },
    });
    expect(good.success).toBe(true);
  });
});

describe("validateGenerateOptions", () => {
  it("accepts valid options", () => {
    expect(
      validateGenerateOptions({ arch: "moderate", formMode: "modal", recipe: "resource" }).success,
    ).toBe(true);
  });

  it("rejects unknown enum values", () => {
    expect(validateGenerateOptions({ arch: "extreme" }).success).toBe(false);
    expect(validateGenerateOptions({ formMode: "popover" }).success).toBe(false);
    expect(validateGenerateOptions({ recipe: "widget" }).success).toBe(false);
  });

  it("rejects mutually exclusive --fields and --file", () => {
    const r = validateGenerateOptions({ fields: "a:str", file: "x.js" });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("mutually exclusive"))).toBe(true);
  });

  it("rejects invalid --relations string", () => {
    const r = validateGenerateOptions({ relations: "only:three:parts" });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("--relations"))).toBe(true);
  });

  it("accepts valid --relations", () => {
    expect(validateGenerateOptions({ relations: "orders:hasMany:Order:customerId" }).success).toBe(
      true,
    );
  });
});
