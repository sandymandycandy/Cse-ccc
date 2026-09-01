import { describe, it, expect } from "vitest";
import { renderCertificatePdf } from "./render";
import { DEFAULT_CERTIFICATE_CONFIG } from "./config";

// A 1×1 PNG — enough to exercise embed → drawText → save end-to-end.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString("latin1") === "%PDF-";

describe("renderCertificatePdf", () => {
  it("embeds the template and returns a valid PDF", async () => {
    const bytes = await renderCertificatePdf({
      templateBytes: new Uint8Array(PNG_1x1),
      templateType: "png",
      name: "Ada Lovelace",
      config: DEFAULT_CERTIFICATE_CONFIG,
    });
    expect(bytes.byteLength).toBeGreaterThan(400);
    expect(isPdf(bytes)).toBe(true);
  });

  it("never throws on names with characters Times-Bold can't encode", async () => {
    const bytes = await renderCertificatePdf({
      templateBytes: new Uint8Array(PNG_1x1),
      templateType: "png",
      name: "José 🚀 Ünïcode",
      config: { ...DEFAULT_CERTIFICATE_CONFIG, align: "left" },
    });
    expect(isPdf(bytes)).toBe(true);
  });
});
