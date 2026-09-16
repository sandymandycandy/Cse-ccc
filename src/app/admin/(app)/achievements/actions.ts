"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { resolveOwningClub } from "@/lib/admin/club-scope";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { getAchievementForEdit } from "@/lib/admin/achievements";
import { toFieldErrors } from "@/lib/admin/field-errors";
import type { AchievementFormState } from "@/lib/admin/form-state";

const Schema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give it a title — at least 3 characters.")
    .max(140, "Keep the title to 140 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(20000, "That is too long — 20000 characters at most.")
    .optional()
    .or(z.literal("")),
  // "" = no date; else a calendar date (YYYY-MM-DD).
  happenedOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date, or leave it blank.")]),
  // "" = council-wide (no club); a uuid = that club.
  clubId: z.union([z.literal(""), z.string().uuid()]),
  // The flat {rank,name,roll} shape stored in the jsonb — one row per person,
  // which `parseWinners` reads back as a standing of one. Ranks repeat freely:
  // two 3rds is a tie, and deduplicating them would erase a joint place.
  winners: z
    .array(
      z.object({
        rank: z.coerce.number().int().min(1).max(3),
        name: z.string().trim().min(1).max(120),
        roll: z.string().trim().max(40).nullable().optional(),
      }),
    )
    .max(20),
});

function parse(formData: FormData) {
  const rawWinners = formData.get("winners");
  let winners: unknown = [];
  if (typeof rawWinners === "string" && rawWinners.trim() !== "") {
    try {
      winners = JSON.parse(rawWinners);
    } catch {
      winners = null; // fails the schema below with a readable message
    }
  }
  return Schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    happenedOn: formData.get("happenedOn") ?? "",
    clubId: formData.get("clubId") ?? "",
    winners,
  });
}

/** Empty list normalises to null, so "no winners" stores nothing. */
function winnersPayload(rows: { rank: number; name: string; roll?: string | null }[]) {
  return rows.length > 0
    ? rows.map((w) => ({ rank: w.rank, name: w.name, roll: w.roll ?? null }))
    : null;
}

export async function createAchievementAction(
  _prev: AchievementFormState,
  formData: FormData,
): Promise<AchievementFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const resolved = resolveOwningClub(session, "manage:content", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (!canManage(session, "manage:content", resolved.clubId)) {
    return { error: "You can't add achievements there." };
  }

  const img = await handleImageUpload(formData, { bucket: "achievements" });
  if (img.error) return { error: img.error };

  const { title } = parsed.data;
  const description = parsed.data.description ? parsed.data.description : null;
  const happenedOn = parsed.data.happenedOn ? parsed.data.happenedOn : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("achievements")
    .insert({
      title,
      description,
      happened_on: happenedOn,
      image_path: img.path ?? null,
      club_id: resolved.clubId,
      winners: winnersPayload(parsed.data.winners),
      created_by: session.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (img.path) await admin.storage.from("achievements").remove([img.path]);
    return { error: "Could not save the achievement. Try again." };
  }

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "achievement",
    entityId: data.id,
    after: { title, happenedOn, clubId: resolved.clubId },
  });

  redirect("/admin/achievements");
}

export async function updateAchievementAction(
  _prev: AchievementFormState,
  formData: FormData,
): Promise<AchievementFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing achievement reference." };

  const existing = await getAchievementForEdit(id);
  if (!existing) return { error: "That achievement no longer exists." };
  if (!canManage(session, "manage:content", existing.clubId)) {
    return { error: "You can't manage that achievement." };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const resolved = resolveOwningClub(session, "manage:content", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (!canManage(session, "manage:content", resolved.clubId)) {
    return { error: "You can't move achievements there." };
  }

  const img = await handleImageUpload(formData, { bucket: "achievements" });
  if (img.error) return { error: img.error };

  const { title } = parsed.data;
  const description = parsed.data.description ? parsed.data.description : null;
  const happenedOn = parsed.data.happenedOn ? parsed.data.happenedOn : null;

  const admin = createAdminClient();
  const update: {
    title: string;
    description: string | null;
    happened_on: string | null;
    club_id: string | null;
    winners: { rank: number; name: string; roll: string | null }[] | null;
    image_path?: string;
  } = {
    title,
    description,
    happened_on: happenedOn,
    club_id: resolved.clubId,
    winners: winnersPayload(parsed.data.winners),
  };
  if (img.path !== undefined) update.image_path = img.path;

  const { error } = await admin.from("achievements").update(update).eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  if (img.path !== undefined && existing.imagePath) {
    await admin.storage.from("achievements").remove([existing.imagePath]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "achievement",
    entityId: id,
    before: { title: existing.title, happenedOn: existing.happenedOn, clubId: existing.clubId },
    after: { title, happenedOn, clubId: resolved.clubId },
  });

  redirect("/admin/achievements");
}

export async function deleteAchievementAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/achievements");

  const existing = await getAchievementForEdit(id);
  if (!existing) redirect("/admin/achievements");
  if (!canManage(session, "manage:content", existing.clubId)) redirect("/admin/achievements");

  const admin = createAdminClient();
  const { error } = await admin.from("achievements").delete().eq("id", id);
  if (!error) {
    if (existing.imagePath) await admin.storage.from("achievements").remove([existing.imagePath]);
    await writeAudit({
      actorId: session.id,
      action: "delete",
      entity: "achievement",
      entityId: id,
      before: { title: existing.title, happenedOn: existing.happenedOn, clubId: existing.clubId },
    });
  }

  redirect("/admin/achievements");
}
