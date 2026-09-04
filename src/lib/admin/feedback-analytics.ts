import { istDateKey } from "@/lib/datetime";

/**
 * Read-only analytics for one feedback period.
 *
 * ⚠️ READ THIS BEFORE ADDING ANYTHING HERE. The owner declined a submission cap
 * (design D3), so any student can submit repeatedly and move a score. That makes
 * a ranked, named watchlist the most dangerous surface in the feature: it is a
 * page someone might act on, built from data anyone can move.
 *
 * Three guards are therefore structural, not cosmetic, and must not be relaxed:
 *
 *   1. Every average travels with its `responses` count. There is no shape in
 *      this module that exposes a mean without its n.
 *   2. A club or leader below `THIN_SAMPLE` responses is marked `thin` and is
 *      NEVER placed on a watchlist, however bad the score. One furious response
 *      must not put a named person on a list.
 *   3. Duplicate-VTU counts are computed here and belong at the TOP of the page,
 *      not buried — if a third of responses share VTUs, that must be read before
 *      any average is.
 *
 * Pure: no I/O, so all of the above is unit-testable.
 */

/** Below this many responses, a figure is reported but never ranked or flagged. */
export const THIN_SAMPLE = 5;

export interface AnalyticsResponse {
  clubId: string;
  vtu: string;
  clubRating: number;
  headRating: number | null;
  headName: string | null;
  viceRating: number | null;
  viceName: string | null;
  activities: string;
  suggestions: string;
  createdAt: string;
}

export interface PreviousPeriod {
  label: string;
  clubAvg: number | null;
  headAvg: number | null;
  viceAvg: number | null;
  responses: number;
}

export interface ClubStat {
  clubId: string;
  clubName: string;
  responses: number;
  clubAvg: number | null;
  headAvg: number | null;
  viceAvg: number | null;
  /** Fewer than THIN_SAMPLE responses — report, but never rank. */
  thin: boolean;
}

export interface LeaderStat {
  name: string;
  role: "Club head" | "Vice head";
  clubName: string;
  responses: number;
  avg: number;
}

export interface FeedbackAnalytics {
  totals: {
    responses: number;
    clubsCovered: number;
    clubsTotal: number;
    clubAvg: number | null;
    headAvg: number | null;
    viceAvg: number | null;
    /** Responses as a % of members on the roster. Coverage, not turnout. */
    reachPct: number;
  };
  /** Counts for ratings 1..5, index 0 = one star. */
  distribution: {
    club: number[];
    head: number[];
    vice: number[];
  };
  clubs: ClubStat[];
  silentClubs: { id: string; name: string }[];
  clubWatchlist: ClubStat[];
  leaderWatchlist: LeaderStat[];
  integrity: {
    duplicateVtus: number;
    responsesFromDuplicates: number;
  };
  engagement: {
    withActivities: number;
    withSuggestions: number;
  };
  timeline: { day: string; count: number }[];
  trend: {
    label: string;
    clubAvgDelta: number | null;
    headAvgDelta: number | null;
    viceAvgDelta: number | null;
    responsesDelta: number;
  } | null;
}

function avg(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10;
}

function buckets(values: (number | null)[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const v of values) {
    if (v != null && v >= 1 && v <= 5) out[v - 1] += 1;
  }
  return out;
}

function delta(now: number | null, before: number | null): number | null {
  if (now == null || before == null) return null;
  return Math.round((now - before) * 10) / 10;
}

export function computeFeedbackAnalytics(input: {
  responses: readonly AnalyticsResponse[];
  clubs: readonly { id: string; name: string }[];
  previous: PreviousPeriod | null;
  memberCount: number;
  belowThreshold: number;
}): FeedbackAnalytics {
  const { responses, clubs, previous, memberCount, belowThreshold } = input;
  const nameOf = new Map(clubs.map((c) => [c.id, c.name]));

  // ── per club ────────────────────────────────────────────────────────────
  const byClub = new Map<string, AnalyticsResponse[]>();
  for (const r of responses) {
    const list = byClub.get(r.clubId);
    if (list) list.push(r);
    else byClub.set(r.clubId, [r]);
  }

  const clubStats: ClubStat[] = [...byClub.entries()]
    .map(([clubId, list]) => ({
      clubId,
      clubName: nameOf.get(clubId) ?? "—",
      responses: list.length,
      clubAvg: avg(list.map((r) => r.clubRating)),
      headAvg: avg(list.map((r) => r.headRating)),
      viceAvg: avg(list.map((r) => r.viceRating)),
      thin: list.length < THIN_SAMPLE,
    }))
    .sort((a, b) => b.responses - a.responses);

  const silentClubs = clubs
    .filter((c) => !byClub.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  // ── per leader (guard 1: the count rides along; guard 2: thin never ranks) ─
  const leaderKey = new Map<string, { name: string; role: LeaderStat["role"]; clubName: string; ratings: number[] }>();
  for (const r of responses) {
    const clubName = nameOf.get(r.clubId) ?? "—";
    if (r.headName && r.headRating != null) {
      const k = `h:${r.clubId}:${r.headName}`;
      const e = leaderKey.get(k) ?? { name: r.headName, role: "Club head" as const, clubName, ratings: [] };
      e.ratings.push(r.headRating);
      leaderKey.set(k, e);
    }
    if (r.viceName && r.viceRating != null) {
      const k = `v:${r.clubId}:${r.viceName}`;
      const e = leaderKey.get(k) ?? { name: r.viceName, role: "Vice head" as const, clubName, ratings: [] };
      e.ratings.push(r.viceRating);
      leaderKey.set(k, e);
    }
  }

  const leaderWatchlist: LeaderStat[] = [...leaderKey.values()]
    .filter((e) => e.ratings.length >= THIN_SAMPLE)
    .map((e) => ({
      name: e.name,
      role: e.role,
      clubName: e.clubName,
      responses: e.ratings.length,
      avg: avg(e.ratings) as number,
    }))
    .filter((l) => l.avg < belowThreshold)
    .sort((a, b) => a.avg - b.avg);

  // ── integrity (guard 3) ─────────────────────────────────────────────────
  const vtuCounts = new Map<string, number>();
  for (const r of responses) {
    const k = r.vtu.trim().toLowerCase();
    vtuCounts.set(k, (vtuCounts.get(k) ?? 0) + 1);
  }
  const repeated = [...vtuCounts.values()].filter((n) => n > 1);

  // ── timeline, by IST calendar day, oldest first ─────────────────────────
  const byDay = new Map<string, number>();
  for (const r of responses) {
    const day = istDateKey(r.createdAt);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const timeline = [...byDay.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const clubAvg = avg(responses.map((r) => r.clubRating));
  const headAvg = avg(responses.map((r) => r.headRating));
  const viceAvg = avg(responses.map((r) => r.viceRating));

  return {
    totals: {
      responses: responses.length,
      clubsCovered: byClub.size,
      clubsTotal: clubs.length,
      clubAvg,
      headAvg,
      viceAvg,
      reachPct:
        memberCount <= 0 ? 0 : Math.round((responses.length / memberCount) * 100),
    },
    distribution: {
      club: buckets(responses.map((r) => r.clubRating)),
      head: buckets(responses.map((r) => r.headRating)),
      vice: buckets(responses.map((r) => r.viceRating)),
    },
    clubs: clubStats,
    silentClubs,
    clubWatchlist: clubStats
      .filter((c) => !c.thin && c.clubAvg != null && c.clubAvg < belowThreshold)
      .sort((a, b) => (a.clubAvg as number) - (b.clubAvg as number)),
    leaderWatchlist,
    integrity: {
      duplicateVtus: repeated.length,
      responsesFromDuplicates: repeated.reduce((a, b) => a + b, 0),
    },
    engagement: {
      withActivities: responses.filter((r) => r.activities.trim().length > 0).length,
      withSuggestions: responses.filter((r) => r.suggestions.trim().length > 0).length,
    },
    timeline,
    trend: previous
      ? {
          label: previous.label,
          clubAvgDelta: delta(clubAvg, previous.clubAvg),
          headAvgDelta: delta(headAvg, previous.headAvg),
          viceAvgDelta: delta(viceAvg, previous.viceAvg),
          responsesDelta: responses.length - previous.responses,
        }
      : null,
  };
}
