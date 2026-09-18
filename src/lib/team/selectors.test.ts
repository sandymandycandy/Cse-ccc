import { describe, it, expect } from "vitest";
import { selectPresident, selectInLayer, selectClubLeaders, selectSmtByGroup } from "./selectors";
import type { Member } from "@/data/ccc";

const m = (over: Partial<Member>): Member => ({
  id: "x",
  name: "X",
  role: "Head",
  layer: "clubs",
  vtu: "1",
  email: "x@y.z",
  ...over,
});

const people = [
  m({ id: "p", layer: "president", role: "President" }),
  m({ id: "c1", layer: "council", role: "Vice President" }),
  m({ id: "k1", layer: "clubs", club: "coding", role: "Head" }),
  m({ id: "k2", layer: "clubs", club: "yoga", role: "Head" }),
  m({ id: "s1", layer: "smt", smtGroup: "Camera" }),
  m({ id: "s2", layer: "smt", smtGroup: "Writing" }),
];

describe("team selectors", () => {
  it("finds the president", () => {
    expect(selectPresident(people)?.id).toBe("p");
  });

  it("filters by layer", () => {
    expect(selectInLayer(people, "smt").map((x) => x.id)).toEqual(["s1", "s2"]);
  });

  it("filters by club", () => {
    expect(selectClubLeaders(people, "coding").map((x) => x.id)).toEqual(["k1"]);
  });

  it("groups SMT and drops empty groups", () => {
    const groups = selectSmtByGroup(people);
    expect(groups.map((g) => g.group)).toEqual(["Camera", "Writing"]);
    expect(groups.every((g) => g.members.length > 0)).toBe(true);
  });

  // The selectors run over the MERGED list, so they must not fall back to the
  // module's own `members` constant when handed an empty array.
  it("returns nothing for an empty members list rather than the file's data", () => {
    expect(selectPresident([])).toBeUndefined();
    expect(selectInLayer([], "smt")).toEqual([]);
    expect(selectClubLeaders([], "coding")).toEqual([]);
    expect(selectSmtByGroup([])).toEqual([]);
  });
});
