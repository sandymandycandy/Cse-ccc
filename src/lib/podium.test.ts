import { describe, it, expect } from "vitest";
import { podiumOf } from "./podium";

const r = (rank: number | null, roll: string) => ({
  roll_no: roll, display_name: roll, team_name: null,
  rank, score: null, advanced: false, remarks: null,
});

describe("podiumOf — the top three of a round", () => {
  it("takes ranks 1, 2 and 3", () => {
    const out = podiumOf([r(1, "a"), r(2, "b"), r(3, "c"), r(4, "d"), r(5, "e")]);
    expect(out.map((x) => x.roll_no)).toEqual(["a", "b", "c"]);
  });

  it("keeps EVERY competitor in a tie rather than dropping one", () => {
    // Real data: PITCH DESK has two students tied at #3. Capping the podium at
    // three cards would silently drop one of them off the page.
    const out = podiumOf([r(1, "a"), r(2, "b"), r(3, "c"), r(3, "d"), r(4, "e")]);
    expect(out.map((x) => x.roll_no)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps a shared first place", () => {
    const out = podiumOf([r(1, "a"), r(1, "b"), r(2, "c")]);
    expect(out.map((x) => x.roll_no)).toEqual(["a", "b", "c"]);
  });

  it("ignores unranked rows", () => {
    expect(podiumOf([r(null, "a"), r(1, "b")]).map((x) => x.roll_no)).toEqual(["b"]);
  });

  it("returns nothing when no row is ranked", () => {
    expect(podiumOf([r(null, "a"), r(null, "b")])).toEqual([]);
  });

  it("orders by rank even if the input is not sorted", () => {
    expect(podiumOf([r(3, "c"), r(1, "a"), r(2, "b")]).map((x) => x.roll_no)).toEqual(["a", "b", "c"]);
  });
});
