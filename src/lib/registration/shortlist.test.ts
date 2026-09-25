import { describe, expect, it } from "vitest";
import {
  attendanceRows,
  decisionPatch,
  filterReview,
  pendingCount,
  reviewCounts,
  shortlistState,
  type ShortlistState,
} from "./shortlist";

describe("shortlistState", () => {
  it("maps decision × finalised to four states", () => {
    expect(shortlistState({ shortlistDecision: null, shortlistedAt: null })).toBe("undecided");
    expect(shortlistState({ shortlistDecision: "waitlist", shortlistedAt: null })).toBe("waitlist");
    expect(shortlistState({ shortlistDecision: "shortlist", shortlistedAt: null })).toBe("picked");
    expect(shortlistState({ shortlistDecision: "shortlist", shortlistedAt: "2026-09-25T00:00:00Z" })).toBe("finalised");
  });
});

describe("review filtering", () => {
  const items = [
    { id: "a", state: "undecided" as ShortlistState, search: ["Owls", { team: [{ n: "Asha" }] }] },
    { id: "b", state: "picked" as ShortlistState, search: ["Hawks"] },
    { id: "c", state: "finalised" as ShortlistState, search: ["Crows"] },
    { id: "d", state: "waitlist" as ShortlistState, search: ["Doves", "Asha"] },
  ];

  it("counts: Shortlisted covers picked and finalised", () => {
    expect(reviewCounts(items.map((i) => i.state))).toEqual({
      All: 4, "Not decided": 1, Shortlisted: 2, "Waiting list": 1,
    });
  });

  it("filters by view and by any nested value, keeping teams whole", () => {
    expect(filterReview(items, "", "Shortlisted").map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterReview(items, "asha", "All").map((i) => i.id)).toEqual(["a", "d"]);
    expect(filterReview(items, "asha", "Waiting list").map((i) => i.id)).toEqual(["d"]);
  });

  it("pendingCount is shortlisted-not-yet-emailed only", () => {
    expect(pendingCount(items.map((i) => i.state))).toBe(1);
    expect(pendingCount(["finalised", "waitlist", "undecided"])).toBe(0);
  });
});

describe("decisionPatch", () => {
  it("to shortlist only sets the decision (finalise stamps shortlisted_at)", () => {
    expect(decisionPatch("shortlist")).toEqual({ shortlist_decision: "shortlist" });
  });

  it("away from shortlist clears finalisation and every attendance trace", () => {
    const cleared = {
      shortlisted_at: null, attended: false, absent_members: [],
      checked_in_at: null, checked_in_by: null, checkin_method: null,
    };
    expect(decisionPatch("waitlist")).toEqual({ shortlist_decision: "waitlist", ...cleared });
    expect(decisionPatch(null)).toEqual({ shortlist_decision: null, ...cleared });
  });
});

describe("attendanceRows", () => {
  const rows = [{ id: "x", shortlistedAt: null }, { id: "y", shortlistedAt: "2026-09-25T00:00:00Z" }];
  it("seats: every row passes through", () => {
    expect(attendanceRows(rows, "seats").map((r) => r.id)).toEqual(["x", "y"]);
  });
  it("shortlist: finalised rows only", () => {
    expect(attendanceRows(rows, "shortlist").map((r) => r.id)).toEqual(["y"]);
  });
});
