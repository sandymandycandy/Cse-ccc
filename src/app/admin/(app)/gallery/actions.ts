"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { resolveOwningClub } from "@/lib/admin/club-scope";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { getGalleryForEdit } from "@/lib/admin/gallery";
import type { GalleryFormState } from "@/lib/admin/form-state";

const Schema = z.object({
  caption: z.string().trim().max(500).optional().or(z.literal("")),
  sort: z.coerce.number().int().min(0).max(9999).optional().or(z.literal("")),
  // "" = council-wide (no club); a uuid = that club.
  clubId: z.union([z.literal(""), z.string().uuid()]),
});

function parse(formData: FormData) {
  return Schema.safeParse({
    caption: formData.get("caption") ?? "",
    sort: formData.get("sort") ?? "",
    clubId: formData.get("clubId") ?? "",
  });
}

export async function createGalleryAction(
  _prev: GalleryFormState,
  formData: FormData,
): Promise<GalleryFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — caption or sort looks off." };

  const resolved = resolveOwningClub(session, "manage:content", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (!canManage(session, "manage:content", resolved.clubId)) {
    return { error: "You can't add photos there." };
  }

  const img = await handleImageUpload(formData, { bucket: "gallery" });
  if (img.error) return { error: img.error };
  if (!img.path) return { error: "Choose an image to upload." };

  const caption = parsed.data.caption ? parsed.data.caption : null;
  const sort = typeof parsed.data.sort === "number" ? parsed.data.sort : 0;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gallery")
    .insert({ image_path: img.path, caption, sort, club_id: resolved.clubId })
    .select("id")
    .single();
  if (error || !data) {
    // Don't leave the just-uploaded object orphaned if the row insert failed.
    await admin.storage.from("gallery").remove([img.path]);
    return { error: "Could not save the photo. Try again." };
  }

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "gallery",
    entityId: data.id,
    after: { caption, sort, clubId: resolved.clubId },
  });

  redirect("/admin/gallery");
}

export async function updateGalleryAction(
  _prev: GalleryFormState,
  formData: FormData,
): Promise<GalleryFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing photo reference." };

  const existing = await getGalleryForEdit(id);
  if (!existing) return { error: "That photo no longer exists." };
  if (!canManage(session, "manage:content", existing.clubId)) {
    return { error: "You can't manage that photo." };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — caption or sort looks off." };

  const resolved = resolveOwningClub(session, "manage:content", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (!canManage(session, "manage:content", resolved.clubId)) {
    return { error: "You can't move photos there." };
  }

  const img = await handleImageUpload(formData, { bucket: "gallery" });
  if (img.error) return { error: img.error };

  const caption = parsed.data.caption ? parsed.data.caption : null;
  const sort = typeof parsed.data.sort === "number" ? parsed.data.sort : 0;

  const admin = createAdminClient();
  const update: {
    caption: string | null;
    sort: number;
    club_id: string | null;
    image_path?: string;
  } = { caption, sort, club_id: resolved.clubId };
  if (img.path !== undefined) update.image_path = img.path;

  const { error } = await admin.from("gallery").update(update).eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  // Replaced image → delete the old object so it doesn't orphan in Storage.
  if (img.path !== undefined && existing.imagePath) {
    await admin.storage.from("gallery").remove([existing.imagePath]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "gallery",
    entityId: id,
    before: { caption: existing.caption, sort: existing.sort, clubId: existing.clubId },
    after: { caption, sort, clubId: resolved.clubId },
  });

  redirect("/admin/gallery");
}

export async function deleteGalleryAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/gallery");

  const existing = await getGalleryForEdit(id);
  if (!existing) redirect("/admin/gallery");
  if (!canManage(session, "manage:content", existing.clubId)) redirect("/admin/gallery");

  const admin = createAdminClient();
  const { error } = await admin.from("gallery").delete().eq("id", id);
  if (!error) {
    if (existing.imagePath) await admin.storage.from("gallery").remove([existing.imagePath]);
    await writeAudit({
      actorId: session.id,
      action: "delete",
      entity: "gallery",
      entityId: id,
      before: { caption: existing.caption, sort: existing.sort, clubId: existing.clubId },
    });
  }

  redirect("/admin/gallery");
}
