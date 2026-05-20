import path from "node:path";
import fs from "fs-extra";
import inquirer from "inquirer";
import { reporterFromOptions } from "../services/index.js";

const BACKUP_PREFIX = "upgrade-backup-";

function parseBackupDir(name) {
  const raw = name.slice(BACKUP_PREFIX.length);
  const parts = raw.split("-");
  const tsNum = parseInt(parts[0], 10);
  return {
    dirName: name,
    timestamp: Number.isNaN(tsNum) ? null : new Date(tsNum),
    id: raw,
  };
}

function listBackupDirs(loomDir) {
  if (!fs.existsSync(loomDir)) return [];
  return fs
    .readdirSync(loomDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(BACKUP_PREFIX))
    .map((d) => {
      const abs = path.join(loomDir, d.name);
      const info = parseBackupDir(d.name);
      const files = listFilesRecursive(abs);
      return { ...info, abs, fileCount: files.length, files };
    })
    .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
}

function listFilesRecursive(dir, prefix = "") {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(abs).isDirectory()) {
      entries.push(...listFilesRecursive(abs, rel));
    } else {
      entries.push(rel);
    }
  }
  return entries;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return total;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      total += dirSize(abs);
    } else {
      total += stat.size;
    }
  }
  return total;
}

function resolveProjectRoot(projectRoot) {
  let dir = projectRoot || process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".loom"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function restoreBackup(backupDir, projectRoot, files, reporter) {
  let restored = 0;
  let failed = 0;
  for (const rel of files) {
    const src = path.join(backupDir, rel);
    const dst = path.join(projectRoot, rel);
    if (!fs.existsSync(src)) {
      reporter.warn(`Backup file missing: ${rel} — skipping`);
      failed++;
      continue;
    }
    try {
      fs.ensureDirSync(path.dirname(dst));
      fs.copySync(src, dst, { overwrite: true });
      restored++;
    } catch (err) {
      failed++;
      reporter.error(`Failed to restore ${rel}: ${err.message}`);
    }
  }
  return { restored, failed };
}

/**
 * `loom backup list` — show available upgrade backups
 * `loom backup restore <id>` — restore project from a backup
 */
export default async function backupCmd(subcommand, id, options = {}) {
  const reporter = reporterFromOptions(options);
  const projectRoot = resolveProjectRoot(options.projectRoot);
  if (!projectRoot) {
    reporter.error("No .loom/ directory found — are you in a loom project?");
    return { ok: false, errors: 1 };
  }

  const loomDir = path.join(projectRoot, ".loom");
  const backups = listBackupDirs(loomDir);

  if (subcommand === "list") {
    if (backups.length === 0) {
      reporter.info("No upgrade backups found in .loom/");
      return { ok: true, backups: [] };
    }

    reporter.step(`${backups.length} backup(s) available:`);
    for (const b of backups) {
      const dateStr = b.timestamp
        ? b.timestamp.toLocaleString()
        : b.dirName;
      const size = formatSize(dirSize(b.abs));
      reporter.info(`${b.id}  ${dateStr}  ${b.fileCount} file(s)  ${size}`);
    }
    return { ok: true, backups };
  }

  if (subcommand === "restore") {
    if (!id) {
      reporter.error("Usage: loom backup restore <id>");
      return { ok: false, errors: 1 };
    }

    const match = backups.find((b) => b.id === id);
    if (!match) {
      reporter.error(`No backup found with id "${id}"`);
      reporter.info("Use 'loom backup list' to see available backups");
      return { ok: false, errors: 1 };
    }

    const dateStr = match.timestamp
      ? match.timestamp.toLocaleString()
      : match.dirName;
    reporter.step(`Restoring: ${match.dirName} (${dateStr}) — ${match.fileCount} file(s)`);

    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Restore ${match.fileCount} file(s) from this backup? Current files will be overwritten.`,
          default: false,
        },
      ]);
      if (!confirm) {
        reporter.info("Restore cancelled.");
        return { ok: false, errors: 0 };
      }
    }

    const { restored, failed } = restoreBackup(match.abs, projectRoot, match.files, reporter);
    if (failed === 0) {
      reporter.success(`Restored ${restored} file(s) from backup`);
    } else {
      reporter.warn(`Restored ${restored} file(s), ${failed} failed. Check messages above.`);
    }
    return { ok: failed === 0, restored, failed };
  }

  reporter.error(`Unknown subcommand "${subcommand}". Use "list" or "restore".`);
  return { ok: false, errors: 1 };
}
