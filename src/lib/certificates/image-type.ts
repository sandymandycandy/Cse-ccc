/**
 * Identify a PNG or JPEG from its bytes and read its pixel size — no decoding,
 * no dependencies. Used to check an uploaded asset really is what it claims
 * (magic bytes, spec §8) and to size a v1 template during conversion.
 */
export interface SniffedImage {
  type: "png" | "jpg";
  width: number;
  height: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 24 && PNG_SIG.every((b, i) => bytes[i] === b)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  return null;
}

function jpegSize(bytes: Uint8Array): SniffedImage | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { type: "jpg", width, height } : null;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}
