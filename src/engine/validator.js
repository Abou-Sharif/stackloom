/**
 * Validator — the pre-commit gate that makes "error-free code" a guarantee.
 *
 * Every staged file is checked before the transaction is allowed to commit; a
 * single failure aborts the whole generation, so a syntactically broken file
 * never reaches the project.
 *
 * Strategies are pluggable per file extension. The shipped default for code is
 * `scanDelimiters` — a dependency-free balanced-delimiter scanner that catches
 * the real bug class (stray code, unbalanced braces/parens, unterminated
 * strings). It is a heuristic, not a full parser: a `@babel/parser` / `tsc`
 * strategy can be registered when those deps are available, without touching
 * any caller.
 */
import path from "node:path";

/**
 * Punctuation after which a `/` begins a regex literal rather than division.
 * `<` and `>` are deliberately excluded: in JSX `</Tag>` and `/>` are far more
 * common than a regex following a comparison operator.
 */
const REGEX_PRECEDERS = new Set("([{,;:=!&|?+-*%~^".split(""));

/**
 * Scan source for balanced (), [], {} — aware of strings, template literals,
 * comments and regex literals. Returns `{ balanced, error? }`.
 *
 * Known heuristic limits: template-literal `${}` interiors are treated as
 * opaque, and JSX angle brackets are not tracked.
 */
export function scanDelimiters(src) {
  const closeToOpen = { ")": "(", "]": "[", "}": "{" };
  const openers = new Set(["(", "[", "{"]);
  const stack = [];
  let prev = "";
  let i = 0;
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
      if (i >= n) return { balanced: false, error: "Unterminated block comment" };
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") i++;
        i++;
      }
      if (i >= n) return { balanced: false, error: "Unterminated string literal" };
      i++;
      prev = c;
      continue;
    }
    if (c === "`") {
      i++;
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") i++;
        i++;
      }
      if (i >= n) return { balanced: false, error: "Unterminated template literal" };
      i++;
      prev = "`";
      continue;
    }
    if (c === "/" && (prev === "" || REGEX_PRECEDERS.has(prev))) {
      i++;
      let inClass = false;
      while (i < n) {
        const r = src[i];
        if (r === "\\") {
          i += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        else if (r === "\n") return { balanced: false, error: "Unterminated regex literal" };
        i++;
      }
      if (i >= n) return { balanced: false, error: "Unterminated regex literal" };
      i++;
      prev = "/";
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (openers.has(c)) {
      stack.push({ c, i });
      prev = c;
      i++;
      continue;
    }
    if (closeToOpen[c]) {
      const top = stack.pop();
      if (!top || top.c !== closeToOpen[c]) {
        return { balanced: false, error: `Unexpected "${c}" at index ${i}` };
      }
      prev = c;
      i++;
      continue;
    }
    prev = c;
    i++;
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    return { balanced: false, error: `Unclosed "${top.c}" at index ${top.i}` };
  }
  return { balanced: true };
}

/** Code strategy: non-empty + balanced delimiters. */
function codeStrategy(file) {
  if (!file.content || !file.content.trim()) {
    return { ok: false, relPath: file.relPath, message: "Generated file is empty" };
  }
  const scan = scanDelimiters(file.content);
  if (!scan.balanced) {
    return { ok: false, relPath: file.relPath, message: scan.error };
  }
  return { ok: true, relPath: file.relPath };
}

/** JSON strategy: must parse. */
function jsonStrategy(file) {
  try {
    JSON.parse(file.content);
    return { ok: true, relPath: file.relPath };
  } catch (err) {
    return { ok: false, relPath: file.relPath, message: `Invalid JSON: ${err.message}` };
  }
}

/** Unknown extensions pass — only registered types are gated. */
function passStrategy(file) {
  return { ok: true, relPath: file.relPath };
}

const DEFAULT_STRATEGIES = {
  js: codeStrategy,
  cjs: codeStrategy,
  mjs: codeStrategy,
  jsx: codeStrategy,
  ts: codeStrategy,
  tsx: codeStrategy,
  json: jsonStrategy,
};

export class Validator {
  /**
   * @param {object} [options]
   * @param {Record<string, (file:{relPath:string,content:string}) => {ok:boolean}>} [options.strategies]
   *   Extra/override strategies keyed by extension (no dot).
   */
  constructor({ strategies = {} } = {}) {
    this.strategies = { ...DEFAULT_STRATEGIES, ...strategies };
  }

  /** Validate one staged file. */
  validateFile(file) {
    const ext = path.extname(file.relPath).slice(1).toLowerCase();
    const strategy = this.strategies[ext] || passStrategy;
    return strategy(file);
  }

  /** Validate every staged file. Returns `{ ok, failures }`. */
  validateAll(files) {
    const failures = [];
    for (const file of files) {
      const result = this.validateFile(file);
      if (!result.ok) failures.push(result);
    }
    return { ok: failures.length === 0, failures };
  }
}
