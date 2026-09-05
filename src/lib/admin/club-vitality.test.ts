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
function members(clubId: string, n: number): VitalityMember[] {
  return Array.from({ length: n }, (_, i) => ({
    clubId,
    memberId: `${clubId}-m${i}`,
  }));
}

// Ids come from a running counter, not the index within one call: two calls for
// the same club (in-window sessions and older ones) would otherwise both start at
// s0 and collide, silently attributing one session's marks to another.
let sessionSeq = 0;
function sessions(clubId: string, dates: string[]): VitalitySession[] {
  return dates.map((date) => ({ id: `${clubId}-s${sessionSeq++}`, clubId, date }));
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

  it("does not flag low-turnout when there was nothing to attend in the window", () => {
    // A roster but no sessions inside the window, so eligible is 0 and the 0% is
    // a convention — not a turnout signal. (Before 2026-09-05 this case was also
    // reached by every member having joined after every session; the join-date
    // eligibility rule is gone, so an unattended session now counts against a
    // club rather than vanishing from its denominator.)
    const row = only(input({
      members: members("c1", 10),
      sessions: [],
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
    // The failure this prevents: this page and /admin/attendance/analytics
    // printing different rates for the same club, which they would the moment
    // either stopped delegating to summarizeAttendance.
    const sess = sessions("c1", ["2026-08-08", "2026-08-15", "2026-08-28"]);
    const mems: VitalityMember[] = [0, 1, 2].map((i) => ({
      clubId: "c1", memberId: `c1-m${i}`,
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
      const s = summarizeAttendance(sess, attendedIds);
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
