// The achievements board (spec 2026-09-07): top 1/2/3 winners from two sources.
// Pure — no DB imports, no `server-only` — so it is unit-testable and safe on
// the client.
//
// Ranking is NOT implemented here. `rankByScore` (results.ts) and `podiumOf` /
// `entrantsOf` (podium.ts) already do it correctly, ties included, and are what
// the event results page renders from. This module composes them so the board
// and that page can never disagree.

import type { PublishedResult } from "@/lib/queries";
import { entrantsOf, podiumOf } from "@/lib/podium";

export type Rank = 1 | 2 | 3;

/** One person on a podium. A team becomes several of these sharing a rank. */
export interface Winner {
  rank: Rank;
  name: string;
  roll: string | null;
}

export interface BoardEntry {
  id: string;
  /** "event" = derived live from published results; "manual" = hand-entered. */
  kind: "event" | "manual";
  title: string;
  clubName: string | null;
  /** Event start, or an achievement's happened_on. Null when never set. */
  date: string | null;
  /** Sort fallback when `date` is null — the row's created_at. */
  fallbackDate: string;
  winners: Winner[];
  description: string | null;
  imageUrl: string | null;
  /** Auto entries link to the full results; manual ones have nowhere to go. */
  href: string | null;
}

const RANKS: readonly Rank[] = [1, 2, 3];

function isRank(n: unknown): n is Rank {
  return n === 1 || n === 2 || n === 3;
}

/**
 * Normalise the untyped `achievements.winners` jsonb.
 *
 * Malformed rows are DROPPED, never thrown: this column can be hand-edited in
 * the Supabase dashboard, and one bad row must not 500 a public page.
 */
export function parseWinners(json: unknown): Winner[] {
  if (!Array.isArray(json)) return [];
  const out: Winner[] = [];
  for (const row of json) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const rank = typeof r.rank === "string" ? Number(r.rank) : r.rank;
    if (!isRank(rank)) continue;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (name === "") continue;
    const rawRoll = typeof r.roll === "string" ? r.roll.trim() : "";
    out.push({ rank, name, roll: rawRoll === "" ? null : rawRoll });
  }
  return out;
}

/** The podium of a round, flattened to people. Teams keep every member. */
export function winnersFromResults(results: readonly PublishedResult[]): Winner[] {
  const out: Winner[] = [];
  for (const standing of podiumOf(results)) {
    const rank = standing.rank;
    if (!isRank(rank)) continue;
    for (const e of entrantsOf(standing)) {
      out.push({ rank, name: e.name, roll: e.roll });
    }
  }
  return out;
}

/** 1st/2nd/3rd buckets in order; a tie shares one. Empty ranks are omitted. */
export function groupByRank(
  winners: readonly Winner[],
): { rank: Rank; winners: Winner[] }[] {
  return RANKS.map((rank) => ({
    rank,
    winners: winners.filter((w) => w.rank === rank),
  })).filter((g) => g.winners.length > 0);
}

/**
 * Compare on the calendar day only. `date` is an ISO instant for events but a
 * plain YYYY-MM-DD for achievements; slicing to 10 chars makes the two formats
 * comparable instead of sorting every timestamp after every bare date.
 */
function sortKey(e: BoardEntry): string {
  return (e.date ?? e.fallbackDate).slice(0, 10);
}

/** Both sources as one list, newest first. Sort is stable, so ties hold order. */
export function mergeBoard(
  auto: readonly BoardEntry[],
  manual: readonly BoardEntry[],
): BoardEntry[] {
  return [...auto, ...manual].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}
