/**
 * schema-kit — a tiny, dependency-free schema validator.
 *
 * Scoped deliberately to what the CLI needs (objects, strings, enums, arrays,
 * string-keyed records, optionals, defaults, path-pointed errors). The public
 * surface — `.optional()`, `.default()`, `.safeParse()` returning
 * `{ success, data, error: { issues } }` — mirrors zod, so a future swap to a
 * heavier validation library is mechanical rather than invasive.
 */

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const typeOf = (value) =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

class Schema {
  /**
   * @param {(value:any, path:Array<string|number>, ctx:{issues:Array}) => any} check
   *   Validates/coerces a *present* value, pushing `{ path, message }` issues.
   */
  constructor(check) {
    this._check = check;
    this._isOptional = false;
    this._hasDefault = false;
    this._default = undefined;
  }

  optional() {
    const next = this._copy();
    next._isOptional = true;
    return next;
  }

  default(value) {
    const next = this._copy();
    next._hasDefault = true;
    next._default = value;
    return next;
  }

  _copy() {
    const next = new Schema(this._check);
    next._isOptional = this._isOptional;
    next._hasDefault = this._hasDefault;
    next._default = this._default;
    return next;
  }

  /** Resolve a value, applying default/optional rules before delegating to `_check`. */
  _resolve(value, path, ctx) {
    if (value === undefined) {
      if (this._hasDefault) return this._check(clone(this._default), path, ctx);
      if (this._isOptional) return undefined;
      ctx.issues.push({ path: [...path], message: "Required" });
      return undefined;
    }
    return this._check(value, path, ctx);
  }

  /** zod-shaped entry point: never throws, returns a discriminated result. */
  safeParse(value) {
    const ctx = { issues: [] };
    const data = this._resolve(value, [], ctx);
    if (ctx.issues.length) return { success: false, error: { issues: ctx.issues } };
    return { success: true, data };
  }
}

export function string() {
  return new Schema((value, path, ctx) => {
    if (typeof value !== "string") {
      ctx.issues.push({ path: [...path], message: `Expected string, got ${typeOf(value)}` });
    }
    return value;
  });
}

export function boolean() {
  return new Schema((value, path, ctx) => {
    if (typeof value !== "boolean") {
      ctx.issues.push({ path: [...path], message: `Expected boolean, got ${typeOf(value)}` });
    }
    return value;
  });
}

export function number() {
  return new Schema((value, path, ctx) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      ctx.issues.push({ path: [...path], message: `Expected number, got ${typeOf(value)}` });
    }
    return value;
  });
}

/** Accepts any present value as-is. Use sparingly — only where the shape is genuinely open. */
export function any() {
  return new Schema((value) => value);
}

export function enumOf(...values) {
  return new Schema((value, path, ctx) => {
    if (!values.includes(value)) {
      ctx.issues.push({
        path: [...path],
        message: `Expected one of ${values.map((v) => `"${v}"`).join(", ")}, got ${JSON.stringify(value)}`,
      });
    }
    return value;
  });
}

export function arrayOf(item, { min = 0 } = {}) {
  return new Schema((value, path, ctx) => {
    if (!Array.isArray(value)) {
      ctx.issues.push({ path: [...path], message: `Expected array, got ${typeOf(value)}` });
      return value;
    }
    if (value.length < min) {
      ctx.issues.push({
        path: [...path],
        message: `Expected at least ${min} item(s), got ${value.length}`,
      });
    }
    return value.map((entry, i) => item._resolve(entry, [...path, i], ctx));
  });
}

/** A string-keyed map where every value matches `valueSchema`. */
export function record(valueSchema) {
  return new Schema((value, path, ctx) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      ctx.issues.push({ path: [...path], message: `Expected object, got ${typeOf(value)}` });
      return value;
    }
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = valueSchema._resolve(entry, [...path, key], ctx);
    }
    return out;
  });
}

/** A fixed-shape object. Unknown keys are dropped; missing keys defer to each field's rules. */
export function object(shape) {
  return new Schema((value, path, ctx) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      ctx.issues.push({ path: [...path], message: `Expected object, got ${typeOf(value)}` });
      return value;
    }
    const out = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const resolved = fieldSchema._resolve(value[key], [...path, key], ctx);
      if (resolved !== undefined) out[key] = resolved;
    }
    return out;
  });
}

export { Schema };
