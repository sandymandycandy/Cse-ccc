import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeAttendance } from "./attendance-math";
import { diffPresence } from "./attendance-presence";

const NO_MARKS: ReadonlySet<string> = new Set();
const SESSION_COLS = "id, title, status, opened_at, closed_at, club_id, session_date, start_time, end_time";

export interface SessionRow {
  id: string;
  title: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  presentCount: number;
  clubId: string;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
}

interface RawSession {
  id: string;
  title: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  club_id: string;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
}

function mapSession(s: RawSession, presentCount: number): SessionRow {
  return {
    id: s.id, title: s.title, status: s.status, openedAt: s.opened_at, closedAt: s.closed_at,
    clubId: s.club_id, presentCount, sessionDate: s.session_date, startTime: s.start_time, endTime: s.end_time,
  };
}

/** A session's date as YYYY-MM-DD: the scheduled date, or (legacy rows) the open date. */
function sessionDateOf(s: { session_date: string | null; opened_at: string }): string {
  return (s.session_date ?? s.opened_at).slice(0, 10);
}

async function countPresent(sessionId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("club_attendance")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return count ?? 0;
}

export async function listSessions(clubId: string): Promise<SessionRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .select(SESSION_COLS)
    .eq("club_id", clubId)
    .order("session_date", { ascending: false, nullsFirst: false })
    .order("opened_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return Promise.all((data ?? []).map(async (s) => mapSession(s, await countPresent(s.id))));
}

/** Flip a session open⇄closed. Closing stamps `closed_at`; reopening clears it. */
export async function setSessionStatus(sessionId: string, status: "open" | "closed"): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("club_attendance_sessions")
    .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
    .eq("id", sessionId);
}

export async function createSession(input: {
  clubId: string; title: string; sessionDate: string; startTime: string; endTime: string; openedBy: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .insert({
      club_id: input.clubId, title: input.title, opened_by: input.openedBy,
      session_date: input.sessionDate, start_time: input.startTime, end_time: input.endTime,
    })
    .select("id").single();
  if (error || !data) throw error ?? new Error("session insert failed");
  return data.id;
}

/** The marking view: every approved+active member with a seeded present flag. */
export async function getSessionMarking(
  sessionId: string,
): Promise<{ session: SessionRow; roster: { memberId: string; name: string; rollNo: string | null; present: boolean }[] } | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions").select(SESSION_COLS).eq("id", sessionId).maybeSingle();
  if (!s) return null;

  const { data: marks } = await admin
    .from("club_attendance").select("member_id").eq("session_id", sessionId);
  const present = new Set((marks ?? []).map((m) => m.member_id));

  const { data: members } = await admin
    .from("club_members")
    .select("id, name, roll_no")
    .eq("club_id", s.club_id).eq("is_active", true).not("approved_at", "is", null)
    .order("name");

  const roster = (members ?? []).map((m) => ({ memberId: m.id, name: m.name, rollNo: m.roll_no, present: present.has(m.id) }));
  return { session: mapSession(s, present.size), roster };
}

/** Persist a session's present-set: insert the newly-present rows, delete the newly-absent. */
export async function savePresence(sessionId: string, desiredIds: string[], markedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { data: marks } = await admin
    .from("club_attendance").select("member_id").eq("session_id", sessionId);
  const current = new Set((marks ?? []).map((m) => m.member_id));
  const desired = new Set(desiredIds);
  const { toAdd, toRemove } = diffPresence(current, desired);
  if (toAdd.length > 0) {
    await admin.from("club_attendance")
      .insert(toAdd.map((memberId) => ({ session_id: sessionId, member_id: memberId, marked_by: markedBy })));
  }
  if (toRemove.length > 0) {
    await admin.from("club_attendance").delete().eq("session_id", sessionId).in("member_id", toRemove);
  }
}

/** Headcount for the analytics panel: total roster, how many are active, and how
 *  many are still pending a head's onboarding (self-registered, approved_at IS NULL). */
export async function membershipCounts(
  clubId: string,
): Promise<{ total: number; active: number; pending: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("club_members")
    .select("is_active, approved_at")
    .eq("club_id", clubId);
  const rows = data ?? [];
  return {
    total: rows.length,
    active: rows.filter((r) => r.is_active).length,
    pending: rows.filter((r) => r.approved_at == null).length,
  };
}

export interface RosterPct {
  memberId: string; name: string; rollNo: string | null; attended: number; eligible: number; pct: number;
}

/** Per approved member: attendance % across ALL of the club's sessions dated on/after they joined. */
export async function rosterWithPercent(clubId: string): Promise<RosterPct[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("club_members")
    .select("id, name, roll_no, created_at")
    .eq("club_id", clubId).eq("is_active", true).not("approved_at", "is", null).order("name");
  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, session_date, opened_at").eq("club_id", clubId);
  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, session_id, club_attendance_sessions!inner(club_id)")
    .eq("club_attendance_sessions.club_id", clubId);

  const sess = (sessions ?? []).map((s) => ({ id: s.id, date: sessionDateOf(s) }));
  const attendedByMember = new Map<string, Set<string>>();
  for (const m of marks ?? []) {
    const set = attendedByMember.get(m.member_id) ?? new Set<string>();
    set.add(m.session_id);
    attendedByMember.set(m.member_id, set);
  }
  return (members ?? []).map((mem) => {
    const { attended, eligible, pct } = summarizeAttendance(sess, mem.created_at.slice(0, 10), attendedByMember.get(mem.id) ?? NO_MARKS);
    return { memberId: mem.id, name: mem.name, rollNo: mem.roll_no, attended, eligible, pct };
  });
}

export type RollLookup =
  | { status: "pending"; name: string; clubName: string | null }
  | {
      status: "active"; name: string; clubName: string | null;
      attended: number; eligible: number; pct: number;
      history: { title: string; date: string; present: boolean }[];
    };

/** Public roll-number lookup. Returns name + club + %/history for an approved member,
 *  a pending marker for an unapproved one, or null if no such roll. PII is never included. */
export async function getMemberAttendanceByRoll(roll: string): Promise<RollLookup | null> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("club_members")
    .select("id, name, created_at, approved_at, club_id, clubs(name)")
    .eq("roll_no", roll).maybeSingle();
  if (!m) return null;
  const clubName = m.clubs?.name ?? null;
  if (!m.approved_at) return { status: "pending", name: m.name, clubName };

  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, title, session_date, opened_at").eq("club_id", m.club_id);
  const { data: marks } = await admin
    .from("club_attendance").select("session_id").eq("member_id", m.id);
  const attendedIds = new Set((marks ?? []).map((x) => x.session_id));

  const rows = (sessions ?? [])
    .map((s) => ({ id: s.id, title: s.title, date: sessionDateOf(s) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const joined = m.created_at.slice(0, 10);
  const { attended, eligible, pct } = summarizeAttendance(rows, joined, attendedIds);
  const history = rows.filter((s) => s.date >= joined).map((s) => ({ title: s.title, date: s.date, present: attendedIds.has(s.id) }));
  return { status: "active", name: m.name, clubName, attended, eligible, pct, history };
}

