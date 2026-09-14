import { describe, it, expect } from "vitest";
import { sniffImage } from "./image-type";

// 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** A structurally valid JPEG header: SOI, an APP0 segment, then SOF0 (h=480, w=640). */
function jpegHeader(): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

describe("sniffImage", () => {
  it("reads a PNG's size", () => {
    expect(sniffImage(new Uint8Array(PNG))).toEqual({ type: "png", width: 1, height: 1 });
  });

  it("reads a JPEG's size from its SOF segment", () => {
    expect(sniffImage(jpegHeader())).toEqual({ type: "jpg", width: 640, height: 480 });
  });

  it("rejects anything else", () => {
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
