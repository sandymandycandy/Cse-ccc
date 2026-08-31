"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import {
  createSession, savePresence, getSessionMarking, setSessionStatus,
  getMemberForEdit, rotateJoinToken,
} from "@/lib/admin/attendance-council";
import type { MemberFormState, SessionFormState } from "@/lib/admin/form-state";

const CAP = "manage:council" as const;

const MemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  designation: z.string().trim().min(2).max(80),
  rollNo: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().min(1).max(20),
  isActive: z.union([z.literal("on"), z.literal("")]),
});

function parse(formData: FormData) {
  return MemberSchema.safeParse({
    name: formData.get("name"),
    designation: formData.get("designation"),
    rollNo: formData.get("rollNo") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    isActive: formData.get("isActive") ? "on" : "",
  });
}

// ── member CRUD ─────────────────────────────────────────────────────────────

export async function createMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, CAP)) return { error: "You can't manage the council roster." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — name, role, roll number and phone are all required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_members")
    .insert({
      full_name: parsed.data.name,
      designation: parsed.data.designation,
      roll_no: parsed.data.rollNo,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      phone: parsed.data.phone,
      is_active: parsed.data.isActive === "on",
      // Admin-added members skip the pending queue — onboarded on the spot.
      approved_at: new Date().toISOString(),
    })
    .select("id").single();
  if (error?.code === "23505") return { error: "That roll number is already registered." };
  if (error || !data) return { error: "Could not add the member. Try again." };

  await writeAudit({
    actorId: session.id, action: "create", entity: "council_member",
    entityId: data.id, after: { name: parsed.data.name, designation: parsed.data.designation },
  });
  redirect("/admin/council/members");
}

export async function updateMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, CAP)) return { error: "You can't manage the council roster." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing member reference." };
  const existing = await getMemberForEdit(id);
  if (!existing) return { error: "That member no longer exists." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — name, role, roll number and phone are required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("council_members")
    .update({
      full_name: parsed.data.name,
      designation: parsed.data.designation,
      roll_no: parsed.data.rollNo,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      phone: parsed.data.phone,
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", id);
  if (error?.code === "23505") return { error: "That roll number is already registered." };
  if (error) return { error: "Could not save your changes. Try again." };

  await writeAudit({
    actorId: session.id, action: "update", entity: "council_member", entityId: id,
    before: { name: existing.name, active: existing.isActive },
    after: { name: parsed.data.name, active: parsed.data.isActive === "on" },
  });
  redirect("/admin/council/members");
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council/members");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/council/members");
  const existing = await getMemberForEdit(id);
  if (!existing) redirect("/admin/council/members");

  const admin = createAdminClient();
  const { error } = await admin.from("council_members").delete().eq("id", id);
  if (!error) {
    await writeAudit({
      actorId: session.id, action: "delete", entity: "council_member", entityId: id,
      before: { name: existing.name },
    });
  }
  redirect("/admin/council/members");
}

// ── self-registration approval + join link ──────────────────────────────────

export async function onboardMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council/members");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/council/members");
  const member = await getMemberForEdit(id);
  if (!member) redirect("/admin/council/members");
  const admin = createAdminClient();
  await admin.from("council_members").update({ approved_at: new Date().toISOString() }).eq("id", id);
  await writeAudit({
    actorId: session.id, action: "update", entity: "council_member", entityId: id, after: { onboarded: true },
  });
  redirect("/admin/council/members");
}

export async function rejectMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council/members");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/council/members");
  const member = await getMemberForEdit(id);
  if (!member) redirect("/admin/council/members");
  // Reject only removes a still-pending self-registration — never a live member.
  if (member.approvedAt) redirect("/admin/council/members");
  const admin = createAdminClient();
  await admin.from("council_members").delete().eq("id", id);
  await writeAudit({
    actorId: session.id, action: "delete", entity: "council_member", entityId: id,
    before: { name: member.name, pending: true },
  });
  redirect("/admin/council/members");
}

export async function rotateJoinTokenAction(): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council/members");
  await rotateJoinToken();
  await writeAudit({
    actorId: session.id, action: "update", entity: "council_settings", entityId: "singleton",
    after: { joinTokenReset: true },
  });
  redirect("/admin/council/members");
}

// ── sessions + marking ──────────────────────────────────────────────────────

const SessionSchema = z.object({
  title: z.string().trim().min(2).max(140),
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
  if (!canManage(session, CAP)) return { error: "You can't run council sessions." };

  const parsed = SessionSchema.safeParse({
    title: formData.get("title"),
    sessionDate: formData.get("sessionDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the session details." };
  if (parsed.data.endTime <= parsed.data.startTime) return { error: "End time must be after the start time." };

  const id = await createSession({
    title: parsed.data.title, sessionDate: parsed.data.sessionDate,
    startTime: parsed.data.startTime, endTime: parsed.data.endTime, openedBy: session.id,
  });
  await writeAudit({
    actorId: session.id, action: "open", entity: "council_attendance_session",
    entityId: id, after: { title: parsed.data.title, date: parsed.data.sessionDate },
  });
  redirect(`/admin/council/sessions/${id}`);
}

export async function saveAttendanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/council");
  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/council");

  const present = formData.getAll("present").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  await savePresence(sessionId, present, session.id);
  await writeAudit({
    actorId: session.id, action: "update", entity: "council_attendance_session",
    entityId: sessionId, after: { present: present.length },
  });
  redirect(`/admin/council/sessions/${sessionId}?saved=1`);
}

export async function saveAndCloseAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/council");
  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/council");

  const present = formData.getAll("present").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  await savePresence(sessionId, present, session.id);
  await setSessionStatus(sessionId, "closed");
  await writeAudit({
    actorId: session.id, action: "close", entity: "council_attendance_session",
    entityId: sessionId, after: { present: present.length, closed: true },
  });
  redirect(`/admin/council/sessions/${sessionId}?closed=1`);
}

export async function reopenSessionAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canManage(session, CAP)) redirect("/admin/council");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/council");
  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/council");

  await setSessionStatus(sessionId, "open");
  await writeAudit({
    actorId: session.id, action: "reopen", entity: "council_attendance_session",
    entityId: sessionId, after: { reopened: true },
  });
  redirect(`/admin/council/sessions/${sessionId}?reopened=1`);
}
