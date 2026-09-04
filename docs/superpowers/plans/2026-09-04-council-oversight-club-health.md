# Council Oversight — Phase 1 (Club health) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the council one page — `/admin/oversight/clubs` — that looks across all 14 active clubs at once and puts the ones needing attention at the top, so "which clubs are in trouble?" stops being unanswerable.

**Architecture:** A pure shaping module (`club-vitality.ts`) computes per-club vitality and flags from data a single impure read (`club-vitality-data.ts`) fetches in four cross-club queries; a presentational component renders it; a council-gated page ties them together. No migration, no mutations, no new email. The attendance rate is delegated to the existing, mutation-checked `summarizeAttendance` so this page and `/admin/attendance/analytics` can never print different numbers for the same club.

**Tech Stack:** Next 16 App Router (RSC, Turbopack) · React 19 · TypeScript strict · Supabase (service-role reads via `createAdminClient`) · vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-09-04-council-oversight-design.md` — read it alongside this plan. This plan implements **Rollout step 1 only** ("Nav group + Club health page + `club-vitality.ts` + tests"). Phase B (`/admin/oversight/activity`, `audit-insights.ts`) is explicitly **not** in this plan.

## Global Constants

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **Gate for this page: `manage:council`.** Never `view:analytics` — spec D2: club heads and vice heads hold `view:analytics` at `own`, and `events_head` / `social_media_head` hold it at `all`. Using it would leak cross-club rankings to nine roles.
- **Window: rolling 30 days** (`WINDOW_DAYS = 30`). No term/semester concept exists in the schema and inventing one is out of scope (spec D3).
- **Thresholds, as named exported constants:** `LARGE_CLUB = 50`, `LOW_TURNOUT = 30`, `MIN_SESSIONS = 2`.
- **Flags:** `empty` (0 active members) · `dormant` (0 sessions in window) · `unmet-demand` (≥ `LARGE_CLUB` members **and** ≤ 1 session in window) · `low-turnout` (rate < `LOW_TURNOUT` **and** ≥ `MIN_SESSIONS` sessions in window).
- **Read-only.** No new mutations, no new email, no new migration (spec D4).
- **Council-only, framed as triage not a league table** (spec D1). Page copy says "needing attention", never "ranking" / "leaderboard" / "top" / "worst".
- **Every rate travels with its `n`** — `ratePct` is never rendered without the session count and attended/eligible totals it came from.
- **Deep links use `/admin/attendance?club=<id>` and `/admin/attendance/analytics?club=<id>`.** `resolveAttendanceScope` already resolves `?club=` server-side against `manage:members`, so these cannot over-grant. Do not add new scoping code.
- **Dates are `YYYY-MM-DD` IST day-keys compared as strings.** Lexicographic order equals chronological order for that format. Never convert to `Date` for comparison.
- Verification gate for every commit: `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| **Create** `src/lib/admin/club-vitality.ts` | PURE. Types, threshold constants, `windowStartKey`, `computeClubVitality`. No `server-only`, no DB import. |
| **Create** `src/lib/admin/club-vitality.test.ts` | Every flag at its boundary, the `MIN_SESSIONS` guard, triage ordering, and the agrees-with-`summarizeAttendance` regression test. |
| **Create** `src/lib/admin/club-vitality-data.ts` | `server-only`. The single impure read: four cross-club queries → `ClubVitalityInput`. |
| **Create** `src/components/admin/ClubHealth.tsx` | Presentational only. Renders `ClubVitality[]` as a summary + one card-collapsing table. |
| **Create** `src/app/admin/(app)/oversight/clubs/page.tsx` | The gated RSC page: `requireViewPage("manage:council")` → read → compute → render. |
| **Modify** `src/lib/admin/nav.ts` | Add `"oversight"` to the `NavGroup` union and one entry to `GROUPS`. |
| **Modify** `src/lib/admin/nav.test.ts` | Extend the president fixture + section-order assertion. |
| **Modify** `src/app/admin/(app)/layout.tsx` | One conditional nav link behind `canView(session, "manage:council")`. |
| **Modify** `src/lib/auth/capabilities.test.ts` | Pin spec D2: `view:analytics` grants neither oversight page; `club_head` and `events_head` are refused. |

**Deviation from the spec, deliberate:** the spec sketches `computeClubVitality` and `getClubVitalityData` in one module. This plan splits them across two files because every pure analytics module in this repo (`attendance-analytics.ts`, `feedback-analytics.ts`, `admin-status.ts`) is kept free of `server-only` and DB imports, with the impure read in a sibling (`attendance-club.ts`, `feedback.ts`, `users/actions.ts`). The split keeps `club-vitality.test.ts` from needing the `server-only` stub at all. Everything else follows the spec as written.

---

### Task 1: The pure vitality module

**Files:**
- Create: `src/lib/admin/club-vitality.ts`
- Test: `src/lib/admin/club-vitality.test.ts`

**Interfaces:**
- Consumes: `summarizeAttendance(sessions: readonly {id: string; date: string}[], joinedDate: string, attendedSessionIds: ReadonlySet<string>) => {attended, eligible, pct}` from `./attendance-math`; `addDays(key: string, n: number) => string` from `@/lib/datetime`.
- Produces: `WINDOW_DAYS`, `LARGE_CLUB`, `LOW_TURNOUT`, `MIN_SESSIONS`, `windowStartKey(nowKey: string): string`, `computeClubVitality(input: ClubVitalityInput, nowKey: string): ClubVitality[]`, and the types `VitalityClub`, `VitalityMember`, `VitalitySession`, `VitalityMark`, `ClubVitalityInput`, `VitalityFlag`, `ClubVitality`.

- [ ] **Step 1: Write the failing test file**

Create `src/lib/admin/club-vitality.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeClubVitality,
  windowStartKey,
  WINDOW_DAYS,
  LARGE_CLUB,
  LOW_TURNOUT,
  MIN_SESSIONS,
  type ClubVitalityInput,
  type VitalityMember,
  type VitalitySession,
  type VitalityMark,
} from "./club-vitality";
import { computeClubAnalytics } from "./attendance-analytics";
import { summarizeAttendance } from "./attendance-math";

const NOW = "2026-09-04";
// windowStartKey(NOW) === "2026-08-05". Sessions on or after that date, and on
// or before NOW, are "in the window".
const IN = "2026-08-20";
const EDGE = "2026-08-05"; // exactly the window start — inside
const OUTSIDE = "2026-08-04"; // one day before the start — outside
const OLD = "2026-01-10";
const FUTURE = "2026-09-20";

const club = (id: string, name = id.toUpperCase()) => ({ id, name });

/** n members of `clubId`, all joined long before any fixture session. */
function members(clubId: string, n: number, joinedDate = "2025-01-01"): VitalityMember[] {
  return Array.from({ length: n }, (_, i) => ({
    clubId,
    memberId: `${clubId}-m${i}`,
    joinedDate,
  }));
}

function sessions(clubId: string, dates: string[]): VitalitySession[] {
  return dates.map((date, i) => ({ id: `${clubId}-s${i}`, clubId, date }));
}

/** Mark the first `n` members of `clubId` present at every session in `sess`. */
function marks(clubId: string, sess: VitalitySession[], n: number): VitalityMark[] {
  return sess.flatMap((s) =>
    Array.from({ length: n }, (_, i) => ({ memberId: `${clubId}-m${i}`, sessionId: s.id })),
  );
}

const input = (over: Partial<ClubVitalityInput> = {}): ClubVitalityInput => ({
  clubs: [club("c1")],
  members: [],
  sessions: [],
  marks: [],
  ...over,
});

const only = (i: ClubVitalityInput) => computeClubVitality(i, NOW)[0];

describe("windowStartKey", () => {
  it("is WINDOW_DAYS before the given day-key", () => {
    expect(windowStartKey(NOW)).toBe("2026-08-05");
    expect(WINDOW_DAYS).toBe(30);
  });
});

describe("flags", () => {
  it("flags a club with no active members as empty, without dividing by zero", () => {
    const row = only(input({ members: [], sessions: sessions("c1", [IN, IN]) }));
    expect(row.activeMembers).toBe(0);
    expect(row.ratePct).toBe(0);
    expect(row.eligible).toBe(0);
    expect(row.flags).toContain("empty");
  });

  it("flags a club with no sessions in the window as dormant, even with old ones", () => {
    const row = only(input({ members: members("c1", 10), sessions: sessions("c1", [OLD]) }));
    expect(row.sessionsInWindow).toBe(0);
    expect(row.sessionsAllTime).toBe(1);
    expect(row.flags).toContain("dormant");
  });

  it("gives an empty club BOTH empty and dormant — neither suppresses the other", () => {
    // Nature and Animatrix (E-Sports) are exactly this today: 0 members, 0 sessions.
    const row = only(input({ members: [], sessions: [] }));
    expect(row.flags).toEqual(expect.arrayContaining(["empty", "dormant"]));
  });

  it("flags a large club with one session in the window as unmet-demand", () => {
    // Ai Forge: 163 members, effectively never meets.
    const row = only(input({ members: members("c1", LARGE_CLUB), sessions: sessions("c1", [IN]) }));
    expect(row.flags).toContain("unmet-demand");
  });

  it("does not flag unmet-demand below LARGE_CLUB members", () => {
    const row = only(input({ members: members("c1", LARGE_CLUB - 1), sessions: sessions("c1", [IN]) }));
    expect(row.flags).not.toContain("unmet-demand");
  });

  it("does not flag unmet-demand once the club has met twice in the window", () => {
    const row = only(input({ members: members("c1", LARGE_CLUB), sessions: sessions("c1", [IN, IN]) }));
    expect(row.flags).not.toContain("unmet-demand");
  });

  it("flags low-turnout just below LOW_TURNOUT", () => {
    // 10 members × 4 sessions = 40 eligible; 11 attended = 28% (< 30).
    const sess = sessions("c1", [IN, IN, IN, IN]);
    const attend = marks("c1", sess.slice(0, 3), 3).concat(marks("c1", sess.slice(3), 2));
    const row = only(input({ members: members("c1", 10), sessions: sess, marks: attend }));
    expect(row.ratePct).toBe(28);
    expect(row.ratePct).toBeLessThan(LOW_TURNOUT);
    expect(row.flags).toContain("low-turnout");
  });

  it("does not flag low-turnout at exactly LOW_TURNOUT", () => {
    // 10 members × 4 sessions = 40 eligible; 12 attended = 30%.
    const sess = sessions("c1", [IN, IN, IN, IN]);
    const row = only(input({ members: members("c1", 10), sessions: sess, marks: marks("c1", sess, 3) }));
    expect(row.ratePct).toBe(LOW_TURNOUT);
    expect(row.flags).not.toContain("low-turnout");
  });

  it("MIN_SESSIONS suppresses low-turnout on a single session, however bad the rate", () => {
    // One session, 1 of 10 present = 10%. Not evidence of a turnout problem, and
    // this flag puts a named head on a council list. Do not relax this guard.
    const sess = sessions("c1", [IN]);
    const row = only(input({ members: members("c1", 10), sessions: sess, marks: marks("c1", sess, 1) }));
    expect(MIN_SESSIONS).toBe(2);
    expect(row.sessionsInWindow).toBe(1);
    expect(row.ratePct).toBe(10);
    expect(row.flags).not.toContain("low-turnout");
  });

  it("does not flag low-turnout when nobody was eligible yet", () => {
    // Two sessions in the window, but every member joined after both of them, so
    // eligible is 0 and the 0% is a convention — not a turnout signal.
    const row = only(input({
      members: members("c1", 10, "2026-09-01"),
      sessions: sessions("c1", ["2026-08-10", "2026-08-12"]),
    }));
    expect(row.eligible).toBe(0);
    expect(row.ratePct).toBe(0);
    expect(row.flags).not.toContain("low-turnout");
  });
});

describe("the window", () => {
  it("counts a session dated exactly at the window start", () => {
    const row = only(input({ members: members("c1", 4), sessions: sessions("c1", [EDGE]) }));
    expect(row.sessionsInWindow).toBe(1);
  });

  it("excludes a session one day before the window start", () => {
    const row = only(input({ members: members("c1", 4), sessions: sessions("c1", [OUTSIDE]) }));
    expect(row.sessionsInWindow).toBe(0);
    expect(row.sessionsAllTime).toBe(1);
  });

  it("treats a future-dated session as not held anywhere", () => {
    // session_date can be scheduled ahead. A meeting that has not happened must
    // not count in the window, in the all-time total, or as "last met".
    const row = only(input({ members: members("c1", 4), sessions: sessions("c1", [FUTURE]) }));
    expect(row.sessionsInWindow).toBe(0);
    expect(row.sessionsAllTime).toBe(0);
    expect(row.daysSinceLastSession).toBeNull();
    expect(row.flags).toContain("dormant");
  });
});

describe("daysSinceLastSession", () => {
  it("is null for a club that has never met", () => {
    expect(only(input({ members: members("c1", 3) })).daysSinceLastSession).toBeNull();
  });

  it("counts from the most recent held session", () => {
    const row = only(input({ members: members("c1", 3), sessions: sessions("c1", [OLD, IN]) }));
    expect(row.daysSinceLastSession).toBe(15); // 2026-08-20 → 2026-09-04
  });
});

describe("the attendance rate", () => {
  it("agrees with computeClubAnalytics on the same fixture", () => {
    // The failure this prevents: a naive marks/(members×sessions) here would
    // print a lower number than /admin/attendance/analytics shows for the same
    // club, because it would ignore the join-date eligibility rule.
    const joins = ["2025-01-01", "2026-08-10", "2026-08-25"];
    const sess = sessions("c1", ["2026-08-08", "2026-08-15", "2026-08-28"]);
    const mems: VitalityMember[] = joins.map((joinedDate, i) => ({
      clubId: "c1", memberId: `c1-m${i}`, joinedDate,
    }));
    const attend: VitalityMark[] = [
      { memberId: "c1-m0", sessionId: sess[0].id },
      { memberId: "c1-m0", sessionId: sess[1].id },
      { memberId: "c1-m1", sessionId: sess[1].id },
      { memberId: "c1-m2", sessionId: sess[2].id },
    ];

    const row = only(input({ members: mems, sessions: sess, marks: attend }));

    const roster = mems.map((m) => {
      const attendedIds = new Set(
        attend.filter((a) => a.memberId === m.memberId).map((a) => a.sessionId),
      );
      const s = summarizeAttendance(sess, m.joinedDate, attendedIds);
      return { memberId: m.memberId, name: m.memberId, ...s };
    });
    const analytics = computeClubAnalytics({
      membership: { total: roster.length, active: roster.length, pending: 0 },
      roster,
      sessions: [],
      belowThreshold: 75,
    });

    expect(row.ratePct).toBe(analytics.rates.overallPct);
    expect(row.attended).toBe(analytics.rates.totalAttended);
    expect(row.eligible).toBe(analytics.rates.totalEligible);
  });

  it("ignores marks against sessions outside the window", () => {
    const inWindow = sessions("c1", [IN, IN]);
    const older = sessions("c1", [OLD]);
    const row = only(input({
      members: members("c1", 2),
      sessions: [...inWindow, ...older],
      marks: [...marks("c1", inWindow, 1), ...marks("c1", older, 2)],
    }));
    expect(row.eligible).toBe(4); // 2 members × 2 window sessions
    expect(row.attended).toBe(2); // only the in-window marks for member 0
  });
});

describe("ordering", () => {
  it("is triage order: flagged clubs first, then by ascending rate, then by name", () => {
    const healthy = sessions("hz", [IN, IN]);
    const alsoHealthy = sessions("ha", [IN, IN]);
    const flagged = sessions("f1", [IN, IN]);
    const i: ClubVitalityInput = {
      clubs: [club("hz", "Zeta"), club("ha", "Alpha"), club("f1", "Flagged"), club("e1", "Empty")],
      members: [...members("hz", 4), ...members("ha", 4), ...members("f1", 4)],
      sessions: [...healthy, ...alsoHealthy, ...flagged],
      marks: [
        ...marks("hz", healthy, 4),
        ...marks("ha", alsoHealthy, 4),
        ...marks("f1", flagged, 1), // 25% → low-turnout
      ],
    };
    // Empty (0%, flagged) → Flagged (25%, flagged) → then the two clean clubs at
    // 100%, tied, broken by name: Alpha before Zeta.
    expect(computeClubVitality(i, NOW).map((r) => r.name)).toEqual([
      "Empty", "Flagged", "Alpha", "Zeta",
    ]);
  });

  it("returns one row per club in `clubs`, including clubs with no rows anywhere", () => {
    const rows = computeClubVitality(input({ clubs: [club("a"), club("b"), club("c")] }), NOW);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.flags.includes("empty"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/admin/club-vitality.test.ts`
Expected: FAIL — `Failed to resolve import "./club-vitality"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/admin/club-vitality.ts`:

```ts
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
  /** YYYY-MM-DD the member joined (the date slice of `club_members.created_at`). */
  joinedDate: string;
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
        m.joinedDate,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/admin/club-vitality.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green; the suite total grows by the new tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/club-vitality.ts src/lib/admin/club-vitality.test.ts
git commit -m "feat(oversight): pure club-vitality module with flags and triage ordering"
```

---

### Task 2: The live read

**Files:**
- Create: `src/lib/admin/club-vitality-data.ts`

**Interfaces:**
- Consumes: `windowStartKey`, `ClubVitalityInput` from `./club-vitality`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `getClubVitalityData(nowKey: string): Promise<ClubVitalityInput>`.

**Deviation from the spec, deliberate:** the spec sketches `getClubVitalityData(session)`. The session is never used — the page is council-only and shows every active club, so there is nothing to scope. It takes `nowKey` instead, which the window filter genuinely needs and which keeps the caller in control of "today".

- [ ] **Step 1: Write the implementation**

There is no unit test for this file: it is I/O only, and this repo verifies read layers against the live database instead (see `docs/STATUS.md` → "Verifying admin flows headless"). Step 2 is that verification.

Create `src/lib/admin/club-vitality-data.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { windowStartKey, type ClubVitalityInput } from "./club-vitality";

/**
 * The one impure read behind the council's Club health page. Four cross-club
 * queries, aggregated in JS by `computeClubVitality` — the house pattern
 * documented in `feedback.ts` ("counted in JS rather than via a nested
 * aggregate … cheap at this scale, and it keeps the generated types
 * straightforward").
 *
 * ⚠️ This is far heavier than the dashboard's `head`-only counts (~816 member
 * rows and ~54 session rows today). It is acceptable ONLY because this is a
 * council-only page reached deliberately, never a landing page. If club
 * membership grows an order of magnitude, move the aggregation into SQL.
 *
 * ⚠️ MARKS ARE FETCHED FOR WINDOW SESSIONS ONLY. `club_attendance` holds ~1,379
 * rows and grows with every meeting; a bare select would be both wasteful and
 * exposed to PostgREST's row cap, and a silently truncated read would understate
 * every club's attendance on a page the council acts on. The window filter is
 * derived from the same `windowStartKey` the pure module uses, so the two can
 * never disagree about what "the window" is.
 */

/** Explicit ceiling so a truncated page of rows can never pass silently. */
const ROW_CAP = 20_000;

export async function getClubVitalityData(nowKey: string): Promise<ClubVitalityInput> {
  const admin = createAdminClient();

  const [clubsRes, membersRes, sessionsRes] = await Promise.all([
    admin.from("clubs").select("id, name").eq("is_active", true).order("name"),
    // The marking roster, matching `rosterWithPercent`: active AND onboarded.
    // A pending self-registration is not yet a member for attendance purposes.
    admin
      .from("club_members")
      .select("id, club_id, created_at")
      .eq("is_active", true)
      .not("approved_at", "is", null)
      .limit(ROW_CAP),
    admin
      .from("club_attendance_sessions")
      .select("id, club_id, session_date, opened_at")
      .limit(ROW_CAP),
  ]);
  if (clubsRes.error) throw clubsRes.error;
  if (membersRes.error) throw membersRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const clubs = (clubsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const members = (membersRes.data ?? []).map((m) => ({
    clubId: m.club_id,
    memberId: m.id,
    joinedDate: m.created_at.slice(0, 10),
  }));

  const sessions = (sessionsRes.data ?? []).map((s) => ({
    id: s.id,
    clubId: s.club_id,
    // Same rule as `attendance-club.ts#sessionDateOf`: the scheduled date, or
    // the open date for legacy rows that predate `session_date`.
    date: (s.session_date ?? s.opened_at).slice(0, 10),
  }));

  const start = windowStartKey(nowKey);
  const windowSessionIds = sessions
    .filter((s) => s.date >= start && s.date <= nowKey)
    .map((s) => s.id);

  if (windowSessionIds.length === 0) {
    return { clubs, members, sessions, marks: [] };
  }

  const { data: markRows, error: marksError } = await admin
    .from("club_attendance")
    .select("member_id, session_id")
    .in("session_id", windowSessionIds)
    .limit(ROW_CAP);
  if (marksError) throw marksError;

  return {
    clubs,
    members,
    sessions,
    marks: (markRows ?? []).map((m) => ({ memberId: m.member_id, sessionId: m.session_id })),
  };
}
```

- [ ] **Step 2: Verify the read against the live database**

The purpose is to catch a silently truncated read and confirm the four queries return what the pure module expects — the class of failure `docs/STATUS.md` calls out ("green checks do not mean the page is right").

Using the Supabase MCP (`execute_sql`), run and record the four ground-truth counts:

```sql
select
  (select count(*) from clubs where is_active) as active_clubs,
  (select count(*) from club_members where is_active and approved_at is not null) as roster,
  (select count(*) from club_attendance_sessions) as sessions,
  (select count(*) from club_attendance) as marks;
```

Expected, from the spec's 2026-09-04 probe: roughly `14` active clubs, ~816 roster members, ~54 sessions, ~1,379 marks. **If `roster` or `marks` now exceeds `ROW_CAP`, stop and raise it** — the aggregation would silently under-report.

Then confirm the flags the page must produce, so Task 3 has an expected answer to check against:

```sql
select c.name,
       count(distinct m.id) filter (where m.is_active and m.approved_at is not null) as members,
       count(distinct s.id) as sessions_all_time
from clubs c
left join club_members m on m.club_id = c.id
left join club_attendance_sessions s on s.club_id = c.id
where c.is_active
group by c.name
order by members;
```

Expected: **Nature** and **Animatrix (E-Sports)** at 0 members / 0 sessions (→ `empty` + `dormant`), and **Ai Forge** large with almost no sessions (→ `unmet-demand`). Record the actual list — it is what Step 3 of Task 3 compares against.

- [ ] **Step 3: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/club-vitality-data.ts
git commit -m "feat(oversight): cross-club vitality read, marks scoped to the window"
```

---

### Task 3: The Club health page

**Files:**
- Create: `src/components/admin/ClubHealth.tsx`
- Create: `src/app/admin/(app)/oversight/clubs/page.tsx`

**Interfaces:**
- Consumes: `ClubVitality`, `VitalityFlag`, `computeClubVitality`, `WINDOW_DAYS`, `LOW_TURNOUT`, `MIN_SESSIONS` from `@/lib/admin/club-vitality`; `getClubVitalityData` from `@/lib/admin/club-vitality-data`; `requireViewPage` from `@/lib/auth/guards`; `todayKey` from `@/lib/datetime`.
- Produces: `ClubHealth({ rows, windowDays }: { rows: ClubVitality[]; windowDays: number })`; the route `/admin/oversight/clubs`.

The page is reachable by URL after this task but not yet linked in the nav — that is Task 4, deliberately last so no commit ever ships a nav link to a route that does not exist.

- [ ] **Step 1: Write the component**

Create `src/components/admin/ClubHealth.tsx`:

```tsx
import Link from "next/link";
import type { ClubVitality, VitalityFlag } from "@/lib/admin/club-vitality";
import { LOW_TURNOUT, MIN_SESSIONS } from "@/lib/admin/club-vitality";

/**
 * The council's cross-club triage table. Pure markup over already-computed
 * `ClubVitality[]` — no fetching, no math, so the numbers here are exactly the
 * ones `computeClubVitality` was tested on.
 *
 * Every rate is rendered with the sessions and attended/eligible totals it came
 * from. There is no shape in this component that shows a percentage alone.
 *
 * `.tablewrap.cards` collapses each row into a card below 720px, which is why
 * every cell carries `data-label` — that attribute IS the header on a phone.
 */

const FLAG_LABEL: Record<VitalityFlag, string> = {
  empty: "No members",
  dormant: "Not meeting",
  "unmet-demand": "Unmet demand",
  "low-turnout": "Low turnout",
};

/** Rust for "this club is not running"; clay for "worth a look". */
const FLAG_TONE: Record<VitalityFlag, "rejected" | "pending"> = {
  empty: "rejected",
  dormant: "rejected",
  "unmet-demand": "pending",
  "low-turnout": "pending",
};

function lastMet(days: number | null): string {
  if (days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function ClubHealth({
  rows,
  windowDays,
}: {
  rows: ClubVitality[];
  windowDays: number;
}) {
  const flagged = rows.filter((r) => r.flags.length > 0);

  if (rows.length === 0) {
    return (
      <p className="body-text" style={{ color: "var(--ink-3)", marginTop: 18 }}>
        No active clubs.
      </p>
    );
  }

  return (
    <section style={{ marginTop: 20 }}>
      <div className="admin-stats">
        <div className="admin-stat">
          <div className="n">{rows.length}</div>
          <div className="label">Active clubs</div>
        </div>
        <div className="admin-stat">
          <div className="n">{flagged.length}</div>
          <div className="label">Needing attention</div>
        </div>
        <div className="admin-stat">
          <div className="n">{rows.reduce((a, r) => a + r.activeMembers, 0)}</div>
          <div className="label">Members on rosters</div>
        </div>
        <div className="admin-stat">
          <div className="n">{rows.reduce((a, r) => a + r.sessionsInWindow, 0)}</div>
          <div className="label">Sessions in {windowDays} days</div>
        </div>
      </div>

      {flagged.length === 0 ? (
        <p className="note" style={{ marginTop: 18 }}>
          Nothing flagged: every active club has members and has met in the last{" "}
          {windowDays} days.
        </p>
      ) : null}

      <div className="tablewrap cards" style={{ marginTop: 16 }}>
        <table className="admin">
          <thead>
            <tr>
              <th>Club</th>
              <th>Members</th>
              <th>Sessions</th>
              <th>Last met</th>
              <th>Attendance</th>
              <th>Flags</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clubId}>
                <td data-primary data-label="Club" style={{ fontWeight: 500 }}>
                  {r.name}
                </td>
                <td data-label="Members">{r.activeMembers}</td>
                <td data-label="Sessions">
                  {r.sessionsInWindow}
                  <span className="hint"> of {r.sessionsAllTime} all time</span>
                </td>
                <td data-label="Last met">{lastMet(r.daysSinceLastSession)}</td>
                <td data-label="Attendance">
                  {/* The rate never appears without the n it came from. */}
                  {r.eligible === 0 ? (
                    <span style={{ color: "var(--ink-3)" }}>—</span>
                  ) : (
                    <>
                      {r.ratePct}%
                      <span className="hint">
                        {" "}
                        {r.attended}/{r.eligible} over {r.sessionsInWindow}{" "}
                        {r.sessionsInWindow === 1 ? "session" : "sessions"}
                      </span>
                    </>
                  )}
                </td>
                <td data-label="Flags">
                  {r.flags.length === 0 ? (
                    <span style={{ color: "var(--ink-3)" }}>—</span>
                  ) : (
                    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
                      {r.flags.map((f) => (
                        <span key={f} className={`abadge abadge-${FLAG_TONE[f]}`}>
                          {FLAG_LABEL[f]}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td data-action>
                  {/* `resolveAttendanceScope` re-resolves `?club=` server-side
                      against manage:members, so these links cannot over-grant. */}
                  <span className="stack">
                    <Link className="btn btn-sm" href={`/admin/attendance?club=${r.clubId}`}>
                      Attendance
                    </Link>
                    <Link
                      className="btn btn-sm"
                      href={`/admin/attendance/analytics?club=${r.clubId}`}
                    >
                      Analytics
                    </Link>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        Low turnout is only flagged below {LOW_TURNOUT}% and only once a club has
        held at least {MIN_SESSIONS} sessions in the window — one sparse meeting is
        not a turnout problem.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/admin/(app)/oversight/clubs/page.tsx`:

```tsx
import { requireViewPage } from "@/lib/auth/guards";
import { todayKey } from "@/lib/datetime";
import { getClubVitalityData } from "@/lib/admin/club-vitality-data";
import { computeClubVitality, WINDOW_DAYS } from "@/lib/admin/club-vitality";
import { ClubHealth } from "@/components/admin/ClubHealth";

/**
 * Council-only club health (design D1/D2).
 *
 * ⚠️ THE GATE IS `manage:council`, NEVER `view:analytics`. Club heads and vice
 * heads hold `view:analytics` at `own`, and events/social heads hold it at
 * `all` — gating on it would hand a cross-club ranking to nine roles. This page
 * is deliberately visible only to the four council roles.
 *
 * It is also deliberately not grafted onto `/admin/attendance` (gated on
 * `manage:members`, which club heads hold): a second, inner capability check
 * inside a page that already has one is how leaks start.
 *
 * `nowKey` is resolved once here and threaded through both the read and the
 * computation, so the window the marks were fetched for is exactly the window
 * the rates are computed over.
 */
export default async function ClubHealthPage() {
  await requireViewPage("manage:council");

  const nowKey = todayKey();
  const rows = computeClubVitality(await getClubVitalityData(nowKey), nowKey);

  return (
    <div className="admin-page">
      <div className="eyebrow">Oversight</div>
      <h1 style={{ margin: "6px 0 0" }}>Club health</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Every active club, the ones needing attention first. Rates cover the last{" "}
        {WINDOW_DAYS} days and are shown with the sessions they were computed from.
      </p>
      <ClubHealth rows={rows} windowDays={WINDOW_DAYS} />
    </div>
  );
}
```

- [ ] **Step 3: Verify the page renders the expected clubs**

Run: `npm run build`
Expected: PASS, and `/admin/oversight/clubs` appears in the route list.

Then start the dev server (`npm run dev`) and, using the session-forging trick in `docs/STATUS.md` → "Verifying admin flows headless", fetch `/admin/oversight/clubs` with a council session and confirm:
- the response is 200 (not a 307 to `/admin/login` or `/admin`),
- **Nature** and **Animatrix (E-Sports)** appear at the TOP with "No members" and "Not meeting",
- **Ai Forge** carries "Unmet demand",
- every club listed in Task 2 Step 2 is present exactly once.

Then fetch the same URL with a `club_head` session and confirm it **307s to `/admin`** — that is spec D1 holding.

⚠️ Add to the browser-verification checklist in `docs/STATUS.md` rather than claiming it verified: **the page has never been looked at, and layout is not covered by any check here** (STATUS gotcha: the results page shipped visibly broken with everything green). The phone-width card collapse in particular is unverified.

- [ ] **Step 4: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ClubHealth.tsx "src/app/admin/(app)/oversight/clubs/page.tsx"
git commit -m "feat(oversight): council-only club health page"
```

---

### Task 4: The Oversight nav group and the capability pins

**Files:**
- Modify: `src/lib/admin/nav.ts`
- Modify: `src/lib/admin/nav.test.ts`
- Modify: `src/app/admin/(app)/layout.tsx`
- Modify: `src/lib/auth/capabilities.test.ts`

**Interfaces:**
- Consumes: `canView` from `@/lib/auth/capabilities`; the `NavLink` type from `@/lib/admin/nav`.
- Produces: `"oversight"` as a member of `NavGroup`; the `/admin/oversight/clubs` link in the admin sidebar for `manage:council` holders.

- [ ] **Step 1: Write the failing nav test**

In `src/lib/admin/nav.test.ts`, add the new link to the `FULL` fixture, immediately after the Dashboard line:

```ts
  link("/admin", "Dashboard", "overview"),
  link("/admin/oversight/clubs", "Club health", "oversight"),
  link("/admin/events", "Events", "programme"),
```

and add `"Oversight"` to the expected section-label array in the "splits a wide role's links into labelled sections in canonical order" test, between `"Overview"` and `"Programme"`:

```ts
    expect(sections.map((s) => s.label)).toEqual([
      "Overview",
      "Oversight",
      "Programme",
```

Then append this block at the end of the file:

```ts
describe("the Oversight group", () => {
  it("sits between Overview and Programme", () => {
    const labels = groupNavLinks(FULL).map((s) => s.label);
    expect(labels.indexOf("Oversight")).toBe(labels.indexOf("Overview") + 1);
    expect(labels.indexOf("Oversight")).toBeLessThan(labels.indexOf("Programme"));
  });

  it("does not render as a heading for a role that holds no oversight link", () => {
    // Groups with no links are dropped, so a club head never sees the heading.
    const clubHead: NavLink[] = FULL.filter((l) => l.group !== "oversight");
    expect(groupNavLinks(clubHead).map((s) => s.label)).not.toContain("Oversight");
  });

  it("marks Club health current on its own route", () => {
    expect(activeHref(FULL, "/admin/oversight/clubs")).toBe("/admin/oversight/clubs");
    expect(activeLabel(FULL, "/admin/oversight/clubs")).toBe("Club health");
  });

  it("does not let the dashboard steal current from an oversight route", () => {
    // `/admin` covers every admin path by prefix; longest-match must win.
    expect(activeHref(FULL, "/admin/oversight/clubs")).not.toBe("/admin");
  });
});
```

- [ ] **Step 2: Run the nav test to verify it fails**

Run: `npx vitest run src/lib/admin/nav.test.ts`
Expected: FAIL — TypeScript rejects `"oversight"` as a `NavLink["group"]`, and the section-order assertion does not match.

- [ ] **Step 3: Add the group to `nav.ts`**

In `src/lib/admin/nav.ts`, extend the union:

```ts
export type NavGroup =
  | "overview"
  | "oversight"
  | "programme"
  | "content"
  | "people"
  | "inbox"
  | "system";
```

and add the section to `GROUPS`, second:

```ts
const GROUPS: { group: NavGroup; label: string }[] = [
  { group: "overview", label: "Overview" },
  // Council-only reading surfaces. Sits high because it is where the council
  // starts a session, and it is empty (so dropped) for every other role.
  { group: "oversight", label: "Oversight" },
  { group: "programme", label: "Programme" },
  { group: "content", label: "Content" },
  { group: "people", label: "People" },
  { group: "inbox", label: "Inbox" },
  { group: "system", label: "System" },
];
```

`GROUPING_THRESHOLD` is unchanged: it counts links, not groups, and an empty group is already filtered out.

- [ ] **Step 4: Run the nav test to verify it passes**

Run: `npx vitest run src/lib/admin/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the link to the layout**

In `src/app/admin/(app)/layout.tsx`, insert this entry into the `links` array immediately after the Dashboard entry and before the Events entry:

```tsx
    // Council-only (design D1/D2). `manage:council` — NOT `view:analytics`,
    // which club, events and social heads all hold.
    ...(canView(session, "manage:council")
      ? [{ href: "/admin/oversight/clubs", label: "Club health", group: "oversight" as const }]
      : []),
```

- [ ] **Step 6: Write the capability pins**

Append to `src/lib/auth/capabilities.test.ts`:

```ts
describe("council oversight is gated on manage:council, not view:analytics", () => {
  // Design D2. `view:analytics` is held at "own" by club and vice heads and at
  // "all" by events and social media heads — gating the cross-club oversight
  // pages on it would hand every club's numbers to nine roles. If this test
  // fails because the gate moved, the gate is wrong, not the test.
  const clubHead = { role: "club_head", clubId: "c1" } as const;
  const viceHead = { role: "vice_head", clubId: "c1" } as const;
  const eventsHead = { role: "events_head", clubId: null } as const;
  const socialHead = { role: "social_media_head", clubId: null } as const;

  it("is visible to exactly the four council roles", () => {
    for (const role of ["faculty_advisor", "president", "vice_president", "tech_head"] as const) {
      expect(canView({ role, clubId: null }, "manage:council")).toBe(true);
    }
  });

  it("is refused to every role that holds view:analytics but not manage:council", () => {
    for (const who of [clubHead, viceHead, eventsHead, socialHead]) {
      expect(canView(who, "view:analytics")).toBe(true);
      expect(canView(who, "manage:council")).toBe(false);
    }
  });
});
```

- [ ] **Step 7: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green.

- [ ] **Step 8: Verify the nav in a signed-in session**

With `npm run dev` and a forged council session (STATUS → "Verifying admin flows headless"), fetch `/admin` and confirm the sidebar HTML contains an **Oversight** heading with a **Club health** link. Fetch `/admin` with a `club_head` session and confirm **neither** string appears.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/nav.ts src/lib/admin/nav.test.ts "src/app/admin/(app)/layout.tsx" src/lib/auth/capabilities.test.ts
git commit -m "feat(oversight): Oversight nav group + Club health link, gated on manage:council"
```

---

### Task 5: Record the state

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Add the shipped block and the owed browser check**

Add a block under "START HERE" in the house style (what shipped · the gate results · what is load-bearing and must not be "simplified" · what is unverified), covering:
- the `manage:council` gate and why `view:analytics` is wrong (D2), so nobody "fixes" it later;
- `MIN_SESSIONS` and the `eligible > 0` guard as structural, not cosmetic;
- that the rate is delegated to `summarizeAttendance` so the two pages agree, and what breaks if someone inlines a ratio;
- that marks are fetched for window sessions only, and why (row cap + cost);
- that future-dated sessions count nowhere.

Then add one line to the **browser-verification debt checklist** (TODO item 1), which becomes EIGHT items:

```markdown
   - [ ] **Club health** (`/admin/oversight/clubs`, 2026-09-04) — never opened.
         Confirm the Oversight nav group renders, that Nature / Animatrix
         (E-Sports) / Ai Forge lead the table with their flags, that the deep
         links land on the right club, and the phone-width card collapse.
```

- [ ] **Step 2: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): council oversight phase 1 shipped; club health browser check owed"
```

---

## Not in this plan

Phase B (`/admin/oversight/activity`, `audit-insights.ts`, the B4 PII field allowlist) is rollout steps 2 and 3 in the spec and gets its own plan. Event analytics, any mutation, a club-head-visible ranking, and terms/semesters are out of scope per the spec.
