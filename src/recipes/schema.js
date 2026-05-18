/**
 * Recipe schema — a recipe is a *declarative* generation manifest.
 *
 * It lists exactly which files to render, which anchors to inject into, and
 * which dependencies to add — each entry gated by an optional `when` condition.
 * The engine emits only what a recipe asks for, so "zero bloat" is structural
 * rather than aspirational.
 */
import { object, record, arrayOf, string, any } from "../blueprint/schema-kit.js";

/** A declared input parameter (drives `when` conditions and template context). */
const paramSchema = object({
  type: string().default("string"),
  default: any().optional(),
  description: string().optional(),
});

/** One file to render: a template, an output path template, an optional gate. */
const fileSchema = object({
  template: string(),
  out: string(),
  when: string().optional(),
});

/** One injection: a blueprint anchor name + a snippet template, optional gate. */
const injectSchema = object({
  anchor: string(),
  template: string(),
  when: string().optional(),
});

/** One dependency requirement, scoped to a root (e.g. "backend"), optional gate. */
const requireSchema = object({
  scope: string(),
  package: string(),
  version: string(),
  when: string().optional(),
});

export const recipeSchema = object({
  name: string(),
  description: string().optional(),
  params: record(paramSchema).default({}),
  files: arrayOf(fileSchema).default([]),
  inject: arrayOf(injectSchema).default([]),
  requires: arrayOf(requireSchema).default([]),
});
