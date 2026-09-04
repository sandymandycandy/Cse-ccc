/**
 * Arranges the admin list by club. Pure, so the ordering is testable without a
 * database.
 *
 * A flat list of 37 accounts hides the thing the council actually wants to
 * know — who runs each club, and where the duplicates are. Grouped, an
 * anomaly reads at a glance: three `club_head` accounts on one club, a club
 * with a head but no vice, or a council role carrying a `club_id`.
 */

/** The slice of an admin row the grouping needs. */
export interface GroupableAdmin {
  id: string;
  name: string;
  role: string;
  clubId: string | null;
  club: string | null;
}

export interface AdminGroup<T extends GroupableAdmin = GroupableAdmin> {
  /** null for the council-wide group. */
  clubId: string | null;
  label: string;
  admins: T[];
}

export const COUNCIL_LABEL = "Council-wide";

/**
 * Sort order within a group. Club roles lead so that a club's heading is
 * followed by the people who actually run it; the council roles then follow in
 * seniority. One list serves both groups because a `club_head` always carries a
 * club and so never lands in the council group.
 */
const ROLE_RANK: readonly string[] = [
  "club_head",
  "vice_head",
  "faculty_advisor",
  "president",
  "vice_president",
  "tech_head",
  "events_head",
  "docs_head",
  "social_media_head",
  "gallery_manager",
];

const rank = (role: string): number => {
  const i = ROLE_RANK.indexOf(role);
  // An unknown role sorts last rather than first — a new role should not
  // silently outrank the club head.
  return i === -1 ? ROLE_RANK.length : i;
};

/**
 * Council-wide first, then clubs by name. Grouping keys on `clubId`, never on
 * the display name: two clubs can share a `short_name`, and grouping on the
 * string would merge them and show one club's admins under another's heading.
 */
export function groupAdminsByClub<T extends GroupableAdmin>(admins: T[]): AdminGroup<T>[] {
  const byClub = new Map<string | null, AdminGroup<T>>();

  for (const a of admins) {
    let group = byClub.get(a.clubId);
    if (!group) {
      group = {
        clubId: a.clubId,
        label: a.clubId === null ? COUNCIL_LABEL : (a.club ?? "Unnamed club"),
        admins: [],
      };
      byClub.set(a.clubId, group);
    }
    group.admins.push(a);
  }

  for (const group of byClub.values()) {
    group.admins.sort(
      (x, y) => rank(x.role) - rank(y.role) || x.name.localeCompare(y.name),
    );
  }

  return [...byClub.values()].sort((x, y) => {
    if (x.clubId === null) return -1;
    if (y.clubId === null) return 1;
    return x.label.localeCompare(y.label);
  });
}
