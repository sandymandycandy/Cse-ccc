import { describe, it, expect } from "vitest";
import { summarizeAttendance } from "./attendance-math";

const s = (id: string, date: string) => ({ id, date });
// YYYY-MM-DD, as PostgREST serializes a `date` column (lexicographic = chronological).
const AUG = (day: number) => `2026-08-${String(day).padStart(2, "0")}`;

describe("summarizeAttendance", () => {
  it("counts EVERY session in the club, including ones before the member row existed", () => {
    // The rule this replaces used the member's created_at as a join date, which
    // hid 625 real marks: every club typed its roster in after running its first
    // sessions, so the opening session was ruled not-applicable for everyone.
    const sessions = [s("a", AUG(1)), s("b", AUG(10)), s("c", AUG(20))];
    const r = summarizeAttendance(sessions, new Set(["a", "b", "c"]));
    expect(r.eligible).toBe(3);
    expect(r.attended).toBe(3);
    expect(r.pct).toBe(100);
  });

  it("counts a mark on the club's very first session", () => {
    const sessions = [s("day1", AUG(27)), s("day2", AUG(28))];
    const r = summarizeAttendance(sessions, new Set(["day1"]));
    expect(r.attended).toBe(1);
    expect(r.eligible).toBe(2);
    expect(r.pct).toBe(50);
  });

  it("counts an unattended session as absent rather than skipping it", () => {
    const sessions = [s("a", AUG(1)), s("b", AUG(2))];
    const r = summarizeAttendance(sessions, new Set(["a"]));
    expect(r.eligible).toBe(2);
    expect(r.attended).toBe(1);
    expect(r.pct).toBe(50);
  });

  it("does not count a mark whose session id is unknown", () => {
    const sessions = [s("a", AUG(1)), s("b", AUG(2))];
    const r = summarizeAttendance(sessions, new Set(["a", "ghost"]));
    expect(r.eligible).toBe(2);
    expect(r.attended).toBe(1);
    expect(r.pct).toBe(50);
  });

  it("guarantees attended <= eligible (never >100%) even if the attended set is a superset", () => {
    const r = summarizeAttendance([s("a", AUG(1))], new Set(["a", "x", "y", "z"]));
    expect(r.attended).toBe(1);
    expect(r.eligible).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("returns 0% (not NaN) when the club has no sessions at all", () => {
    const r = summarizeAttendance([], new Set(["a"]));
    expect(r).toEqual({ attended: 0, eligible: 0, pct: 0 });
  });

  it("rounds the percentage to the nearest integer", () => {
    const sessions = [s("a", AUG(1)), s("b", AUG(2)), s("c", AUG(3))];
    expect(summarizeAttendance(sessions, new Set(["a"])).pct).toBe(33); // 1/3 = 33.3 → 33
    expect(summarizeAttendance(sessions, new Set(["a", "b"])).pct).toBe(67); // 2/3 = 66.7 → 67
  });
});
