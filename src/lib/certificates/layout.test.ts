import { describe, it, expect } from "vitest";
import { ALL_FACES, type FaceMetrics } from "./fonts";
import { DEFAULT_STYLE, type Style, type TextElement } from "./design";
import { layoutText, MIN_SHRINK, type MetricsTable } from "./layout";
import { METRICS } from "./metrics";

// A fake monospace face: every ASCII glyph is 500/1000 em wide, so at
// sizePct 10 on a 1000 px page (100 px font) each character is exactly 50 px.
const mono: FaceMetrics = {
  unitsPerEm: 1000,
  ascent: 800,
  descent: -200,
  underlinePosition: -100,
  underlineThickness: 50,
  widths: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(32 + i), 500])),
};
const FAKE = Object.fromEntries(ALL_FACES.map((f) => [f, mono])) as MetricsTable;
const PAGE = { widthPx: 1000, heightPx: 1000 };
const S: Style = { ...DEFAULT_STYLE, sizePct: 10 };
const none = () => "";

const box = (over: Partial<TextElement>): TextElement => ({
  id: "t",
  name: "T",
  type: "text",
  x: 0,
  y: 0,
  w: 50, // 500 px = 10 characters
  h: 20,
  locked: false,
  hidden: false,
  align: "left",
  lineHeight: 1,
  fit: "wrap",
  paragraphs: [{ runs: [{ kind: "text", text: "", style: S }] }],
  ...over,
});
const textOf = (text: string, style: Style = S) => [{ runs: [{ kind: "text" as const, text, style }] }];
const lineTexts = (l: ReturnType<typeof layoutText>) => l.lines.map((line) => line.runs.map((r) => r.text).join(""));

describe("layoutText — wrapping", () => {
  it("fills lines greedily and drops spaces at line ends", () => {
    const l = layoutText(box({ paragraphs: textOf("aaaa bbbb cccc") }), none, PAGE, FAKE);
    expect(lineTexts(l)).toEqual(["aaaa bbbb", "cccc"]);
    expect(l.lines[0].width).toBe(450);
    expect(l.height).toBe(200);
    expect(l.overflow).toBe(false);
  });

  it("puts the baseline at the half-leading position", () => {
    const l = layoutText(box({ lineHeight: 1.5, paragraphs: textOf("a") }), none, PAGE, FAKE);
    // line box 150, content 80+20=100 → 25 px half-leading, baseline 25 + 80.
    expect(l.lines[0].baseline).toBe(105);
    expect(l.height).toBe(150);
  });

  it("breaks a single word longer than the box by character", () => {
    const l = layoutText(box({ paragraphs: textOf("abcdefghijklmnop") }), none, PAGE, FAKE);
    expect(lineTexts(l)).toEqual(["abcdefghij", "klmnop"]);
  });

  it("keeps a paragraph per line block and gives empty paragraphs a line", () => {
    const l = layoutText(
      box({ paragraphs: [...textOf("one"), { runs: [] }, ...textOf("two")] }),
      none,
      PAGE,
      FAKE,
    );
    expect(lineTexts(l)).toEqual(["one", "", "two"]);
    expect(l.height).toBe(300);
  });

  it("aligns centre and right using the width without trailing spaces", () => {
    const c = layoutText(box({ align: "center", paragraphs: textOf("ab   ") }), none, PAGE, FAKE);
    expect(c.lines[0].runs[0].x).toBe(200); // (500 - 100) / 2
    const r = layoutText(box({ align: "right", x: 10, paragraphs: textOf("ab") }), none, PAGE, FAKE);
    expect(r.lines[0].runs[0].x).toBe(100 + 500 - 100);
  });

  it("flags a wrap box that runs off the bottom of the page", () => {
    // Top at 800 px; each line is 100 px tall.
    const l = layoutText(box({ y: 80, paragraphs: textOf("aaaa bbbb cccc") }), none, PAGE, FAKE);
    expect(l.overflow).toBe(false); // 2 lines end exactly at 1000
    const off = layoutText(box({ y: 80, paragraphs: textOf("aaaa bbbb cccc dddd eeee") }), none, PAGE, FAKE);
    expect(off.overflow).toBe(true);
  });
});

describe("layoutText — rich runs and fields", () => {
  it("resolves fields with transforms and shares one baseline across sizes", () => {
    const big: Style = { ...S, sizePct: 20, bold: true };
    const l = layoutText(
      box({
        w: 100,
        paragraphs: [
          {
            runs: [
              { kind: "text", text: "Hi ", style: S },
              { kind: "field", field: "person.name", transform: "title", style: big },
              { kind: "text", text: "!", style: S },
            ],
          },
        ],
      }),
      (k) => (k === "person.name" ? "asha r" : ""),
      PAGE,
      FAKE,
    );
    const runs = l.lines[0].runs;
    expect(runs.map((r) => r.text)).toEqual(["Hi ", "Asha R", "!"]);
    expect(runs.map((r) => r.x)).toEqual([0, 150, 750]);
    expect(runs[1]).toMatchObject({ size: 200, bold: true, face: "playfair-b" });
    // line box = 200 (largest size × 1); ascent 160, descent 40 → baseline 160.
    expect(l.lines[0].baseline).toBe(160);
  });

  it("keeps a field and its punctuation together as one word when wrapping", () => {
    const l = layoutText(
      box({
        paragraphs: [
          {
            runs: [
              { kind: "text", text: "to ", style: S },
              { kind: "field", field: "person.name", transform: "none", style: S },
              { kind: "text", text: ", ok", style: S },
            ],
          },
        ],
      }),
      () => "Venkata",
      PAGE,
      FAKE,
    );
    expect(lineTexts(l)).toEqual(["to", "Venkata,", "ok"]);
  });

  it("drops characters the face cannot print and reports them", () => {
    const l = layoutText(box({ paragraphs: textOf("José") }), none, PAGE, FAKE);
    expect(lineTexts(l)).toEqual(["Jos"]);
    expect(l.missingGlyphs).toEqual(["é"]);
  });

  it("places underlines below the baseline", () => {
    const l = layoutText(box({ paragraphs: textOf("a", { ...S, underline: true }) }), none, PAGE, FAKE);
    const run = l.lines[0].runs[0];
    // baseline 80; position -100/1000*100 = 10 below; bar 5 thick, centred → top at 87.5.
    expect(run.underline).toEqual({ y: 87.5, thickness: 5 });
  });
});

describe("layoutText — shrink to fit", () => {
  it("leaves text that fits alone, centred vertically in the box", () => {
    const l = layoutText(box({ fit: "shrink", h: 30, paragraphs: textOf("short") }), none, PAGE, FAKE);
    expect(l.scale).toBe(1);
    expect(l.top).toBe(100); // (300 - 100) / 2
  });

  it("scales a long line down to the box width", () => {
    const l = layoutText(box({ fit: "shrink", paragraphs: textOf("a".repeat(20)) }), none, PAGE, FAKE);
    expect(l.scale).toBe(0.5);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0].width).toBe(500);
    expect(l.lines[0].runs[0].size).toBe(50);
    expect(l.overflow).toBe(false);
  });

  it("stops at the minimum scale and flags overflow", () => {
    const l = layoutText(box({ fit: "shrink", paragraphs: textOf("a".repeat(40)) }), none, PAGE, FAKE);
    expect(l.scale).toBe(MIN_SHRINK);
    expect(l.overflow).toBe(true);
  });
});

describe("layoutText — real metrics", () => {
  it("lays out with a bundled face without throwing", () => {
    const l = layoutText(
      box({ w: 80, paragraphs: textOf("This is to certify that ₹ Śrī participated", { ...S, font: "lora", sizePct: 4 }) }),
      none,
      PAGE,
      METRICS,
    );
    expect(l.lines.length).toBeGreaterThan(0);
    expect(l.missingGlyphs).not.toContain("a");
  });
});
