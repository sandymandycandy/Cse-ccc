/**
 * Cross-club vitality for the council's Club health page (`/admin/oversight/clubs`).
 *
 * PURE — no `server-only`, no DB import — so every flag, the window boundary and
 * the ordering are unit-testable, mirroring `attendance-analytics.ts` /
 * `feedback-analytics.ts` / `admin-status.ts`. The one impure read lives in
 * `club-vitality-data.ts`.
 *
 * ⚠️ THE ATTENDANCE RATE MUST COME FROM `summarizeAttendance` — never a local
 * `marks / (members × sessions)`. That function implements the eligibility rule
 * (a member is only counted against sessions dated on or after they joined) and
 * is mutation-checked. A naive ratio here would print a different, lower number
 * than `/admin/attendance/analytics` shows for the same club, and two admin
 * pages disagreeing about one club is worse than having no second page.
 *
 * ⚠️ `MIN_SESSIONS` IS STRUCTURAL, NOT COSMETIC — do not relax it. A club that
 * met once and had four people turn up is not evidence of a turnout problem, and
 * `low-turnout` puts a named head on a list the council reads. Same principle as
 * `THIN_SAMPLE` in `feedback-analytics.ts`: every rate here travels with the
 * session count and the attended/eligible totals it was computed from.
 *
 * This is triage, not a league table (design D1). The ordering surfaces clubs
 * needing attention; the page must be worded that way too.
 *
 * All dates are `YYYY-MM-DD` IST day-keys compared as strings — lexicographic
 * order equals chronological order for that format, which is why `date` stays a
 * raw string here and in `attendance-math.ts`. Do not convert to `Date`.
 */
import { addDays } from "@/lib/datetime";
import { summarizeAttendance } from "./attendance-math";

/** The rolling window. No term/semester concept exists in the schema (D3). */
export const WINDOW_DAYS = 30;
/** At or above this many active members, one session a month is under-serving them. */
export const LARGE_CLUB = 50;
/** Below this attendance rate a club is flagged — but only past MIN_SESSIONS. */
export const LOW_TURNOUT = 30;
/** The thin-sample guard: fewer window sessions than this can never flag turnout. */
export const MIN_SESSIONS = 2;

export interface VitalityClub {
  id: string;
  name: string;
}

export interface VitalityMember {
  clubId: string;
  memberId: string;
}

export interface VitalitySession {
  id: string;
  clubId: string;
  /** YYYY-MM-DD — `session_date`, or the `opened_at` date for legacy rows. */
  date: string;
}

export interface VitalityMark {
  memberId: string;
  sessionId: string;
}

export interface ClubVitalityInput {
  clubs: readonly VitalityClub[];
  members: readonly VitalityMember[];
  sessions: readonly VitalitySession[];
  /** May be pre-filtered to window sessions by the caller; extra marks are ignored. */
  marks: readonly VitalityMark[];
}

export type VitalityFlag = "empty" | "dormant" | "unmet-demand" | "low-turnout";

export interface ClubVitality {
  clubId: string;
  name: string;
  activeMembers: number;
  sessionsInWindow: number;
  /** Sessions actually held, all time — future-dated rows are excluded. */
  sessionsAllTime: number;
  /** null when the club has never held a session. */
  daysSinceLastSession: number | null;
  /** Attendance rate across the window, 0–100. Never render it without `n`. */
  ratePct: number;
  attended: number;
  eligible: number;
  flags: VitalityFlag[];
}

const NO_MARKS: ReadonlySet<string> = new Set();

/** The oldest day-key still inside the rolling window. */
export function windowStartKey(nowKey: string): string {
  return addDays(nowKey, -WINDOW_DAYS);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export function computeClubVitality(
  input: ClubVitalityInput,
  nowKey: string,
): ClubVitality[] {
  const start = windowStartKey(nowKey);

  // A session dated ahead of today has not been held, so it counts nowhere: not
  // in the window, not in the all-time total, and not as "last met". Scheduling
  // a meeting must never make a dormant club look active.
  const held = input.sessions.filter((s) => s.date <= nowKey);

  const membersByClub = groupBy(input.members, (m) => m.clubId);
  const sessionsByClub = groupBy(held, (s) => s.clubId);

  const attendedByMember = new Map<string, Set<string>>();
  for (const mark of input.marks) {
    const set = attendedByMember.get(mark.memberId) ?? new Set<string>();
    set.add(mark.sessionId);
    attendedByMember.set(mark.memberId, set);
  }

  const rows: ClubVitality[] = input.clubs.map((club) => {
    const members = membersByClub.get(club.id) ?? [];
    const clubSessions = sessionsByClub.get(club.id) ?? [];
    const windowSessions = clubSessions.filter((s) => s.date >= start);

    // Σ attended / Σ eligible across members — the same aggregation
    // `computeClubAnalytics` performs, so the two pages agree by construction.
    let attended = 0;
    let eligible = 0;
    for (const m of members) {
      const s = summarizeAttendance(
        windowSessions,
        attendedByMember.get(m.memberId) ?? NO_MARKS,
      );
      attended += s.attended;
      eligible += s.eligible;
    }
    const ratePct = eligible === 0 ? 0 : Math.round((attended / eligible) * 100);

    let lastDate: string | null = null;
    for (const s of clubSessions) {
      if (lastDate === null || s.date > lastDate) lastDate = s.date;
    }

    const flags: VitalityFlag[] = [];
    // Independent rules on purpose: an empty club is also dormant, and saying
    // both is honest. Suppressing one would be an invented rule.
    if (members.length === 0) flags.push("empty");
    if (windowSessions.length === 0) flags.push("dormant");
    if (members.length >= LARGE_CLUB && windowSessions.length <= 1) flags.push("unmet-demand");
    // `eligible > 0` matters as much as MIN_SESSIONS: a club whose members all
    // joined after its window sessions has a 0% by convention, not by turnout.
    if (windowSessions.length >= MIN_SESSIONS && eligible > 0 && ratePct < LOW_TURNOUT) {
      flags.push("low-turnout");
    }

    return {
      clubId: club.id,
      name: club.name,
      activeMembers: members.length,
      sessionsInWindow: windowSessions.length,
      sessionsAllTime: clubSessions.length,
      daysSinceLastSession: lastDate === null ? null : daysBetween(lastDate, nowKey),
      ratePct,
      attended,
      eligible,
      flags,
    };
  });

  // Triage order (D1): anything flagged first, then the lowest rate, then by name
  // so the page is stable between loads. This is deliberately not a score.
  return rows.sort(
    (a, b) =>
      Number(b.flags.length > 0) - Number(a.flags.length > 0) ||
      a.ratePct - b.ratePct ||
      a.name.localeCompare(b.name),
  );
}
