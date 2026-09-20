/**
 * Tri-state attendance diff: what to write when a roll call is saved.
 *
 * `club_attendance` used to be a presence-row table — a row meant present, no
 * row meant absent. That collapsed two different things: "I looked, they aren't
 * here" and "I haven't got to them yet". A half-finished roll call therefore
 * read as a finished one with poor turnout. Now the row carries its own
 * `status`, and the absence of a row is what means unmarked.
 *
 * Kept free of DB and `server-only` imports so it is unit-testable, the same
 * way `diffPresence` is for the council roster (which stays binary — it writes
 * to a different table and is untouched by this).
 */

export type Mark = "present" | "absent";
/** `null` = not yet marked, which is stored as the absence of a row. */
export type MarkState = Mark | null;

export interface MarkDiff {
  /** Rows to insert or update, because the mark is new or has changed. */
  toUpsert: { memberId: string; status: Mark }[];
  /** Member ids whose row should go, because they are unmarked again. */
  toRemove: string[];
}

/**
 * Diff the marks already stored against the ones just submitted.
 *
 * Only members present in `desired` are considered, so a caller that submits a
 * filtered subset cannot silently clear everyone it left out.
 */
export function diffMarks(
  current: ReadonlyMap<string, Mark>,
  desired: ReadonlyMap<string, MarkState>,
): MarkDiff {
  const toUpsert: { memberId: string; status: Mark }[] = [];
  const toRemove: string[] = [];

  for (const [memberId, status] of desired) {
    const was = current.get(memberId);
    if (status === null) {
      // Only worth a delete if there is actually a row to delete.
      if (was !== undefined) toRemove.push(memberId);
    } else if (was !== status) {
      toUpsert.push({ memberId, status });
    }
  }

  return { toUpsert, toRemove };
}

/** Counts for the summary card. `total` is the full roster, not the filtered view. */
export function tallyMarks(
  marks: ReadonlyMap<string, MarkState>,
  total: number,
): { present: number; absent: number; unmarked: number; turnout: number } {
  let present = 0;
  let absent = 0;
  for (const status of marks.values()) {
    if (status === "present") present += 1;
    else if (status === "absent") absent += 1;
  }
  // Anyone with no entry at all is unmarked, so this is derived from the
  // roster size rather than counted — a member missing from the map still
  // shows up in the total.
  const unmarked = Math.max(0, total - present - absent);
  // Turnout is of the WHOLE roster, not of those marked so far: a roll call
  // that is half done should not report 100% turnout.
  const turnout = total === 0 ? 0 : Math.round((present / total) * 100);
  return { present, absent, unmarked, turnout };
}
