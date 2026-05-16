import { describe, it, expect } from "vitest";
import { MarkerStrategy } from "../marker-strategy.js";

describe("MarkerStrategy", () => {
  const sampleContent = `//══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED — DO NOT EDIT MANUALLY
// Resource: Test
// Generated at: 2026-05-11T16:50:49.052Z
//══════════════════════════════════════════════════════════════════════════════

const a = 1;

//══════════════════════════════════════════════════════════════════════════════
// END AUTO-GENERATED
//══════════════════════════════════════════════════════════════════════════════
const b = 2;
`;

  it("should detect markers", () => {
    const parsed = MarkerStrategy.parse(sampleContent);
    expect(parsed.hasMarkers).toBe(true);
    expect(parsed.autoBlock).toContain("const a = 1;");
    expect(parsed.epilogue).toContain("const b = 2;");
  });

  it("should extract auto block from new content", () => {
    const newContent = `//══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATED — DO NOT EDIT MANUALLY
//══════════════════════════════════════════════════════════════════════════════

const a = 2;

//══════════════════════════════════════════════════════════════════════════════
// END AUTO-GENERATED
//══════════════════════════════════════════════════════════════════════════════
`;
    const auto = MarkerStrategy.extractAutoBlock(newContent);
    expect(auto).toBe("const a = 2;");
  });

  it("should compose new content preserving custom code", () => {
    const parsed = MarkerStrategy.parse(sampleContent);
    const newAuto = "const a = 3;";
    const composed = MarkerStrategy.compose(parsed, newAuto);
    expect(composed).toContain("const a = 3;");
    expect(composed).toContain("const b = 2;");
  });

  it("should support stealth mode (no timestamps)", () => {
    const content = "hello";
    const withMarkers = MarkerStrategy.wrapWithMarkers(content, "Test", {
      stealth: true,
    });
    expect(withMarkers).not.toContain("Generated at:");
    expect(withMarkers).not.toContain("Resource:");
  });
});
