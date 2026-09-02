import { describe, it, expect } from "vitest";
import { podiumOf, entrantsOf } from "./podium";

const r = (rank: number | null, roll: string) => ({
  roll_no: roll, display_name: roll, team_name: null, team_members: null,
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

describe("entrantsOf — everyone on an entry, weighted equally", () => {
  const row = (over: Partial<Parameters<typeof entrantsOf>[0]> = {}) => ({
    roll_no: "VTU100", display_name: "Asha Rao", team_name: null,
    team_members: null, rank: 1, score: null, advanced: false, remarks: null,
    ...over,
  });

  it("puts the registrant first, then the rest of the team", () => {
    expect(entrantsOf(row({
      team_members: [{ name: "Bob Singh", roll: "VTU202" }, { name: "Cara M", roll: "VTU303" }],
    }))).toEqual([
      { name: "Asha Rao", roll: "VTU100" },
      { name: "Bob Singh", roll: "VTU202" },
      { name: "Cara M", roll: "VTU303" },
    ]);
  });

  it("is a single entry for a solo competitor", () => {
    expect(entrantsOf(row())).toEqual([{ name: "Asha Rao", roll: "VTU100" }]);
  });

  it("falls back to the roll when a name was never recorded", () => {
    expect(entrantsOf(row({ display_name: null }))).toEqual([{ name: "VTU100", roll: "VTU100" }]);
  });

  it("treats an empty team array as solo", () => {
    expect(entrantsOf(row({ team_members: [] }))).toEqual([{ name: "Asha Rao", roll: "VTU100" }]);
  });
});
