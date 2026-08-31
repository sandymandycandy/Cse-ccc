"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getClubForEdit } from "@/lib/admin/clubs";
import {
  ClubCreateSchema,
  ClubProfileSchema,
  ClubStructuralSchema,
} from "@/lib/validation/club";
import type { ClubFormState } from "@/lib/admin/form-state";
import type { Database } from "@/lib/database.types";

type ClubUpdate = Database["public"]["Tables"]["clubs"]["Update"];
type AuditFields = Record<string, string | number | boolean | null>;

function profileFrom(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    shortName: formData.get("shortName") ?? "",
    tagline: formData.get("tagline") ?? "",
    description: formData.get("description") ?? "",
  };
}

function structuralFrom(formData: FormData) {
  return {
    slug: formData.get("slug") ?? "",
    category: formData.get("category") ?? "",
    color: formData.get("color") ?? "",
    isActive: formData.get("isActive") != null,
    isPublic: formData.get("isPublic") != null,
    sort: formData.get("sort") ?? "0",
  };
}

/** Create a brand-new club. Council-only (grant `all`); no club_head create. */
export async function createClubAction(
  _prev: ClubFormState,
  formData: FormData,
): Promise<ClubFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (grantFor(session.role, "manage:clubs") !== "all") {
    return { error: "Only council admins can create clubs." };
  }

  const parsed = ClubCreateSchema.safeParse({
    ...profileFrom(formData),
    ...structuralFrom(formData),
  });
  if (!parsed.success) {
    return {
      error:
        "Check the form — a name, short name, lowercase-hyphen slug, category and a #hex colour are all required.",
    };
  }

  const d = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .insert({
      name: d.name,
      short_name: d.shortName,
      slug: d.slug,
      category: d.category,
      color: d.color,
      tagline: d.tagline ?? null,
      description: d.description ?? null,
      is_active: d.isActive,
      is_public: d.isPublic,
      sort: d.sort,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That slug is already taken — pick another." };
    return { error: "Could not create the club. Try again." };
  }

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "club",
    entityId: data.id,
    after: { name: d.name, slug: d.slug, category: d.category, isActive: d.isActive },
  });

  redirect("/admin/clubs");
}

/** Edit a club. Profile fields are always saved; structural / identity fields
 *  (slug, category, colour, active, sort) only when the actor is council-wide. */
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
  const canStructural = grantFor(session.role, "manage:clubs") === "all";

  const profile = ClubProfileSchema.safeParse(profileFrom(formData));
  if (!profile.success) {
    return { error: "Check the form — a name (2–80 chars) and a short name are required." };
  }

  const update: ClubUpdate = {
    name: profile.data.name,
    short_name: profile.data.shortName,
    tagline: profile.data.tagline ?? null,
    description: profile.data.description ?? null,
    updated_at: new Date().toISOString(),
  };
  const after: AuditFields = {
    name: profile.data.name,
    tagline: profile.data.tagline ?? null,
    description: profile.data.description ?? null,
  };

  if (canStructural) {
    const structural = ClubStructuralSchema.safeParse(structuralFrom(formData));
    if (!structural.success) {
      return {
        error: "Check the structural fields — a lowercase-hyphen slug, category and #hex colour are required.",
      };
    }
    update.slug = structural.data.slug;
    update.category = structural.data.category;
    update.color = structural.data.color;
    update.is_active = structural.data.isActive;
    update.is_public = structural.data.isPublic;
    update.sort = structural.data.sort;
    after.slug = structural.data.slug;
    after.category = structural.data.category;
    after.isActive = structural.data.isActive;
    after.isPublic = structural.data.isPublic;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("clubs").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That slug is already taken — pick another." };
    return { error: "Could not save your changes. Try again." };
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "club",
    entityId: id,
    before: {
      name: existing.name,
      tagline: existing.tagline,
      description: existing.description,
      slug: existing.slug,
      category: existing.category,
      isActive: existing.isActive,
    },
    after,
  });

  redirect("/admin/clubs");
}
