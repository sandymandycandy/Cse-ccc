// Pure standings logic (§13.9). No I/O, no `server-only` — runs under vitest.

export interface Standing {
  roll_no: string;
  display_name: string | null;
  score: number | null;
  rank: number | null;
  advanced: boolean;
  remarks: string | null;
}

/**
 * Assign standard competition ranking by score (desc). Equal scores share a
 * rank; the next rank skips by the number of tied rows. Rows with a null score
 * sort last and receive rank null. Returns a new array (input not mutated).
 */
export function rankByScore<T extends { score: number | null; rank: number | null }>(
  rows: T[],
): T[] {
  const scored = rows.filter((r) => r.score !== null);
  const unscored = rows.filter((r) => r.score === null);
  scored.sort((a, b) => (b.score as number) - (a.score as number));

  const ranked = scored.map((r, _i, arr) => {
    // standard competition ranking: index of first row with this score, +1
    const first = arr.findIndex((x) => x.score === r.score);
    return { ...r, rank: first + 1 };
  });

  return [...ranked, ...unscored.map((r) => ({ ...r, rank: null }))];
}

/**
 * Students who proceed to the next round: marked `advanced` AND with a score
 * entered. A student with no marks can never be advanced (§13.9 rule). Score 0
 * counts as a real score.
 */
export function eligibleAdvancers<T extends { advanced: boolean; score: number | null }>(
  rows: T[],
): T[] {
  return rows.filter((r) => r.advanced && r.score !== null);
}

/** Display order: rank asc (nulls last), then score desc (nulls last), then roll. */
export function orderStandings<
  T extends { rank: number | null; score: number | null; roll_no: string },
>(rows: T[]): T[] {
  const byNullable = (a: number | null, b: number | null, dir: 1 | -1) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1; // nulls last
    if (b === null) return -1;
    return (a - b) * dir;
  };
  return [...rows].sort(
    (a, b) =>
      byNullable(a.rank, b.rank, 1) ||
      byNullable(a.score, b.score, -1) ||
      a.roll_no.localeCompare(b.roll_no),
  );
}
