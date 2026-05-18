import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { Blueprint, BlueprintLoader, BlueprintLoadError, blueprintLoader } from "../index.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);
const writeJSON = (file, obj) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
};
const readJSON = (file) => JSON.parse(readFileSync(file, "utf-8"));

describe("BlueprintLoader", () => {
  it("falls back to the built-in MERN blueprint when a project has none", async () => {
    const bp = await blueprintLoader.load(os.tmpdir());
    expect(bp).toBeInstanceOf(Blueprint);
    expect(bp.id).toBe("mern");
    expect(bp.schemaVersion).toBe("1.0");
    expect(bp.source).toBe(blueprintLoader.builtinPath);
  });

  it("rejects a blueprint that fails schema validation", async () => {
    const file = `${tmp("bp-bad")}.json`;
    writeJSON(file, { schemaVersion: "1.0", architecture: { id: "x" } });
    await expect(blueprintLoader.loadFile(file)).rejects.toThrow(BlueprintLoadError);
    rmSync(file, { force: true });
  });

  it("rejects an unsupported schemaVersion", async () => {
    const file = `${tmp("bp-ver")}.json`;
    writeJSON(file, { ...readJSON(blueprintLoader.builtinPath), schemaVersion: "99.0" });
    await expect(blueprintLoader.loadFile(file)).rejects.toThrow(/schemaVersion/);
    rmSync(file, { force: true });
  });

  it("prefers a project-local blueprint over the built-in", async () => {
    const projectRoot = tmp("bp-proj");
    const builtin = readJSON(blueprintLoader.builtinPath);
    writeJSON(path.join(projectRoot, ".loom", "blueprint.json"), {
      ...builtin,
      architecture: { ...builtin.architecture, id: "custom" },
    });

    const bp = await new BlueprintLoader().load(projectRoot);
    expect(bp.id).toBe("custom");
    rmSync(projectRoot, { recursive: true, force: true });
  });
});

describe("Blueprint", () => {
  let projectRoot;
  let bp;

  beforeEach(async () => {
    projectRoot = tmp("bp-test");
    writeJSON(path.join(projectRoot, "backend", "package.json"), { name: "backend" });
    mkdirSync(path.join(projectRoot, "frontend", "src"), { recursive: true });
    writeFileSync(path.join(projectRoot, "frontend", "src", "main.jsx"), "");
    bp = await blueprintLoader.load(projectRoot);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("resolves named roots via detect + marker", () => {
    expect(bp.resolveRoot("backend", projectRoot)).toBe("backend");
    expect(bp.resolveRoot("frontend", projectRoot)).toBe("frontend");
  });

  it("falls back to a root's default when no candidate matches", () => {
    expect(bp.resolveRoot("frontend", tmp("bp-bare"))).toBe("frontend");
  });

  it("throws for an unknown root", () => {
    expect(() => bp.resolveRoot("database", projectRoot)).toThrow(/no root named "database"/);
  });

  it("expands root tokens in path templates", () => {
    expect(bp.resolvePath("backend.modules", projectRoot)).toBe(
      path.join(projectRoot, "backend", "src", "modules"),
    );
  });

  it("substitutes extra vars into path templates", () => {
    expect(bp.expand("{backend}/src/modules/{kebab}", projectRoot, { kebab: "order" })).toBe(
      "backend/src/modules/order",
    );
  });

  it("throws for an unknown token", () => {
    expect(() => bp.expand("{frontend}/{mystery}", projectRoot)).toThrow(/Unknown token/);
  });

  it("looks up injection anchors", () => {
    expect(bp.hasAnchor("backend.routes")).toBe(true);
    expect(bp.getAnchor("backend.routes").strategy).toBe("before-line");
    expect(bp.resolveAnchorFile("backend.routes", projectRoot)).toBe(
      path.join(projectRoot, "backend", "src", "routes", "index.js"),
    );
  });

  it("detects language per the blueprint convention", () => {
    expect(bp.usesTypeScript(projectRoot)).toBe(false);
    writeFileSync(path.join(projectRoot, "frontend", "tsconfig.json"), "{}");
    expect(new Blueprint(bp.data, bp.source).usesTypeScript(projectRoot)).toBe(true);
  });
});
