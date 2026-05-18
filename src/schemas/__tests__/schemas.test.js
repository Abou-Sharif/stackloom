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

  it("rejects an invalid field identifier", () => {
    const r = validateResourceDefinition({ name: "Product", fields: [{ name: "2bad" }] });
    expect(r.success).toBe(false);
    expect(r.issues.some((i) => i.includes("identifier"))).toBe(true);
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
});
