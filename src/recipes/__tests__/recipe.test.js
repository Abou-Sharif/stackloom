import { describe, it, expect } from "vitest";
import os from "node:os";
import { evaluateCondition, recipeLoader, RecipeLoadError } from "../index.js";
import { blueprintLoader } from "../../blueprint/index.js";

describe("evaluateCondition", () => {
  it("resolves identifiers (missing = falsy)", () => {
    expect(evaluateCondition("withFrontend", { withFrontend: true })).toBe(true);
    expect(evaluateCondition("withFrontend", {})).toBe(false);
  });

  it("treats empty/missing expressions as always-true", () => {
    expect(evaluateCondition("", {})).toBe(true);
    expect(evaluateCondition(undefined, {})).toBe(true);
  });

  it("supports !, &&, ||, ==, != and parentheses", () => {
    expect(evaluateCondition("!withFrontend", { withFrontend: false })).toBe(true);
    expect(evaluateCondition("a && b", { a: true, b: false })).toBe(false);
    expect(evaluateCondition("a || b", { a: false, b: true })).toBe(true);
    expect(evaluateCondition('architecture == "advanced"', { architecture: "advanced" })).toBe(true);
    expect(evaluateCondition('architecture != "advanced"', { architecture: "moderate" })).toBe(true);
    expect(evaluateCondition("(a || b) && c", { a: true, b: false, c: false })).toBe(false);
  });

  it("allows : in identifiers (hasField:slug)", () => {
    expect(evaluateCondition("hasField:slug", { "hasField:slug": true })).toBe(true);
  });

  it("rejects malformed expressions", () => {
    expect(() => evaluateCondition("a &&", {})).toThrow();
    expect(() => evaluateCondition("(a || b", {})).toThrow();
    expect(() => evaluateCondition("a == == b", {})).toThrow();
  });
});

describe("RecipeLoader", () => {
  it("loads the built-in resource recipe", async () => {
    const recipe = await recipeLoader.load("resource");
    expect(recipe.name).toBe("resource");
    expect(recipe.data.files.length).toBe(14);
    expect(recipe.data.inject.length).toBe(4);
    expect(recipe.data.requires.length).toBe(1);
  });

  it("loads the module and page recipes", async () => {
    expect((await recipeLoader.load("module")).name).toBe("module");
    expect((await recipeLoader.load("page")).name).toBe("page");
  });

  it("rejects an unknown recipe", async () => {
    await expect(recipeLoader.load("nope-not-real")).rejects.toThrow(RecipeLoadError);
  });
});

describe("Recipe.plan", () => {
  it("applies declared param defaults", async () => {
    const recipe = await recipeLoader.load("resource");
    const plan = recipe.plan({ context: {} });
    expect(plan.context.withFrontend).toBe(true);
    expect(plan.context.withTests).toBe(false);
    expect(plan.context.architecture).toBe("moderate");
    expect(plan.context.formMode).toBe("page");
  });

  it("filters files/inject/requires by `when` and renders out paths", async () => {
    const recipe = await recipeLoader.load("resource");
    const blueprint = await blueprintLoader.load(os.tmpdir());
    const vars = { kebab: "order", Name: "Order" };

    const backendOnly = recipe.plan({
      context: { withFrontend: false },
      blueprint,
      projectRoot: os.tmpdir(),
      vars,
    });
    expect(backendOnly.files.length).toBe(5);
    expect(backendOnly.inject.length).toBe(1);
    expect(backendOnly.requires.length).toBe(0);
    expect(backendOnly.files[0].out).toBe("backend/src/modules/order/models/Order.js");

    const full = recipe.plan({
      context: { withFrontend: true, withTests: true, "hasField:slug": true },
      blueprint,
      projectRoot: os.tmpdir(),
      vars,
    });
    expect(full.files.length).toBe(13);
    expect(full.inject.length).toBe(4);
    expect(full.requires).toEqual([
      { scope: "backend", package: "slugify", version: "^1.6.6" },
    ]);
  });

  it("emits the types file only for TypeScript projects", async () => {
    const recipe = await recipeLoader.load("resource");
    const blueprint = await blueprintLoader.load(os.tmpdir());
    const plan = recipe.plan({
      context: { withFrontend: true, usesTypeScript: true },
      blueprint,
      projectRoot: os.tmpdir(),
      vars: { kebab: "order", Name: "Order" },
    });
    expect(plan.files.some((f) => f.out.endsWith("types/order.types.ts"))).toBe(true);
  });

  it("lets formMode select the page-shell template", async () => {
    const recipe = await recipeLoader.load("resource");
    const blueprint = await blueprintLoader.load(os.tmpdir());
    const planFor = (formMode) =>
      recipe.plan({
        context: { withFrontend: true, formMode },
        blueprint,
        projectRoot: os.tmpdir(),
        vars: { kebab: "order", Name: "Order" },
      });

    for (const mode of ["page", "modal", "sidepanel", "inline"]) {
      const plan = planFor(mode);
      const shell = plan.files.find((f) => f.out.endsWith("ListPage.jsx"));
      expect(shell.template).toBe(`resource/page-${mode}.jsx.ejs`);
    }

    // The dedicated routed form page exists only for "page" mode.
    expect(planFor("page").files.some((f) => f.out.endsWith("FormPage.jsx"))).toBe(true);
    expect(planFor("modal").files.some((f) => f.out.endsWith("FormPage.jsx"))).toBe(false);
  });
});
