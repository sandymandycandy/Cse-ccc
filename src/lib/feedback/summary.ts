/**
 * Per-club aggregates for one feedback period, plus duplicate-VTU detection.
 *
 * ⚠️ These averages are ADVISORY, NOT EVIDENCE. The owner declined any
 * submission cap (design D3), so one person can submit repeatedly and move a
 * leader's average. `duplicateVtus` is the compensating control: it surfaces
 * repeats to a human. It must never be used to reject a student.
 *
 * Pure: no I/O.
 */

export interface ResponseForSummary {
  clubId: string;
  vtu: string;
  clubRating: number;
  headRating: number | null;
  viceRating: number | null;
}

export interface ClubSummary {
  clubId: string;
  responses: number;
  clubAvg: number | null;
  headAvg: number | null;
  viceAvg: number | null;
}

/** Mean of the non-null values, to one decimal; null when there are none. */
function avg(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  return Math.round(mean * 10) / 10;
}

export function summariseByClub(rows: ResponseForSummary[]): ClubSummary[] {
  const byClub = new Map<string, ResponseForSummary[]>();
  for (const r of rows) {
    const list = byClub.get(r.clubId);
    if (list) list.push(r);
    else byClub.set(r.clubId, [r]);
  }

  return [...byClub.entries()].map(([clubId, list]) => ({
    clubId,
    responses: list.length,
    clubAvg: avg(list.map((r) => r.clubRating)),
    headAvg: avg(list.map((r) => r.headRating)),
    viceAvg: avg(list.map((r) => r.viceRating)),
  }));
}

/** VTUs appearing more than once, normalised for case and stray whitespace. */
export function duplicateVtus(rows: { vtu: string }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = r.vtu.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
