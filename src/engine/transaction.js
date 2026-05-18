/**
 * FileTransaction — atomic, all-or-nothing file writes.
 *
 * Generation stages every file here first; nothing touches the project until
 * `commit()`. If any write fails mid-commit, every file already written in this
 * commit is rolled back (prior contents restored, freshly-created files
 * removed). A half-generated project is never left behind.
 *
 * The `fs` adapter is injected, so tests can drive failure paths deterministically.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";

/** Default adapter — the real filesystem. */
export const realFs = { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync };

export class FileTransaction {
  /**
   * @param {object} args
   * @param {string} args.projectRoot - absolute root all staged paths are relative to
   * @param {typeof realFs} [args.fs] - filesystem adapter (injectable for tests)
   */
  constructor({ projectRoot, fs = realFs }) {
    if (!projectRoot) throw new Error("FileTransaction requires a projectRoot");
    this.projectRoot = projectRoot;
    this.fs = fs;
    this._staged = [];
    this._committed = false;
  }

  /**
   * Stage a file's final content (relative to projectRoot). Upsert semantics —
   * re-staging the same path replaces it, so successive injections into one
   * file compose correctly.
   */
  stage(relPath, content) {
    if (this._committed) throw new Error("Cannot stage on an already-committed transaction");
    const existing = this._staged.find((file) => file.relPath === relPath);
    if (existing) existing.content = content;
    else this._staged.push({ relPath, content });
    return this;
  }

  /** Latest staged content for a path, or undefined if it has not been staged. */
  get(relPath) {
    const entry = this._staged.find((file) => file.relPath === relPath);
    return entry ? entry.content : undefined;
  }

  /** Staged files annotated with the action they would perform. */
  staged() {
    return this._staged.map((file) => ({
      relPath: file.relPath,
      content: file.content,
      action: this.fs.existsSync(path.join(this.projectRoot, file.relPath))
        ? "update"
        : "create",
    }));
  }

  /** Dry-run preview — paths + actions, no content, nothing written. */
  plan() {
    return this.staged().map(({ relPath, action }) => ({ relPath, action }));
  }

  /**
   * Write every staged file. On any failure, roll back all writes from this
   * commit and rethrow. Returns the journal of applied changes on success.
   */
  commit() {
    if (this._committed) throw new Error("Transaction already committed");
    const journal = [];
    try {
      for (const file of this._staged) {
        const abs = path.join(this.projectRoot, file.relPath);
        const existed = this.fs.existsSync(abs);
        const backup = existed ? this.fs.readFileSync(abs) : null;
        this.fs.mkdirSync(path.dirname(abs), { recursive: true });
        this.fs.writeFileSync(abs, file.content);
        journal.push({ abs, existed, backup });
      }
    } catch (err) {
      for (const entry of journal.reverse()) {
        try {
          if (entry.existed) this.fs.writeFileSync(entry.abs, entry.backup);
          else this.fs.rmSync(entry.abs, { force: true });
        } catch {
          // best-effort rollback — surface the original failure regardless
        }
      }
      throw err;
    }
    this._committed = true;
    return journal.map((entry) => ({
      relPath: path.relative(this.projectRoot, entry.abs),
      action: entry.existed ? "update" : "create",
    }));
  }
}
