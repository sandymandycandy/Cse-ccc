"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { uniqueSlug, getAnnouncementForEdit } from "@/lib/admin/announcements";
import type { AnnouncementFormState } from "@/lib/admin/form-state";

const Schema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(1).max(20000),
});

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_IMAGE = 5 * 1024 * 1024;

/**
 * Handle an optional uploaded image. Returns:
 *  - a string path when a new image was uploaded,
 *  - undefined when none was provided (caller leaves the field unchanged),
 *  - an error string to surface to the form.
 */
async function handleImage(
  formData: FormData,
): Promise<{ path?: string; error?: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > MAX_IMAGE) return { error: "Image must be 5 MB or smaller." };
  const ext = EXT[file.type];
  if (!ext) return { error: "Image must be PNG, JPEG, WebP or GIF." };

  const admin = createAdminClient();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from("announcements")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "Could not upload the image. Try again." };
  return { path };
}

export async function createAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  // Announcements are council-wide (no club) → only org-wide managers.
  if (!canManage(session, "manage:content")) {
    return { error: "You can't manage announcements." };
  }

  const parsed = Schema.safeParse({ title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) return { error: "Check the form — title and body are required." };
  const { title, body } = parsed.data;
  const published = formData.get("published") === "on";

  const img = await handleImage(formData);
  if (img.error) return { error: img.error };

  const admin = createAdminClient();
  const slug = await uniqueSlug(title);
  const { data, error } = await admin
    .from("announcements")
    .insert({
      slug,
      title,
      body_markdown: body,
      published_at: published ? new Date().toISOString() : null,
      author_id: session.id,
      image_path: img.path ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the announcement. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "announcement",
    entityId: data.id,
    after: { title, slug, published },
  });

  redirect("/admin/announcements");
}

export async function updateAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, "manage:content")) {
    return { error: "You can't manage announcements." };
  }

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing announcement reference." };

  const existing = await getAnnouncementForEdit(id);
  if (!existing) return { error: "That announcement no longer exists." };

  const parsed = Schema.safeParse({ title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) return { error: "Check the form — title and body are required." };
  const { title, body } = parsed.data;
  const published = formData.get("published") === "on";

  const img = await handleImage(formData);
  if (img.error) return { error: img.error };

  const admin = createAdminClient();
  const update: {
    title: string;
    body_markdown: string;
    published_at: string | null;
    image_path?: string;
  } = {
    title,
    body_markdown: body,
    // Keep the original publish time when it stays published; set now on a
    // draft→publish; clear on unpublish.
    published_at: published ? existing.publishedAt ?? new Date().toISOString() : null,
  };
  if (img.path !== undefined) update.image_path = img.path;

  const { error } = await admin.from("announcements").update(update).eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  // Replaced image → remove the old object so it doesn't orphan in Storage.
  if (img.path !== undefined && existing.imagePath) {
    await admin.storage.from("announcements").remove([existing.imagePath]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "announcement",
    entityId: id,
    before: { title: existing.title, published: existing.publishedAt != null },
    after: { title, published },
  });

  redirect("/admin/announcements");
}
