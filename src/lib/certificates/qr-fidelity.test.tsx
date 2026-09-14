import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { emptyDesign, type Design, type QrElement } from "./design";
import { PAGE_LONG_EDGE_PT, renderCertificatesPdf } from "./render";
import { qrMatrix, qrPath, qrRuns, qrSpan, qrSquare, verifyUrl } from "./qr";
import { QrSvg } from "@/components/admin/certificates/QrSvg";

/**
 * The verification QR must land in the PDF exactly where the editor shows it,
 * at the same size. Both sides draw `qrPath` under a translate + scale, so this
 * pins both transforms to the same numbers (as layout-fidelity does for text).
 */

const ORIGIN = "https://cse-ccc.vercel.app";
const SERIAL = "CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ0";
const qr: QrElement = { id: "qr", name: "QR", type: "qr", x: 80, y: 66, w: 14, h: 22, locked: false, hidden: false, color: "#224466" };
const design: Design = { ...emptyDesign(), elements: [qr] };
const box = {
  x: (qr.x / 100) * design.page.widthPx,
  y: (qr.y / 100) * design.page.heightPx,
  w: (qr.w / 100) * design.page.widthPx,
  h: (qr.h / 100) * design.page.heightPx,
};
const url = verifyUrl(ORIGIN, SERIAL);
const matrix = qrMatrix(url);
const square = qrSquare(box);
const moduleSize = square.side / qrSpan(matrix);

async function contentStreams(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  let content = "";
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const raw = Buffer.from(obj.getContents());
    const decoded = String(obj.dict.get(PDFName.of("Filter"))) === "/FlateDecode" ? inflateSync(raw) : raw;
    const text = decoded.toString("latin1");
    if (text.includes(" cm")) content += text;
  }
  return content;
}

describe("verification QR: editor and PDF agree", () => {
  it("the editor draws the shared path, one unit per module, at the centred square", () => {
    const svg = renderToStaticMarkup(
      <svg>
        <QrSvg box={box} color={qr.color} text={url} />
      </svg>,
    );
    const g = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/.exec(svg);
    expect(g, svg.slice(0, 200)).not.toBeNull();
    expect(Number(g![1])).toBeCloseTo(square.x, 6);
    expect(Number(g![2])).toBeCloseTo(square.y, 6);
    expect(Number(g![3])).toBeCloseTo(moduleSize, 6);
    expect(svg).toContain(`d="${qrPath(qrRuns(matrix))}"`);
    expect(svg).toContain('fill="#224466"');
  });

  it("the PDF applies the same placement in points, with the y axis flipped", async () => {
    const bytes = await renderCertificatesPdf({
      design,
      pages: [{ valueFor: (k) => (k === "cert.serial" ? SERIAL : "") }],
      loadAsset: async () => new Uint8Array(),
      loadFont: async () => new Uint8Array(),
      verifyOrigin: ORIGIN,
    });
    const k = PAGE_LONG_EDGE_PT / Math.max(design.page.widthPx, design.page.heightPx);
    const pageH = design.page.heightPx * k;
    const content = await contentStreams(bytes);

    const translate = /1 0 0 1 ([\d.-]+) ([\d.-]+) cm/.exec(content);
    const scale = /([\d.]+) 0 0 -([\d.]+) 0 0 cm/.exec(content);
    expect(translate, content.slice(0, 400)).not.toBeNull();
    expect(scale, content.slice(0, 400)).not.toBeNull();
    expect(Number(translate![1])).toBeCloseTo(square.x * k, 3);
    expect(Number(translate![2])).toBeCloseTo(pageH - square.y * k, 3);
    expect(Number(scale![1])).toBeCloseTo(moduleSize * k, 4);
    expect(Number(scale![2])).toBeCloseTo(moduleSize * k, 4);
    // One moveto per run: every dark module is drawn, none twice.
    expect(content.match(/^[\d.-]+ [\d.-]+ m$/gm)?.length).toBe(qrRuns(matrix).length);
  });
});
