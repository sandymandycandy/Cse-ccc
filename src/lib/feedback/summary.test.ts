import { describe, it, expect } from "vitest";
import { summariseByClub, duplicateVtus, type ResponseForSummary } from "./summary";

const row = (o: Partial<ResponseForSummary> = {}): ResponseForSummary => ({
  clubId: "c1",
  vtu: "vtu1",
  clubRating: 4,
  headRating: 4,
  viceRating: 4,
  ...o,
});

describe("summariseByClub", () => {
  it("returns nothing for no rows", () => {
    expect(summariseByClub([])).toEqual([]);
  });

  it("counts responses and averages each rating", () => {
    const [s] = summariseByClub([
      row({ clubRating: 5, headRating: 4, viceRating: 3 }),
      row({ clubRating: 4, headRating: 3, viceRating: 2 }),
    ]);
    expect(s.responses).toBe(2);
    expect(s.clubAvg).toBe(4.5);
    expect(s.headAvg).toBe(3.5);
    expect(s.viceAvg).toBe(2.5);
  });

  it("rounds to one decimal", () => {
    const [s] = summariseByClub([
      row({ clubRating: 4 }),
      row({ clubRating: 4 }),
      row({ clubRating: 5 }),
    ]);
    expect(s.clubAvg).toBe(4.3);
  });

  it("ignores null ratings in the average rather than counting them as zero", () => {
    const [s] = summariseByClub([row({ headRating: 5 }), row({ headRating: null })]);
    expect(s.headAvg).toBe(5);
    expect(s.responses).toBe(2);
  });

  it("gives a null average when every rating for a target is null", () => {
    const [s] = summariseByClub([row({ viceRating: null }), row({ viceRating: null })]);
    expect(s.viceAvg).toBeNull();
  });

  it("groups by club", () => {
    const out = summariseByClub([
      row({ clubId: "a", clubRating: 5 }),
      row({ clubId: "b", clubRating: 1 }),
      row({ clubId: "a", clubRating: 3 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.clubId === "a")?.responses).toBe(2);
    expect(out.find((s) => s.clubId === "b")?.clubAvg).toBe(1);
  });
});

describe("duplicateVtus", () => {
  it("is empty when every VTU is distinct", () => {
    expect(duplicateVtus([{ vtu: "a" }, { vtu: "b" }]).size).toBe(0);
  });

  it("flags a VTU appearing more than once", () => {
    const d = duplicateVtus([{ vtu: "a" }, { vtu: "b" }, { vtu: "a" }]);
    expect(d.has("a")).toBe(true);
    expect(d.has("b")).toBe(false);
  });

  it("compares case- and whitespace-insensitively", () => {
    const d = duplicateVtus([{ vtu: "VTU1" }, { vtu: " vtu1 " }]);
    expect(d.has("vtu1")).toBe(true);
  });
});
