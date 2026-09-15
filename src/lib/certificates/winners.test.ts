import { describe, it, expect } from "vitest";
import {
  detectPositionColumn,
  parsePosition,
  placeText,
  placeWords,
  podiumRound,
  standingsOf,
  type StandingLike,
} from "./winners";

const standing = (over: Partial<StandingLike> = {}): StandingLike => ({
  roll_no: "VTU27001",
  display_name: "Asha R",
  team_name: null,
  team_members: null,
  rank: 1,
  registration_id: null,
  ...over,
});

describe("podiumRound", () => {
  const published = [{ published_at: "2026-09-10T00:00:00Z" }];
  const draft = [{ published_at: null }];

  it("takes the highest-sort round that has published results", () => {
    const rounds = [
      { sort: 0, name: "Prelims", results: published },
      { sort: 1, name: "Final", results: published },
    ];
    expect(podiumRound(rounds)?.name).toBe("Final");
  });

  it("skips a later round nobody has played yet", () => {
    const rounds = [
      { sort: 0, name: "Prelims", results: published },
      { sort: 1, name: "Final", results: draft },
      { sort: 2, name: "Grand final", results: [] },
    ];
    expect(podiumRound(rounds)?.name).toBe("Prelims");
  });

  it("is null when nothing is published", () => {
    expect(podiumRound([{ sort: 0, results: draft }])).toBeNull();
    expect(podiumRound([])).toBeNull();
  });

  it("does not reorder the caller's array", () => {
    const rounds = [
      { sort: 0, results: published },
      { sort: 1, results: published },
    ];
    podiumRound(rounds);
    expect(rounds.map((r) => r.sort)).toEqual([0, 1]);
  });
});

describe("standingsOf", () => {
  it("keeps every tied place, in rank order", () => {
    const out = standingsOf([
      standing({ rank: 3, roll_no: "C", display_name: "Cee" }),
      standing({ rank: 1, roll_no: "A", display_name: "Ay" }),
      standing({ rank: 3, roll_no: "D", display_name: "Dee" }),
      standing({ rank: 2, roll_no: "B", display_name: "Bee" }),
    ]);
    expect(out.map((s) => [s.place, s.rollNo])).toEqual([
      [1, "A"],
      [2, "B"],
      [3, "C"],
      [3, "D"],
    ]);
  });

  it("drops anyone off the podium, and anyone unranked", () => {
    const out = standingsOf([standing({ rank: 4 }), standing({ rank: null }), standing({ rank: 2 })]);
    expect(out.map((s) => s.place)).toEqual([2]);
  });

  it("carries the team and its members, defaulting members to an empty list", () => {
    const [team] = standingsOf([
      standing({ rank: 1, team_name: "Byte Me", team_members: [{ name: "Ravi", roll: "VTU27099" }], registration_id: "r1" }),
    ]);
    expect(team).toMatchObject({
      place: 1,
      teamName: "Byte Me",
      teamMembers: [{ name: "Ravi", roll: "VTU27099" }],
      registrationId: "r1",
    });
    expect(standingsOf([standing()])[0].teamMembers).toEqual([]);
  });
});

describe("place wording", () => {
  it("prints the short and long forms", () => {
    expect([placeText(1), placeText(2), placeText(3)]).toEqual(["1st", "2nd", "3rd"]);
    expect([placeWords(1), placeWords(2), placeWords(3)]).toEqual(["First", "Second", "Third"]);
  });
});

describe("parsePosition", () => {
  it("normalises the ways people write a placing", () => {
    for (const raw of ["1", " 1st ", "First", "FIRST", "1ST"]) expect(parsePosition(raw)).toBe("1st");
    expect(parsePosition("2nd")).toBe("2nd");
    expect(parsePosition("third")).toBe("3rd");
  });

  it("prints anything else exactly as typed — predictable beats clever", () => {
    expect(parsePosition("Runner-up")).toBe("Runner-up");
    expect(parsePosition("Best UI")).toBe("Best UI");
    expect(parsePosition("4th")).toBe("4th");
    expect(parsePosition("  ")).toBe("");
  });
});

describe("detectPositionColumn", () => {
  it("finds the column that holds the placing", () => {
    expect(detectPositionColumn(["Name", "Position", "Email"])).toBe(1);
    expect(detectPositionColumn(["Rank", "Name"])).toBe(0);
    expect(detectPositionColumn(["Name", "Place"])).toBe(1);
    expect(detectPositionColumn(["Name", "Prize"])).toBe(1);
  });

  it("is null when the sheet has no such column", () => {
    expect(detectPositionColumn(["Name", "Email"])).toBeNull();
    expect(detectPositionColumn([])).toBeNull();
  });
});
