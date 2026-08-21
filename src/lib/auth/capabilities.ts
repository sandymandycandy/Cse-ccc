// Capability model — SECURITY_SPEC §4 / BUILD_PLAN §3.2.
//
// Permissions are capabilities derived from (role + club), NOT role-name checks:
// Docs Head and Social Media Head are cross-club but narrow, which a five-role
// model can't express. This module is the single source of truth the server-side
// require* guards consult; it is pure (no I/O) so it can be unit-tested and can
// run in middleware, route handlers, and the UI alike.
//
// Grants are transcribed cell-for-cell from the §3.2 matrix. Keep them in sync
// with the doc — this table is the audit surface.

export type AdminRole =
  | "faculty_advisor"
  | "president"
  | "vice_president"
  | "tech_head"
  | "events_head"
  | "docs_head"
  | "social_media_head"
  | "club_head"
  | "vice_head";

/**
 * How much of a capability a role holds:
 * - `all`     act across every club
 * - `own`     act only on resources in the admin's own club
 * - `request` may request (not directly perform) — venue bookings for heads
 * - `read`    view only, never mutate (Faculty Advisor's entire surface)
 * - `none`    no access
 */
export type Grant = "none" | "read" | "request" | "own" | "all";

export type Capability =
  | "manage:events"
  | "approve:events"
  | "cancel:events"
  | "manage:blackouts"
  | "manage:schedules"
  | "manage:registrations"
  | "issue:participation_certificate"
  | "issue:winner_certificate"
  | "revoke:certificate"
  | "manage:content" // announcements / gallery / achievements
  | "manage:resources"
  | "manage:recruitment"
  | "manage:venues"
  | "manage:admins"
  | "view:audit"
  | "view:analytics";

/** The identity the capability checks reason about (a slice of the session). */
export interface AdminIdentity {
  role: AdminRole;
  clubId: string | null;
}

// Per-capability grants by role. Omitted roles default to "none". Read the rows
// against BUILD_PLAN §3.2; F=Faculty P=Pres V=VP T=Tech E=Events D=Docs S=Social
// H=Club Head VH=Vice Head.
const MATRIX: Record<Capability, Partial<Record<AdminRole, Grant>>> = {
  "manage:events": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "approve:events": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all",
  },
  "cancel:events": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own",
  },
  "manage:blackouts": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all",
  },
  "manage:schedules": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "manage:registrations": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "issue:participation_certificate": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own",
  },
  "issue:winner_certificate": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own",
  },
  // §3.2's revoke row is malformed in the doc (8 cells for 9 roles). Applying
  // §10 ("Technical Head is unrestricted") plus least-privilege for a dangerous,
  // irreversible action: Tech Head only, Faculty read. TODO: confirm with a human
  // whether President/VP should also revoke.
  "revoke:certificate": {
    faculty_advisor: "read", tech_head: "all",
  },
  "manage:content": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", social_media_head: "all", club_head: "own", vice_head: "own",
  },
  "manage:resources": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", docs_head: "all", club_head: "own",
  },
  "manage:recruitment": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", social_media_head: "all", club_head: "own", vice_head: "own",
  },
  "manage:venues": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "request", vice_head: "request",
  },
  "manage:admins": {
    tech_head: "all",
  },
  "view:audit": {
    faculty_advisor: "read", president: "read", tech_head: "all",
  },
  "view:analytics": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", social_media_head: "all",
    club_head: "own", vice_head: "own",
  },
};

/** Raw grant a role holds for a capability (defaults to "none"). */
export function grantFor(role: AdminRole, cap: Capability): Grant {
  return MATRIX[cap][role] ?? "none";
}

/** Can this identity *view* the capability's surface (any non-none grant)? */
export function canView(id: AdminIdentity, cap: Capability): boolean {
  return grantFor(id.role, cap) !== "none";
}

/**
 * Can this identity *perform* (mutate) the capability?
 * - `all` → yes, any club.
 * - `own` → yes, but only when the resource belongs to the admin's own club
 *   (`resourceClubId` must be supplied and match). A club-scoped admin with no
 *   club, or acting on another club's resource, is denied.
 * - `read` / `request` / `none` → no.
 */
export function canManage(
  id: AdminIdentity,
  cap: Capability,
  resourceClubId?: string | null,
): boolean {
  const grant = grantFor(id.role, cap);
  if (grant === "all") return true;
  if (grant === "own") {
    return (
      id.clubId != null &&
      resourceClubId != null &&
      id.clubId === resourceClubId
    );
  }
  return false;
}

/** Capabilities this role can at least see — drives the admin nav. */
export function viewableCapabilities(role: AdminRole): Capability[] {
  return (Object.keys(MATRIX) as Capability[]).filter(
    (cap) => grantFor(role, cap) !== "none",
  );
}
