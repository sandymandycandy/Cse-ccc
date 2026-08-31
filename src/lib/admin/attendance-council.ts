import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeAttendance } from "./attendance-math";
import { diffPresence } from "./attendance-presence";

/** Server-side data layer for council / leadership attendance (org-wide — no club
 *  scope). Mirrors attendance-club.ts and reuses the same pure engine. */

const NO_MARKS: ReadonlySet<string> = new Set();
const SESSION_COLS = "id, title, status, opened_at, closed_at, session_date, start_time, end_time";
const MEMBER_COLS = "id, full_name, roll_no, email, phone, designation, is_active, approved_at, created_at";

export interface CouncilMember {
  id: string; name: string; rollNo: string | null; email: string | null; phone: string | null;
  designation: string; isActive: boolean; approvedAt: string | null; createdAt: string;
}
export interface CouncilSession {
  id: string; title: string; status: "open" | "closed"; openedAt: string; closedAt: string | null;
  sessionDate: string | null; startTime: string | null; endTime: string | null; presentCount: number;
}

interface RawMember {
  id: string; full_name: string; roll_no: string | null; email: string | null; phone: string | null;
  designation: string; is_active: boolean; approved_at: string | null; created_at: string;
}
function mapMember(m: RawMember): CouncilMember {
  return {
    id: m.id, name: m.full_name, rollNo: m.roll_no, email: m.email, phone: m.phone,
    designation: m.designation, isActive: m.is_active, approvedAt: m.approved_at, createdAt: m.created_at,
  };
}

interface RawSession {
  id: string; title: string; status: "open" | "closed"; opened_at: string; closed_at: string | null;
  session_date: string | null; start_time: string | null; end_time: string | null;
}
function mapSession(s: RawSession, presentCount: number): CouncilSession {
  return {
    id: s.id, title: s.title, status: s.status, openedAt: s.opened_at, closedAt: s.closed_at,
    sessionDate: s.session_date, startTime: s.start_time, endTime: s.end_time, presentCount,
  };
}
function sessionDateOf(s: { session_date: string | null; opened_at: string }): string {
  return (s.session_date ?? s.opened_at).slice(0, 10);
}

async function countPresent(sessionId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("council_attendance").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  return count ?? 0;
}

/** Resolve the singleton join token → truthy when it matches, else null. */
export async function getCouncilByJoinToken(token: string): Promise<{ id: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null; // non-uuid → not found (no 500 on a bad literal)
  const admin = createAdminClient();
  const { data } = await admin
    .from("council_settings").select("id").eq("join_token", token).maybeSingle();
  return data ? { id: data.id } : null;
}

export async function rotateJoinToken(): Promise<void> {
  const admin = createAdminClient();
  await admin.from("council_settings").update({ join_token: crypto.randomUUID() }).eq("singleton", true);
}

/** The current join token (for the admin "copy link" control). */
export async function getJoinToken(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("council_settings").select("join_token").eq("singleton", true).maybeSingle();
  return data?.join_token ?? null;
}

export async function listMembers(): Promise<CouncilMember[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("council_members").select(MEMBER_COLS).order("full_name");
  return (data ?? []).map(mapMember);
}

export async function getMemberForEdit(id: string): Promise<CouncilMember | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("council_members").select(MEMBER_COLS).eq("id", id).maybeSingle();
  return data ? mapMember(data) : null;
}

export interface CouncilRosterPct {
  memberId: string; name: string; designation: string; attended: number; eligible: number; pct: number;
}
export async function rosterWithPercent(): Promise<CouncilRosterPct[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("council_members").select("id, full_name, designation, created_at")
    .eq("is_active", true).not("approved_at", "is", null).order("full_name");
  const { data: sessions } = await admin
    .from("council_attendance_sessions").select("id, session_date, opened_at");
  const { data: marks } = await admin.from("council_attendance").select("member_id, session_id");

  const sess = (sessions ?? []).map((s) => ({ id: s.id, date: sessionDateOf(s) }));
  const attendedByMember = new Map<string, Set<string>>();
  for (const m of marks ?? []) {
    const set = attendedByMember.get(m.member_id) ?? new Set<string>();
    set.add(m.session_id);
    attendedByMember.set(m.member_id, set);
  }
  return (members ?? []).map((mem) => {
    const { attended, eligible, pct } = summarizeAttendance(
      sess, mem.created_at.slice(0, 10), attendedByMember.get(mem.id) ?? NO_MARKS);
    return { memberId: mem.id, name: mem.full_name, designation: mem.designation, attended, eligible, pct };
  });
}

export async function listSessions(): Promise<CouncilSession[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_attendance_sessions").select(SESSION_COLS)
    .order("session_date", { ascending: false, nullsFirst: false })
    .order("opened_at", { ascending: false }).limit(200);
  if (error) throw error;
  return Promise.all((data ?? []).map(async (s) => mapSession(s, await countPresent(s.id))));
}

export async function createSession(input: {
  title: string; sessionDate: string; startTime: string; endTime: string; openedBy: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_attendance_sessions")
    .insert({
      title: input.title, opened_by: input.openedBy,
      session_date: input.sessionDate, start_time: input.startTime, end_time: input.endTime,
    })
    .select("id").single();
  if (error || !data) throw error ?? new Error("session insert failed");
  return data.id;
}

export async function setSessionStatus(sessionId: string, status: "open" | "closed"): Promise<void> {
  const admin = createAdminClient();
  await admin.from("council_attendance_sessions")
    .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
    .eq("id", sessionId);
}

export async function getSessionMarking(
  sessionId: string,
): Promise<{ session: CouncilSession; roster: { memberId: string; name: string; designation: string; present: boolean }[] } | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("council_attendance_sessions").select(SESSION_COLS).eq("id", sessionId).maybeSingle();
  if (!s) return null;
  const { data: marks } = await admin.from("council_attendance").select("member_id").eq("session_id", sessionId);
  const present = new Set((marks ?? []).map((m) => m.member_id));
  const { data: members } = await admin
    .from("council_members").select("id, full_name, designation")
    .eq("is_active", true).not("approved_at", "is", null).order("full_name");
  const roster = (members ?? []).map((m) => ({
    memberId: m.id, name: m.full_name, designation: m.designation, present: present.has(m.id),
  }));
  return { session: mapSession(s, present.size), roster };
}

export async function savePresence(sessionId: string, desiredIds: string[], markedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { data: marks } = await admin.from("council_attendance").select("member_id").eq("session_id", sessionId);
  const current = new Set((marks ?? []).map((m) => m.member_id));
  const { toAdd, toRemove } = diffPresence(current, new Set(desiredIds));
  if (toAdd.length > 0) {
    await admin.from("council_attendance")
      .insert(toAdd.map((memberId) => ({ session_id: sessionId, member_id: memberId, marked_by: markedBy })));
  }
  if (toRemove.length > 0) {
    await admin.from("council_attendance").delete().eq("session_id", sessionId).in("member_id", toRemove);
  }
}
