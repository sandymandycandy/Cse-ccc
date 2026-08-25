import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeAttendance } from "./attendance-math";

const NO_MARKS: ReadonlySet<string> = new Set();

export interface SessionRow {
  id: string;
  title: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  presentCount: number;
  clubId: string;
}

async function countPresent(sessionId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("club_attendance")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return count ?? 0;
}

export async function getOpenSession(clubId: string): Promise<SessionRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id")
    .eq("club_id", clubId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id, title: data.title, status: data.status, openedAt: data.opened_at,
    closedAt: data.closed_at, clubId: data.club_id, presentCount: await countPresent(data.id),
  };
}

export async function listSessions(clubId: string): Promise<SessionRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id")
    .eq("club_id", clubId)
    .order("opened_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data ?? [];
  return Promise.all(rows.map(async (s) => ({
    id: s.id, title: s.title, status: s.status, openedAt: s.opened_at,
    closedAt: s.closed_at, clubId: s.club_id, presentCount: await countPresent(s.id),
  })));
}

export interface SessionDetail {
  session: SessionRow;
  present: { memberId: string; name: string; markedAt: string }[];
  absent: { memberId: string; name: string }[];
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id")
    .eq("id", sessionId).maybeSingle();
  if (!s) return null;

  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, marked_at, club_members(name)")
    .eq("session_id", sessionId);
  const present = (marks ?? []).map((m) => ({
    memberId: m.member_id, name: m.club_members?.name ?? "—", markedAt: m.marked_at,
  }));
  const presentIds = new Set(present.map((p) => p.memberId));

  const { data: roster } = await admin
    .from("club_members")
    .select("id, name")
    .eq("club_id", s.club_id).eq("is_active", true).order("name");
  const absent = (roster ?? []).filter((m) => !presentIds.has(m.id)).map((m) => ({ memberId: m.id, name: m.name }));

  return {
    session: {
      id: s.id, title: s.title, status: s.status, openedAt: s.opened_at,
      closedAt: s.closed_at, clubId: s.club_id, presentCount: present.length,
    },
    present, absent,
  };
}

export interface RosterPct {
  memberId: string; name: string; attended: number; eligible: number; pct: number;
}

export async function rosterWithPercent(clubId: string): Promise<RosterPct[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("club_members")
    .select("id, name, created_at")
    .eq("club_id", clubId).eq("is_active", true).order("name");
  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, opened_at").eq("club_id", clubId).eq("status", "closed");
  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, session_id, club_attendance_sessions!inner(club_id)")
    .eq("club_attendance_sessions.club_id", clubId);

  const sess = sessions ?? [];
  const closedIds = new Set(sess.map((s) => s.id));
  // Per member: the CLOSED sessions they were marked at. A mark on a still-open
  // session is dropped so `attended` is drawn from the same set as `eligible`
  // (see summarizeAttendance) — the dashboard then agrees with the member
  // self-view and can never exceed 100%.
  const attendedByMember = new Map<string, Set<string>>();
  for (const m of marks ?? []) {
    if (!closedIds.has(m.session_id)) continue;
    const set = attendedByMember.get(m.member_id) ?? new Set<string>();
    set.add(m.session_id);
    attendedByMember.set(m.member_id, set);
  }
  return (members ?? []).map((mem) => {
    const { attended, eligible, pct } = summarizeAttendance(sess, mem.created_at, attendedByMember.get(mem.id) ?? NO_MARKS);
    return { memberId: mem.id, name: mem.name, attended, eligible, pct };
  });
}

export async function liveFeed(
  sessionId: string,
): Promise<{ open: boolean; count: number; present: { memberId: string; name: string }[] } | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions").select("status").eq("id", sessionId).maybeSingle();
  if (!s) return null;
  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, marked_at, club_members(name)")
    .eq("session_id", sessionId).order("marked_at", { ascending: false });
  const present = (marks ?? []).map((m) => ({ memberId: m.member_id, name: m.club_members?.name ?? "—" }));
  return { open: s.status === "open", count: present.length, present };
}

export interface MemberSelfView {
  name: string;
  clubName: string | null;
  role: string;
  attended: number;
  eligible: number;
  pct: number;
  history: { title: string; at: string; present: boolean }[];
}

export async function getMemberAttendance(memberId: string): Promise<MemberSelfView | null> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("club_members")
    .select("id, name, role, created_at, club_id, clubs(name)")
    .eq("id", memberId).maybeSingle();
  if (!m) return null;

  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, title, opened_at").eq("club_id", m.club_id).eq("status", "closed")
    .order("opened_at", { ascending: false });
  const { data: marks } = await admin
    .from("club_attendance").select("session_id").eq("member_id", memberId);
  const attendedIds = new Set((marks ?? []).map((x) => x.session_id));

  const all = sessions ?? [];
  const { attended, eligible, pct } = summarizeAttendance(all, m.created_at, attendedIds);
  // History lists the same eligible set (closed sessions opened on/after join).
  const eligibleSessions = all.filter((s) => s.opened_at >= m.created_at);
  return {
    name: m.name, clubName: m.clubs?.name ?? null, role: m.role,
    attended, eligible, pct,
    history: eligibleSessions.map((s) => ({ title: s.title, at: s.opened_at, present: attendedIds.has(s.id) })),
  };
}
