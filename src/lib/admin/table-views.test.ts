import { describe, it, expect } from "vitest";
import { ALL_VIEW, deriveViews, describeCount, isWideTable } from "./table-views";

describe("deriveViews", () => {
  it("prefixes All and counts each distinct status once", () => {
    expect(deriveViews(["Draft", "Published", "Draft"])).toEqual([
      { label: ALL_VIEW, count: 3 },
      { label: "Draft", count: 2 },
      { label: "Published", count: 1 },
    ]);
  });

  it("keeps first-seen order, not alphabetical", () => {
    expect(deriveViews(["Published", "Draft"]).map((v) => v.label))
      .toEqual([ALL_VIEW, "Published", "Draft"]);
  });

  it("returns [] when no row carries a status, so the chip row is suppressed", () => {
    // A lone "All" chip is a control that cannot do anything.
    expect(deriveViews([])).toEqual([]);
    expect(deriveViews([undefined, null, ""])).toEqual([]);
  });

  it("counts All over every row, including ones with no status", () => {
    const views = deriveViews(["Draft", undefined, null]);
    expect(views[0]).toEqual({ label: ALL_VIEW, count: 3 });
    expect(views[1]).toEqual({ label: "Draft", count: 1 });
  });
});

describe("describeCount", () => {
  it("names only the total when nothing is filtered", () => {
    expect(describeCount({ shown: 18, total: 18 })).toBe("18 rows");
  });

  it("singularises a one-row table", () => {
    expect(describeCount({ shown: 1, total: 1 })).toBe("1 row");
  });

  it("uses the screen's own noun", () => {
    expect(describeCount({ shown: 3, total: 3, noun: "session" })).toBe("3 sessions");
  });

  it("takes an explicit plural where adding an s would be wrong", () => {
    expect(describeCount({ shown: 3, total: 3, noun: "entry", nounPlural: "entries" }))
      .toBe("3 entries");
    expect(describeCount({ shown: 1, total: 1, noun: "entry", nounPlural: "entries" }))
      .toBe("1 entry");
  });

  it("names every active narrowing, in the order they apply", () => {
    expect(
      describeCount({ shown: 7, total: 18, view: "Pending", query: "ctf" }),
    ).toBe("7 of 18 rows · Pending · “ctf”");
  });

  it("omits the view when it is All, and the query when it is blank", () => {
    expect(describeCount({ shown: 7, total: 18, query: "ctf" }))
      .toBe("7 of 18 rows · “ctf”");
    expect(describeCount({ shown: 7, total: 18, view: "Pending" }))
      .toBe("7 of 18 rows · Pending");
  });

  it("treats a whitespace-only query as unfiltered", () => {
    expect(describeCount({ shown: 18, total: 18, query: "   " })).toBe("18 rows");
  });

  it("still reports the total when a filter matches nothing", () => {
    expect(describeCount({ shown: 0, total: 18, query: "zz" }))
      .toBe("0 of 18 rows · “zz”");
  });
});

describe("isWideTable", () => {
  it("turns the edge fade on at six columns, not five", () => {
    expect(isWideTable(5)).toBe(false);
    expect(isWideTable(6)).toBe(true);
  });
});
