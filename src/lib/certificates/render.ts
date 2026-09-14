import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { AssetRef, Design } from "./design";
import { needsFullEmbed, type FaceId } from "./fonts";
import { layoutText } from "./layout";
import { METRICS } from "./metrics";
import { NO_FEATURES } from "./pdf-features";
import { qrMatrix, qrPath, qrRuns, qrSpan, qrSquare, verifyUrl } from "./qr";
import { siteOrigin } from "@/lib/site-origin";

/**
 * Draw certificates as a PDF (spec §6.5): one page per entry in `pages`, each
 * the same design with its own field values. Text comes from the shared layout
 * engine, so it lands exactly where the editor showed it. Assets and fonts are
 * embedded once per document and shared by every page.
 *
 * I/O is injected (`loadAsset`, `loadFont`) so this stays testable and the
 * caller controls caching.
 */

/** The PDF page's long edge in points — A4 (842 × 595 pt) for an A4-shaped template. */
export const PAGE_LONG_EDGE_PT = 842;

export interface RenderInput {
  design: Design;
  pages: { valueFor: (field: string) => string }[];
  loadAsset: (ref: AssetRef) => Promise<Uint8Array>;
  loadFont: (face: FaceId) => Promise<Uint8Array>;
  /** Origin the verification QR points at. Defaults to NEXT_PUBLIC_SITE_URL; tests pass their own. */
  verifyOrigin?: string;
  /** Diagonal watermark text, e.g. "PREVIEW". */
  watermark?: string;
  title?: string;
}

const rgbHex = (hex: string) =>
  rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

export async function renderCertificatesPdf(input: RenderInput): Promise<Uint8Array> {
  const { design } = input;
  const W = design.page.widthPx;
  const H = design.page.heightPx;
  const k = PAGE_LONG_EDGE_PT / Math.max(W, H); // page px → pt
  const pageW = W * k;
  const pageH = H * k;

  const origin = input.verifyOrigin ?? siteOrigin() ?? "";

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setProducer("CSE Club Council");
  pdf.setCreator("CSE Club Council certificates");
  if (input.title) pdf.setTitle(input.title);

  const images = new Map<string, Promise<PDFImage>>();
  const image = (ref: AssetRef) => {
    const key = `${ref.bucket}/${ref.path}`;
    let p = images.get(key);
    if (!p) {
      p = input.loadAsset(ref).then((bytes) => (ref.type === "png" ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)));
      images.set(key, p);
    }
    return p;
  };
  const fonts = new Map<FaceId, Promise<PDFFont>>();
  const font = (face: FaceId) => {
    let p = fonts.get(face);
    if (!p) {
      p = input
        .loadFont(face)
        .then((bytes) => pdf.embedFont(bytes, { subset: !needsFullEmbed(face), features: NO_FEATURES }));
      fonts.set(face, p);
    }
    return p;
  };

  for (const { valueFor } of input.pages) {
    const page = pdf.addPage([pageW, pageH]);
    if (design.page.template) {
      page.drawImage(await image(design.page.template), { x: 0, y: 0, width: pageW, height: pageH });
    }
    for (const el of design.elements) {
      if (el.hidden) continue;
      if (el.type === "image") {
        const w = (el.w / 100) * W * k;
        const h = (el.h / 100) * H * k;
        page.drawImage(await image(el.asset), {
          x: (el.x / 100) * W * k,
          y: pageH - (el.y / 100) * H * k - h,
          width: w,
          height: h,
          opacity: el.opacity,
        });
        continue;
      }
      if (el.type === "qr") {
        // The QR is per certificate: it encodes this page's own serial.
        const serial = valueFor("cert.serial");
        if (!serial) continue;
        if (!origin) throw new Error("NEXT_PUBLIC_SITE_URL is not set — the verification QR would point nowhere.");
        const matrix = qrMatrix(verifyUrl(origin, serial));
        const square = qrSquare({ x: (el.x / 100) * W, y: (el.y / 100) * H, w: (el.w / 100) * W, h: (el.h / 100) * H });
        // drawSvgPath flips y itself: path units go down from (x, y) as in the editor's SVG.
        page.drawSvgPath(qrPath(qrRuns(matrix)), {
          x: square.x * k,
          y: pageH - square.y * k,
          scale: (square.side / qrSpan(matrix)) * k,
          color: rgbHex(el.color),
        });
        continue;
      }
      const layout = layoutText(el, valueFor, design.page, METRICS);
      for (const line of layout.lines) {
        for (const run of line.runs) {
          const color = rgbHex(run.color);
          page.drawText(run.text, {
            x: run.x * k,
            y: pageH - line.baseline * k,
            size: run.size * k,
            font: await font(run.face),
            color,
          });
          if (run.underline) {
            page.drawRectangle({
              x: run.x * k,
              y: pageH - (run.underline.y + run.underline.thickness) * k,
              width: run.width * k,
              height: run.underline.thickness * k,
              color,
            });
          }
        }
      }
    }
    if (input.watermark) {
      const helv = await pdf.embedFont(StandardFonts.HelveticaBold);
      const size = pageH / 5;
      const width = helv.widthOfTextAtSize(input.watermark, size);
      page.drawText(input.watermark, {
        x: pageW / 2 - (width / 2) * Math.cos(Math.PI / 6),
        y: pageH / 2 - (width / 2) * Math.sin(Math.PI / 6),
        size,
        font: helv,
        color: rgb(0.8, 0.1, 0.1),
        opacity: 0.12,
        rotate: degrees(30),
      });
    }
  }
  return pdf.save();
}
