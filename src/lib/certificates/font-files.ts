import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { faceFile, type FaceId } from "./fonts";

/**
 * The bundled TTFs, read from public/fonts/cert — the same files the editor
 * loads with @font-face. next.config.ts traces them into the certificate
 * routes (outputFileTracingIncludes) so they exist inside the Vercel function.
 */
const cache = new Map<FaceId, Promise<Uint8Array>>();

export function loadFontFile(face: FaceId): Promise<Uint8Array> {
  let pending = cache.get(face);
  if (!pending) {
    pending = readFile(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face))).then((b) => new Uint8Array(b));
    pending.catch(() => cache.delete(face));
    cache.set(face, pending);
  }
  return pending;
}
