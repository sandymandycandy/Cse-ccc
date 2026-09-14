import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ALL_FACES, faceFile } from "./fonts";
import { METRICS } from "./metrics";
import { NO_FEATURES } from "./pdf-features";

// The whole preview-equals-PDF promise rests on this: the widths the layout
// engine measures with must be the widths pdf-lib draws with.
const SAMPLE = "The quick brown fox — “Venkata” Śrī office ffi AVAWAY Tê ₹1,000 ‘ok’…";

describe("font metrics", () => {
  it("has metrics for every bundled face", () => {
    expect(Object.keys(METRICS).sort()).toEqual([...ALL_FACES].sort());
  });

  it.each(ALL_FACES)("%s widths equal pdf-lib's", async (face) => {
    const m = METRICS[face];
    const bytes = readFileSync(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face)));
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(bytes, { subset: true, features: NO_FEATURES });
    const text = [...SAMPLE].filter((ch) => m.widths[ch.codePointAt(0)!] !== undefined).join("");
    const ours =
      ([...text].reduce((sum, ch) => sum + m.widths[ch.codePointAt(0)!], 0) / m.unitsPerEm) * 50;
    expect(text.length).toBeGreaterThan(40);
    expect(ours).toBeCloseTo(font.widthOfTextAtSize(text, 50), 6);
  });
});
