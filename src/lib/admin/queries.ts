import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantFor } from "@/lib/auth/capabilities";
import type { AdminSession } from "@/lib/auth/guards";
import {
  canManageEvent,
  cohostIdsOf,
  hostsFromLinks,
  type EventHosts,
} from "@/lib/admin/event-hosts";
import { hostLabel, orderHosts } from "@/lib/event-hosts";
import { UUID, diffAudit, idsIn, type AuditChange } from "@/lib/admin/audit-diff";

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
  /** Every hosting club's short name, primary first: "Coding × Ai Forge". */
  club: string;
  /** The primary (owning) club. */
  clubId: string | null;
  createdBy: string | null;
  selectionMode: "seats" | "shortlist";
}

const EVENT_SELECT =
  "id, title, starts_at, ends_at, status, approval_status, created_by, selection_mode, " +
  "event_clubs ( club_id, is_primary, clubs ( short_name ) )";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  approval_status: string;
  created_by: string | null;
  selection_mode: "seats" | "shortlist" | null;
  event_clubs: { club_id: string; is_primary: boolean; clubs: { short_name: string } | null }[];
};

function toRow(e: EventRow): AdminEventRow {
  return {
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    status: e.status,
    approvalStatus: e.approval_status,
    club: hostLabel(orderHosts(e.event_clubs).map((c) => c.short_name)) || "—",
    clubId: hostsFromLinks(e.event_clubs).primaryClubId,
    createdBy: e.created_by,
    selectionMode: e.selection_mode ?? "seats",
  };
}

/** True when the session only manages its own club's events. */
function isClubScoped(session: AdminSession): boolean {
  return grantFor(session.role, "manage:events") === "own";
}

/** Events this admin may see, newest first. Club-scoped roles see only theirs. */
export async function listEventsForAdmin(session: AdminSession): Promise<AdminEventRow[]> {
  const admin = createAdminClient();

  if (isClubScoped(session)) {
    // Fail closed: a club-scoped admin with no club sees nothing, never "all".
    if (!session.clubId) return [];

    // Every event this club hosts, as owner or co-host, resolved to ids FIRST.
    // ⚠️ Do not fold this back into one `event_clubs!inner` query filtered on
    // club_id. That filter also strips the embedded link rows down to this
    // club's own, so each row would lose its other hosts and label a co-hosted
    // event as this club's alone.
    const { data: links, error: linkErr } = await admin
      .from("event_clubs")
      .select("event_id")
      .eq("club_id", session.clubId);
    if (linkErr) throw linkErr;
    const ids = [...new Set((links ?? []).map((l) => l.event_id))];
    if (ids.length === 0) return [];

    const { data, error } = await admin
      .from("events")
      .select(EVENT_SELECT)
      .in("id", ids)
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
  /** The primary (owning) club: the form's "Hosting club". */
  clubId: string | null;
  /** Co-hosting clubs, not including the primary. */
  cohostIds: string[];
  hosts: EventHosts;
  status: string;
  approvalStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  selectionMode: "seats" | "shortlist";
  registrationForm: unknown;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  waitlistEnabled: boolean;
  showOnAchievements: boolean;
  /** The event's group chat, given only to registrants. */
  whatsappUrl: string | null;
  summary: string | null;
}

/**
 * A single event's editable fields and its hosting clubs, for the edit form.
 * Fail-closed: returns null (→ 404) unless this admin manages the event through
 * one of its hosting clubs. A co-host's head gets the form, like the owner's.
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
        "show_on_achievements, whatsapp_url, summary, " +
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
    show_on_achievements: boolean | null;
    whatsapp_url: string | null;
    summary: string | null;
    event_clubs: { club_id: string; is_primary: boolean }[];
  };
  const hosts = hostsFromLinks(row.event_clubs);
  if (!canManageEvent(session, "manage:events", hosts)) return null;

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
    clubId: hosts.primaryClubId,
    cohostIds: cohostIdsOf(hosts),
    hosts,
    status: row.status,
    approvalStatus: row.approval_status,
    rejectionReason: row.rejection_reason,
    selectionMode: row.selection_mode ?? "seats",
    registrationForm: row.registration_form ?? null,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    waitlistEnabled: row.waitlist_enabled ?? true,
    // Opt-out, matching the column default: an event is on the board unless
    // someone unticks it.
    showOnAchievements: row.show_on_achievements ?? true,
    whatsappUrl: row.whatsapp_url,
    summary: row.summary,
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
    club: hostLabel(orderHosts(row.event_clubs).map((c) => c.name)) || null,
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
  /** The affected record's name (event title, club, person), when it resolves. */
  target: string | null;
  /** Field-by-field "from → to" (see audit-diff). */
  changes: AuditChange[];
  ip: string | null;
}

/**
 * Resolves ids to display names across the tables audit rows point at. One
 * query per table; ids are unique across tables, so one map holds them all.
 */
async function resolveNames(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  // `.in()` travels in the GET URL — batch so 500 rows' worth of ids stays
  // well under the gateway's URL limit.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [admins, clubs, events, members, council, regs] = await Promise.all([
      admin.from("admin_users").select("id, full_name").in("id", chunk),
      admin.from("clubs").select("id, name").in("id", chunk),
      admin.from("events").select("id, title").in("id", chunk),
      admin.from("club_members").select("id, name").in("id", chunk),
      admin.from("council_members").select("id, full_name").in("id", chunk),
      admin.from("registrations").select("id, student_name").in("id", chunk),
    ]);
    for (const r of admins.data ?? []) names.set(r.id, r.full_name);
    for (const r of clubs.data ?? []) names.set(r.id, r.name);
    for (const r of events.data ?? []) names.set(r.id, r.title);
    for (const r of members.data ?? []) names.set(r.id, r.name);
    for (const r of council.data ?? []) names.set(r.id, r.full_name);
    for (const r of regs.data ?? []) if (r.student_name) names.set(r.id, r.student_name);
  }
  return names;
}

/**
 * The audit trail (SECURITY_SPEC §14), newest first. Org-wide and read-only —
 * `view:audit` has no club scope, so the page guard (`requireViewPage`) is the
 * only gate. Actor, record and referenced-id names are resolved in follow-up
 * queries (no FK-embed assumed).
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

  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actor_id) ids.add(r.actor_id);
    if (r.entity_id && UUID.test(r.entity_id)) ids.add(r.entity_id);
    for (const id of [...idsIn(r.before), ...idsIn(r.after)]) ids.add(id);
  }
  const names = await resolveNames(admin, [...ids]);

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor_id ? names.get(r.actor_id) ?? "(removed)" : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    target: r.entity_id ? names.get(r.entity_id) ?? null : null,
    changes: diffAudit(r.before, r.after, names),
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
