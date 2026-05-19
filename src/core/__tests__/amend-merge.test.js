import { describe, it, expect } from "vitest";
import {
  mergeAmendContent,
  mergeModelCustomZone,
  mergeFieldLists,
  removeFieldsFromList,
  auditAmendSafety,
  formatAmendSafetyError,
} from "../amend-merge.js";

describe("mergeModelCustomZone", () => {
  const incoming = `const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema({ name: String, sku: String });

// ✎ CUSTOM CODE ZONE — YOUR CODE HERE

module.exports = mongoose.model('Product', ProductSchema);
`;

  it("preserves custom tail while updating schema head", () => {
    const existing = `const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema({ name: String });

// ✎ CUSTOM CODE ZONE — YOUR CODE HERE
ProductSchema.methods.tag = function () { return this.name; };

module.exports = mongoose.model('Product', ProductSchema);
`;
    const merged = mergeModelCustomZone(existing, incoming);
    expect(merged).toContain("sku: String");
    expect(merged).toContain("ProductSchema.methods.tag");
    expect(merged).not.toMatch(/name: String,\s*\n\s*\}/);
  });
});

describe("mergeAmendContent", () => {
  it("throws on unmarked file without force", () => {
    expect(() =>
      mergeAmendContent({
        existing: "export const x = 1;\n// hand written",
        incoming: "export const x = 2;",
        relPath: "frontend/src/components/forms/ProductForm.jsx",
        force: false,
      }),
    ).toThrow(/Cannot amend/);
  });

  it("replaces unmarked file with force", () => {
    const r = mergeAmendContent({
      existing: "old",
      incoming: "new",
      relPath: "frontend/src/components/forms/ProductForm.jsx",
      force: true,
    });
    expect(r.content).toBe("new");
    expect(r.mode).toBe("replace");
  });
});

describe("auditAmendSafety", () => {
  const modelIncoming = `const mongoose = require('mongoose');
const ProductSchema = new mongoose.Schema({ name: String });

// ✎ CUSTOM CODE ZONE — YOUR CODE HERE

module.exports = mongoose.model('Product', ProductSchema);

// ═══════════════════════════════════════════════════════════════════════════
// END AUTO-GENERATED
// ═══════════════════════════════════════════════════════════════════════════
`;

  it("flags manual lines before model custom zone", () => {
    const existing = modelIncoming.replace(
      "// ✎ CUSTOM CODE ZONE",
      "const helper = () => true;\n\n// ✎ CUSTOM CODE ZONE",
    );
    const issues = auditAmendSafety(
      existing,
      modelIncoming,
      "backend/src/modules/product/models/Product.js",
    );
    expect(issues.some((i) => i.kind === "model-before-zone")).toBe(true);
  });

  it("allows edits inside custom zone only", () => {
    const existing = modelIncoming.replace(
      "// ✎ CUSTOM CODE ZONE — YOUR CODE HERE",
      "// ✎ CUSTOM CODE ZONE — YOUR CODE HERE\nProductSchema.methods.tag = function () {};",
    );
    const issues = auditAmendSafety(
      existing,
      modelIncoming,
      "backend/src/modules/product/models/Product.js",
    );
    expect(issues).toHaveLength(0);
  });

  it("flags prelude on marker-based files", () => {
    const existing = `const manual = 1;
//══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED — DO NOT EDIT MANUALLY
//══════════════════════════════════════════════════════════════════════════════
export const x = 1;
//══════════════════════════════════════════════════════════════════════════════
// END AUTO-GENERATED
//══════════════════════════════════════════════════════════════════════════════
`;
    const incoming = existing.replace("const manual = 1;\n", "");
    const issues = auditAmendSafety(
      existing,
      incoming,
      "frontend/src/components/forms/ProductForm.jsx",
    );
    expect(issues.some((i) => i.kind === "prelude")).toBe(true);
  });

  it("formatAmendSafetyError names AmendSafetyError", () => {
    const err = formatAmendSafetyError([
      { relPath: "a.js", message: "test" },
    ]);
    expect(err.name).toBe("AmendSafetyError");
    expect(err.message).toContain("--force");
  });
});

describe("field list helpers", () => {
  it("mergeFieldLists adds and updates", () => {
    const merged = mergeFieldLists(
      [{ name: "a", type: "string" }, { name: "b", type: "number" }],
      [{ name: "b", type: "string" }, { name: "c", type: "boolean" }],
    );
    expect(merged.map((f) => f.name).sort()).toEqual(["a", "b", "c"]);
    expect(merged.find((f) => f.name === "b").type).toBe("string");
  });

  it("removeFieldsFromList drops names", () => {
    const out = removeFieldsFromList(
      [{ name: "a" }, { name: "b" }],
      ["b"],
    );
    expect(out).toEqual([{ name: "a" }]);
  });
});
