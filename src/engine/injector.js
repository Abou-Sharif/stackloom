/**
 * Injector — splices generated snippets into existing project files at the
 * injection points a blueprint declares.
 *
 * Replaces the scattered, fragile regex string-replacement in the old
 * generator. Properties:
 *   - blueprint-driven   — anchors (file + strategy + pattern) come from the
 *     architecture contract, not hardcoded here
 *   - idempotent         — re-running an injection that is already present is a
 *     no-op, so generators are safe to re-run
 *   - transaction-aware  — modified files are staged into the same
 *     FileTransaction as generated files, so the whole change set is atomic and
 *     successive injections into one file compose correctly
 *   - loud on failure    — a missing anchor file or unfound pattern throws an
 *     InjectionError rather than silently skipping
 */
import path from "node:path";
import { realFs } from "./transaction.js";

export class InjectionError extends Error {
  constructor(message, { anchor, file } = {}) {
    super(message);
    this.name = "InjectionError";
    this.anchor = anchor;
    this.file = file;
  }
}

/** Leading whitespace of the line containing `idx`. */
function lineIndentAt(content, idx) {
  const lineStart = content.lastIndexOf("\n", idx) + 1;
  return (content.slice(lineStart).match(/^[ \t]*/) || [""])[0];
}

/** Indent every non-blank line of `block` by `indent`. */
function indentBlock(block, indent) {
  return block
    .split("\n")
    .map((line) => (line.trim() ? indent + line : line))
    .join("\n");
}

/**
 * Index of the delimiter that closes the one at `openIndex`, aware of strings,
 * template literals and comments. Returns -1 if unbalanced.
 */
function findMatchingDelimiter(src, openIndex, openChar, closeChar) {
  let depth = 0;
  let i = openIndex;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Apply one anchor's strategy, returning the updated file content. */
function applyStrategy(anchor, anchorName, relFile, content, snippet) {
  const fail = (msg) => {
    throw new InjectionError(`${msg} (anchor "${anchorName}" → ${relFile})`, {
      anchor: anchorName,
      file: relFile,
    });
  };
  const block = snippet.endsWith("\n") ? snippet : `${snippet}\n`;

  switch (anchor.strategy) {
    case "marker-comment": {
      const idx = anchor.comment ? content.indexOf(anchor.comment) : -1;
      if (idx === -1) fail(`anchor comment "${anchor.comment}" not found`);
      const nl = content.indexOf("\n", idx);
      const at = nl === -1 ? content.length : nl + 1;
      return content.slice(0, at) + indentBlock(block, lineIndentAt(content, idx)) + content.slice(at);
    }

    case "before-line": {
      const idx = content.indexOf(anchor.pattern);
      if (idx === -1) fail(`pattern "${anchor.pattern}" not found`);
      const lineStart = content.lastIndexOf("\n", idx) + 1;
      return content.slice(0, lineStart) + indentBlock(block, lineIndentAt(content, idx)) + content.slice(lineStart);
    }

    case "before-match": {
      const match = new RegExp(anchor.pattern, "m").exec(content);
      if (!match) fail(`pattern /${anchor.pattern}/ not found`);
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      return (
        content.slice(0, lineStart) +
        indentBlock(block, lineIndentAt(content, match.index)) +
        content.slice(lineStart)
      );
    }

    case "after-last-match": {
      const re = new RegExp(anchor.pattern, "gm");
      let last = null;
      let m;
      while ((m = re.exec(content)) !== null) {
        last = m;
        if (m[0] === "") re.lastIndex++;
      }
      if (!last) fail(`pattern /${anchor.pattern}/ not found`);
      const nl = content.indexOf("\n", last.index + last[0].length);
      const at = nl === -1 ? content.length : nl + 1;
      return content.slice(0, at) + indentBlock(block, lineIndentAt(content, last.index)) + content.slice(at);
    }

    case "array-append": {
      const match = new RegExp(anchor.pattern, "m").exec(content);
      if (!match) fail(`array pattern /${anchor.pattern}/ not found`);
      const open = content.indexOf("[", match.index);
      if (open === -1) fail(`no "[" found after array pattern`);
      const close = findMatchingDelimiter(content, open, "[", "]");
      if (close === -1) fail(`unbalanced "[" for array anchor`);

      const inner = content.slice(open + 1, close).replace(/\s+$/, "");
      const closeIndent = lineIndentAt(content, close);
      const entryIndent = `${closeIndent}  `;
      const needsComma = inner.length > 0 && !inner.endsWith(",");
      const newInner = `${inner}${needsComma ? "," : ""}\n${entryIndent}${snippet.trim()}\n${closeIndent}`;
      return content.slice(0, open + 1) + newInner + content.slice(close);
    }

    default:
      return fail(`unknown injection strategy "${anchor.strategy}"`);
  }
}

export class Injector {
  /**
   * @param {object} [options]
   * @param {typeof realFs} [options.fs] - filesystem adapter (injectable for tests)
   */
  constructor({ fs = realFs } = {}) {
    this.fs = fs;
  }

  /**
   * Splice `snippet` into the file named by blueprint anchor `anchorName`,
   * staging the modified file into `transaction`.
   * @returns {{ anchor: string, file: string, action: "inject"|"skip", reason?: string }}
   */
  inject({ anchorName, snippet, blueprint, projectRoot, transaction }) {
    const anchor = blueprint.getAnchor(anchorName); // throws if anchor undeclared
    const relFile = blueprint.expand(anchor.file, projectRoot);
    const absFile = path.join(projectRoot, relFile);

    // Prefer the transaction's pending content so successive injections compose.
    let content = transaction.get(relFile);
    if (content === undefined) {
      if (!this.fs.existsSync(absFile)) {
        throw new InjectionError(
          `Anchor "${anchorName}" targets ${relFile}, which does not exist in this project.`,
          { anchor: anchorName, file: relFile },
        );
      }
      content = this.fs.readFileSync(absFile, "utf-8");
    }

    const trimmed = snippet.trim();
    if (!trimmed) {
      return { anchor: anchorName, file: relFile, action: "skip", reason: "empty-snippet" };
    }
    if (content.includes(trimmed)) {
      return { anchor: anchorName, file: relFile, action: "skip", reason: "already-present" };
    }

    transaction.stage(relFile, applyStrategy(anchor, anchorName, relFile, content, snippet));
    return { anchor: anchorName, file: relFile, action: "inject" };
  }
}
