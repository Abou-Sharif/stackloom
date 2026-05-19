import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import os from "os";

const CLI_PATH = path.resolve(__dirname, "../../bin/cli.js");
const TEMP_DIR = path.join(os.tmpdir(), "loom-test-" + Date.now());

describe("Stackloom CLI Smoke Tests", () => {
  beforeAll(async () => {
    await fs.ensureDir(TEMP_DIR);
  });

  afterAll(async () => {
    await fs.remove(TEMP_DIR);
  });

  // Spawning a fresh Node process per test is slow on Windows + pnpm symlinks;
  // give the smoke tests generous timeouts — they assert behaviour, not speed.
  const SMOKE_TIMEOUT = 30000;

  it("should show version", () => {
    const output = execSync(`node "${CLI_PATH}" --version`).toString();
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  }, SMOKE_TIMEOUT);

  it("should show help", () => {
    const output = execSync(`node "${CLI_PATH}" --help`).toString();
    expect(output).toContain("Usage: loom");
    expect(output).toContain("init");
    expect(output).toContain("generate");
    expect(output).toContain("upgrade");
  }, SMOKE_TIMEOUT);

  it("should fail when running doctor outside project", () => {
    let failed = false;
    try {
      execSync(`node "${CLI_PATH}" doctor`, { cwd: TEMP_DIR, stdio: "pipe" });
    } catch (err) {
      failed = true;
      const out = `${err.stdout?.toString() ?? ""}${err.stderr?.toString() ?? ""}`;
      expect(out).toMatch(/not a|MERN|project/i);
    }
    expect(failed).toBe(true);
  }, SMOKE_TIMEOUT);
});
