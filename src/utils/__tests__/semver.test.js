import { describe, it, expect } from "vitest";
import {
  compareSemver,
  minCliSatisfied,
  parseMetadataCompat,
  metadataCompatSatisfied,
} from "../semver.js";

describe("compareSemver", () => {
  it("compares patch levels", () => {
    expect(compareSemver("1.0.2", "1.0.10")).toBe(-1);
    expect(compareSemver("1.0.10", "1.0.2")).toBe(1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
  });

  it("returns 0 for equal cores", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  it("ignores pre-release for core comparison", () => {
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBe(0);
  });
});

describe("minCliSatisfied", () => {
  it("accepts when CLI is newer", () => {
    expect(minCliSatisfied("1.0.12", "0.1.0")).toBe(true);
  });

  it("rejects when CLI is older", () => {
    expect(minCliSatisfied("0.9.0", "1.0.0")).toBe(false);
  });

  it("accepts when equal", () => {
    expect(minCliSatisfied("1.0.0", "1.0.0")).toBe(true);
  });
});

describe("parseMetadataCompat", () => {
  it("parses stackloom-cli@>=1.0.0", () => {
    expect(parseMetadataCompat("stackloom-cli@>=1.0.0")).toEqual({
      op: ">=",
      version: "1.0.0",
    });
  });

  it("defaults operator to >=", () => {
    expect(parseMetadataCompat("stackloom-cli@1.2.3")).toEqual({
      op: ">=",
      version: "1.2.3",
    });
  });
});

describe("metadataCompatSatisfied", () => {
  it("respects >=", () => {
    expect(metadataCompatSatisfied("1.0.0", { op: ">=", version: "1.0.0" })).toBe(true);
    expect(metadataCompatSatisfied("0.9.0", { op: ">=", version: "1.0.0" })).toBe(false);
  });
});
