import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve an event + its primary club id for attendance/registration authz. */

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
