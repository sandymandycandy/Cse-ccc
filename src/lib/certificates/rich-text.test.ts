import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE, emptyDesign, type Paragraph, type Style, type TextElement } from "./design";
import {
  applyStyleToAll,
  docToParagraphs,
  listFieldRuns,
  paragraphsToDoc,
  primaryStyle,
  replaceUnknownFields,
  designWithUnknownFieldsAsText,
  setFieldTransform,
  type PMNode,
} from "./rich-text";

const PAGE_H = 2000;
const bold: Style = { ...DEFAULT_STYLE, bold: true, sizePct: 6, color: "#aa0000", font: "lora" };

const sample: Paragraph[] = [
  {
    runs: [
      { kind: "text", text: "This is to certify that ", style: DEFAULT_STYLE },
      { kind: "field", field: "person.name", transform: "title", style: bold },
      { kind: "text", text: ".", style: DEFAULT_STYLE },
    ],
  },
  { runs: [] },
  { runs: [{ kind: "text", text: "Second", style: { ...DEFAULT_STYLE, italic: true, underline: true } }] },
];

describe("paragraphsToDoc / docToParagraphs", () => {
  it("round-trips text, fields, empty paragraphs and styles", () => {
    const doc = paragraphsToDoc(sample, PAGE_H);
    expect(docToParagraphs(doc, PAGE_H, DEFAULT_STYLE)).toEqual(sample);
  });

  it("encodes styles as TipTap marks in page px", () => {
    const doc = paragraphsToDoc(sample, PAGE_H);
    const field = doc.content![0].content![1];
    expect(field).toEqual({
      type: "certField",
      attrs: { field: "person.name", transform: "title" },
      marks: [{ type: "bold" }, { type: "textStyle", attrs: { fontFamily: "cert-lora", fontSize: "120px", color: "#aa0000" } }],
    });
    expect(doc.content![1]).toEqual({ type: "paragraph" });
  });

  it("merges adjacent same-style text and lets unstyled text inherit", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [{ type: "textStyle", attrs: { fontFamily: "cert-cinzel", fontSize: "100px", color: "rgb(255, 0, 0)" } }] },
            { type: "text", text: "world", marks: [{ type: "textStyle", attrs: { fontFamily: "cert-cinzel", fontSize: "100px", color: "#f00" } }] },
          ],
        },
      ],
    };
    expect(docToParagraphs(doc, 1000, DEFAULT_STYLE)).toEqual([
      { runs: [{ kind: "text", text: "Hello world", style: { ...DEFAULT_STYLE, font: "cinzel", sizePct: 10, color: "#ff0000" } }] },
    ]);
  });

  it("drops a bold/italic the family cannot draw", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Name", marks: [{ type: "bold" }, { type: "italic" }, { type: "textStyle", attrs: { fontFamily: "cert-cinzel" } }] }],
        },
      ],
    };
    const [p] = docToParagraphs(doc, 1000, DEFAULT_STYLE);
    expect(p.runs[0].style).toMatchObject({ font: "cinzel", bold: true, italic: false });
  });

  it("splits on hard breaks and returns one empty paragraph for an empty doc", () => {
    const doc: PMNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] }],
    };
    expect(docToParagraphs(doc, 1000, DEFAULT_STYLE).map((p) => p.runs.length)).toEqual([1, 1]);
    expect(docToParagraphs({ type: "doc" }, 1000, DEFAULT_STYLE)).toEqual([{ runs: [] }]);
  });
});

describe("whole-box helpers", () => {
  it("applies a style patch to every run, keeping faces valid", () => {
    const out = applyStyleToAll(sample, { font: "greatvibes" });
    for (const r of out.flatMap((p) => p.runs)) {
      expect(r.style.font).toBe("greatvibes");
      expect(r.style.bold || r.style.italic).toBe(false);
    }
    expect(primaryStyle(out, DEFAULT_STYLE).font).toBe("greatvibes");
    expect(primaryStyle([{ runs: [] }], bold)).toBe(bold);
  });

  it("lists field runs and changes one's transform", () => {
    const refs = listFieldRuns(sample);
    expect(refs).toEqual([{ paragraph: 0, run: 1, field: "person.name", transform: "title" }]);
    const out = setFieldTransform(sample, refs[0], "upper");
    expect(listFieldRuns(out)[0].transform).toBe("upper");
    expect(sample[0].runs[1]).toMatchObject({ transform: "title" }); // input untouched
  });

  it("turns unknown fields into visible placeholder text", () => {
    const out = replaceUnknownFields(sample, (k) => k !== "person.name", () => "Name");
    expect(out[0].runs[1]).toEqual({ kind: "text", text: "{Name}", style: bold });
  });

  it("does it for a whole design", () => {
    const el: TextElement = { id: "t", name: "T", type: "text", x: 0, y: 0, w: 10, h: 10, locked: false, hidden: false, align: "left", lineHeight: 1, fit: "wrap", paragraphs: sample };
    const out = designWithUnknownFieldsAsText({ ...emptyDesign(), elements: [el] }, () => false, (k) => k);
    expect(listFieldRuns((out.elements[0] as TextElement).paragraphs)).toEqual([]);
  });
});
