import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderCertificatesPdf, PAGE_LONG_EDGE_PT } from "./render";
import { DEFAULT_STYLE, emptyDesign, type Design } from "./design";
import { faceFile, type FaceId } from "./fonts";

// 1×1 PNG — enough to exercise embedding.
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const loadFont = (face: FaceId) => readFile(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face)));
const isPdf = (b: Uint8Array) => Buffer.from(b.slice(0, 5)).toString("latin1") === "%PDF-";
const asset = (p: string) => ({ bucket: "certificate-assets" as const, path: p, type: "png" as const, widthPx: 1, heightPx: 1 });

function design(): Design {
  const d = emptyDesign(); // 3508 × 2480
  d.page.template = asset("template");
  d.elements = [
    { id: "logo", name: "Logo", type: "image", x: 5, y: 5, w: 10, h: 10, locked: false, hidden: false, opacity: 0.8, asset: asset("logo") },
    {
      id: "body",
      name: "Body",
      type: "text",
      x: 10,
      y: 40,
      w: 80,
      h: 10,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.3,
      fit: "wrap",
      paragraphs: [
        {
          runs: [
            { kind: "text", text: "This is to certify that ", style: DEFAULT_STYLE },
            { kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, bold: true, underline: true } },
          ],
        },
      ],
    },
  ];
  return d;
}

describe("renderCertificatesPdf", () => {
  it("renders one A4-sized page per recipient and embeds shared images once", async () => {
    const loads: string[] = [];
    const bytes = await renderCertificatesPdf({
      design: design(),
      pages: [{ valueFor: () => "asha r" }, { valueFor: () => "ravi k" }],
      loadAsset: async (ref) => {
        loads.push(ref.path);
        return PNG;
      },
      loadFont,
      title: "Certificates",
    });
    expect(isPdf(bytes)).toBe(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(PAGE_LONG_EDGE_PT, 5);
    expect(height).toBeCloseTo((2480 / 3508) * PAGE_LONG_EDGE_PT, 5);
    expect(loads.sort()).toEqual(["logo", "template"]);
  });

  it("renders a watermark and skips hidden elements", async () => {
    const d = design();
    d.elements[0].hidden = true;
    const loads: string[] = [];
    const bytes = await renderCertificatesPdf({
      design: d,
      pages: [{ valueFor: () => "" }],
      loadAsset: async (ref) => {
        loads.push(ref.path);
        return PNG;
      },
      loadFont,
      watermark: "PREVIEW",
    });
    expect(isPdf(bytes)).toBe(true);
    expect(loads).toEqual(["template"]);
  });
});

describe("renderCertificatesPdf — verification QR", () => {
  const qrDesign = (): Design => {
    const d = emptyDesign();
    d.elements = [{ id: "qr", name: "QR", type: "qr", x: 80, y: 70, w: 12, h: 17, locked: false, hidden: false, color: "#000000" }];
    return d;
  };
  const serialOnly = (key: string) => (key === "cert.serial" ? "CSE-2026-9F3AC1B2" : "");

  // These pass no origin, so an attempt to draw would throw: resolving proves the QR was skipped.
  it("draws nothing for a QR without a serial", async () => {
    const bytes = await renderCertificatesPdf({ design: qrDesign(), pages: [{ valueFor: () => "" }], loadAsset: async () => PNG, loadFont, verifyOrigin: "" });
    expect(isPdf(bytes)).toBe(true);
  });

  it("refuses to print a QR that would point nowhere", async () => {
    await expect(
      renderCertificatesPdf({ design: qrDesign(), pages: [{ valueFor: serialOnly }], loadAsset: async () => PNG, loadFont, verifyOrigin: "" }),
    ).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("skips a hidden QR", async () => {
    const d = qrDesign();
    d.elements[0].hidden = true;
    const bytes = await renderCertificatesPdf({ design: d, pages: [{ valueFor: serialOnly }], loadAsset: async () => PNG, loadFont, verifyOrigin: "" });
    expect(isPdf(bytes)).toBe(true);
  });
});

describe("renderCertificatesPdf — a design per page", () => {
  it("draws each page with its own design and size, embedding each template once", async () => {
    const landscape = design();
    const portrait: Design = { ...emptyDesign(), page: { template: asset("portrait"), widthPx: 2480, heightPx: 3508 } };
    const loads: string[] = [];
    const bytes = await renderCertificatesPdf({
      design: landscape,
      pages: [
        { valueFor: () => "asha r" },
        { valueFor: () => "ravi k", design: portrait },
        { valueFor: () => "kim p" },
      ],
      loadAsset: async (ref) => {
        loads.push(ref.path);
        return PNG;
      },
      loadFont,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const sizes = doc.getPages().map((p) => p.getSize());
    expect(sizes[0].width).toBeGreaterThan(sizes[0].height);
    expect(sizes[1].height).toBeCloseTo(PAGE_LONG_EDGE_PT, 5);
    expect(sizes[1].width).toBeLessThan(sizes[1].height);
    expect(sizes[2]).toEqual(sizes[0]);
    expect(loads.sort()).toEqual(["logo", "portrait", "template"]);
  });
});
