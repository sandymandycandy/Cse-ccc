/**
 * Which announcement, if any, belongs in the home hero.
 *
 * Pure and clock-injectable so expiry is testable without faking time. The
 * expiry filter lives HERE and nowhere else: `/announcements` and the home
 * page's Announcements section deliberately keep showing an expired notice —
 * expiring removes it from the hero only, it does not unpublish it.
 */

export interface HeroCandidate {
  /** ISO timestamp. */
  publishedAt: string;
  /** ISO timestamp, or null for "never leaves the hero". */
  expiresAt: string | null;
}

/**
 * An expiry of exactly `now` counts as expired — "hide it at 5pm" means gone at
 * 5pm, not one tick after.
 *
 * An unparseable expiry keeps the announcement VISIBLE. A notice is not
 * sensitive, so a malformed value should not silently blank the hero; the
 * opposite of the fail-closed rule the team roster uses for visibility.
 */
export function isAnnouncementLive(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return true;
  return at > now.getTime();
}

/**
 * The newest still-live announcement, or null.
 *
 * Sorts internally rather than trusting the caller's order, so the hero keeps
 * showing the newest notice even if the query's ordering ever changes.
 */
export function pickHeroAnnouncement<T extends HeroCandidate>(
  rows: readonly T[],
  now: Date,
): T | null {
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const row of rows) {
    if (!isAnnouncementLive(row.expiresAt, now)) continue;
    const publishedAt = Date.parse(row.publishedAt);
    if (publishedAt > bestAt) {
      best = row;
      bestAt = publishedAt;
    }
  }
  return best;
}
