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
