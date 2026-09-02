import type { PublishedResult } from "./queries";

/**
 * The podium for a round: everyone placed first, second or third.
 *
 * Deliberately NOT capped at three entries. Ties are common — the published
 * PITCH DESK standings have two students sharing third — and truncating to three
 * cards would drop one of them off the page entirely while still showing their
 * rank as awarded. A tie renders as two cards with the same number, which is
 * what a printed result sheet does too.
 */
export function podiumOf(results: readonly PublishedResult[]): PublishedResult[] {
  return results
    .filter((r) => r.rank != null && r.rank <= 3)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/** One person on a standing, as displayed. */
export interface Entrant {
  name: string;
  roll: string;
}

/**
 * Everyone who shares a standing, as one flat list.
 *
 * A team's rank belongs to the whole team, so the page shows its people with
 * equal weight rather than featuring the registrant and demoting the rest to a
 * caption. The registrant leads the list only because they are the one the
 * result row is keyed by — nothing in the rendering treats them differently.
 */
export function entrantsOf(result: PublishedResult): Entrant[] {
  return [
    { name: result.display_name ?? result.roll_no, roll: result.roll_no },
    ...(result.team_members ?? []),
  ];
}
