"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { resolveOwningClub } from "@/lib/admin/club-scope";
import { writeAudit } from "@/lib/admin/audit";
import { getMemberForEdit } from "@/lib/admin/members";
import { createSession, savePresence, getSessionMarking, setSessionStatus } from "@/lib/admin/attendance-club";
import type { MemberFormState, SessionFormState } from "@/lib/admin/form-state";

const MemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  // Roll number and phone are mandatory for every roster member.
  rollNo: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().min(1).max(20),
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
  if (!parsed.success) return { error: "Check the form — name, roll number and phone are all required." };

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
      roll_no: parsed.data.rollNo,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      phone: parsed.data.phone,
      photo_path: null,
      role: "member",
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : 0,
      is_active: parsed.data.isActive === "on",
      // Admin-added members skip the pending queue — they're onboarded on the spot.
      approved_at: new Date().toISOString(),
      socials: {},
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { error: "That roll number or email is already registered." };
  if (error || !data) return { error: "Could not add the member. Try again." };

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
  if (!parsed.success) return { error: "Check the form — name, roll number and phone are required." };

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
      roll_no: parsed.data.rollNo,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      phone: parsed.data.phone,
      role: "member",
      // On UPDATE preserve the current ordering when sort is unset (create defaults to 0).
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : existing.sort,
      is_active: parsed.data.isActive === "on",
      club_id: targetClub,
    })
    .eq("id", id);
  if (error?.code === "23505") return { error: "That roll number or email is already registered." };
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
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick an end time."),
});

export async function createSessionAction(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = SessionSchema.safeParse({
    title: formData.get("title"),
    clubId: formData.get("clubId") ?? "",
    sessionDate: formData.get("sessionDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the session details." };
  if (parsed.data.endTime <= parsed.data.startTime) return { error: "End time must be after the start time." };

  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.clubId == null) return { error: "Pick a club for this session." };
  const clubId = resolved.clubId;
  if (!canManage(session, "manage:members", clubId)) return { error: "You can't run sessions for that club." };

  const id = await createSession({
    clubId, title: parsed.data.title, sessionDate: parsed.data.sessionDate,
    startTime: parsed.data.startTime, endTime: parsed.data.endTime, openedBy: session.id,
  });
  await writeAudit({
    actorId: session.id, action: "open", entity: "club_attendance_session",
    entityId: id, after: { title: parsed.data.title, clubId, date: parsed.data.sessionDate },
  });
  redirect(`/admin/attendance/sessions/${id}`);
}

export async function saveAttendanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/attendance");

  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/attendance");
  if (!canManage(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");

  const present = formData.getAll("present").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  await savePresence(sessionId, present, session.id);
  await writeAudit({
    actorId: session.id, action: "update", entity: "club_attendance_session",
    entityId: sessionId, after: { present: present.length },
  });
  redirect(`/admin/attendance/sessions/${sessionId}?saved=1`);
}

/**
 * Autosave the marks as the head works. Saves the present-set and returns —
 * no close, no redirect, so the page keeps its scroll position and search box.
 *
 * This exists because marking a 200-member roster can outlast the idle window
 * (20 minutes) and every tap used to be client-only state: the browser sent nothing,
 * the proxy expired the login, and the Save POST was bounced to /admin/login,
 * losing the lot. Each autosave is a real /admin request, so it also keeps the
 * idle clock sliding while the head is genuinely working.
 *
 * Deliberately writes NO audit row: this runs every few seconds, and flooding
 * audit_log would bury the events that matter. Attribution survives anyway —
 * savePresence stamps marked_by on every row it inserts — and the explicit
 * "Save draft" and "Save & close" actions still audit.
 *
 * Returns ok:false rather than redirecting, so the caller can surface a failure
 * without throwing away the marks still held on screen.
 */
export async function autosaveAttendanceAction(
  sessionId: string,
  presentIds: string[],
): Promise<{ ok: boolean }> {
  const session = await getAdminSession();
  if (!session) return { ok: false };
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false };

  const detail = await getSessionMarking(sessionId);
  if (!detail) return { ok: false };
  if (!canManage(session, "manage:members", detail.session.clubId)) return { ok: false };
  // A closed session is finalised; autosave must not quietly reopen its marks.
  if (detail.session.status === "closed") return { ok: false };

  const present = presentIds.filter((v) => z.string().uuid().safeParse(v).success);
  await savePresence(sessionId, present, session.id);
  return { ok: true };
}

/** Save the current marks AND close the session (explicit finalise). Own-club scoped. */
export async function saveAndCloseAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/attendance");

  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/attendance");
  if (!canManage(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");

  const present = formData.getAll("present").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  await savePresence(sessionId, present, session.id);
  await setSessionStatus(sessionId, "closed");
  await writeAudit({
    actorId: session.id, action: "close", entity: "club_attendance_session",
    entityId: sessionId, after: { present: present.length, closed: true },
  });
  redirect(`/admin/attendance/sessions/${sessionId}?closed=1`);
}

/** Reopen a closed session so marks can be edited again. Own-club scoped. */
export async function reopenSessionAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/attendance");

  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/attendance");
  if (!canManage(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");

  await setSessionStatus(sessionId, "open");
  await writeAudit({
    actorId: session.id, action: "reopen", entity: "club_attendance_session",
    entityId: sessionId, after: { reopened: true },
  });
  redirect(`/admin/attendance/sessions/${sessionId}?reopened=1`);
}

// ── Self-registration approval + join-link (spec §5) — own-club-scoped ──────────

export async function onboardMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance/members");
  const member = await getMemberForEdit(id);
  if (!member) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  const admin = createAdminClient();
  await admin.from("club_members").update({ approved_at: new Date().toISOString() }).eq("id", id);
  await writeAudit({
    actorId: session.id, action: "update", entity: "club_member", entityId: id, after: { onboarded: true },
  });
  redirect(`/admin/attendance/members?club=${member.clubId}`);
}

export async function rejectMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance/members");
  const member = await getMemberForEdit(id);
  if (!member) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  // Reject only removes a still-pending self-registration — never a live member.
  if (member.approvedAt) redirect(`/admin/attendance/members?club=${member.clubId}`);
  const admin = createAdminClient();
  await admin.from("club_members").delete().eq("id", id);
  await writeAudit({
    actorId: session.id, action: "delete", entity: "club_member", entityId: id,
    before: { name: member.name, pending: true },
  });
  redirect(`/admin/attendance/members?club=${member.clubId}`);
}

export async function resetJoinTokenAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const clubId = String(formData.get("clubId") ?? "");
  if (!z.string().uuid().safeParse(clubId).success) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", clubId)) redirect("/admin/attendance/members");
  const admin = createAdminClient();
  await admin.from("clubs").update({ join_token: crypto.randomUUID() }).eq("id", clubId);
  await writeAudit({
    actorId: session.id, action: "update", entity: "club", entityId: clubId, after: { joinTokenReset: true },
  });
  redirect(`/admin/attendance/members?club=${clubId}`);
}
