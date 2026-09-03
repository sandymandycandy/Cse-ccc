import type { SeatStatus } from "./types";

export interface EventCta {
  /** The single button that leads the row. */
  primary: "register" | "waitlist" | "results" | "ended";
  /** Show a secondary "View results" button beneath the primary one. */
  secondaryResults: boolean;
  /**
   * Whether seat counts, the seat badge and the fill bar still mean anything.
   * False once the event has finished — nobody can take those seats.
   */
  showSeats: boolean;
}

/**
 * Which button a public event row should offer.
 *
 * Pure so the rule lives in one testable place rather than being spelled out in
 * JSX. Two things it settles:
 *
 * - **A finished event leads with its results**, not with "Register". Register
 *   was previously shown on every past event, which is a dead end: the form is
 *   closed and clicking it tells the student nothing.
 * - **An event still taking sign-ups keeps Register primary** even if some
 *   standings are already published (multi-round events publish as they go), so
 *   the results ride alongside rather than displacing the point of the page.
 * - **A finished event shows no seat counts.** The seat badge, "N seats left"
 *   and the fill bar all describe an offer that has closed; leaving them up
 *   made a past event read "12 seats left" directly above "Event ended".
 *   Kept here, next to the button rule, so the two can never disagree.
 */
export function eventCta(event: {
  isPast: boolean;
  hasResults: boolean;
  status: SeatStatus;
}): EventCta {
  if (event.isPast) {
    return {
      primary: event.hasResults ? "results" : "ended",
      secondaryResults: false,
      showSeats: false,
    };
  }
  return {
    primary: event.status === "full" ? "waitlist" : "register",
    secondaryResults: event.hasResults,
    showSeats: true,
  };
}
