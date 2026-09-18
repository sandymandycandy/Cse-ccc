import "server-only";
import sharp from "sharp";
import { handleImageUpload } from "./image-upload";

/**
 * The same bucket src/lib/admin/team.ts already names, and already provisioned
 * (public, 2 MB, image MIME types). Re-homed here because that module serves
 * council_members and may be retired; do NOT add a second constant for the
 * same bucket — point other importers at this one instead.
 */
export const COUNCIL_PHOTO_BUCKET = "council-photos";

/**
 * Portraits may be large: these are camera/phone originals, and shrinking them
 * by hand before upload is exactly the chore this admin exists to avoid.
 *
 * ⚠️ THREE limits must stay in agreement, largest last:
 *   1. this value,
 *   2. the `council-photos` bucket's own file_size_limit (raised to 10 MB on
 *      2026-09-18) — Storage rejects anything above it regardless of this,
 *   3. experimental.serverActions.bodySizeLimit in next.config.ts, which must
 *      be ABOVE this so OUR check reports the size, not Next's opaque 413.
 * upload-limits.test.ts pins (1) against (3).
 */
export const PORTRAIT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Uploads a portrait and measures it.
 *
 * Width and height are stored because coverPosition() in src/data/ccc.ts
 * divides by the image aspect ratio, and a Storage URL carries no dimensions
 * the way a static import does.
 *
 * The blur is stored because <Image placeholder="blur"> THROWS for a remote src
 * unless blurDataURL is supplied.
 */
export async function uploadPortrait(formData: FormData): Promise<{
  path?: string;
  width?: number;
  height?: number;
  blur?: string;
  error?: string;
}> {
  const file = formData.get("photo");
  const uploaded = await handleImageUpload(formData, {
    bucket: COUNCIL_PHOTO_BUCKET,
    field: "photo",
    maxBytes: PORTRAIT_MAX_BYTES,
  });
  if (uploaded.error) return { error: uploaded.error };
  if (!uploaded.path) return {};
  if (!(file instanceof File)) return { path: uploaded.path };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const img = sharp(buf);
    const { width, height } = await img.metadata();
    const thumb = await img.resize(16).webp({ quality: 40 }).toBuffer();
    return {
      path: uploaded.path,
      width,
      height,
      blur: `data:image/webp;base64,${thumb.toString("base64")}`,
    };
  } catch {
    // The object IS stored, so keep the path. Without width/height
    // photoOverrides() ignores it and the bundled portrait keeps showing — a
    // visible no-op rather than a broken crop. Re-uploading fixes it.
    return { path: uploaded.path };
  }
}
