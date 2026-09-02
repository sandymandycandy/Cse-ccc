import "server-only";
import { canManage, canViewClub, grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import type { AdminSession } from "@/lib/auth/guards";

export interface AttendanceScope {
  /** null when the admin has no club to show — render the empty state. */
  clubId: string | null;
  /** Populated only for council-wide grants, who get the club picker. */
  clubs: { id: string; name: string }[];
  councilWide: boolean;
  /** Council-wide `read` (faculty) can look but not create sessions. */
  canManageClub: boolean;
}

/**
 * Which club an attendance page is showing, and what the viewer may do to it.
 *
 * Shared by the attendance dashboard and its analytics page so the two can
 * never drift apart on who sees which club — a club-scoped head is pinned to
 * their own club regardless of `?club=`, which is the whole point of resolving
 * it server-side rather than trusting the query string.
 */
export async function resolveAttendanceScope(
  session: AdminSession,
  clubParam?: string,
): Promise<AttendanceScope> {
  const grant = grantFor(session.role, "manage:members");
  // Council-wide grants (all managers, faculty read-only) can view every club
  // and need a picker; own-scoped heads are pinned to their own club.
  const councilWide = grant === "all" || grant === "read";
  const clubs = councilWide ? await listClubsBrief() : [];
  const requested = grant === "own" ? session.clubId : (clubParam ?? clubs[0]?.id ?? null);

  if (requested == null || !canViewClub(session, "manage:members", requested)) {
    return { clubId: null, clubs, councilWide, canManageClub: false };
  }
  return {
    clubId: requested,
    clubs,
    councilWide,
    canManageClub: canManage(session, "manage:members", requested),
  };
}
