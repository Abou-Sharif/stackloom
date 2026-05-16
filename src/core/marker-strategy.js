/**
 * MarkerStrategy — preserves custom code during regeneration
 */

const MARKERS = {
  // Matches the entire auto-generated block including header/footer.
  // Note: the END line is `// END AUTO-GENERATED` (a plain comment) — it is NOT
  // prefixed with the ═ rule, so the pattern must not expect ═ chars there.
  block:
    /(\/\/═+\s*[\r\n]+\/\/ AUTO-GENERATED[\s\S]*?\/\/ END AUTO-GENERATED\s*[\r\n]+\/\/═+)/m,

  header: (resourceName, timestamp, stealth = false) => {
    if (stealth)
      return `//══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED — DO NOT EDIT MANUALLY
//══════════════════════════════════════════════════════════════════════════════`;

    return `//══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED — DO NOT EDIT MANUALLY
// Resource: ${resourceName || "Unknown"}
// Generated at: ${timestamp || new Date().toISOString()}
//══════════════════════════════════════════════════════════════════════════════`;
  },

  footer: `//══════════════════════════════════════════════════════════════════════════════
// END AUTO-GENERATED
//══════════════════════════════════════════════════════════════════════════════`,
};

export class MarkerStrategy {
  static parse(content) {
    // Very flexible regex for parsing. The END line is a plain `// END
    // AUTO-GENERATED` comment — not prefixed with the ═/- rule — so the middle
    // segment must match `// END`, not `//═══ END`.
    const flexibleBlock =
      /(\/\/[═-]+\s*[\r\n]+\/\/ AUTO-GENERATED[\s\S]*?\/\/ END AUTO-GENERATED\s*[\r\n]+\/\/[═-]+)/m;
    const blockMatch = content.match(flexibleBlock);

    if (!blockMatch) {
      return { hasMarkers: false, full: content };
    }

    const fullBlock = blockMatch[0];
    const blockStart = blockMatch.index;
    const blockEnd = blockStart + fullBlock.length;

    const lines = fullBlock.split(/\r?\n/);

    // Find auto content (between header and footer)
    let headerEndIdx = -1;
    let separatorCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("════════") || lines[i].includes("--------")) {
        separatorCount++;
        if (separatorCount === 2) {
          headerEndIdx = i + 1;
          break;
        }
      }
    }

    let footerStartIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes("END AUTO-GENERATED")) {
        footerStartIdx = i - 1;
        break;
      }
    }

    let autoBlock = "";
    if (headerEndIdx > 0 && footerStartIdx > headerEndIdx) {
      autoBlock = lines.slice(headerEndIdx, footerStartIdx).join("\n").trim();
    }

    // Look for custom zone
    const customZoneMarker = "// ✎ CUSTOM CODE ZONE";
    let customBlock = "";
    const customIdx = content.indexOf(customZoneMarker);
    if (customIdx !== -1) {
      customBlock = content.slice(customIdx);
    }

    return {
      hasMarkers: true,
      prelude: content.slice(0, blockStart),
      autoBlock,
      customBlock,
      epilogue: content.slice(blockEnd),
      fullBlock,
    };
  }

  static compose(parsed, newAutoBlock, options = {}) {
    if (!parsed.hasMarkers) {
      return MarkerStrategy.wrapWithMarkers(newAutoBlock, "", options);
    }

    const timestamp = new Date().toISOString();
    const header = MARKERS.header(
      parsed.resourceName,
      timestamp,
      options.stealth,
    );
    const footer = MARKERS.footer;

    const autoSection = `${header}\n\n${newAutoBlock.trim()}\n\n${footer}`;

    // Preserve existing custom code if it exists
    const customSection = parsed.customBlock
      ? `\n\n${parsed.customBlock}`
      : "\n\n// ✎ CUSTOM CODE ZONE — YOUR CODE HERE\n// Add custom logic below. This section is preserved during regeneration.\n// ────────────────────────────────────────────────────────────────────────────\n";

    return parsed.prelude + autoSection + customSection + parsed.epilogue;
  }

  static wrapWithMarkers(autoContent, resourceName = "", options = {}) {
    const timestamp = new Date().toISOString();
    const header = MARKERS.header(resourceName, timestamp, options.stealth);
    const footer = MARKERS.footer;

    const customZone =
      "\n\n// ✎ CUSTOM CODE ZONE — YOUR CODE HERE\n// Add custom logic below. This section is preserved during regeneration.\n// ────────────────────────────────────────────────────────────────────────────\n";

    return `${header}\n\n${autoContent.trim()}\n\n${footer}${customZone}`;
  }

  static ensureMarkers(content, resourceName, options = {}) {
    if (MarkerStrategy.parse(content).hasMarkers) {
      return content;
    }
    return MarkerStrategy.wrapWithMarkers(content, resourceName, options);
  }

  static extractAutoBlock(content) {
    const parsed = MarkerStrategy.parse(content);
    return parsed.hasMarkers ? parsed.autoBlock : content.trim();
  }
}
