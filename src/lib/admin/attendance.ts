import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve an event + its primary club id for attendance/registration authz. */

export interface AttendanceEvent {
  id: string;
  title: string;
  clubId: string | null;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  /** Free-text venue, else the booked venue's name, else null. */
  venue: string | null;
}

export async function getEventForAttendance(
  eventId: string,
): Promise<AttendanceEvent | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select(
      "id, title, starts_at, ends_at, is_all_day, venue_text, event_clubs ( is_primary, club_id ), venues ( name )",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    is_all_day: boolean;
    venue_text: string | null;
    event_clubs: { is_primary: boolean; club_id: string }[];
    venues: { name: string } | null;
  };
  const primary = row.event_clubs.find((e) => e.is_primary) ?? row.event_clubs[0];
  return {
    id: row.id,
    title: row.title,
    clubId: primary?.club_id ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
    venue: row.venue_text ?? row.venues?.name ?? null,
  };
}
