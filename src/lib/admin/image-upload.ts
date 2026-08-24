import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared image upload for the content verticals (announcements, gallery, …).
 *
 * Uploads an optional image form field to a public Storage bucket via the
 * service role — the buckets have no write policy, so only this server-side path
 * can write (least privilege, SECURITY_SPEC). Returns:
 *  - `{ path }`  a new object was uploaded,
 *  - `{}`        no file was provided (caller decides if that's an error),
 *  - `{ error }` a validation/upload failure to surface on the form.
 *
 * Server-side caps (belt-and-braces with each bucket's own limits): images only,
 * <= 5 MB. The stored object name is a random UUID + extension — never the
 * client filename — so uploads can't collide or path-traverse.
 */

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_IMAGE = 5 * 1024 * 1024;

export async function handleImageUpload(
  formData: FormData,
  opts: { bucket: string; field?: string },
): Promise<{ path?: string; error?: string }> {
  const file = formData.get(opts.field ?? "image");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_IMAGE) return { error: "Image must be 5 MB or smaller." };
  const ext = EXT[file.type];
  if (!ext) return { error: "Image must be PNG, JPEG, WebP or GIF." };

  const admin = createAdminClient();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from(opts.bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "Could not upload the image. Try again." };
  return { path };
}
