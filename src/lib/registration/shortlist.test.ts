import { describe, expect, it } from "vitest";
import {
  attendanceRows,
  decisionPatch,
  defaultGroupField,
  filterReview,
  groupFields,
  groupReview,
  pendingCount,
  reviewCounts,
  searchedCounts,
  segmentClick,
  shortlistState,
  type ShortlistState,
} from "./shortlist";
import type { FormField } from "@/lib/registration-form/schema";

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

describe("searchedCounts", () => {
  const items = [
    { id: "a", state: "picked" as ShortlistState, search: ["Owls"] },
    { id: "b", state: "picked" as ShortlistState, search: ["Hawks"] },
    { id: "c", state: "waitlist" as ShortlistState, search: ["Owlets"] },
  ];
  it("counts only what the search matches, per category", () => {
    expect(searchedCounts(items, "owl")).toEqual({ All: 2, "Not decided": 0, Shortlisted: 1, "Waiting list": 1 });
    expect(searchedCounts(items, "")).toEqual({ All: 3, "Not decided": 0, Shortlisted: 2, "Waiting list": 1 });
  });
});

describe("segmentClick", () => {
  it("a category already held does nothing", () => {
    expect(segmentClick("picked", "shortlist", false)).toEqual({ kind: "noop" });
  });
  it("any change to an un-emailed team saves at once", () => {
    expect(segmentClick("picked", "waitlist", false)).toEqual({ kind: "save", decision: "waitlist" });
    expect(segmentClick("undecided", "shortlist", false)).toEqual({ kind: "save", decision: "shortlist" });
  });
  it("moving an emailed team away asks first", () => {
    expect(segmentClick("finalised", "waitlist", false)).toEqual({ kind: "ask", decision: "waitlist" });
  });
  it("while the warning is open another segment only changes what is asked — it never saves", () => {
    expect(segmentClick("finalised", null, true)).toEqual({ kind: "ask", decision: null });
    expect(segmentClick("finalised", "shortlist", true)).toEqual({ kind: "cancel" });
  });
});

describe("grouping by a choice question", () => {
  const schema = [
    { id: "team_name", kind: "short_text", identity: "team_name", label: "Team name", required: true },
    { id: "year", kind: "dropdown", identity: "year", label: "Year", required: true, options: ["1", "2", "3", "4"] },
    { id: "ieee", kind: "radio", identity: null, label: "Are u a IEEE member", required: true, options: ["Yes", "No"] },
    { id: "th", kind: "radio", identity: null, label: "Choose the theme", required: true, options: ["Theme-1 - Green", "Theme-2 - Agents"] },
    { id: "link", kind: "link", identity: null, label: "Idea", required: true },
  ] as FormField[];

  it("offers only choice questions, and defaults to the theme/track one", () => {
    const fields = groupFields(schema);
    expect(fields.map((f) => f.id)).toEqual(["year", "ieee", "th"]);
    expect(defaultGroupField(fields)).toBe("th");
    expect(defaultGroupField(fields.filter((f) => f.id !== "th"))).toBeNull();
  });

  const it_ = (id: string, th: string | null) => ({ id, choices: { th } });
  const th = { id: "th", label: "Choose the theme", options: ["Theme-1 - Green", "Theme-2 - Agents"] };

  it("groups in option order; unknown answers after; unanswered last; empty groups dropped", () => {
    const groups = groupReview([it_("a", "Theme-2 - Agents"), it_("b", null), it_("c", "Theme-2 - Agents"), it_("d", "Something else")], th);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Theme-2 - Agents", ["a", "c"]],
      ["Something else", ["d"]],
      ["Not answered", ["b"]],
    ]);
  });

  it("no field → one unlabelled group of everything", () => {
    const groups = groupReview([it_("a", "x"), it_("b", null)], null);
    expect(groups).toEqual([{ key: "", label: "", items: [it_("a", "x"), it_("b", null)] }]);
  });
});
