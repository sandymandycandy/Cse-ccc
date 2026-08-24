"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession, type AdminSession } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getResourceForEdit } from "@/lib/admin/resources";
import { isSafeHttpUrl } from "@/lib/url";
import type { Database } from "@/lib/database.types";
import type { ResourceFormState } from "@/lib/admin/form-state";

type ResourceKind = Database["public"]["Enums"]["resource_kind"];

const Schema = z.object({
  title: z.string().trim().min(3).max(140),
  url: z.string().trim().min(1).max(2000).refine(isSafeHttpUrl, "not-a-web-url"),
  kind: z.enum(["drive", "doc", "template"]),
  // "" = council-wide (no club); a uuid = that club.
  clubId: z.union([z.literal(""), z.string().uuid()]),
});

/**
 * Which club a resource may be filed under, given the actor's grant:
 * - `all`  → the submitted club, or null (council-wide).
 * - `own`  → forced to the actor's own club (a club-scoped admin can never file
 *            council-wide or under another club); denied if they have no club.
 * Returns the resolved club id, or an error string to surface on the form.
 */
function resolveClub(
  session: AdminSession,
  submittedClubId: string,
): { clubId: string | null } | { error: string } {
  const grant = grantFor(session.role, "manage:resources");
  if (grant === "all") return { clubId: submittedClubId === "" ? null : submittedClubId };
  if (grant === "own") {
    if (!session.clubId) return { error: "Your account isn't linked to a club." };
    return { clubId: session.clubId };
  }
  return { error: "You can't manage resources." };
}

export async function createResourceAction(
  _prev: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = Schema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    kind: formData.get("kind"),
    clubId: formData.get("clubId") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the form — a valid title, http(s) link and type are required." };
  }

  const resolved = resolveClub(session, parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };

  // Final authoritative check against the resolved owning club.
  if (!canManage(session, "manage:resources", resolved.clubId)) {
    return { error: "You can't file resources there." };
  }

  const { title, url, kind } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("resources")
    .insert({ title, url, kind: kind as ResourceKind, club_id: resolved.clubId, updated_by: session.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the resource. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "resource",
    entityId: data.id,
    after: { title, url, kind, clubId: resolved.clubId },
  });

  redirect("/admin/resources");
}

export async function updateResourceAction(
  _prev: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing resource reference." };

  const existing = await getResourceForEdit(id);
  if (!existing) return { error: "That resource no longer exists." };
  // Authorise against the resource's *current* owning club.
  if (!canManage(session, "manage:resources", existing.clubId)) {
    return { error: "You can't manage that resource." };
  }

  const parsed = Schema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    kind: formData.get("kind"),
    clubId: formData.get("clubId") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the form — a valid title, http(s) link and type are required." };
  }

  const resolved = resolveClub(session, parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  // Also authorise against the *destination* club (only an `all` admin can move
  // a resource between clubs; `own` is pinned to their club by resolveClub).
  if (!canManage(session, "manage:resources", resolved.clubId)) {
    return { error: "You can't file resources there." };
  }

  const { title, url, kind } = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin
    .from("resources")
    .update({
      title,
      url,
      kind: kind as ResourceKind,
      club_id: resolved.clubId,
      updated_by: session.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "resource",
    entityId: id,
    before: { title: existing.title, url: existing.url, kind: existing.kind, clubId: existing.clubId },
    after: { title, url, kind, clubId: resolved.clubId },
  });

  redirect("/admin/resources");
}

export async function deleteResourceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/resources");

  const existing = await getResourceForEdit(id);
  if (!existing) redirect("/admin/resources");
  if (!canManage(session, "manage:resources", existing.clubId)) redirect("/admin/resources");

  const admin = createAdminClient();
  const { error } = await admin.from("resources").delete().eq("id", id);
  if (!error) {
    await writeAudit({
      actorId: session.id,
      action: "delete",
      entity: "resource",
      entityId: id,
      before: { title: existing.title, url: existing.url, kind: existing.kind, clubId: existing.clubId },
    });
  }

  redirect("/admin/resources");
}
