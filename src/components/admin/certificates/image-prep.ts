/**
 * Getting a picked file ready to upload (spec §6.3): pdf-lib embeds only PNG
 * and JPEG, so SVG/WebP are rasterised; oversized templates are scaled down to
 * A4 at 300 dpi; big opaque PNG templates become JPEG. JPEGs are always redrawn:
 * a phone photo's EXIF rotation is applied by the browser but ignored by
 * pdf-lib, so only baked-in pixels print the way the editor shows them.
 * The decisions are pure (`planImagePrep`); `prepareImage` does the canvas work.
 */

export type AssetKind = "template" | "image";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TEMPLATE_BOX = { long: 3508, short: 2480 };
const IMAGE_LONG_EDGE = 2000;
const PNG_TO_JPEG_BYTES = 3 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

export interface PrepPlan {
  /** Draw through a canvas (convert and/or resize) instead of uploading the file as-is. */
  redraw: boolean;
  width: number;
  height: number;
  /** Output format when redrawing; "auto" = JPEG if the pixels turn out opaque, else PNG. */
  output: "png" | "jpeg" | "auto";
}

export function isAcceptedImage(mime: string): boolean {
  return ACCEPTED.has(mime);
}

/** Largest size within the limit for this kind, keeping the aspect ratio (never upscales). */
export function fitSize(width: number, height: number, kind: AssetKind): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale =
    kind === "template"
      ? Math.min(1, TEMPLATE_BOX.long / long, TEMPLATE_BOX.short / short)
      : Math.min(1, IMAGE_LONG_EDGE / long);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function planImagePrep(file: { type: string; size: number }, natural: { width: number; height: number }, kind: AssetKind): PrepPlan {
  const target = fitSize(natural.width, natural.height, kind);
  const resized = target.width !== natural.width || target.height !== natural.height;
  const png = file.type === "image/png";
  const heavyPngTemplate = kind === "template" && png && file.size > PNG_TO_JPEG_BYTES;
  const output: PrepPlan["output"] =
    file.type === "image/jpeg" ? "jpeg" : heavyPngTemplate || (kind === "template" && !png) ? "auto" : "png";
  return { redraw: !png || resized || heavyPngTemplate, ...target, output };
}

export interface PreparedImage {
  blob: Blob;
  type: "png" | "jpg";
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't an image the browser can read."));
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), type, quality),
  );
}

/** Browser only. Throws with a user-facing message. */
export async function prepareImage(file: File, kind: AssetKind): Promise<PreparedImage> {
  if (!isAcceptedImage(file.type)) throw new Error("Use a PNG, JPEG, SVG or WebP image.");
  const img = await loadImage(file);
  // SVGs without an intrinsic size report 0 — give them a sensible canvas.
  const natural = { width: img.naturalWidth || 1200, height: img.naturalHeight || 1200 };
  const plan = planImagePrep(file, natural, kind);

  let prepared: PreparedImage;
  if (!plan.redraw) {
    prepared = { blob: file, type: file.type === "image/png" ? "png" : "jpg", width: natural.width, height: natural.height };
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare images.");
    ctx.drawImage(img, 0, 0, plan.width, plan.height);
    let opaque = false;
    if (plan.output === "auto") {
      const { data } = ctx.getImageData(0, 0, plan.width, plan.height);
      opaque = true;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          opaque = false;
          break;
        }
      }
    }
    prepared =
      plan.output === "jpeg" || opaque
        ? { blob: await toBlob(canvas, "image/jpeg", 0.92), type: "jpg", width: plan.width, height: plan.height }
        : { blob: await toBlob(canvas, "image/png"), type: "png", width: plan.width, height: plan.height };
  }
  if (prepared.blob.size > MAX_UPLOAD_BYTES) throw new Error("That image is still over 8 MB after preparing it — use a smaller file.");
  return prepared;
}
