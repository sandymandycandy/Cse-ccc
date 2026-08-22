import { describe, it, expect } from "vitest";
import { rankByScore, orderStandings } from "./results";

const row = (roll_no: string, score: number | null) => ({
  roll_no,
  display_name: roll_no,
  score,
  rank: null as number | null,
  advanced: false,
  remarks: null as string | null,
});

describe("rankByScore", () => {
  it("ranks by score descending, 1-based", () => {
    const out = rankByScore([row("a", 10), row("b", 30), row("c", 20)]);
    expect(out.map((r) => [r.roll_no, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("gives tied scores the same rank and skips the next (standard competition ranking)", () => {
    const out = rankByScore([row("a", 50), row("b", 50), row("c", 40)]);
    expect(out.map((r) => [r.roll_no, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("sorts null scores last with rank null", () => {
    const out = rankByScore([row("a", null), row("b", 10)]);
    expect(out.map((r) => [r.roll_no, r.rank])).toEqual([
      ["b", 1],
      ["a", null],
    ]);
  });
});

describe("orderStandings", () => {
  it("orders by rank asc, nulls last", () => {
    const out = orderStandings([
      { roll_no: "a", rank: null, score: null },
      { roll_no: "b", rank: 2, score: 5 },
      { roll_no: "c", rank: 1, score: 9 },
    ]);
    expect(out.map((r) => r.roll_no)).toEqual(["c", "b", "a"]);
  });
});
