"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { validateTeamProfile } from "@/lib/admin/team-profile-validate";
import { getTeamProfilePhoto, syncTeamProfiles } from "@/lib/admin/team-profiles";
import { COUNCIL_PHOTO_BUCKET, uploadPortrait } from "@/lib/admin/portrait-upload";
import type { TeamProfileState } from "@/lib/admin/form-state";

/*
 * Edits to the public /team page, backed by team_profiles.
 *
 * Mirrors saveTeamLinksAction in ./actions.ts on purpose — same guard shape,
 * same audit shape, and the same upload → write → delete-old ordering.
 */

const CAP = "manage:council" as const;

export async function saveTeamProfileAction(
  _prev: TeamProfileState,
  formData: FormData,
): Promise<TeamProfileState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, CAP)) return { error: "You can't manage the team page." };

  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!memberId) return { error: "Missing member reference." };

  const { values, fieldErrors } = validateTeamProfile(formData);
  if (fieldErrors || !values) return { fieldErrors };

  // Uploaded BEFORE the row write, so a failed upload changes nothing at all.
  const photo = await uploadPortrait(formData);
  if (photo.error) return { fieldErrors: { photo: photo.error } };

  // Captured before the write, so the replaced object can be removed after.
  const previousPhoto = photo.path ? await getTeamProfilePhoto(memberId) : null;

  const admin = createAdminClient();
  // Upsert, not update: a person edited for the first time has no row yet.
  const { error } = await admin.from("team_profiles").upsert(
    {
      member_id: memberId,
      name: values.name,
      role: values.role,
      email: values.email,
      year: values.year,
      department: values.department,
      description: values.description,
      portfolio: values.portfolio,
      focal_x: values.focalX,
      focal_y: values.focalY,
      // Omitted when no new file was chosen, so saving text never clears a photo.
      ...(photo.path
        ? {
            photo_path: photo.path,
            photo_width: photo.width ?? null,
            photo_height: photo.height ?? null,
            photo_blur: photo.blur ?? null,
          }
        : {}),
      updated_at: new Date().toISOString(),
      updated_by: session.id,
    },
    { onConflict: "member_id" },
  );
  if (error) return { error: "Could not save. Try again." };

  // ⚠️ Only once the row points at the new object. Deleting first would leave a
  // person whose photo_path names a file that no longer exists; skipping it
  // entirely would orphan one file in council-photos per replacement, forever.
  if (photo.path && previousPhoto && previousPhoto !== photo.path) {
    await admin.storage.from(COUNCIL_PHOTO_BUCKET).remove([previousPhoto]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "team_profile",
    entityId: memberId,
    after: {
      name: values.name,
      role: values.role,
      year: values.year,
      department: values.department,
      bioChars: values.description?.length ?? 0,
      portfolio: values.portfolio,
      focal: [values.focalX, values.focalY],
      photoReplaced: Boolean(photo.path),
    },
  });

  revalidatePath("/team");
  revalidatePath("/admin/team");
  return { saved: true };
}

/**
 * Creates team_profiles rows for anyone in src/data/ccc.ts who has none —
 * run once, and again after adding a person to the file. Never overwrites an
 * edit; see syncTeamProfiles.
 */
export async function syncTeamProfilesAction(): Promise<void> {
  const session = await getAdminSession();
  if (!session || !canManage(session, CAP)) return;

  const created = await syncTeamProfiles();
  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "team_profile",
    entityId: null,
    after: { created },
  });
  revalidatePath("/admin/team");
}
