"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { resolveOwningClub } from "@/lib/admin/club-scope";
import { writeAudit } from "@/lib/admin/audit";
import { getMemberForEdit } from "@/lib/admin/members";
import type { MemberFormState } from "@/lib/admin/form-state";

const MemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  rollNo: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.enum(["head", "vice_head", "member"]),
  sort: z.coerce.number().int().min(0).max(9999).optional().or(z.literal("")),
  isActive: z.union([z.literal("on"), z.literal("")]),
  // resolveOwningClub uses "manage:members" grant; "" = council-wide is INVALID
  // for members (a member always belongs to a club), so require a uuid for `all`.
  clubId: z.union([z.literal(""), z.string().uuid()]),
});

function parse(formData: FormData) {
  return MemberSchema.safeParse({
    name: formData.get("name"),
    rollNo: formData.get("rollNo") ?? "",
    role: formData.get("role"),
    sort: formData.get("sort") ?? "",
    isActive: formData.get("isActive") ? "on" : "",
    clubId: formData.get("clubId") ?? "",
  });
}

export async function createMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — name and role are required." };

  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.clubId == null) return { error: "Pick a club for this member." };
  if (!canManage(session, "manage:members", resolved.clubId)) {
    return { error: "You can't add members to that club." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .insert({
      club_id: resolved.clubId,
      name: parsed.data.name,
      roll_no: parsed.data.rollNo ? parsed.data.rollNo : null,
      role: parsed.data.role,
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : 0,
      is_active: parsed.data.isActive === "on",
      socials: {},
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add the member. Try again." };

  await writeAudit({
    actorId: session.id, action: "create", entity: "club_member",
    entityId: data.id, after: { name: parsed.data.name, role: parsed.data.role, clubId: resolved.clubId },
  });
  redirect("/admin/attendance/members");
}

export async function updateMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing member reference." };
  const existing = await getMemberForEdit(id);
  if (!existing) return { error: "That member no longer exists." };
  if (!canManage(session, "manage:members", existing.clubId)) {
    return { error: "You can't manage that member." };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — name and role are required." };

  // A club-scoped admin cannot move a member to another club; org-wide can.
  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  const targetClub = resolved.clubId ?? existing.clubId;
  if (!canManage(session, "manage:members", targetClub)) {
    return { error: "You can't file members there." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("club_members")
    .update({
      name: parsed.data.name,
      roll_no: parsed.data.rollNo ? parsed.data.rollNo : null,
      role: parsed.data.role,
      // On UPDATE preserve the current ordering when sort is unset (create defaults to 0).
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : existing.sort,
      is_active: parsed.data.isActive === "on",
      club_id: targetClub,
    })
    .eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  await writeAudit({
    actorId: session.id, action: "update", entity: "club_member", entityId: id,
    before: { name: existing.name, active: existing.isActive, role: existing.role, clubId: existing.clubId },
    after: { name: parsed.data.name, active: parsed.data.isActive === "on", role: parsed.data.role, clubId: targetClub },
  });
  redirect("/admin/attendance/members");
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance/members");
  const existing = await getMemberForEdit(id);
  if (!existing) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", existing.clubId)) redirect("/admin/attendance/members");

  const admin = createAdminClient();
  const { error } = await admin.from("club_members").delete().eq("id", id);
  if (!error) {
    await writeAudit({
      actorId: session.id, action: "delete", entity: "club_member", entityId: id,
      before: { name: existing.name, clubId: existing.clubId },
    });
  }
  redirect("/admin/attendance/members");
}
