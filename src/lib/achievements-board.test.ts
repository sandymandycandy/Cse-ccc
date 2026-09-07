import { describe, expect, it } from "vitest";
import type { PublishedResult } from "@/lib/queries";
import {
  type BoardEntry,
  type Winner,
  groupByRank,
  mergeBoard,
  parseWinners,
  winnersFromResults,
} from "@/lib/achievements-board";

function res(over: Partial<PublishedResult> = {}): PublishedResult {
  return {
    roll_no: "VTU00001",
    display_name: "A Person",
    team_name: null,
    team_members: null,
    rank: 1,
    score: 10,
    advanced: false,
    remarks: null,
    ...over,
  };
}

function entry(over: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: "x",
    kind: "manual",
    title: "A win",
    clubName: null,
    date: "2026-01-01",
    fallbackDate: "2026-01-01T00:00:00.000Z",
    winners: [],
    description: null,
    imageUrl: null,
    href: null,
    ...over,
  };
}

describe("parseWinners", () => {
  it("keeps well-formed rows", () => {
    expect(
      parseWinners([{ rank: 1, name: "Rahul K", roll: "VTU28001" }]),
    ).toEqual([{ rank: 1, name: "Rahul K", roll: "VTU28001" }]);
  });

  it("returns [] for null, a non-array, and an empty array", () => {
    expect(parseWinners(null)).toEqual([]);
    expect(parseWinners({ rank: 1 })).toEqual([]);
    expect(parseWinners([])).toEqual([]);
  });

  it("drops a malformed row and keeps the good ones", () => {
    const out = parseWinners([
      { rank: 1, name: "Good" },
      { rank: 9, name: "Bad rank" },
      { rank: 2, name: "" },
      null,
      "nonsense",
      { rank: 3, name: "Also good", roll: "VTU2" },
    ]);
    expect(out).toEqual([
      { rank: 1, name: "Good", roll: null },
      { rank: 3, name: "Also good", roll: "VTU2" },
    ]);
  });

  it("blanks an empty roll to null and trims", () => {
    expect(parseWinners([{ rank: 2, name: "  Priya  ", roll: "   " }])).toEqual([
      { rank: 2, name: "Priya", roll: null },
    ]);
  });
});

describe("winnersFromResults", () => {
  it("preserves a tied third as two rank-3 winners", () => {
    const out = winnersFromResults([
      res({ rank: 1, display_name: "First", roll_no: "R1" }),
      res({ rank: 3, display_name: "Third A", roll_no: "R3a" }),
      res({ rank: 3, display_name: "Third B", roll_no: "R3b" }),
    ]);
    expect(out.filter((w) => w.rank === 3)).toHaveLength(2);
  });

  it("drops entrants ranked below third", () => {
    const out = winnersFromResults([
      res({ rank: 1, roll_no: "R1" }),
      res({ rank: 4, roll_no: "R4" }),
      res({ rank: null, roll_no: "R0" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("expands a team standing into one row per member, sharing the rank", () => {
    const out = winnersFromResults([
      res({
        rank: 2,
        display_name: "Captain",
        roll_no: "RC",
        team_name: "ByteForce",
        team_members: [{ name: "Mate One", roll: "RM1" }],
      }),
    ]);
    expect(out).toEqual([
      { rank: 2, name: "Captain", roll: "RC" },
      { rank: 2, name: "Mate One", roll: "RM1" },
    ]);
  });
});

describe("groupByRank", () => {
  it("buckets 1/2/3 in order and lets a tie share a bucket", () => {
    const winners: Winner[] = [
      { rank: 3, name: "C", roll: null },
      { rank: 1, name: "A", roll: null },
      { rank: 3, name: "D", roll: null },
    ];
    const groups = groupByRank(winners);
    expect(groups.map((g) => g.rank)).toEqual([1, 3]);
    expect(groups[1].winners.map((w) => w.name)).toEqual(["C", "D"]);
  });

  it("omits a rank nobody holds", () => {
    expect(groupByRank([{ rank: 2, name: "B", roll: null }])).toHaveLength(1);
  });
});

describe("mergeBoard", () => {
  it("orders newest first across both sources", () => {
    const out = mergeBoard(
      [entry({ id: "auto", kind: "event", date: "2026-09-02T04:00:00.000Z" })],
      [entry({ id: "old", date: "2026-03-14" })],
    );
    expect(out.map((e) => e.id)).toEqual(["auto", "old"]);
  });

  it("falls back to created_at when a manual entry has no happened_on", () => {
    const out = mergeBoard(
      [],
      [
        entry({ id: "dated", date: "2026-01-05" }),
        entry({ id: "undated", date: null, fallbackDate: "2026-06-01T00:00:00.000Z" }),
      ],
    );
    expect(out.map((e) => e.id)).toEqual(["undated", "dated"]);
  });
});
