import { describe, it, expect } from "vitest";
import { sortSessions } from "./session-sort";

/** Minimal rows: the sort only reads `sessionDate` and `openedAt`. */
const row = (id: string, sessionDate: string | null, openedAt: string) => ({ id, sessionDate, openedAt });

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("sortSessions", () => {
  it("newest-first puts the most recent date at the top", () => {
    const rows = [
      row("mid", "2026-08-15", "2026-08-15T04:00:00.000Z"),
      row("old", "2026-07-01", "2026-07-01T04:00:00.000Z"),
      row("new", "2026-09-03", "2026-09-03T04:00:00.000Z"),
    ];
    expect(ids(sortSessions(rows, "newest"))).toEqual(["new", "mid", "old"]);
  });

  it("oldest-first reverses it", () => {
    const rows = [
      row("mid", "2026-08-15", "2026-08-15T04:00:00.000Z"),
      row("old", "2026-07-01", "2026-07-01T04:00:00.000Z"),
      row("new", "2026-09-03", "2026-09-03T04:00:00.000Z"),
    ];
    expect(ids(sortSessions(rows, "oldest"))).toEqual(["old", "mid", "new"]);
  });

  it("tie-breaks a shared date on openedAt", () => {
    const rows = [
      row("early", "2026-08-15", "2026-08-15T03:00:00.000Z"),
      row("late", "2026-08-15", "2026-08-15T09:00:00.000Z"),
    ];
    expect(ids(sortSessions(rows, "newest"))).toEqual(["late", "early"]);
    expect(ids(sortSessions(rows, "oldest"))).toEqual(["early", "late"]);
  });

  it("sorts a null sessionDate by that row's own openedAt", () => {
    // The table displays `sessionDate ?? openedAt`, so an undated session must
    // sort where its opened-at date puts it — not to the bottom of the list.
    const rows = [
      row("dated-old", "2026-07-01", "2026-07-01T04:00:00.000Z"),
      row("undated", null, "2026-08-20T04:00:00.000Z"),
      row("dated-new", "2026-09-03", "2026-09-03T04:00:00.000Z"),
    ];
    expect(ids(sortSessions(rows, "newest"))).toEqual(["dated-new", "undated", "dated-old"]);
    expect(ids(sortSessions(rows, "oldest"))).toEqual(["dated-old", "undated", "dated-new"]);
  });

  it("keys on the IST calendar day the table shows, not the UTC instant", () => {
    // 2026-08-20T19:00Z is 00:30 IST on the 21st — the table stamps it 21/08.
    // Keying on the raw UTC string would file it under the 20th, i.e. below a
    // session dated the 21st, while both rows read "21/08/2026" on screen.
    const rows = [
      row("dated-21st", "2026-08-21", "2026-08-21T10:00:00.000Z"),
      row("undated-late-20th", null, "2026-08-20T19:00:00.000Z"),
      row("dated-20th", "2026-08-20", "2026-08-20T10:00:00.000Z"),
    ];
    // Same IST day (21st) for the first two, so openedAt breaks the tie:
    // 2026-08-21T10:00Z is later than 2026-08-20T19:00Z.
    expect(ids(sortSessions(rows, "newest"))).toEqual(["dated-21st", "undated-late-20th", "dated-20th"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      row("a", "2026-07-01", "2026-07-01T04:00:00.000Z"),
      row("b", "2026-09-03", "2026-09-03T04:00:00.000Z"),
    ];
    const before = ids(rows);
    sortSessions(rows, "newest");
    expect(ids(rows)).toEqual(before);
  });
});
