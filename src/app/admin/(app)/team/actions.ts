"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { isSafeHttpUrl } from "@/lib/url";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { COUNCIL_PHOTO_BUCKET, getTeamMember } from "@/lib/admin/team";
import type { TeamLinksState } from "@/lib/admin/form-state";

const CAP = "manage:council" as const;

/** Blank means "no link". Anything else must be a real http(s) URL — checked here
 *  on write and AGAIN on read (mapRosterRows), because rows can also be inserted
 *  by hand in the SQL editor. */
const Url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || isSafeHttpUrl(v), {
    message: "Enter a full https:// link, or leave it blank.",
  });

const Schema = z.object({
  id: z.string().uuid(),
  linkedinUrl: Url,
  instagramUrl: Url,
  // Plain text, rendered with `white-space: pre-line` on the profile. 800 chars is
  // a few short paragraphs — long enough to be useful, short enough to stay a
  // caption rather than an essay.
  bio: z.string().trim().max(800),
});

/** Save one member's links, description and photo. */
export async function saveTeamLinksAction(
  _prev: TeamLinksState,
  formData: FormData,
): Promise<TeamLinksState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, CAP)) return { error: "You can't manage the council roster." };

  const parsed = Schema.safeParse({
    id: formData.get("id"),
    linkedinUrl: formData.get("linkedinUrl") ?? "",
    instagramUrl: formData.get("instagramUrl") ?? "",
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) {
    const bad = parsed.error.issues.find((i) => i.path[0] !== "id");
    return { error: bad ? bad.message : "Missing member reference." };
  }

  // Uploaded BEFORE the row update so a failed upload changes nothing at all.
  const upload = await handleImageUpload(formData, {
    bucket: COUNCIL_PHOTO_BUCKET,
    field: "photo",
    maxBytes: 2 * 1024 * 1024,
  });
  if (upload.error) return { error: upload.error };

  // Captured before the update so the replaced file can be cleaned up after.
  const previousPhoto = upload.path ? ((await getTeamMember(parsed.data.id))?.photoPath ?? null) : null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("council_members")
    .update({
      linkedin_url: parsed.data.linkedinUrl || null,
      instagram_url: parsed.data.instagramUrl || null,
      bio: parsed.data.bio || null,
      // Omitted when no new file was chosen, so saving text never clears a photo.
      ...(upload.path ? { photo_path: upload.path } : {}),
    })
    .eq("id", parsed.data.id);
  if (error?.code === "42703") {
    return { error: "Apply migration 20260913000000_council_member_link.sql first." };
  }
  if (error) return { error: "Could not save the links. Try again." };

  // Only once the row points at the new file — deleting first would leave a member
  // with a photo_path to an object that no longer exists.
  if (upload.path && previousPhoto && previousPhoto !== upload.path) {
    await admin.storage.from(COUNCIL_PHOTO_BUCKET).remove([previousPhoto]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "council_member",
    entityId: parsed.data.id,
    after: {
      linkedin: parsed.data.linkedinUrl || null,
      instagram: parsed.data.instagramUrl || null,
      bioChars: parsed.data.bio.length,
      photoReplaced: Boolean(upload.path),
    },
  });
  // /team is dynamic, but revalidate so any cached shell picks the change up.
  revalidatePath("/team");
  revalidatePath("/admin/team");
  return { saved: true };
}

/** Publish or unpublish one member on the public /team page. */
export async function setTeamVisibilityAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  if (!canManage(session, CAP)) return;

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  // The form posts the value it wants, not a flip of what it last rendered — a
  // stale page must not silently publish someone by toggling the wrong way.
  const next = formData.get("next") === "public";

  const admin = createAdminClient();
  const { error } = await admin
    .from("council_members")
    .update({ is_public: next })
    .eq("id", id);
  if (error) return;

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "council_member",
    entityId: id,
    after: { isPublic: next },
  });
  revalidatePath("/team");
  revalidatePath("/admin/team");
}
