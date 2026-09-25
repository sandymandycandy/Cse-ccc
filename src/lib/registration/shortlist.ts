import { matchesAny } from "@/lib/admin/roster-filter";
import type { FormField } from "@/lib/registration-form/schema";

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

/** The category a state was chosen as — what the three-way switch shows. */
export function decisionOf(state: ShortlistState): ShortlistDecision {
  return state === "picked" || state === "finalised" ? "shortlist" : state === "waitlist" ? "waitlist" : null;
}

/** Per-category counts over what the search box currently matches. */
export function searchedCounts<T extends { state: ShortlistState; search: unknown[] }>(
  items: T[],
  query: string,
): Record<ReviewView, number> {
  return reviewCounts(filterReview(items, query, "All").map((i) => i.state));
}

export type SegmentOutcome =
  | { kind: "noop" }
  | { kind: "cancel" }
  | { kind: "save"; decision: ShortlistDecision }
  | { kind: "ask"; decision: ShortlistDecision };

/**
 * What a click on the three-way switch does. An emailed team is never moved
 * out by the switch alone: it opens a warning, and while that warning is open
 * another segment only changes what the warning asks (its own Confirm saves).
 */
export function segmentClick(
  state: ShortlistState,
  decision: ShortlistDecision,
  warningOpen: boolean,
): SegmentOutcome {
  const current = decisionOf(state);
  if (warningOpen) return decision === current ? { kind: "cancel" } : { kind: "ask", decision };
  if (decision === current) return { kind: "noop" };
  if (state === "finalised") return { kind: "ask", decision };
  return { kind: "save", decision };
}

/** A single-answer choice question the review page can group teams by. */
export interface GroupField {
  id: string;
  label: string;
  options: string[];
}

export function groupFields(schema: FormField[]): GroupField[] {
  return schema
    .filter((f) => (f.kind === "radio" || f.kind === "dropdown") && (f.options?.length ?? 0) > 0)
    .map((f) => ({ id: f.id, label: f.label, options: f.options ?? [] }));
}

/** Group by the event's theme / track question when it has one; otherwise not at all. */
export function defaultGroupField(fields: GroupField[]): string | null {
  return fields.find((f) => /theme|track/i.test(f.label))?.id ?? null;
}

export interface ReviewGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Teams sectioned by their answer to one choice question: the form's options in
 * order, then any other answer ("Other" free text), then the unanswered. Empty
 * groups are dropped. With no field, everything is one unlabelled group.
 */
export function groupReview<T extends { choices: Record<string, string | null> }>(
  items: T[],
  field: GroupField | null,
): ReviewGroup<T>[] {
  if (!field) return [{ key: "", label: "", items }];
  const byAnswer = new Map<string, T[]>();
  const none: T[] = [];
  for (const item of items) {
    const answer = item.choices[field.id]?.trim();
    if (!answer) none.push(item);
    else byAnswer.set(answer, [...(byAnswer.get(answer) ?? []), item]);
  }
  const extras = [...byAnswer.keys()].filter((a) => !field.options.includes(a));
  const groups: ReviewGroup<T>[] = [...field.options, ...extras]
    .filter((a) => byAnswer.has(a))
    .map((a) => ({ key: a, label: a, items: byAnswer.get(a) ?? [] }));
  if (none.length) groups.push({ key: "\u0000none", label: "Not answered", items: none });
  return groups;
}
