import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Server-side helpers for the organiser's attendance session (§13.8). */

export interface AttendanceEvent {
  id: string;
  title: string;
  clubId: string | null;
  startsAt: string;
}

export async function getEventForAttendance(
  eventId: string,
): Promise<AttendanceEvent | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("id, title, starts_at, event_clubs ( is_primary, club_id )")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    starts_at: string;
    event_clubs: { is_primary: boolean; club_id: string }[];
  };
  const primary = row.event_clubs.find((e) => e.is_primary) ?? row.event_clubs[0];
  return { id: row.id, title: row.title, clubId: primary?.club_id ?? null, startsAt: row.starts_at };
}

export interface AttendanceSession {
  id: string;
  status: string;
  opened_at: string;
  window_seconds: number;
  closed_at: string | null;
}

export async function getLatestSession(eventId: string): Promise<AttendanceSession | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("attendance_sessions")
    .select("id, status, opened_at, window_seconds, closed_at")
    .eq("event_id", eventId)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AttendanceSession | null) ?? null;
}

export async function getSessionById(sessionId: string): Promise<
  (AttendanceSession & { eventId: string }) | null
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("attendance_sessions")
    .select("id, event_id, status, opened_at, window_seconds, closed_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as AttendanceSession & { event_id: string };
  return { ...r, eventId: r.event_id };
}

/** Open a fresh session, closing any lingering open one for the event first. */
export async function openSession(
  eventId: string,
  adminId: string,
  windowSeconds = 60,
): Promise<string> {
  const admin = createAdminClient();
  await admin
    .from("attendance_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("status", "open");
  const { data, error } = await admin
    .from("attendance_sessions")
    .insert({ event_id: eventId, opened_by: adminId, window_seconds: windowSeconds, status: "open" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Could not open session.");
  return data.id;
}

export async function closeSession(sessionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("attendance_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/** How many devices have scanned this session. */
export async function sessionScanCount(sessionId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("attendance_scans")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return count ?? 0;
}

/** How many registrations are marked attended for this event (any method). */
export async function attendedCount(eventId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("attended", true);
  return count ?? 0;
}
