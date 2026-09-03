/**
 * Browser-side canvas export for the admin image editor.
 *
 * Replays the `drawPlan()` transform onto a canvas and hands back a Blob. This
 * is the only place the edit becomes pixels; everything upstream is numbers
 * (see edit-math.ts), which is why the geometry is testable and this file is
 * deliberately thin.
 *
 * Not unit-tested — it is canvas and ImageBitmap all the way down, and a jsdom
 * shim would only prove the shim works. It is verified in a real browser.
 */

import { drawPlan, outputSize, resolveFrame, type EditState, type Size } from "./edit-math";

/** Canvas cannot preserve GIF animation — baking one keeps only frame 1. */
export const ANIMATED_TYPE = "image/gif";

export interface BakeResult {
  file: File;
  /** Object URL of the baked bytes — the preview shows exactly what uploads. */
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export interface BakeOptions {
  /** Cap on the longer output edge, in pixels. */
  longEdge: number;
  /** 0–1, for the lossy encoders. */
  quality: number;
  /** Base name for the produced File (extension is added to match the type). */
  baseName?: string;
}

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Decode a file into an <img>. The element keeps the browser's default
 * `image-orientation: from-image`, so a phone photo carrying an EXIF rotation
 * flag arrives already upright and `naturalWidth/Height` describe what the user
 * actually sees. The editor and the export both work from this one element, so
 * neither can disagree about orientation.
 */
export function loadImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscaling in one `drawImage` step aliases badly on phone-sized photos, so
 * anything shrinking past half size is pre-resampled by `createImageBitmap`,
 * which does a proper filtered resize. Headroom of 2x is left for the rotation
 * to eat into.
 */
async function sourceFor(
  img: HTMLImageElement,
  natural: Size,
  effectiveScale: number,
): Promise<{ bitmap: ImageBitmap; preScale: number }> {
  if (effectiveScale >= 0.5 || typeof createImageBitmap !== "function") {
    return { bitmap: await createImageBitmap(img), preScale: 1 };
  }
  const preScale = Math.min(1, effectiveScale * 2);
  const bitmap = await createImageBitmap(img, {
    resizeWidth: Math.max(1, Math.round(natural.width * preScale)),
    resizeHeight: Math.max(1, Math.round(natural.height * preScale)),
    resizeQuality: "high",
  });
  return { bitmap, preScale };
}

/**
 * Bake the edit into an image file.
 *
 * WebP is preferred — it is markedly smaller than JPEG at the same quality and,
 * unlike JPEG, keeps a PNG's transparency instead of flattening it to black. A
 * browser that quietly ignores the requested type (returning PNG) is detected
 * and retried as JPEG rather than shipping a needlessly huge file.
 */
export async function bake(
  img: HTMLImageElement,
  state: EditState,
  opts: BakeOptions,
): Promise<BakeResult> {
  const natural: Size = { width: img.naturalWidth, height: img.naturalHeight };
  const frame = resolveFrame(state, natural);
  const output = outputSize(frame, state.zoom, opts.longEdge);
  const plan = drawPlan(state, natural, output);

  const { bitmap, preScale } = await sourceFor(img, natural, plan.outScale * Math.abs(plan.scaleX));

  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the image.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Order mirrors the CSS preview exactly — see the note in edit-math.ts.
  ctx.translate(output.width / 2, output.height / 2);
  ctx.scale(plan.outScale, plan.outScale);
  ctx.translate(plan.offsetX, plan.offsetY);
  ctx.rotate(plan.rotateRad);
  ctx.scale(plan.scaleX / preScale, plan.scaleY / preScale);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2, bitmap.width, bitmap.height);
  bitmap.close();

  let type = "image/webp";
  let blob = await toBlob(canvas, type, opts.quality);
  if (!blob || blob.type !== type) {
    type = "image/jpeg";
    blob = await toBlob(canvas, type, opts.quality);
  }
  if (!blob) throw new Error("This browser could not prepare the image.");

  const name = `${opts.baseName ?? "photo"}.${EXT[blob.type] ?? "jpg"}`;
  const file = new File([blob], name, { type: blob.type });
  return {
    file,
    url: URL.createObjectURL(blob),
    width: output.width,
    height: output.height,
    bytes: blob.size,
  };
}

/**
 * Put a produced File into a real `<input type="file">` so the surrounding
 * plain form submits it as an ordinary file field. This is what lets the whole
 * editor sit in front of the existing server actions without any of them
 * learning that an editor exists.
 */
export function assignToInput(input: HTMLInputElement, file: File | null): void {
  const dt = new DataTransfer();
  if (file) dt.items.add(file);
  input.files = dt.files;
}

/** Human-readable size for the "uploads as …" readout. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
