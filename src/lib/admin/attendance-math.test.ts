import { describe, it, expect } from "vitest";
import { summarizeAttendance } from "./attendance-math";

const s = (id: string, opened_at: string) => ({ id, opened_at });
// Fixed-width UTC ISO-8601, as PostgREST serializes timestamptz.
const AUG = (day: number) => `2026-08-${String(day).padStart(2, "0")}T00:00:00+00:00`;

describe("summarizeAttendance", () => {
  it("counts only closed sessions opened on/after the member joined", () => {
    const sessions = [s("a", AUG(1)), s("b", AUG(10)), s("c", AUG(20))];
    // Joined on the 10th → session "a" (before join) is not eligible, and the
    // mark on "a" must not count.
    const r = summarizeAttendance(sessions, AUG(10), new Set(["a", "b", "c"]));
    expect(r.eligible).toBe(2); // b, c
    expect(r.attended).toBe(2); // b, c
    expect(r.pct).toBe(100);
  });

  it("does not count a mark on a session outside the eligible set (still-open / unknown id)", () => {
    const sessions = [s("a", AUG(1)), s("b", AUG(2))];
    // "open1" is a still-open session the caller left in the attended set; it is
    // not among the closed sessions, so it is neither eligible nor attended.
    const r = summarizeAttendance(sessions, AUG(1), new Set(["a", "open1"]));
    expect(r.eligible).toBe(2);
    expect(r.attended).toBe(1); // only "a"
    expect(r.pct).toBe(50);
  });

  it("guarantees attended <= eligible (never >100%) even if the attended set is a superset", () => {
    const sessions = [s("a", AUG(1))];
    const r = summarizeAttendance(sessions, AUG(1), new Set(["a", "x", "y", "z"]));
    expect(r.attended).toBe(1);
    expect(r.eligible).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("returns 0% (not NaN) when there are no eligible sessions", () => {
    const sessions = [s("a", AUG(1))];
    const r = summarizeAttendance(sessions, AUG(30), new Set(["a"])); // joined after every session
    expect(r.eligible).toBe(0);
    expect(r.attended).toBe(0);
    expect(r.pct).toBe(0);
  });

  it("rounds the percentage to the nearest integer", () => {
    const sessions = [s("a", AUG(1)), s("b", AUG(2)), s("c", AUG(3))];
    expect(summarizeAttendance(sessions, AUG(1), new Set(["a"])).pct).toBe(33); // 1/3 = 33.3 → 33
    expect(summarizeAttendance(sessions, AUG(1), new Set(["a", "b"])).pct).toBe(67); // 2/3 = 66.7 → 67
  });

  it("treats a session opened exactly at the join instant as eligible (>= is inclusive)", () => {
    const r = summarizeAttendance([s("a", AUG(10))], AUG(10), new Set(["a"]));
    expect(r.eligible).toBe(1);
    expect(r.attended).toBe(1);
  });

  it("is 0/0 for a brand-new member with no closed sessions", () => {
    const r = summarizeAttendance([], AUG(1), new Set());
    expect(r).toEqual({ attended: 0, eligible: 0, pct: 0 });
  });
});
