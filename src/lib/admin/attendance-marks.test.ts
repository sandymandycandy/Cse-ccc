import { describe, it, expect } from "vitest";
import { diffMarks, tallyMarks, type Mark, type MarkState } from "./attendance-marks";

const cur = (o: Record<string, Mark>) => new Map(Object.entries(o));
const want = (o: Record<string, MarkState>) => new Map(Object.entries(o));

describe("diffMarks", () => {
  it("upserts a brand-new mark", () => {
    expect(diffMarks(cur({}), want({ a: "present" }))).toEqual({
      toUpsert: [{ memberId: "a", status: "present" }],
      toRemove: [],
    });
  });

  it("upserts a mark that flipped", () => {
    expect(diffMarks(cur({ a: "present" }), want({ a: "absent" }))).toEqual({
      toUpsert: [{ memberId: "a", status: "absent" }],
      toRemove: [],
    });
  });

  it("writes nothing for a mark that is unchanged", () => {
    expect(diffMarks(cur({ a: "present" }), want({ a: "present" }))).toEqual({
      toUpsert: [],
      toRemove: [],
    });
  });

  it("removes the row when a mark is cleared back to unmarked", () => {
    expect(diffMarks(cur({ a: "absent" }), want({ a: null }))).toEqual({
      toUpsert: [],
      toRemove: ["a"],
    });
  });

  it("does not delete a row that was never there", () => {
    // Clearing someone who is already unmarked is a no-op, not a DELETE.
    expect(diffMarks(cur({}), want({ a: null }))).toEqual({ toUpsert: [], toRemove: [] });
  });

  it("ignores members the caller did not submit", () => {
    // A filtered save must not clear everyone hidden by the search box.
    expect(diffMarks(cur({ a: "present", b: "present" }), want({ a: "absent" }))).toEqual({
      toUpsert: [{ memberId: "a", status: "absent" }],
      toRemove: [],
    });
  });

  it("handles a full roll call in one pass", () => {
    const d = diffMarks(
      cur({ a: "present", b: "present", c: "absent" }),
      want({ a: "present", b: "absent", c: null, d: "present" }),
    );
    expect(d.toUpsert).toEqual([
      { memberId: "b", status: "absent" },
      { memberId: "d", status: "present" },
    ]);
    expect(d.toRemove).toEqual(["c"]);
  });
});

describe("tallyMarks", () => {
  it("counts the three states against the full roster", () => {
    expect(tallyMarks(want({ a: "present", b: "absent" }), 5)).toEqual({
      present: 1,
      absent: 1,
      unmarked: 3,
      turnout: 20,
    });
  });

  it("treats a member with no entry as unmarked", () => {
    expect(tallyMarks(want({}), 4).unmarked).toBe(4);
  });

  it("counts an explicit null as unmarked, not absent", () => {
    const t = tallyMarks(want({ a: null, b: "present" }), 2);
    expect(t).toEqual({ present: 1, absent: 0, unmarked: 1, turnout: 50 });
  });

  it("reports turnout over the whole roster, not over those marked so far", () => {
    // Half the roll call done, everyone seen so far present → 50%, not 100%.
    expect(tallyMarks(want({ a: "present", b: "present" }), 4).turnout).toBe(50);
  });

  it("does not divide by zero on an empty roster", () => {
    expect(tallyMarks(want({}), 0)).toEqual({
      present: 0,
      absent: 0,
      unmarked: 0,
      turnout: 0,
    });
  });

  it("never reports negative unmarked if the map outruns the total", () => {
    expect(tallyMarks(want({ a: "present", b: "present" }), 1).unmarked).toBe(0);
  });
});
