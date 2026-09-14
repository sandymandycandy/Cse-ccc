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
import type { TeamAddState, TeamLinksState } from "@/lib/admin/form-state";

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

/** Blank = no club (council-wide, or not assigned yet). Otherwise a real club id. */
const ClubId = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().uuid().safeParse(v).success, {
    message: "Pick a club from the list, or leave it blank.",
  });

/** The role as the public page prints it, e.g. "Head", "Vice Head", "President".
 *  Matched against LEADERSHIP_TITLES to decide the leadership tier, so the exact
 *  spelling matters — see roster.ts. */
const Designation = z.string().trim().min(1).max(80);

const Schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  designation: Designation,
  clubId: ClubId,
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
    name: formData.get("name") ?? "",
    designation: formData.get("designation") ?? "",
    clubId: formData.get("clubId") ?? "",
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
      // ⚠️ full_name and designation are the SAME columns the council attendance
      // roster shows — editing them here changes both surfaces, which is the point:
      // there is one person, not two records.
      full_name: parsed.data.name,
      designation: parsed.data.designation,
      club_id: parsed.data.clubId || null,
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
      name: parsed.data.name,
      designation: parsed.data.designation,
      clubId: parsed.data.clubId || null,
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

/**
 * Publish or hide MANY members at once.
 *
 * Exists because publishing was one click per person and the roster is 27 people
 * — which is why, for a day after /team shipped, exactly one member was live.
 *
 * Like the single toggle, the form posts the state it WANTS ("public"/"hidden"),
 * never a flip of what it rendered. One audit row for the batch, not 27: the
 * actor and the moment are what matter, and 27 rows would bury the real events.
 */
export async function setTeamVisibilityBulkAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  if (!canManage(session, CAP)) return;

  const next = formData.get("next") === "public";
  const ids = formData
    .getAll("ids")
    .map(String)
    .filter((id) => z.string().uuid().safeParse(id).success);
  // Nothing ticked — do nothing rather than silently applying to everyone.
  if (ids.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("council_members")
    .update({ is_public: next })
    .in("id", ids);
  if (error) return;

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "council_member",
    // No single subject: this is one action across many rows.
    entityId: null,
    after: { isPublic: next, count: ids.length, ids },
  });
  revalidatePath("/team");
  revalidatePath("/admin/team");
}

const AddSchema = z.object({
  name: z.string().trim().min(1).max(120),
  designation: Designation,
  clubId: ClubId,
  // Optional: a council officer may not be a student with a VTU number, and the
  // card simply omits the footer rule when this is blank.
  rollNo: z.string().trim().max(20),
});

/**
 * Add a council member by hand.
 *
 * The roster is otherwise fed by /council/join/[token], which only a student with
 * the link can use. Anyone who never used it — a council officer, someone without
 * a login — could not be listed at all before this.
 *
 * Two deliberate choices:
 *   is_public FALSE — added hidden, like everyone else. Adding somebody must never
 *     publish them; that stays a separate, explicit click.
 *   approved_at NOW — onboarded immediately. `listTeamMembers` filters on it, so a
 *     row without it would be added and then be invisible on this very page.
 */
export async function addTeamMemberAction(
  _prev: TeamAddState,
  formData: FormData,
): Promise<TeamAddState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, CAP)) return { error: "You can't manage the council roster." };

  const parsed = AddSchema.safeParse({
    name: formData.get("name") ?? "",
    designation: formData.get("designation") ?? "",
    clubId: formData.get("clubId") ?? "",
    rollNo: formData.get("rollNo") ?? "",
  });
  if (!parsed.success) {
    const bad = parsed.error.issues[0];
    return { error: bad ? bad.message : "Check the name and role." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_members")
    .insert({
      full_name: parsed.data.name,
      designation: parsed.data.designation,
      club_id: parsed.data.clubId || null,
      roll_no: parsed.data.rollNo || null,
      is_active: true,
      is_public: false,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add them. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "council_member",
    entityId: data.id,
    after: {
      name: parsed.data.name,
      designation: parsed.data.designation,
      clubId: parsed.data.clubId || null,
    },
  });
  revalidatePath("/team");
  revalidatePath("/admin/team");
  return { addedName: parsed.data.name };
}
