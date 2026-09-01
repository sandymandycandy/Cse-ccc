import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { computeNamePlacement, type CertificateConfig } from "./config";

/**
 * Render one participation certificate as a PDF: the uploaded template image is
 * drawn as a full-page background at its native pixel size, and the recipient's
 * name is drawn on top at the organiser-configured position. Pure aside from no
 * I/O — takes template bytes in, returns PDF bytes out — so the caller owns
 * fetching the template and sending the mail. pdf-lib is pure JS (no native deps
 * → runs on Vercel Functions).
 */

const rgbFromHex = (hex: string) => {
  const n = hex.replace("#", "");
  return rgb(
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  );
};

/** Times-Bold (a PDF standard font) only encodes Latin-1; drop anything else so
 *  an exotic character in a name can never throw mid-render. */
const sanitizeName = (name: string) =>
  name.normalize("NFKD").replace(/[^\x20-\xFF]/g, "").trim();

export async function renderCertificatePdf(args: {
  templateBytes: Uint8Array;
  templateType: "png" | "jpg";
  name: string;
  config: CertificateConfig;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const img =
    args.templateType === "png"
      ? await pdf.embedPng(args.templateBytes)
      : await pdf.embedJpg(args.templateBytes);

  const { width, height } = img;
  const page = pdf.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });

  const name = sanitizeName(args.name) || "Participant";
  const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const size = (args.config.fontPct / 100) * height;
  const textWidth = font.widthOfTextAtSize(name, size);
  const placement = computeNamePlacement(width, height, args.config, textWidth);

  page.drawText(name, {
    x: placement.x,
    y: placement.y,
    size: placement.size,
    font,
    color: rgbFromHex(args.config.color),
  });

  return pdf.save();
}
