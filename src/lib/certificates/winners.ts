import { podiumOf } from "@/lib/podium";

/**
 * Winner certificates (spec 2026-09-15 §4). Pure: which round is "the podium",
 * who stands on it, and how a placing is written.
 *
 * Ranking is NOT implemented here. `rankByScore` (results.ts) and `podiumOf`
 * (podium.ts) already do it, ties included, and are what the public results page
 * renders from. This module composes them so a winner's certificate can never
 * disagree with the standings that earned it.
 */

export type Place = 1 | 2 | 3;

/** A published standing, as both the public page and the admin read it. */
export interface StandingLike {
  roll_no: string;
  display_name: string | null;
  team_name: string | null;
  team_members: { name: string; roll: string }[] | null;
  rank: number | null;
  /** Set when the standing came from a registration on this platform. */
  registration_id?: string | null;
}

/** One standing on the podium — a team is ONE standing carrying its people. */
export interface WinnerStanding {
  place: Place;
  rollNo: string;
  displayName: string | null;
  teamName: string | null;
  teamMembers: { name: string; roll: string }[];
  registrationId: string | null;
}

const isPlace = (n: unknown): n is Place => n === 1 || n === 2 || n === 3;

/**
 * An event has rounds, so "the podium" has to mean one of them: the
 * highest-`sort` round that actually has published results — not simply the
 * last round, which may be an unplayed final. Same rule as `/achievements`.
 */
export function podiumRound<T extends { sort: number; results: readonly { published_at: string | null }[] }>(
  rounds: readonly T[],
): T | null {
  return (
    [...rounds]
      .sort((a, b) => b.sort - a.sort)
      .find((round) => (round.results ?? []).some((r) => r.published_at != null)) ?? null
  );
}

/** Everyone placed 1st, 2nd or 3rd, ties kept, in rank order. */
export function standingsOf(results: readonly StandingLike[]): WinnerStanding[] {
  const out: WinnerStanding[] = [];
  for (const row of podiumOf(results as Parameters<typeof podiumOf>[0])) {
    const source = row as unknown as StandingLike;
    if (!isPlace(source.rank)) continue;
    out.push({
      place: source.rank,
      rollNo: source.roll_no,
      displayName: source.display_name,
      teamName: source.team_name,
      teamMembers: source.team_members ?? [],
      registrationId: source.registration_id ?? null,
    });
  }
  return out;
}

const SHORT: Record<Place, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
const WORDS: Record<Place, string> = { 1: "First", 2: "Second", 3: "Third" };

export const placeText = (place: Place): string => SHORT[place];
export const placeWords = (place: Place): string => WORDS[place];

const TYPED_PLACE: Record<string, Place> = {
  "1": 1, "1st": 1, first: 1,
  "2": 2, "2nd": 2, second: 2,
  "3": 3, "3rd": 3, third: 3,
};

/**
 * A Position cell as it will print. `1`, `1st` and `First` all become `1st`;
 * anything else — "Runner-up", "Best UI", "4th" — prints exactly as typed.
 * Predictable beats clever: an award this doesn't recognise is still an award.
 */
export function parsePosition(raw: string): string {
  const text = raw.trim();
  const place = TYPED_PLACE[text.toLowerCase()];
  return place ? SHORT[place] : text;
}

const POSITION_RE = /position|rank|place|prize/i;

/** Which uploaded column holds the placing, if any. */
export function detectPositionColumn(header: string[]): number | null {
  const found = header.findIndex((h) => POSITION_RE.test((h ?? "").trim()));
  return found >= 0 ? found : null;
}
