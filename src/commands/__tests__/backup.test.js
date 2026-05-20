import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import backupCmd from "../backup.js";

const tmp = (label) =>
  path.join(os.tmpdir(), `${label}-${Math.random().toString(36).slice(2)}`);

function createProject(root) {
  mkdirSync(path.join(root, ".loom"), { recursive: true });
  mkdirSync(path.join(root, "backend", "src"), { recursive: true });
  mkdirSync(path.join(root, "frontend", "src"), { recursive: true });
  writeFileSync(path.join(root, "README.md"), "# My Project\n");
  writeFileSync(path.join(root, "backend", "src", "app.js"), "// original app.js\n");
  writeFileSync(path.join(root, "frontend", "src", "main.jsx"), "// original main.jsx\n");
}

function createBackup(root, id, files) {
  const dir = path.join(root, ".loom", `upgrade-backup-${id}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

describe("loom backup", () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it("fails outside a project", async () => {
    const root = tmp("backup-empty");
    mkdirSync(root, { recursive: true });
    const r = await backupCmd("list", null, { projectRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("lists empty when no backups exist", async () => {
    const root = tmp("backup-none");
    createProject(root);
    const r = await backupCmd("list", null, { projectRoot: root });
    expect(r.ok).toBe(true);
    expect(r.backups).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it("lists available backups", async () => {
    const root = tmp("backup-list");
    createProject(root);
    const ts1 = String(Date.now() - 10000);
    const ts2 = String(Date.now());
    createBackup(root, ts1, { "app.js": "// v1\n" });
    createBackup(root, ts2, { "app.js": "// v2\n", "main.jsx": "// v2\n" });
    const r = await backupCmd("list", null, { projectRoot: root });
    expect(r.ok).toBe(true);
    expect(r.backups).toHaveLength(2);
    expect(r.backups[0].fileCount).toBe(2); // newest first
    expect(r.backups[1].fileCount).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects restore with missing id", async () => {
    const root = tmp("backup-noid");
    createProject(root);
    const r = await backupCmd("restore", null, { force: true, projectRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects restore with unknown id", async () => {
    const root = tmp("backup-badid");
    createProject(root);
    const r = await backupCmd("restore", "9999999999999", { force: true, projectRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("restores files from a backup with --force", async () => {
    const root = tmp("backup-restore");
    createProject(root);
    const ts = String(Date.now());
    createBackup(root, ts, {
      "backend/src/app.js": "// restored app.js\n",
    });
    const r = await backupCmd("restore", ts, { force: true, projectRoot: root });
    expect(r.ok).toBe(true);
    expect(r.restored).toBeGreaterThan(0);

    const { readFileSync } = await import("node:fs");
    expect(readFileSync(path.join(root, "backend", "src", "app.js"), "utf-8")).toBe("// restored app.js\n");
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unknown subcommand", async () => {
    const root = tmp("backup-unknown");
    createProject(root);
    const r = await backupCmd("purge", null, { projectRoot: root });
    expect(r.ok).toBe(false);
    expect(r.errors).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });
});
