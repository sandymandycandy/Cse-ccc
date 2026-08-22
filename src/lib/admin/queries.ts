import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantFor } from "@/lib/auth/capabilities";
import type { AdminSession } from "@/lib/auth/guards";

/**
 * Admin-side reads. These use the service-role client (drafts, pending events and
 * PII are invisible to anon), so every function here must apply the caller's club
 * scope itself: a club-scoped role (grant "own" on manage:events) sees only its
 * own club's events.
 */

export interface AdminEventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  approvalStatus: string;
  club: string;
  clubId: string | null;
  createdBy: string | null;
}

const EVENT_SELECT =
  "id, title, starts_at, ends_at, status, approval_status, created_by, " +
  "event_clubs ( is_primary, clubs ( id, short_name ) )";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  approval_status: string;
  created_by: string | null;
  event_clubs: { is_primary: boolean; clubs: { id: string; short_name: string } | null }[];
};

function toRow(e: EventRow): AdminEventRow {
  const primary = e.event_clubs.find((ec) => ec.is_primary) ?? e.event_clubs[0];
  return {
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    status: e.status,
    approvalStatus: e.approval_status,
    club: primary?.clubs?.short_name ?? "—",
    clubId: primary?.clubs?.id ?? null,
    createdBy: e.created_by,
  };
}

/** True when the session only manages its own club's events. */
function isClubScoped(session: AdminSession): boolean {
  return grantFor(session.role, "manage:events") === "own";
}

// Inner-join variant so a club filter constrains which events come back (and the
// row limit isn't spent on events the admin can't see).
const EVENT_SELECT_OWN = EVENT_SELECT.replace("event_clubs (", "event_clubs!inner (");

/** Events this admin may see, newest first. Club-scoped roles see only theirs. */
export async function listEventsForAdmin(session: AdminSession): Promise<AdminEventRow[]> {
  const admin = createAdminClient();

  if (isClubScoped(session)) {
    // Fail closed: a club-scoped admin with no club sees nothing, never "all".
    if (!session.clubId) return [];
    const { data, error } = await admin
      .from("events")
      .select(EVENT_SELECT_OWN)
      .eq("event_clubs.club_id", session.clubId)
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data ?? []) as unknown as EventRow[]).map(toRow);
  }

  const { data, error } = await admin
    .from("events")
    .select(EVENT_SELECT)
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as EventRow[]).map(toRow);
}

/** Events awaiting approval (approvers hold an "all" grant, so no club scope). */
export async function listPendingApprovals(): Promise<AdminEventRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(EVENT_SELECT)
    .eq("approval_status", "pending")
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as EventRow[]).map(toRow);
}

export interface AdminStats {
  pending: number;
  upcoming: number;
  events: number;
}

/** Headline counts for the dashboard, scoped to the session's reach. */
export async function getAdminStats(session: AdminSession): Promise<AdminStats> {
  const rows = await listEventsForAdmin(session);
  const now = Date.now();
  return {
    pending: rows.filter((r) => r.approvalStatus === "pending").length,
    upcoming: rows.filter((r) => new Date(r.endsAt).getTime() >= now).length,
    events: rows.length,
  };
}

export interface EventForEdit {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  venueId: string | null;
  capacity: number | null;
  clubId: string | null;
}

/**
 * A single event's editable fields + its primary club, for the edit form.
 * Fail-closed for club-scoped admins: returns null (→ 404) unless the event
 * belongs to the admin's own club.
 */
export async function getEventForEdit(
  session: AdminSession,
  eventId: string,
): Promise<EventForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, venue_id, capacity, " +
        "event_clubs ( club_id, is_primary )",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    venue_id: string | null;
    capacity: number | null;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const primary = row.event_clubs.find((l) => l.is_primary) ?? row.event_clubs[0];
  const clubId = primary?.club_id ?? null;

  if (isClubScoped(session) && (!session.clubId || session.clubId !== clubId)) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueId: row.venue_id,
    capacity: row.capacity,
    clubId,
  };
}

/** Active clubs for the create-event select (id + label). */
export async function getClubOptions(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name")
    .eq("is_active", true)
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/** Bookable venues for the create-event select. */
export async function getVenueOptions(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("venues")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((v) => ({ id: v.id, name: v.name }));
}
