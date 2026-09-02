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
//
// 2026-09-02, owner decision: `manage:gallery` was split out of `manage:content`
// (which still covers announcements + achievements) so that a `gallery_manager`
// account can be given the photo gallery and nothing else. The split is
// access-neutral for every pre-existing role: the two rows carry identical
// grants, and a test enforces that. There are 21 capabilities, not 20.
//
// 2026-09-02, owner decision: the Faculty Advisor is NO LONGER read-only, and the
// Vice President is no longer short of `revoke:certificate` / `manage:admins` /
// `view:audit`. Both now hold "all" on every capability, which leaves THREE
// unrestricted roles — Faculty, VP, Tech Head — and is why Faculty and VP joined
// TOTP_REQUIRED_ROLES below. The President was deliberately not widened: they
// keep `view:audit` at "read" and still hold no `manage:admins`, because that was
// not part of the ask. BUILD_PLAN §3.2 and SECURITY_SPEC were updated to match;
// do not "restore" the narrower grants from an older copy of the spec.

export const ADMIN_ROLES = [
  "faculty_advisor",
  "president",
  "vice_president",
  "tech_head",
  "events_head",
  "docs_head",
  "social_media_head",
  "club_head",
  "vice_head",
  // The narrowest role in the system: the public photo gallery and nothing else.
  // Added 2026-09-02 so one person can be given the gallery without also being
  // handed announcements and achievements (see the manage:gallery row below).
  "gallery_manager",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

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
  | "manage:results"
  | "issue:participation_certificate"
  | "issue:winner_certificate"
  | "revoke:certificate"
  | "manage:content" // announcements / achievements (and gallery, for legacy roles)
  | "manage:gallery" // the public photo gallery, split out of manage:content
  | "manage:clubs" // a club's own name / tagline / description
  | "manage:contact" // the public contact-form inbox (council-wide)
  | "manage:members"
  | "manage:council" // the council / leadership attendance roster + sessions (org-wide)
  | "manage:resources"
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
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "approve:events": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all",
  },
  "cancel:events": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own",
  },
  "manage:blackouts": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all",
  },
  "manage:schedules": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "manage:registrations": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "manage:results": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
  "issue:participation_certificate": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own",
  },
  "issue:winner_certificate": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own",
  },
  // §3.2's revoke row is malformed in the doc (8 cells for 9 roles). Applying
  // §10 ("Technical Head is unrestricted") plus least-privilege for a dangerous,
  // irreversible action: Tech Head only — plus Faculty and the VP, who now hold
  // everything.
  // TODO: confirm with a human whether President/VP should also revoke.
  "revoke:certificate": {
    faculty_advisor: "all", vice_president: "all", tech_head: "all",
  },
  "manage:content": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", social_media_head: "all", club_head: "own", vice_head: "own",
  },
  // Split out of manage:content (2026-09-02) so a gallery-only admin is possible.
  // Every pre-existing role MUST hold the same grant here as it holds on
  // manage:content — the split was meant to add a role, not to change anyone's
  // access. A test pins the two rows together; if you edit one, edit both.
  "manage:gallery": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", social_media_head: "all", club_head: "own", vice_head: "own",
    gallery_manager: "all",
  },
  // A club's public profile (name/tagline/description) is self-editable: heads
  // edit their own club; council-wide roles edit any; faculty read.
  "manage:clubs": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", club_head: "own", vice_head: "own",
  },
  // The public contact-form inbox is council-wide (no club scope) — the roles
  // that field outside enquiries plus Social Media (outreach); faculty read.
  "manage:contact": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", social_media_head: "all",
  },
  "manage:members": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", club_head: "own", vice_head: "own",
  },
  // The council / leadership attendance body is org-wide (no club scope), so only
  // all/read/none. Taken by president + VP + tech head; faculty view-only. Club
  // heads/vice-heads sit on the roster but hold no grant here.
  "manage:council": {
    faculty_advisor: "all", president: "all", vice_president: "all", tech_head: "all",
  },
  "manage:resources": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", docs_head: "all", club_head: "own",
  },
  "manage:venues": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "request", vice_head: "request",
  },
  // Owner decision (2026-09-02): the Faculty Advisor and the Vice President hold
  // full access, this row included — they can create and remove admins, Tech Head
  // among them. Note the President still cannot.
  "manage:admins": {
    faculty_advisor: "all", vice_president: "all", tech_head: "all",
  },
  "view:audit": {
    faculty_advisor: "all", vice_president: "all", president: "read", tech_head: "all",
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

/**
 * Can this identity *view* a capability's surface for a SPECIFIC club?
 * Council-wide grants (`all`/`read`) view every club; `own` sees only its own;
 * `request`/`none` view nothing. Unlike `canManage`, a `read` grant qualifies —
 * this is what lets a Faculty Advisor open a club's dashboard read-only while
 * mutations stay gated behind `canManage`.
 */
export function canViewClub(
  id: AdminIdentity,
  cap: Capability,
  resourceClubId: string | null,
): boolean {
  if (resourceClubId == null) return false;
  const grant = grantFor(id.role, cap);
  if (grant === "all" || grant === "read") return true;
  if (grant === "own") return id.clubId != null && id.clubId === resourceClubId;
  return false;
}

/** Capabilities this role can at least see — drives the admin nav. */
export function viewableCapabilities(role: AdminRole): Capability[] {
  return (Object.keys(MATRIX) as Capability[]).filter(
    (cap) => grantFor(role, cap) !== "none",
  );
}

/**
 * Where an admin's "home" points — the nav's first link and the landing spot
 * after login. The dashboard at /admin is an events surface (pending approvals,
 * upcoming events, "Create event"), so a role that can't see any of that would
 * land on an empty, confusing page. Such a role goes straight to its one
 * surface instead.
 */
export function adminHomePath(role: AdminRole): string {
  const caps = viewableCapabilities(role);
  if (caps.length === 1 && caps[0] === "manage:gallery") return "/admin/gallery";
  return "/admin";
}

/**
 * Roles that MUST have a second factor enrolled (SECURITY_SPEC §3). These hold
 * the widest blast radius, so password-only is not acceptable: at login they are
 * routed to forced TOTP enrollment before they can reach any admin surface.
 */
export const TOTP_REQUIRED_ROLES: readonly AdminRole[] = [
  "faculty_advisor",
  "vice_president",
  "tech_head",
  "president",
];

export function roleRequiresTotp(role: AdminRole): boolean {
  return TOTP_REQUIRED_ROLES.includes(role);
}
