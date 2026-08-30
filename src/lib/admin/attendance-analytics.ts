/**
 * Pure club-attendance analytics for the admin dashboard panel. Kept free of
 * `server-only` and DB imports so it is unit-testable (mirrors the pure
 * `attendance-math.ts` extraction).
 *
 * Everything here is computed from data the dashboard has ALREADY fetched: the
 * per-member roster (active + onboarded members, each with the
 * attended/eligible/pct that `summarizeAttendance` produced), the club's
 * sessions each with a present count, and a small membership headcount. The
 * panel therefore adds no per-session/per-member round-trips — only the one
 * headcount query the dashboard doesn't otherwise make.
 *
 * "Strength" is the marking roster: active, onboarded members (i.e.
 * `roster.length`). It is the denominator for a session's "% of strength".
 */

export interface AnalyticsMember {
  memberId: string;
  name: string;
  attended: number;
  eligible: number;
  pct: number;
}

export interface AnalyticsSession {
  id: string;
  title: string;
  status: "open" | "closed";
  presentCount: number;
  /** YYYY-MM-DD (scheduled date, or the open date for legacy rows). */
  date: string;
}

export interface MembershipCounts {
  total: number;
  active: number;
  /** Self-registered members awaiting a head's onboarding (approved_at IS NULL). */
  pending: number;
}

export interface SessionStat {
  id: string;
  title: string;
  date: string;
  present: number;
  pctOfStrength: number;
}

export interface ClubAnalytics {
  strength: number;
  membership: MembershipCounts;
  rates: {
    /** Σ attended ÷ Σ eligible across members, as a rounded %; 0 when nothing is eligible. */
    overallPct: number;
    totalAttended: number;
    totalEligible: number;
    avgPresentPerSession: number;
    sessionsHeld: number;
  };
  sessions: {
    total: number;
    open: number;
    closed: number;
    most: SessionStat | null;
    least: SessionStat | null;
  };
  watchlist: {
    threshold: number;
    members: AnalyticsMember[];
  };
}

/** A session's present count as a % of the club's marking strength, clamped to 0–100.
 *  Clamped because a member marked present and later deactivated can push a raw
 *  ratio past 100 (present counts the mark; strength no longer counts the member). */
export function pctOfStrength(present: number, strength: number): number {
  if (strength <= 0) return 0;
  return Math.min(100, Math.round((present / strength) * 100));
}

export function computeClubAnalytics(input: {
  membership: MembershipCounts;
  roster: readonly AnalyticsMember[];
  sessions: readonly AnalyticsSession[];
  belowThreshold: number;
}): ClubAnalytics {
  const { membership, roster, sessions, belowThreshold } = input;
  const strength = roster.length;

  const totalAttended = roster.reduce((a, m) => a + m.attended, 0);
  const totalEligible = roster.reduce((a, m) => a + m.eligible, 0);
  const overallPct = totalEligible === 0 ? 0 : Math.round((totalAttended / totalEligible) * 100);

  const sessionsHeld = sessions.length;
  const totalPresent = sessions.reduce((a, s) => a + s.presentCount, 0);
  const avgPresentPerSession = sessionsHeld === 0 ? 0 : Math.round(totalPresent / sessionsHeld);

  // Most/least attended by present count. Ties keep the first session seen —
  // `listSessions` orders newest-first, so a tie surfaces the more recent one.
  let most: SessionStat | null = null;
  let least: SessionStat | null = null;
  for (const s of sessions) {
    const stat: SessionStat = {
      id: s.id, title: s.title, date: s.date, present: s.presentCount,
      pctOfStrength: pctOfStrength(s.presentCount, strength),
    };
    if (most === null || stat.present > most.present) most = stat;
    if (least === null || stat.present < least.present) least = stat;
  }

  // Only members who actually had eligible sessions can be "behind" — a brand-new
  // member with 0 eligible sessions is 0% by convention but isn't falling behind.
  const watchlist = roster
    .filter((m) => m.eligible > 0 && m.pct < belowThreshold)
    .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));

  return {
    strength,
    membership,
    rates: { overallPct, totalAttended, totalEligible, avgPresentPerSession, sessionsHeld },
    sessions: {
      total: sessions.length,
      open: sessions.filter((s) => s.status === "open").length,
      closed: sessions.filter((s) => s.status === "closed").length,
      most,
      least,
    },
    watchlist: { threshold: belowThreshold, members: watchlist },
  };
}
