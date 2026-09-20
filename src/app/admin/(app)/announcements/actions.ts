"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { uniqueSlug, getAnnouncementForEdit } from "@/lib/admin/announcements";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { toFieldErrors } from "@/lib/admin/field-errors";
import type { AnnouncementFormState } from "@/lib/admin/form-state";
import { istLocalToUTC } from "@/lib/datetime";

const Schema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give it a title — at least 3 characters.")
    .max(140, "Keep the title to 140 characters or fewer."),
  body: z
    .string()
    .trim()
    .min(1, "Write the announcement.")
    .max(20000, "That is too long — 20000 characters at most."),
});

/**
 * The optional "hide after" time, IST wall-clock → UTC ISO, or null for blank.
 *
 * A past time is allowed on purpose: on the edit form it is the natural way to
 * pull a notice off the public site immediately. Returns `undefined` only when
 * the field holds something that is not a valid datetime, which the callers
 * turn into a form error rather than silently storing null.
 */
function readExpiresAt(formData: FormData): string | null | undefined {
  const raw = String(formData.get("expiresAt") ?? "").trim();
  if (!raw) return null;
  return istLocalToUTC(raw) ?? undefined;
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
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const { title, body } = parsed.data;
  const published = formData.get("published") === "on";
  const expiresAt = readExpiresAt(formData);
  if (expiresAt === undefined) {
    return { fieldErrors: { expiresAt: "That is not a valid date and time." } };
  }

  const img = await handleImageUpload(formData, { bucket: "announcements" });
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
      expires_at: expiresAt,
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
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };
  const { title, body } = parsed.data;
  const published = formData.get("published") === "on";
  const expiresAt = readExpiresAt(formData);
  if (expiresAt === undefined) {
    return { fieldErrors: { expiresAt: "That is not a valid date and time." } };
  }

  const img = await handleImageUpload(formData, { bucket: "announcements" });
  if (img.error) return { error: img.error };

  const admin = createAdminClient();
  const update: {
    title: string;
    body_markdown: string;
    published_at: string | null;
    image_path?: string;
    expires_at: string | null;
  } = {
    title,
    body_markdown: body,
    // Keep the original publish time when it stays published; set now on a
    // draft→publish; clear on unpublish.
    published_at: published ? existing.publishedAt ?? new Date().toISOString() : null,
    // Always written, so clearing the box really does remove the expiry.
    expires_at: expiresAt,
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

/**
 * Inline rename from the list — title only.
 *
 * Deliberately narrower than `updateAnnouncementAction`: it does not touch the
 * slug, so a rename cannot break a link already published to students. Anything
 * beyond the title still goes through the edit form.
 */
export async function renameAnnouncementAction(
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error?: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  if (!canManage(session, "manage:content")) {
    return { ok: false, error: "You can't manage announcements." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Missing announcement reference." };
  }

  const parsed = Schema.shape.title.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const existing = await getAnnouncementForEdit(id);
  if (!existing) return { ok: false, error: "That announcement no longer exists." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update({ title: parsed.data })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not save that. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "announcement",
    entityId: id,
    before: { title: existing.title },
    after: { title: parsed.data },
  });

  revalidatePath("/admin/announcements");
  return { ok: true };
}
