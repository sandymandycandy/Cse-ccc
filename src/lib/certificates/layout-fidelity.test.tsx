import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { DEFAULT_STYLE, emptyDesign, type Design, type TextElement } from "./design";
import { faceFile, type FaceId } from "./fonts";
import { layoutText } from "./layout";
import { METRICS } from "./metrics";
import { PAGE_LONG_EDGE_PT, renderCertificatesPdf } from "./render";
import { TextSvg } from "@/components/admin/certificates/TextSvg";

/**
 * The promise the whole designer rests on: what the organiser sees in the
 * editor is what the recipient gets in the PDF.
 *
 * Both sides consume `layoutText` output, so this test pins both mappings to
 * the same numbers — the editor's SVG attributes, and the PDF's text-positioning
 * operators — instead of trusting them to stay in step.
 */

const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const loadFont = async (face: FaceId) =>
  new Uint8Array(await readFile(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face))));

const body: TextElement = {
  id: "body",
  name: "Body",
  type: "text",
  x: 10,
  y: 40,
  w: 80,
  h: 12,
  locked: false,
  hidden: false,
  align: "center",
  lineHeight: 1.35,
  fit: "wrap",
  paragraphs: [
    {
      runs: [
        { kind: "text", text: "This is to certify that ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 3 } },
        { kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, font: "playfair", sizePct: 4.5, bold: true } },
        { kind: "text", text: " took part in the annual showcase and did rather well.", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 3 } },
      ],
    },
  ],
};

const design: Design = { ...emptyDesign(), elements: [body] };
const valueFor = (key: string) => (key === "person.name" ? "venkata satya sai" : "");

/**
 * Every text placement in the page's content stream: `/<font> <size> Tf` sets
 * the size, `1 0 0 1 x y Tm` positions the run that follows. Font names are
 * pdf-lib's subset names (`/Lora-Regular-9742682568`), not `/F1`.
 */
function pdfTextPositions(bytes: Buffer): { x: number; y: number; size: number }[] {
  const text = bytes.toString("latin1");
  const out: { x: number; y: number; size: number }[] = [];
  let size = 0;
  for (const m of text.matchAll(/\/\S+\s+([\d.]+)\s+Tf|1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
    if (m[1] !== undefined) size = Number(m[1]);
    else out.push({ x: Number(m[2]), y: Number(m[3]), size });
  }
  return out;
}

describe("editor preview and PDF agree", () => {
  const layout = layoutText(body, valueFor, design.page, METRICS);
  const runs = layout.lines.flatMap((line) => line.runs.map((run) => ({ run, baseline: line.baseline })));

  it("lays the sample out over more than one line, with mixed sizes", () => {
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(new Set(runs.map((r) => r.run.size)).size).toBeGreaterThan(1);
  });

  it("the editor SVG places every run at the layout's own numbers", () => {
    const svg = renderToStaticMarkup(<TextSvg layout={layout} />);
    const drawn = [...svg.matchAll(/<text[^>]*?x="([\d.-]+)"[^>]*?y="([\d.-]+)"[^>]*?font-size="([\d.-]+)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      size: Number(m[3]),
    }));
    expect(drawn).toHaveLength(runs.length);
    drawn.forEach((d, i) => {
      expect(d.x).toBeCloseTo(runs[i].run.x, 6);
      expect(d.y).toBeCloseTo(runs[i].baseline, 6);
      expect(d.size).toBeCloseTo(runs[i].run.size, 6);
    });
  });

  it("the PDF places every run at the same numbers, scaled to the page", async () => {
    const pdfBytes = await renderCertificatesPdf({
      design,
      pages: [{ valueFor }],
      loadAsset: async () => PNG,
      loadFont,
    });
    const pdf = await PDFDocument.load(pdfBytes);
    const { width: pageW, height: pageH } = pdf.getPage(0).getSize();
    const k = PAGE_LONG_EDGE_PT / Math.max(design.page.widthPx, design.page.heightPx);
    expect(pageW).toBeCloseTo(design.page.widthPx * k, 5);

    let content: Buffer | null = null;
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("FontFile2")) === undefined) {
        const raw = Buffer.from(obj.getContents());
        const decoded = String(obj.dict.get(PDFName.of("Filter"))) === "/FlateDecode" ? inflateSync(raw) : raw;
        if (decoded.toString("latin1").includes(" Tj")) content = decoded;
      }
    }
    expect(content, "no text content stream found").not.toBeNull();

    const placed = pdfTextPositions(content!);
    expect(placed).toHaveLength(runs.length);
    placed.forEach((p, i) => {
      // PDF's origin is bottom-left; the layout's is top-left.
      expect(p.x).toBeCloseTo(runs[i].run.x * k, 3);
      expect(p.y).toBeCloseTo(pageH - runs[i].baseline * k, 3);
      expect(p.size).toBeCloseTo(runs[i].run.size * k, 3);
    });
  });
});
