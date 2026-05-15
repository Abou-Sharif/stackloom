import { describe, it, expect } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { branding, defaultBranding, loadBrandingFrom, saveBrandingTo } from "../index.js";

const tmp = () =>
  path.join(os.tmpdir(), `branding-${Math.random().toString(36).slice(2)}.json`);

describe("branding", () => {
  it("ships sensible defaults", () => {
    expect(defaultBranding.binName).toBe("loom");
    expect(defaultBranding.stateDirName).toBe(".loom");
  });

  it("loads the effective branding from branding.json", () => {
    expect(branding.binName).toBe("loom");
    expect(branding.displayName).toBe("Stackloom");
  });

  it("falls back to defaults when the file is missing", () => {
    expect(loadBrandingFrom(tmp())).toEqual({ ...defaultBranding });
  });

  it("falls back to defaults on invalid JSON instead of throwing", () => {
    const file = tmp();
    writeFileSync(file, "{ not json");
    expect(loadBrandingFrom(file)).toEqual({ ...defaultBranding });
    rmSync(file, { force: true });
  });

  it("layers a partial file over the defaults", () => {
    const file = tmp();
    writeFileSync(file, JSON.stringify({ binName: "acme" }));
    const loaded = loadBrandingFrom(file);
    expect(loaded.binName).toBe("acme");
    expect(loaded.stateDirName).toBe(".loom");
    rmSync(file, { force: true });
  });

  it("round-trips through saveBrandingTo", () => {
    const file = tmp();
    saveBrandingTo(file, { binName: "acme", displayName: "ACME" }, defaultBranding);
    const loaded = loadBrandingFrom(file);
    expect(loaded.binName).toBe("acme");
    expect(loaded.displayName).toBe("ACME");
    rmSync(file, { force: true });
  });
});
