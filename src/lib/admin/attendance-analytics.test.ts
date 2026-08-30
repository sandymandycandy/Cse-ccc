import { describe, it, expect } from "vitest";
import { computeClubAnalytics, pctOfStrength } from "./attendance-analytics";
import type { AnalyticsMember, AnalyticsSession } from "./attendance-analytics";

const m = (
  memberId: string, name: string, attended: number, eligible: number,
): AnalyticsMember => ({
  memberId, name, attended, eligible,
  pct: eligible === 0 ? 0 : Math.round((attended / eligible) * 100),
});

const sess = (
  id: string, present: number, status: "open" | "closed" = "closed", date = "2026-08-10",
): AnalyticsSession => ({ id, title: id, status, presentCount: present, date });

const membership = { total: 10, active: 9, pending: 1 };

describe("pctOfStrength", () => {
  it("is a rounded percentage of strength", () => {
    expect(pctOfStrength(3, 4)).toBe(75);
    expect(pctOfStrength(1, 3)).toBe(33);
  });
  it("returns 0 (not NaN) when strength is zero", () => {
    expect(pctOfStrength(5, 0)).toBe(0);
  });
  it("clamps to 100 when present exceeds strength (deactivated-after-marking)", () => {
    expect(pctOfStrength(6, 4)).toBe(100);
  });
});

describe("computeClubAnalytics", () => {
  it("passes membership through and derives strength from the roster length", () => {
    const a = computeClubAnalytics({
      membership, roster: [m("1", "A", 1, 1), m("2", "B", 0, 1)], sessions: [], belowThreshold: 75,
    });
    expect(a.membership).toEqual(membership);
    expect(a.strength).toBe(2);
  });

  it("overall % is aggregate Σattended/Σeligible, not the mean of per-member %", () => {
    // Member A: 1/1 = 100%, Member B: 1/3 = 33%. Mean of pcts = 67, but the
    // aggregate 2/4 = 50% is the correct club rate.
    const a = computeClubAnalytics({
      membership, roster: [m("1", "A", 1, 1), m("2", "B", 1, 3)], sessions: [], belowThreshold: 75,
    });
    expect(a.rates.totalAttended).toBe(2);
    expect(a.rates.totalEligible).toBe(4);
    expect(a.rates.overallPct).toBe(50);
  });

  it("overall % is 0 (not NaN) when nothing is eligible", () => {
    const a = computeClubAnalytics({
      membership, roster: [m("1", "A", 0, 0)], sessions: [], belowThreshold: 75,
    });
    expect(a.rates.overallPct).toBe(0);
  });

  it("averages present across all sessions and counts open vs closed", () => {
    const a = computeClubAnalytics({
      membership, roster: [m("1", "A", 0, 0)],
      sessions: [sess("s1", 10, "closed"), sess("s2", 4, "closed"), sess("s3", 1, "open")],
      belowThreshold: 75,
    });
    expect(a.rates.sessionsHeld).toBe(3);
    expect(a.rates.avgPresentPerSession).toBe(5); // (10+4+1)/3 = 5
    expect(a.sessions).toMatchObject({ total: 3, open: 1, closed: 2 });
  });

  it("picks most- and least-attended sessions with % of strength", () => {
    const roster = [m("1", "A", 0, 0), m("2", "B", 0, 0), m("3", "C", 0, 0), m("4", "D", 0, 0)]; // strength 4
    const a = computeClubAnalytics({
      membership, roster,
      sessions: [sess("hi", 3), sess("lo", 1), sess("mid", 2)],
      belowThreshold: 75,
    });
    expect(a.sessions.most).toMatchObject({ id: "hi", present: 3, pctOfStrength: 75 });
    expect(a.sessions.least).toMatchObject({ id: "lo", present: 1, pctOfStrength: 25 });
  });

  it("most/least are null when there are no sessions", () => {
    const a = computeClubAnalytics({ membership, roster: [m("1", "A", 0, 0)], sessions: [], belowThreshold: 75 });
    expect(a.sessions.most).toBeNull();
    expect(a.sessions.least).toBeNull();
    expect(a.rates.avgPresentPerSession).toBe(0);
  });

  it("watchlist keeps only members below the threshold WITH eligible sessions, sorted worst-first", () => {
    const a = computeClubAnalytics({
      membership,
      roster: [
        m("1", "Full", 4, 4),   // 100% — above
        m("2", "Half", 2, 4),   // 50%  — below
        m("3", "Low", 1, 4),    // 25%  — below (worst)
        m("4", "New", 0, 0),    // 0% but 0 eligible — excluded
      ],
      sessions: [],
      belowThreshold: 75,
    });
    expect(a.watchlist.threshold).toBe(75);
    expect(a.watchlist.members.map((x) => x.name)).toEqual(["Low", "Half"]);
  });

  it("respects a custom threshold", () => {
    const a = computeClubAnalytics({
      membership,
      roster: [m("1", "A", 4, 4), m("2", "B", 2, 4)], // 100%, 50%
      sessions: [],
      belowThreshold: 50, // strictly below 50 → nobody (B is exactly 50)
    });
    expect(a.watchlist.members).toHaveLength(0);
  });

  it("handles an empty club (no members, no sessions) without dividing by zero", () => {
    const a = computeClubAnalytics({
      membership: { total: 0, active: 0, pending: 0 }, roster: [], sessions: [], belowThreshold: 75,
    });
    expect(a.strength).toBe(0);
    expect(a.rates).toMatchObject({ overallPct: 0, avgPresentPerSession: 0, sessionsHeld: 0 });
    expect(a.sessions.most).toBeNull();
    expect(a.watchlist.members).toHaveLength(0);
  });
});
