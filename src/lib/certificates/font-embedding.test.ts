import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ALL_FACES, faceFile, type FaceId, type FontFamilyId, type FaceVariant } from "./fonts";
import { DEFAULT_STYLE, emptyDesign, type Design } from "./design";
import { renderCertificatesPdf } from "./render";

/**
 * Every glyph we draw must survive into the PDF.
 *
 * pdf-lib's font subsetting writes an undecodable `glyf` table for some fonts,
 * which prints as blank or garbled text — and it hits plain letters, not only
 * accented ones. `FULL_EMBED_FACES` lists the faces that must therefore go in
 * whole. This test is what keeps that list honest: for each bundled face it
 * renders a sample, pulls the embedded font program back out of the PDF, and
 * decodes every glyph id the page actually draws. It is also the gate on adding
 * or updating a font.
 */

// No spaces: the space is the one glyph that legitimately has no outline, and a
// subset font's cmap may not identify it, so leaving it out keeps the rule simple —
// every drawn glyph must have outline data.
const SAMPLE = "Thequickbrownfoxjumpsoverthelazydog0123456789ÜnïcodeÀÉÎÕÜàéîõü";
const fontPath = (face: FaceId) => path.join(process.cwd(), "public", "fonts", "cert", faceFile(face));
const loadFont = async (face: FaceId) => new Uint8Array(await readFile(fontPath(face)));

/** A 1×1 PNG stands in for the template. */
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function sampleDesign(face: FaceId, text: string): Design {
  const [family, variant] = face.split("-") as [FontFamilyId, FaceVariant];
  const design = emptyDesign();
  design.elements = [
    {
      id: "s",
      name: "Specimen",
      type: "text",
      x: 5,
      y: 20,
      w: 90,
      h: 60,
      locked: false,
      hidden: false,
      align: "left",
      lineHeight: 1.3,
      fit: "wrap",
      paragraphs: [
        {
          runs: [
            {
              kind: "text",
              text,
              style: { ...DEFAULT_STYLE, font: family, bold: variant.includes("b"), italic: variant.includes("i"), sizePct: 4 },
            },
          ],
        },
      ],
    },
  ];
  return design;
}

const decodeStream = (stream: PDFRawStream): Buffer => {
  const raw = Buffer.from(stream.getContents());
  return String(stream.dict.get(PDFName.of("Filter"))) === "/FlateDecode" ? inflateSync(raw) : raw;
};

/** The embedded font program plus every glyph id the page draws. */
async function readBackFont(pdfBytes: Uint8Array) {
  const pdf = await PDFDocument.load(pdfBytes);
  let fontBytes: Buffer | null = null;
  const contents: Buffer[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) {
      const ref = obj.get(PDFName.of("FontFile2"));
      if (ref) fontBytes = decodeStream(pdf.context.lookup(ref) as PDFRawStream);
    }
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("FontFile2")) === undefined) {
      try {
        contents.push(decodeStream(obj));
      } catch {
        // not a stream we can read; it is not the content stream either
      }
    }
  }
  const gids = new Set<number>();
  for (const stream of contents) {
    for (const match of stream.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const hex = match[1];
      for (let i = 0; i + 4 <= hex.length; i += 4) gids.add(parseInt(hex.slice(i, i + 4), 16));
    }
  }
  return { fontBytes, gids };
}

describe("embedded fonts", () => {
  it.each(ALL_FACES)("%s: every drawn glyph decodes out of the PDF", async (face) => {
    const source = fontkit.create(Buffer.from(await loadFont(face)));
    const text = [...SAMPLE].filter((ch) => source.hasGlyphForCodePoint(ch.codePointAt(0)!)).join("");
    expect(text.length).toBeGreaterThan(40);

    const pdfBytes = await renderCertificatesPdf({
      design: sampleDesign(face, text),
      pages: [{ valueFor: () => "" }],
      loadAsset: async () => PNG,
      loadFont,
    });

    const { fontBytes, gids } = await readBackFont(pdfBytes);
    expect(fontBytes, "no font program embedded").not.toBeNull();
    expect(gids.size).toBeGreaterThan(20);

    const embedded = fontkit.create(fontBytes!);
    const broken: number[] = [];
    for (const gid of gids) {
      if (gid === 0 || gid >= embedded.numGlyphs) {
        broken.push(gid);
        continue;
      }
      try {
        const glyph = embedded.getGlyph(gid);
        // A glyph with no outline is only legitimate for the space.
        if (glyph.path.commands.length === 0 && glyph.advanceWidth > 0 && glyph.codePoints?.[0] !== 32) broken.push(gid);
      } catch {
        broken.push(gid);
      }
    }
    expect(broken, `${face} has ${broken.length} unusable glyphs — add it to FULL_EMBED_FACES`).toEqual([]);
  }, 20_000);
});
