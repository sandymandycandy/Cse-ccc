import { matchesAny } from "@/lib/admin/roster-filter";

/**
 * Shortlist review (spec 2026-09-25). Pure and client-safe: the review page's
 * chips and search run in the browser; the actions reuse the patches.
 *
 * `shortlist_decision` is the organiser's draft category; `shortlisted_at` means
 * finalised — the team was emailed and is in attendance.
 */
export type ShortlistDecision = "shortlist" | "waitlist" | null;
export type ShortlistState = "undecided" | "waitlist" | "picked" | "finalised";

export function shortlistState(r: {
  shortlistDecision: ShortlistDecision;
  shortlistedAt: string | null;
}): ShortlistState {
  if (r.shortlistDecision === "shortlist") return r.shortlistedAt ? "finalised" : "picked";
  if (r.shortlistDecision === "waitlist") return "waitlist";
  return "undecided";
}

export const STATE_LABEL: Record<ShortlistState, string> = {
  undecided: "Not decided",
  waitlist: "Waiting list",
  picked: "Shortlisted",
  finalised: "Shortlisted · emailed",
};

export type ReviewView = "All" | "Not decided" | "Shortlisted" | "Waiting list";
export const REVIEW_VIEWS: ReviewView[] = ["All", "Not decided", "Shortlisted", "Waiting list"];

export function inView(state: ShortlistState, view: ReviewView): boolean {
  switch (view) {
    case "All": return true;
    case "Not decided": return state === "undecided";
    case "Shortlisted": return state === "picked" || state === "finalised";
    case "Waiting list": return state === "waitlist";
  }
}

export function reviewCounts(states: ShortlistState[]): Record<ReviewView, number> {
  const out: Record<ReviewView, number> = { All: 0, "Not decided": 0, Shortlisted: 0, "Waiting list": 0 };
  for (const s of states) for (const v of REVIEW_VIEWS) if (inView(s, v)) out[v]++;
  return out;
}

export function filterReview<T extends { state: ShortlistState; search: unknown[] }>(
  items: T[],
  query: string,
  view: ReviewView,
): T[] {
  return items.filter((i) => inView(i.state, view) && matchesAny(i.search, query));
}

/** Teams Finalise would email now: shortlisted, not yet emailed. */
export function pendingCount(states: ShortlistState[]): number {
  return states.filter((s) => s === "picked").length;
}

export type DecisionPatch =
  | { shortlist_decision: "shortlist" }
  | {
      shortlist_decision: "waitlist" | null;
      shortlisted_at: null;
      attended: false;
      absent_members: number[];
      checked_in_at: null;
      checked_in_by: null;
      checkin_method: null;
    };

/**
 * The row update for a category change. Leaving Shortlisted un-finalises the
 * team and wipes its attendance — certificates follow `attended`, so a removed
 * team must not keep one.
 */
export function decisionPatch(next: ShortlistDecision): DecisionPatch {
  if (next === "shortlist") return { shortlist_decision: "shortlist" };
  return {
    shortlist_decision: next,
    shortlisted_at: null,
    attended: false,
    absent_members: [],
    checked_in_at: null,
    checked_in_by: null,
    checkin_method: null,
  };
}

/** Who the attendance page lists: seats → everyone given; shortlist → finalised only. */
export function attendanceRows<T extends { shortlistedAt: string | null }>(
  rows: T[],
  mode: "seats" | "shortlist",
): T[] {
  return mode === "shortlist" ? rows.filter((r) => r.shortlistedAt != null) : rows;
}
