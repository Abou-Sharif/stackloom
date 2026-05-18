/**
 * condition — a tiny, safe boolean-expression evaluator for recipe `when` rules.
 *
 * Supports identifiers (resolved from a flat context; missing = falsy),
 * quoted string literals, `&&`, `||`, `!`, `==`, `!=`, and parentheses.
 * Hand-written recursive-descent parser — no `eval`, no dependencies — so a
 * recipe manifest can carry conditions without becoming a scripting surface.
 *
 *   evaluateCondition('withFrontend && usesTypeScript', ctx)
 *   evaluateCondition('withTests || architecture == "advanced"', ctx)
 */

// Sticky tokenizer: leading whitespace, then one operator / paren / quoted
// string / identifier. Identifiers allow `:`, `.`, `-` so `hasField:slug` works.
const TOKEN = /\s*(\|\||&&|==|!=|!|\(|\)|"[^"]*"|'[^']*'|[\w:.\-]+)/y;

function tokenize(input) {
  const tokens = [];
  let pos = 0;
  while (pos < input.length) {
    TOKEN.lastIndex = pos;
    const match = TOKEN.exec(input);
    if (!match || match.index !== pos) {
      if (input.slice(pos).trim() === "") break;
      throw new Error(`Cannot parse condition near "${input.slice(pos)}"`);
    }
    tokens.push(match[1]);
    pos = TOKEN.lastIndex;
  }
  return tokens;
}

const OPERATORS = new Set(["||", "&&", "==", "!=", "!", "(", ")"]);

function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function parseOr() {
    let node = parseAnd();
    while (peek() === "||") {
      next();
      node = { op: "||", left: node, right: parseAnd() };
    }
    return node;
  }

  function parseAnd() {
    let node = parseUnary();
    while (peek() === "&&") {
      next();
      node = { op: "&&", left: node, right: parseUnary() };
    }
    return node;
  }

  function parseUnary() {
    if (peek() === "!") {
      next();
      return { op: "!", operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    if (peek() === "(") {
      next();
      const node = parseOr();
      if (next() !== ")") throw new Error("Unbalanced parentheses in condition");
      return node;
    }
    const left = parseAtom();
    if (peek() === "==" || peek() === "!=") {
      const op = next();
      return { op, left, right: parseAtom() };
    }
    return left;
  }

  function parseAtom() {
    const token = next();
    if (token === undefined) throw new Error("Unexpected end of condition");
    if (OPERATORS.has(token)) throw new Error(`Unexpected token "${token}" in condition`);
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return { type: "literal", value: token.slice(1, -1) };
    }
    return { type: "ident", name: token };
  }

  const ast = parseOr();
  if (i < tokens.length) {
    throw new Error(`Unexpected trailing token "${tokens[i]}" in condition`);
  }
  return ast;
}

function valueOf(node, ctx) {
  if (node.type === "literal") return node.value;
  if (node.type === "ident") return ctx[node.name];
  return truthy(node, ctx);
}

function truthy(node, ctx) {
  if (node.type === "literal") return Boolean(node.value);
  if (node.type === "ident") return Boolean(ctx[node.name]);
  switch (node.op) {
    case "||":
      return truthy(node.left, ctx) || truthy(node.right, ctx);
    case "&&":
      return truthy(node.left, ctx) && truthy(node.right, ctx);
    case "!":
      return !truthy(node.operand, ctx);
    case "==":
      return valueOf(node.left, ctx) === valueOf(node.right, ctx);
    case "!=":
      return valueOf(node.left, ctx) !== valueOf(node.right, ctx);
    default:
      throw new Error("Malformed condition node");
  }
}

const astCache = new Map();

/**
 * Evaluate a recipe `when` expression against a flat context object.
 * A missing/empty expression means "always" (returns true).
 * @param {string|boolean|undefined} expr
 * @param {Record<string, unknown>} ctx
 * @returns {boolean}
 */
export function evaluateCondition(expr, ctx = {}) {
  if (expr === undefined || expr === null || expr === "") return true;
  if (typeof expr === "boolean") return expr;

  let ast = astCache.get(expr);
  if (!ast) {
    const tokens = tokenize(String(expr).trim());
    if (tokens.length === 0) return true;
    ast = parse(tokens);
    astCache.set(expr, ast);
  }
  return truthy(ast, ctx);
}
