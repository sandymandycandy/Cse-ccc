/**
 * Pure attendance math shared by the club dashboard roster (`rosterWithPercent`)
 * and the public roll lookup (`getMemberAttendanceByRoll`) so the two can never disagree.
 * Kept free of `server-only` and DB imports so it is unit-testable (mirrors the
 * pure `calendar-layout.ts` / `resources.ts` extraction pattern).
 *
 * EVERY session the club has held counts for every member on its roster.
 * ATTENDED is the subset the member was marked present at, so `attended <=
 * eligible` always holds and the percentage can never exceed 100 (a mark whose
 * session id is not in the list never counts).
 *
 * ⚠️ This used to take a `joinedDate` and skip sessions dated before it, using
 * `club_members.created_at` as the join date. That silently hid **625 real marks
 * across 12 clubs**: every club typed its roster into the system AFTER running
 * its first sessions, so the opening session was ruled "not applicable" for the
 * whole roster and its Present marks exported as blank cells. `created_at` is
 * when a row was inserted, never when a person joined the club. Removed 2026-09-05
 * at the owner's decision. The accepted trade-off: a member who genuinely joins
 * mid-term now shows Absent for the sessions held before they arrived.
 *
 * `date` is kept on the session shape for callers that display it; the math no
 * longer compares dates at all.
 */
export interface AttendanceSummary {
  attended: number;
  eligible: number;
  pct: number;
}

export function summarizeAttendance(
  sessions: readonly { id: string; date: string }[],
  attendedSessionIds: ReadonlySet<string>,
): AttendanceSummary {
  const attended = sessions.filter((s) => attendedSessionIds.has(s.id)).length;
  return {
    attended,
    eligible: sessions.length,
    pct: sessions.length === 0 ? 0 : Math.round((attended / sessions.length) * 100),
  };
}
