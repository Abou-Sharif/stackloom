/**
 * Amend merge — update generated resource files while preserving custom zones.
 */
import { MarkerStrategy } from "./marker-strategy.js";

const CUSTOM_ZONE_MARKER = "// ✎ CUSTOM CODE ZONE";
const END_AUTO_GENERATED = "// END AUTO-GENERATED";

/** @param {string} line */
function isMeaningfulLine(line) {
  const t = line.trim();
  return Boolean(t) && !t.startsWith("//");
}

/** Lines that are expected to differ when fields are added/removed on amend. */
function looksLikeGeneratedSchemaLine(line) {
  const t = line.trim();
  return (
    /^\w+:\s*\{/.test(t) ||
    /Schema\.(index|virtual|plugin)|mongoose\.|timestamps:|toJSON:|toObject:|module\.exports\s*=/.test(
      t,
    ) ||
    /^const\s+\w+Schema\s*=/.test(t) ||
    /^const\s+\w+\s*=\s*require\(/.test(t) ||
    t === "{" ||
    t === "}," ||
    t === "}" ||
    t === ");"
  );
}

/**
 * Detect manual edits outside merge-safe regions before applying amend.
 * @returns {Array<{ relPath: string, kind: string, message: string }>}
 */
export function auditAmendSafety(existing, incoming, relPath) {
  const issues = [];
  const rel = relPath.replace(/\\/g, "/");

  if (isModelResourcePath(rel)) {
    const exIdx = existing.indexOf(CUSTOM_ZONE_MARKER);
    const inIdx = incoming.indexOf(CUSTOM_ZONE_MARKER);
    if (exIdx >= 0 && inIdx >= 0) {
      for (const line of findManualLinesBeforeZone(existing, incoming)) {
        issues.push({
          relPath: rel,
          kind: "model-before-zone",
          message: `Manual edit before custom zone: ${line.trim().slice(0, 72)}`,
        });
      }
    }
    const epilogue = extractModelEpilogue(existing);
    if (epilogue.trim()) {
      issues.push({
        relPath: rel,
        kind: "model-epilogue",
        message: `Manual code after END AUTO-GENERATED (${epilogue.trim().length} chars)`,
      });
    }
  } else {
    const parsed = MarkerStrategy.parse(existing);
    if (parsed.hasMarkers) {
      if (parsed.prelude.trim()) {
        issues.push({
          relPath: rel,
          kind: "prelude",
          message: `Manual code before AUTO-GENERATED block (${parsed.prelude.trim().length} chars)`,
        });
      }
      if (parsed.epilogue.trim()) {
        issues.push({
          relPath: rel,
          kind: "epilogue",
          message: `Manual code after AUTO-GENERATED block (${parsed.epilogue.trim().length} chars)`,
        });
      }
    }
  }

  return issues;
}

/** Content after the closing ═══ line following END AUTO-GENERATED (model template). */
function extractModelEpilogue(content) {
  const endIdx = content.indexOf(END_AUTO_GENERATED);
  if (endIdx < 0) return "";
  const after = content.slice(endIdx);
  const closeRule = after.match(/\/\/═+\s*(\r?\n|$)/);
  if (!closeRule || closeRule.index === undefined) return "";
  const tailStart = endIdx + closeRule.index + closeRule[0].length;
  return content.slice(tailStart);
}

function findManualLinesBeforeZone(existing, incoming) {
  const exIdx = existing.indexOf(CUSTOM_ZONE_MARKER);
  const inIdx = incoming.indexOf(CUSTOM_ZONE_MARKER);
  if (exIdx < 0 || inIdx < 0) return [];

  const exHead = existing.slice(0, exIdx);
  const inHead = incoming.slice(0, inIdx);
  const inLines = new Set(
    inHead.split(/\r?\n/).map((l) => l.trim()).filter(isMeaningfulLine),
  );

  const extra = [];
  for (const line of exHead.split(/\r?\n/)) {
    if (!isMeaningfulLine(line)) continue;
    const t = line.trim();
    if (looksLikeGeneratedSchemaLine(line)) continue;
    if (inLines.has(t)) continue;
    extra.push(line);
  }
  return extra;
}

/** @param {Array<{ relPath: string, message: string }>} issues */
export function formatAmendSafetyError(issues) {
  const detail = issues.map((i) => `  • ${i.relPath}: ${i.message}`).join("\n");
  const err = new Error(
    `Amend blocked — manual edits detected outside safe zones:\n${detail}\n` +
      "Move custom logic into the ✎ CUSTOM CODE ZONE (or between AUTO-GENERATED markers), or re-run with --force.",
  );
  err.name = "AmendSafetyError";
  err.issues = issues;
  return err;
}

/** Backend model paths use the custom-code zone instead of full-file markers. */
export function isModelResourcePath(relPath) {
  return /\/models\/[A-Z][a-zA-Z0-9]*\.js$/.test(relPath.replace(/\\/g, "/"));
}

/**
 * Merge a regenerated model: replace schema/index/virtuals; keep tail from CUSTOM CODE ZONE.
 * @returns {string|null} merged content, or null if merge is not possible
 */
export function mergeModelCustomZone(existing, incoming) {
  const exIdx = existing.indexOf(CUSTOM_ZONE_MARKER);
  const inIdx = incoming.indexOf(CUSTOM_ZONE_MARKER);
  if (exIdx === -1 || inIdx === -1) return null;
  const head = incoming.slice(0, inIdx).trimEnd();
  const tail = existing.slice(exIdx);
  return `${head}\n\n${tail}`;
}

/**
 * @param {object} args
 * @param {string} args.existing
 * @param {string} args.incoming
 * @param {string} args.relPath
 * @param {string} [args.resourceName]
 * @param {boolean} [args.force]
 * @returns {{ content: string, mode: 'create'|'replace'|'merge-markers'|'merge-zone' }}
 */
export function mergeAmendContent({
  existing,
  incoming,
  relPath,
  resourceName = "",
  force = false,
}) {
  if (!existing) {
    return {
      content: MarkerStrategy.ensureMarkers(incoming, resourceName),
      mode: "create",
    };
  }

  if (isModelResourcePath(relPath)) {
    const zoned = mergeModelCustomZone(existing, incoming);
    if (zoned) return { content: zoned, mode: "merge-zone" };
  }

  const parsed = MarkerStrategy.parse(existing);
  if (parsed.hasMarkers) {
    const newAuto = MarkerStrategy.extractAutoBlock(incoming);
    return {
      content: MarkerStrategy.compose(parsed, newAuto, { resourceName }),
      mode: "merge-markers",
    };
  }

  if (!force) {
    const err = new Error(
      `Cannot amend ${relPath}: no AUTO-GENERATED markers or custom zone. Re-run with --force to overwrite, or keep edits inside the custom zone / markers.`,
    );
    err.name = "AmendMergeError";
    err.relPath = relPath;
    throw err;
  }

  return { content: incoming, mode: "replace" };
}

/**
 * Merge field lists for amend: incoming fields overwrite by name; omitted fields kept.
 * @param {object[]} storedFields
 * @param {object[]} incomingFields
 */
export function mergeFieldLists(storedFields, incomingFields) {
  const byName = new Map(storedFields.map((f) => [f.name, { ...f }]));
  for (const f of incomingFields) byName.set(f.name, { ...f });
  return [...byName.values()];
}

/** @param {object[]} fields @param {string[]} removeNames */
export function removeFieldsFromList(fields, removeNames) {
  const drop = new Set(removeNames.filter(Boolean));
  return fields.filter((f) => !drop.has(f.name));
}

/** Plain JSON snapshot of a ResourceDefinition for `.loom/resources/`. */
export function serializeResourceSnapshot(resource) {
  return {
    name: resource.name,
    collection: resource.collection,
    fields: resource.fields.map((f) => ({
      name: f.name,
      type: f.type,
      validation: f.validation || {},
      special: f.special || {},
      ui: f.ui || {},
    })),
    relations: resource.relations || { belongsTo: [], hasMany: [] },
    features: resource.features || {},
    ui: resource.ui || {},
    hooks: resource.hooks || {},
    permissions: resource.permissions || {},
    options: resource.options || {},
  };
}
