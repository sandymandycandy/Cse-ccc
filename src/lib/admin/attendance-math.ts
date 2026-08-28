/**
 * Pure attendance math shared by the club dashboard roster (`rosterWithPercent`)
 * and the member self-view (`getMemberAttendance`) so the two can never disagree.
 * Kept free of `server-only` and DB imports so it is unit-testable (mirrors the
 * pure `calendar-layout.ts` / `resources.ts` extraction pattern).
 *
 * A session is ELIGIBLE for a member when its `date` is on/after the date the
 * member joined — a fairer denominator than counting sessions from before they
 * existed. ATTENDED is the subset of those eligible sessions the member was
 * actually marked present at, so `attended <= eligible` always holds and the
 * percentage can never exceed 100 (a mark on a pre-join session never counts,
 * because such a session is never in the eligible set).
 *
 * `date` and `joinedDate` are compared as strings on purpose: both are
 * `YYYY-MM-DD` (a PostgREST `date` column, or the date slice of a timestamp),
 * for which lexicographic order equals chronological order. Keep them as those
 * raw strings — a raw `Date` or a differently-formatted string would silently
 * break the comparison.
 */
export interface AttendanceSummary {
  attended: number;
  eligible: number;
  pct: number;
}

export function summarizeAttendance(
  sessions: readonly { id: string; date: string }[],
  joinedDate: string,
  attendedSessionIds: ReadonlySet<string>,
): AttendanceSummary {
  const eligible = sessions.filter((s) => s.date >= joinedDate);
  const attended = eligible.filter((s) => attendedSessionIds.has(s.id)).length;
  return {
    attended,
    eligible: eligible.length,
    pct: eligible.length === 0 ? 0 : Math.round((attended / eligible.length) * 100),
  };
}
