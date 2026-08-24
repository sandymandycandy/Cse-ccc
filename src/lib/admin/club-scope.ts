import "server-only";
import { grantFor, type Capability } from "@/lib/auth/capabilities";
import type { AdminSession } from "@/lib/auth/guards";

/**
 * Resolve which club a content row (resource, gallery photo, …) may be filed
 * under, given the actor's grant for `cap`:
 * - `all` → the submitted club, or null (council-wide).
 * - `own` → forced to the actor's own club (a club-scoped admin can never file
 *   council-wide or under another club); denied if they have no club.
 *
 * Returns the resolved club id, or an error string to surface on the form. The
 * caller must still `canManage(session, cap, resolved.clubId)` as the final gate
 * (this only decides scope; it doesn't authorise).
 */
export function resolveOwningClub(
  session: AdminSession,
  cap: Capability,
  submittedClubId: string,
): { clubId: string | null } | { error: string } {
  const grant = grantFor(session.role, cap);
  if (grant === "all") return { clubId: submittedClubId === "" ? null : submittedClubId };
  if (grant === "own") {
    if (!session.clubId) return { error: "Your account isn't linked to a club." };
    return { clubId: session.clubId };
  }
  return { error: "You don't have permission to do that." };
}

/**
 * Can this identity create a new row for `cap` at all? `all` → yes; `own` → yes
 * only if they have a club to file under; otherwise no. Drives whether the
 * "New / Add" affordance is shown.
 */
export function canCreateForCapability(session: AdminSession, cap: Capability): boolean {
  const grant = grantFor(session.role, cap);
  return grant === "all" || (grant === "own" && session.clubId != null);
}
