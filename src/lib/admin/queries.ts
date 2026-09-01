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
  venueText: string | null;
  posterUrl: string | null;
  capacity: number | null;
  clubId: string | null;
  status: string;
  approvalStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  selectionMode: "seats" | "shortlist";
  registrationForm: unknown;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  waitlistEnabled: boolean;
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
      "id, title, description, starts_at, ends_at, venue_text, poster_path, capacity, status, " +
        "approval_status, rejection_reason, selection_mode, registration_form, " +
        "registration_opens_at, registration_closes_at, waitlist_enabled, " +
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
    venue_text: string | null;
    poster_path: string | null;
    capacity: number | null;
    status: string;
    approval_status: "pending" | "approved" | "rejected";
    rejection_reason: string | null;
    selection_mode: "seats" | "shortlist" | null;
    registration_form: unknown;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
    waitlist_enabled: boolean | null;
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
    venueText: row.venue_text,
    posterUrl: row.poster_path
      ? admin.storage.from("event-posters").getPublicUrl(row.poster_path).data.publicUrl
      : null,
    capacity: row.capacity,
    clubId,
    status: row.status,
    approvalStatus: row.approval_status,
    rejectionReason: row.rejection_reason,
    selectionMode: row.selection_mode ?? "seats",
    registrationForm: row.registration_form ?? null,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    waitlistEnabled: row.waitlist_enabled ?? true,
  };
}

export interface EventForReview {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  venueText: string | null;
  posterUrl: string | null;
  capacity: number | null;
  club: string | null;
  selectionMode: "seats" | "shortlist";
  registrationForm: unknown;
  approvalStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  submittedBy: string | null;
}

/**
 * A full read-only view of one event for the approver's review page. No club
 * scope: approvers hold an "all" grant (the page still guards `approve:events`).
 */
export async function getEventForReview(eventId: string): Promise<EventForReview | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, venue_text, poster_path, capacity, " +
        "approval_status, rejection_reason, selection_mode, registration_form, created_by, " +
        "event_clubs ( is_primary, clubs ( name ) )",
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
    venue_text: string | null;
    poster_path: string | null;
    capacity: number | null;
    approval_status: "pending" | "approved" | "rejected";
    rejection_reason: string | null;
    selection_mode: "seats" | "shortlist" | null;
    registration_form: unknown;
    created_by: string | null;
    event_clubs: { is_primary: boolean; clubs: { name: string } | null }[];
  };
  const primary = row.event_clubs.find((l) => l.is_primary) ?? row.event_clubs[0];

  let submittedBy: string | null = null;
  if (row.created_by) {
    const { data: u } = await admin
      .from("admin_users")
      .select("full_name")
      .eq("id", row.created_by)
      .maybeSingle();
    submittedBy = u?.full_name ?? null;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueText: row.venue_text,
    posterUrl: row.poster_path
      ? admin.storage.from("event-posters").getPublicUrl(row.poster_path).data.publicUrl
      : null,
    capacity: row.capacity,
    club: primary?.clubs?.name ?? null,
    selectionMode: row.selection_mode ?? "seats",
    registrationForm: row.registration_form ?? null,
    approvalStatus: row.approval_status,
    rejectionReason: row.rejection_reason,
    submittedBy,
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

export interface AuditEntry {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  ip: string | null;
}

/** A compact "k=v, k=v" of the after-snapshot (or before, on deletes), truncated. */
function summarizeChange(before: unknown, after: unknown): string {
  const src = (after && typeof after === "object" ? after : before) as Record<string, unknown> | null;
  if (!src || typeof src !== "object") return "";
  const parts = Object.entries(src).map(([k, v]) => {
    const val = v == null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `${k}=${val.length > 40 ? val.slice(0, 40) + "…" : val}`;
  });
  const joined = parts.join(", ");
  return joined.length > 120 ? joined.slice(0, 120) + "…" : joined;
}

/**
 * The audit trail (SECURITY_SPEC §14), newest first. Org-wide and read-only —
 * `view:audit` has no club scope, so the page guard (`requireViewPage`) is the
 * only gate. Actor names are resolved in a second query (no FK-embed assumed).
 */
export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("audit_log")
    .select("id, at, actor_id, action, entity, entity_id, before, after, ip")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    at: string;
    actor_id: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    before: unknown;
    after: unknown;
    ip: string | null;
  }[];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: admins } = await admin
      .from("admin_users")
      .select("id, full_name")
      .in("id", actorIds);
    for (const a of admins ?? []) names.set(a.id, a.full_name);
  }

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor_id ? names.get(r.actor_id) ?? "(removed)" : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    summary: summarizeChange(r.before, r.after),
    ip: r.ip,
  }));
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
