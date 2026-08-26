"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { resolveOwningClub } from "@/lib/admin/club-scope";
import { writeAudit } from "@/lib/admin/audit";
import { getMemberForEdit } from "@/lib/admin/members";
import { getOpenSession } from "@/lib/admin/attendance-club";
import { createMemberInvite } from "@/lib/member/invites";
import { resetMemberAccess, ensureAuthRow } from "@/lib/member/auth";
import { enqueueEmail } from "@/lib/email";
import type { MemberFormState, SessionFormState, MemberInviteState } from "@/lib/admin/form-state";

const MemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  rollNo: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  // Roster is members-only. Head / vice-head are admin_users, created via the
  // admin-invite flow — never set here — so `role` is always "member".
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
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
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
  if (!parsed.success) return { error: "Check the form — a name is required." };

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
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      phone: parsed.data.phone ? parsed.data.phone : null,
      role: "member",
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : 0,
      is_active: parsed.data.isActive === "on",
      socials: {},
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: "That email is already used by another member." };
  if (error || !data) return { error: "Could not add the member. Try again." };

  // Provision an empty credential row so the head can later generate a login link.
  if (parsed.data.email) {
    await ensureAuthRow(data.id);
  }

  await writeAudit({
    actorId: session.id, action: "create", entity: "club_member",
    entityId: data.id, after: { name: parsed.data.name, role: "member", clubId: resolved.clubId },
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
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      phone: parsed.data.phone ? parsed.data.phone : null,
      role: "member",
      // On UPDATE preserve the current ordering when sort is unset (create defaults to 0).
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : existing.sort,
      is_active: parsed.data.isActive === "on",
      club_id: targetClub,
    })
    .eq("id", id);
  if (error?.code === "23505") return { error: "That email is already used by another member." };
  if (error) return { error: "Could not save your changes. Try again." };

  await writeAudit({
    actorId: session.id, action: "update", entity: "club_member", entityId: id,
    before: { name: existing.name, active: existing.isActive, clubId: existing.clubId },
    after: { name: parsed.data.name, active: parsed.data.isActive === "on", clubId: targetClub },
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

const SessionSchema = z.object({
  title: z.string().trim().min(2).max(140),
  clubId: z.union([z.literal(""), z.string().uuid()]),
  qrTtlSeconds: z.coerce.number().int().min(5).max(600).optional(),
});

export async function openSessionAction(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = SessionSchema.safeParse({
    title: formData.get("title"),
    clubId: formData.get("clubId") ?? "",
    qrTtlSeconds: formData.get("qrTtlSeconds") ?? undefined,
  });
  if (!parsed.success) return { error: "Give the session a title." };

  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.clubId == null) return { error: "Pick a club for this session." };
  const clubId = resolved.clubId;
  if (!canManage(session, "manage:members", clubId)) return { error: "You can't run sessions for that club." };

  // One open session per club at a time (also enforced by a partial unique index).
  const already = await getOpenSession(clubId);
  if (already) return { error: "A session is already open for this club. Close it first." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .insert({ club_id: clubId, title: parsed.data.title, opened_by: session.id, status: "open", qr_ttl_seconds: parsed.data.qrTtlSeconds ?? 60 })
    .select("id").single();
  if (error || !data) return { error: "Could not open the session. Try again." };

  await writeAudit({
    actorId: session.id, action: "open", entity: "club_attendance_session",
    entityId: data.id, after: { title: parsed.data.title, clubId },
  });
  redirect(`/admin/attendance/sessions/${data.id}`);
}

export async function closeSessionAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance");

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions").select("club_id, status").eq("id", id).maybeSingle();
  if (!s) redirect("/admin/attendance");
  if (!canManage(session, "manage:members", s.club_id)) redirect("/admin/attendance");

  if (s.status === "open") {
    await admin.from("club_attendance_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
    await writeAudit({ actorId: session.id, action: "close", entity: "club_attendance_session", entityId: id });
  }
  redirect(`/admin/attendance/sessions/${id}`);
}

// ── Member login access (spec §5.1) — own-club-scoped generate-link / reset ─────

/** Own-club-scoped guard shared by both member-login actions below. */
async function requireOwnClubMember(memberId: string) {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." as string };
  if (!z.string().uuid().safeParse(memberId).success) return { error: "Missing member reference." };
  const member = await getMemberForEdit(memberId);
  if (!member) return { error: "That member no longer exists." };
  if (!member.email) return { error: "Add an email for this member first." };
  if (!canManage(session, "manage:members", member.clubId)) return { error: "You can't manage that member." };
  return { session, member };
}

export async function generateMemberLinkAction(
  _prev: MemberInviteState,
  formData: FormData,
): Promise<MemberInviteState> {
  const memberId = String(formData.get("memberId") ?? "");
  const gate = await requireOwnClubMember(memberId);
  if ("error" in gate) return { error: gate.error };

  await ensureAuthRow(memberId);
  const { token } = await createMemberInvite({ memberId, createdBy: gate.session.id });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await writeAudit({
    actorId: gate.session.id, action: "invite", entity: "club_member", entityId: memberId,
    after: { action: "login-link" },
  });
  const inviteUrl = `${base}/member/accept-invite?token=${token}`;
  try {
    await enqueueEmail({
      template: "member_login_link",
      toEmail: gate.member.email!,
      toName: gate.member.name,
      subject: "Set up your CSE Council member login",
      payload: { inviteUrl, name: gate.member.name },
      priority: 1,
    });
  } catch {
    /* never lose the URL over an email hiccup — it's still returned + shown on screen */
  }
  return { inviteUrl };
}

export async function resetMemberAccessAction(
  _prev: MemberInviteState,
  formData: FormData,
): Promise<MemberInviteState> {
  const memberId = String(formData.get("memberId") ?? "");
  const gate = await requireOwnClubMember(memberId);
  if ("error" in gate) return { error: gate.error };

  await resetMemberAccess(memberId); // clears creds + bumps epoch (logs them out)
  const { token } = await createMemberInvite({ memberId, createdBy: gate.session.id });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await writeAudit({
    actorId: gate.session.id, action: "reset", entity: "club_member", entityId: memberId,
    after: { action: "reset-access" },
  });
  const inviteUrl = `${base}/member/accept-invite?token=${token}`;
  try {
    await enqueueEmail({
      template: "member_login_link",
      toEmail: gate.member.email!,
      toName: gate.member.name,
      subject: "Set up your CSE Council member login",
      payload: { inviteUrl, name: gate.member.name },
      priority: 1,
    });
  } catch {
    /* never lose the URL over an email hiccup — it's still returned + shown on screen */
  }
  return { inviteUrl };
}
