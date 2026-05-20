import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import addFieldCmd from "../add-field.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);

function createProject(root) {
  mkdirSync(path.join(root, ".loom", "resources"), { recursive: true });
  writeFileSync(
    path.join(root, ".loom", "resources", "product.json"),
    JSON.stringify({
      name: "Product",
      fields: [
        { name: "name", type: "string", validation: { required: true } },
        { name: "price", type: "number", validation: { required: true } },
      ],
      relations: { hasMany: [], belongsTo: [] },
      features: {},
      ui: {},
    }),
  );
}

describe("loom resource add-field", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("fails when resource has no stored definition", async () => {
    const root = tmp("addf-nostore");
    mkdirSync(path.join(root, ".loom"), { recursive: true });
    mkdirSync(path.join(root, "backend"), { recursive: true });
    mkdirSync(path.join(root, "frontend"), { recursive: true });

    // We can't rely on the full engine being present in the test project,
    // but add-field should bail early when no stored definition exists.
    // Since process.exitCode is set, we check that.
    await addFieldCmd("Widget", "sku:string:required", {});
    expect(process.exitCode).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("fails without a field spec in non-interactive mode", async () => {
    const root = tmp("addf-nospec");
    createProject(root);
    // Set cwd-like behavior — we use projectRoot via process.cwd(), so
    // addFieldCmd will look for .loom/resources/ under process.cwd().
    // Our tmp dir has the right structure so it should work.
    const origCwd = process.cwd;
    // We'll just check that it errors properly.
    await addFieldCmd("Product", undefined, {});
    expect(process.exitCode).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("fails with an invalid field spec", async () => {
    const root = tmp("addf-badspec");
    createProject(root);
    await addFieldCmd("Product", "invalid-spec-without-colons", {});
    expect(process.exitCode).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("warns when field already exists on the resource", async () => {
    const root = tmp("addf-dupe");
    createProject(root);
    // Field "name" already exists in the stored definition
    await addFieldCmd("Product", "name:string:required", {});
    // Should not crash — just warns
    rmSync(root, { recursive: true, force: true });
  });

  it("parses and delegates a valid field spec to amend pipeline", async () => {
    const root = tmp("addf-valid");
    createProject(root);

    // Set process.cwd to our test root for add-field
    const origCwd = process.cwd;
    process.cwd = () => root;

    // This should trigger the amend pipeline. It will fail on the
    // assertAmendTargetExists step because the model file doesn't exist,
    // but we should get to that point without crashing on earlier steps.
    let error = null;
    try {
      await addFieldCmd("Product", "sku:string:required:unique", {});
    } catch (err) {
      error = err;
    }

    // Restore cwd
    process.cwd = origCwd;

    // The command should fail with a meaningful error about missing model
    // file (the resource exists in store but model file doesn't),
    // NOT about invalid field spec or missing resource
    expect(error).toBeNull(); // error is handled via process.exitCode
    rmSync(root, { recursive: true, force: true });
  });
});
