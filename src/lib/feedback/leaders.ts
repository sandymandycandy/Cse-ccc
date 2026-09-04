/**
 * Which head and vice head the feedback form shows for a club.
 *
 * `admin_users` is NOT one-head-per-club on the live data: Coding Club has three
 * `club_head` accounts, AppNova two, AspireX two `vice_head` rows that look like
 * one duplicated person, and three clubs have no vice head at all. So the form
 * cannot simply query for "the" head — hence the curated pick, and hence the
 * refusal to guess.
 *
 * Pure: no I/O, so the rules are unit-testable.
 */

export interface LeaderCandidate {
  id: string;
  name: string;
  role: "club_head" | "vice_head";
  isActive: boolean;
}

export interface ResolvedLeader {
  id: string;
  name: string;
}

export interface ClubLeaders {
  head: ResolvedLeader | null;
  viceHead: ResolvedLeader | null;
}

function pick(
  candidates: LeaderCandidate[],
  role: LeaderCandidate["role"],
  curatedId: string | null,
): ResolvedLeader | null {
  const eligible = candidates.filter((c) => c.isActive && c.role === role);

  // 1) the curated pick, if it is still an eligible account of THIS role.
  if (curatedId) {
    const chosen = eligible.find((c) => c.id === curatedId);
    if (chosen) return { id: chosen.id, name: chosen.name };
    // falls through: a stale or wrong-role pick is ignored, not honoured.
  }

  // 2) the sole candidate, if there is exactly one.
  if (eligible.length === 1) return { id: eligible[0].id, name: eligible[0].name };

  // 3) nothing. An ambiguous club shows no block rather than guessing — a wrong
  //    name attached to a rating is worse than a missing one.
  return null;
}

export function resolveLeaders(
  candidates: LeaderCandidate[],
  curated: { headId: string | null; viceHeadId: string | null },
): ClubLeaders {
  return {
    head: pick(candidates, "club_head", curated.headId),
    viceHead: pick(candidates, "vice_head", curated.viceHeadId),
  };
}
