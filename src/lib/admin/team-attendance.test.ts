import { describe, expect, it } from "vitest";
import { normaliseAbsent, presentOf, presentPositions, setPerson, teamMark } from "./team-attendance";

describe("team attendance", () => {
  it("reads an attended team with no absentees as everyone present", () => {
    expect(teamMark(4, true, [])).toBe("present");
    expect(presentPositions(4, true, [])).toEqual([0, 1, 2, 3]);
  });

  it("reads absentees as partly present, and an unattended team as unmarked", () => {
    expect(teamMark(4, true, [2])).toBe("partial");
    expect(presentPositions(4, true, [2])).toEqual([0, 1, 3]);
    expect(teamMark(4, false, [])).toBe("unmarked");
    expect(presentPositions(4, false, [1])).toEqual([]);
  });

  it("drops duplicate and out-of-range positions", () => {
    expect(normaliseAbsent(3, [2, 2, 7, -1, 0])).toEqual([0, 2]);
    expect(teamMark(3, true, [9])).toBe("present");
  });

  it("marks one person absent on an attended team", () => {
    expect(setPerson(4, { attended: true, absent: [] }, 2, false)).toEqual({ attended: true, absent: [2] });
  });

  it("marks them back present", () => {
    expect(setPerson(4, { attended: true, absent: [1, 2] }, 2, true)).toEqual({ attended: true, absent: [1] });
  });

  it("marking one person absent on an unmarked team attends it with just that person absent", () => {
    expect(setPerson(4, { attended: false, absent: [] }, 3, false)).toEqual({ attended: true, absent: [3] });
  });

  it("marking one person present on an unmarked team marks everyone present", () => {
    expect(setPerson(4, { attended: false, absent: [] }, 0, true)).toEqual({ attended: true, absent: [] });
  });

  it("collapses a team with everyone absent back to unmarked", () => {
    expect(setPerson(2, { attended: true, absent: [0] }, 1, false)).toEqual({ attended: false, absent: [] });
  });

  it("rejects a position outside the team", () => {
    expect(setPerson(2, { attended: true, absent: [] }, 2, false)).toBeNull();
    expect(setPerson(2, { attended: true, absent: [] }, -1, false)).toBeNull();
  });

  it("treats a solo registrant as a team of one", () => {
    expect(setPerson(1, { attended: false, absent: [] }, 0, true)).toEqual({ attended: true, absent: [] });
    expect(setPerson(1, { attended: true, absent: [] }, 0, false)).toEqual({ attended: false, absent: [] });
  });

  it("filters people to those present", () => {
    expect(presentOf(["a", "b", "c"], true, [1])).toEqual(["a", "c"]);
    expect(presentOf(["a", "b"], false, [])).toEqual([]);
  });

  it("skips an absent leader but keeps their present teammates (certificate rule)", () => {
    const team = [{ name: "Lead", isLeader: true }, { name: "Asha", isLeader: false }, { name: "Ravi", isLeader: false }];
    const present = presentOf(team, true, [0, 2]);
    expect(present.some((p) => p.isLeader)).toBe(false);
    expect(present.map((p) => p.name)).toEqual(["Asha"]);
  });
});
