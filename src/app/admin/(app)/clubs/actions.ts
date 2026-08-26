"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getClubForEdit } from "@/lib/admin/clubs";
import type { ClubFormState } from "@/lib/admin/form-state";

// Empty text fields are stored as NULL, not "".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

const Schema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: optionalText(160),
  description: optionalText(2000),
});

export async function updateClubAction(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing club reference." };

  const existing = await getClubForEdit(id);
  if (!existing) return { error: "That club no longer exists." };
  // A club's own id is its owning club — authorise the head against exactly it.
  if (!canManage(session, "manage:clubs", id)) {
    return { error: "You can only edit your own club." };
  }

  const parsed = Schema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the form — a name (2–80 chars) is required." };
  }

  const { name, tagline, description } = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin
    .from("clubs")
    .update({ name, tagline: tagline ?? null, description: description ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "club",
    entityId: id,
    before: { name: existing.name, tagline: existing.tagline, description: existing.description },
    after: { name, tagline: tagline ?? null, description: description ?? null },
  });

  redirect("/admin/clubs");
}
