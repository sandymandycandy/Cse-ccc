/**
 * Which head and vice head the feedback form shows for a club.
 *
 * Two problems, one resolver. First, `admin_users` was never one-head-per-club:
 * duplicate head and vice-head rows have repeatedly made a club ambiguous, so
 * the form cannot simply query for "the" head — hence the curated pick, and
 * hence the refusal to guess. Second, a club's real vice head may hold no admin
 * account at all (three clubs are in that state), and an unnamed role is not
 * rendered on the public form at all — those clubs silently collect no
 * feedback. Hence the typed name: a curated pick that is a name rather than an
 * account.
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
  /** null when the leader was typed by hand and has no admin account. */
  id: string | null;
  name: string;
}

export interface ClubLeaders {
  head: ResolvedLeader | null;
  viceHead: ResolvedLeader | null;
}

/** The curated choice for a club: an account id, or a hand-typed name, per role. */
export interface CuratedLeaders {
  headId: string | null;
  viceHeadId: string | null;
  headName?: string | null;
  viceHeadName?: string | null;
}

function pick(
  candidates: LeaderCandidate[],
  role: LeaderCandidate["role"],
  curatedId: string | null,
  typedName: string | null | undefined,
): ResolvedLeader | null {
  const eligible = candidates.filter((c) => c.isActive && c.role === role);

  // 1) the curated pick, if it is still an eligible account of THIS role.
  if (curatedId) {
    const chosen = eligible.find((c) => c.id === curatedId);
    if (chosen) return { id: chosen.id, name: chosen.name };
    // falls through: a stale or wrong-role pick is ignored, not honoured.
  }

  // 2) a hand-typed name. Deliberately beats the sole-candidate fallback below:
  //    typing a name is an explicit act, so it outranks anything inferred.
  const typed = typedName?.trim();
  if (typed) return { id: null, name: typed };

  // 3) the sole candidate, if there is exactly one.
  if (eligible.length === 1) return { id: eligible[0].id, name: eligible[0].name };

  // 4) nothing. An ambiguous club shows no block rather than guessing — a wrong
  //    name attached to a rating is worse than a missing one.
  return null;
}

export function resolveLeaders(
  candidates: LeaderCandidate[],
  curated: CuratedLeaders,
): ClubLeaders {
  return {
    head: pick(candidates, "club_head", curated.headId, curated.headName),
    viceHead: pick(candidates, "vice_head", curated.viceHeadId, curated.viceHeadName),
  };
}
