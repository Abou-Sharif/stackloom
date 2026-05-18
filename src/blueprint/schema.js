/**
 * Blueprint schema — the contract a Starter Template publishes so the CLI can
 * scaffold into it without hardcoding any one architecture.
 *
 * A blueprint lives at `<project>/.loom/blueprint.json`. The CLI also ships a
 * built-in default (`default.blueprint.json`) describing the MERN kit, used as
 * a fallback when a project has no blueprint of its own.
 */
import { object, record, string, enumOf, arrayOf } from "./schema-kit.js";

/** Schema versions this CLI build understands. Bump on breaking blueprint changes. */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0"];

const namingStyle = () => enumOf("kebab", "camel", "pascal", "snake");

/**
 * A named root directory (e.g. "backend", "frontend"). The CLI walks `detect`
 * candidates, confirms each with `marker`, and falls back to `default`.
 */
const rootSchema = object({
  detect: arrayOf(string(), { min: 1 }),
  marker: string(),
  default: string(),
});

/**
 * An injection point. `strategy` describes *how* the CLI splices generated
 * snippets in; `pattern` is the regex/literal the strategy keys off. `comment`
 * is the literal anchor comment a template may carry so future versions can
 * migrate from pattern-matching to explicit markers.
 */
const anchorSchema = object({
  file: string(),
  strategy: enumOf(
    "before-line",
    "before-match",
    "after-last-match",
    "array-append",
    "marker-comment",
  ),
  pattern: string(),
  comment: string().optional(),
});

const conventionsSchema = object({
  naming: object({
    module: namingStyle().default("kebab"),
    component: namingStyle().default("pascal"),
    route: namingStyle().default("kebab"),
  }).default({}),
  language: object({
    detect: enumOf("typescript", "none").default("typescript"),
    default: enumOf("javascript", "typescript").default("javascript"),
  }).default({}),
}).default({});

export const blueprintSchema = object({
  schemaVersion: string(),
  architecture: object({
    id: string(),
    name: string(),
    description: string().optional(),
  }),
  engine: object({
    minCliVersion: string().optional(),
  }).optional(),
  /** Named directory roots, resolved per-project. */
  roots: record(rootSchema),
  conventions: conventionsSchema,
  /** Named path templates. Tokens like `{backend}` resolve against `roots`. */
  paths: record(string()),
  /** Named injection points for mounting routes, nav entries, etc. */
  anchors: record(anchorSchema).default({}),
  /** Named recipe references (path to a recipe manifest, relative to project root). */
  recipes: record(string()).default({}),
  /** Named preset file locations (themes, layouts, ...). */
  presets: record(string()).default({}),
});
