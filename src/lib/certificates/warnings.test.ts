import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE, emptyDesign, type Design, type TextElement } from "./design";
import { METRICS } from "./metrics";
import { hasWarnings, recipientWarnings, warningLines, NO_WARNINGS } from "./warnings";

const box = (over: Partial<TextElement>): TextElement => ({
  id: "t",
  name: "Body",
  type: "text",
  x: 10,
  y: 40,
  w: 40,
  h: 6,
  locked: false,
  hidden: false,
  align: "left",
  lineHeight: 1.2,
  fit: "wrap",
  paragraphs: [{ runs: [{ kind: "field", field: "person.name", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 4 } }] }],
  ...over,
});

const designOf = (...elements: Design["elements"]): Design => ({ ...emptyDesign(), elements });
const values = (map: Record<string, string>) => (key: string) => map[key] ?? "";

describe("recipientWarnings", () => {
  it("says nothing when everything fits and is filled in", () => {
    const w = recipientWarnings(designOf(box({})), values({ "person.name": "Asha R" }), METRICS);
    expect(w).toEqual(NO_WARNINGS);
    expect(hasWarnings(w)).toBe(false);
  });

  it("names each field the design prints but this person has no value for", () => {
    const element = box({
      paragraphs: [
        {
          runs: [
            { kind: "field", field: "person.name", transform: "none", style: DEFAULT_STYLE },
            { kind: "text", text: " of ", style: DEFAULT_STYLE },
            { kind: "field", field: "person.department", transform: "none", style: DEFAULT_STYLE },
          ],
        },
      ],
    });
    const w = recipientWarnings(designOf(element), values({ "person.name": "Asha" }), METRICS);
    expect(w.emptyFields).toEqual(["person.department"]);
    expect(warningLines(w, (f) => (f === "person.department" ? "Department" : f))).toEqual(["Department is empty"]);
  });

  it("flags a shrink box that is still too wide at its smallest", () => {
    const short = recipientWarnings(designOf(box({ fit: "shrink" })), values({ "person.name": "Asha" }), METRICS);
    expect(short.overflow).toEqual([]);
    const long = recipientWarnings(
      designOf(box({ fit: "shrink" })),
      values({ "person.name": "Venkata Satya Sai Krishna Prasad Reddy Yellapragada Subrahmanyam Chandrasekhar" }),
      METRICS,
    );
    expect(long.overflow).toEqual(["Body"]);
    expect(warningLines(long, (f) => f)).toEqual([`"Body" doesn't fit its box`]);
  });

  it("flags a wrapping box that runs off the bottom of the page", () => {
    const element = box({ y: 92, fit: "wrap", name: "Long note" });
    const w = recipientWarnings(designOf(element), values({ "person.name": "word ".repeat(60) }), METRICS);
    expect(w.overflow).toEqual(["Long note"]);
  });

  it("reports characters the chosen font cannot print", () => {
    const w = recipientWarnings(designOf(box({})), values({ "person.name": "Aša 日本" }), METRICS);
    expect(w.missingGlyphs).toContain("日");
    expect(warningLines(w, (f) => f).some((l) => l.startsWith("Font can't print:"))).toBe(true);
  });

  it("ignores hidden elements and image elements", () => {
    const hidden = box({ hidden: true });
    const image: Design["elements"][number] = {
      id: "i",
      name: "Logo",
      type: "image",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      locked: false,
      hidden: false,
      opacity: 1,
      asset: { bucket: "certificate-assets", path: "a", type: "png", widthPx: 1, heightPx: 1 },
    };
    expect(recipientWarnings(designOf(hidden, image), values({}), METRICS)).toEqual(NO_WARNINGS);
  });
});
