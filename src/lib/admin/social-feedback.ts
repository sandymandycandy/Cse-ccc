import { THIN_SAMPLE } from "./feedback-analytics";

/**
 * Council-wide social-media feedback for one period.
 *
 * Kept OUT of `feedback-analytics.ts` because it obeys a different counting
 * rule. Everything in that module is per-club, so one response = one voice. The
 * social media team serves every club, but a student who belongs to three clubs
 * may legitimately submit three club responses — and each carries their social
 * rating. Averaged naively, that one person's opinion would count three times.
 *
 * So this module counts each STUDENT once, keeping their most recent submission.
 * That is the same worry the parent module records at the top (duplicate VTUs
 * can move a score); here it is structural rather than merely reported.
 *
 * The two ratings are independent: someone may rate the team's output without
 * rating the head, or the reverse, so each average carries its own `n`.
 *
 * Pure: no I/O, so the rules are unit-testable.
 */

export interface SocialResponse {
  vtu: string;
  socialTeamRating: number | null;
  socialLeadRating: number | null;
  socialLeadName: string | null;
  createdAt: string;
}

export interface SocialStat {
  /** Distinct students counted, after collapsing repeat submissions. */
  students: number;
  teamAvg: number | null;
  teamRatings: number;
  leadAvg: number | null;
  leadRatings: number;
  leadName: string | null;
  /** Fewer than THIN_SAMPLE students — report, but never treat as a verdict. */
  thin: boolean;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  // One decimal, matching every other average on the analytics page.
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function summarizeSocial(responses: readonly SocialResponse[]): SocialStat {
  // One row per student — the most recent, so a corrected opinion replaces the
  // first one rather than being averaged with it.
  const latest = new Map<string, SocialResponse>();
  for (const r of responses) {
    const held = latest.get(r.vtu);
    if (!held || r.createdAt > held.createdAt) latest.set(r.vtu, r);
  }

  const rated = [...latest.values()].filter(
    (r) => r.socialTeamRating != null || r.socialLeadRating != null,
  );
  const team = rated.map((r) => r.socialTeamRating).filter((v): v is number => v != null);
  const lead = rated.map((r) => r.socialLeadRating).filter((v): v is number => v != null);

  return {
    students: rated.length,
    teamAvg: avg(team),
    teamRatings: team.length,
    leadAvg: avg(lead),
    leadRatings: lead.length,
    leadName: rated.find((r) => r.socialLeadName)?.socialLeadName ?? null,
    thin: rated.length < THIN_SAMPLE,
  };
}
