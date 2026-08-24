import { describe, it, expect } from "vitest";
import { qrDataUrl } from "./qr";

describe("qrDataUrl", () => {
  it("produces a PNG data URL for a URL", async () => {
    const out = await qrDataUrl("https://example.com/m/abc.def");
    expect(out.startsWith("data:image/png;base64,")).toBe(true);
    expect(out.length).toBeGreaterThan(100);
  });
});
