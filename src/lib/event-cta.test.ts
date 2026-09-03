import { describe, it, expect } from "vitest";
import { eventCta } from "./event-cta";

const ev = (over: Partial<Parameters<typeof eventCta>[0]> = {}) => ({
  isPast: false,
  hasResults: false,
  status: "open" as const,
  ...over,
});

describe("eventCta — which button a public event row offers", () => {
  it("a finished event with published results leads with the results", () => {
    expect(eventCta(ev({ isPast: true, hasResults: true }))).toEqual({
      primary: "results",
      secondaryResults: false,
      showSeats: false,
    });
  });

  it("a finished event with no results offers nothing to click", () => {
    // "Register" on a finished event is a dead end — it was there before.
    expect(eventCta(ev({ isPast: true }))).toEqual({
      primary: "ended",
      secondaryResults: false,
      showSeats: false,
    });
  });

  it("an open upcoming event still leads with Register", () => {
    expect(eventCta(ev())).toEqual({
      primary: "register",
      secondaryResults: false,
      showSeats: true,
    });
    expect(eventCta(ev({ status: "fast" }))).toEqual({
      primary: "register",
      secondaryResults: false,
      showSeats: true,
    });
  });

  it("a full upcoming event still leads with the waitlist", () => {
    expect(eventCta(ev({ status: "full" }))).toEqual({
      primary: "waitlist",
      secondaryResults: false,
      showSeats: true,
    });
  });

  it("an upcoming event that already has results keeps Register primary", () => {
    // Registration is the point while it is still open; results ride alongside.
    expect(eventCta(ev({ hasResults: true }))).toEqual({
      primary: "register",
      secondaryResults: true,
      showSeats: true,
    });
    expect(eventCta(ev({ hasResults: true, status: "full" }))).toEqual({
      primary: "waitlist",
      secondaryResults: true,
      showSeats: true,
    });
  });

  it("never offers results when there are none", () => {
    for (const isPast of [true, false]) {
      for (const status of ["open", "fast", "full"] as const) {
        const cta = eventCta(ev({ isPast, status }));
        expect(cta.primary).not.toBe("results");
        expect(cta.secondaryResults).toBe(false);
      }
    }
  });
});

describe("eventCta — whether seat counts still mean anything", () => {
  it("hides seats on a finished event, whatever its seat status says", () => {
    // A finished event kept reporting "12 seats left" with an open badge, right
    // above an "Event ended" button. Nobody can take those seats.
    for (const status of ["open", "fast", "full"] as const) {
      for (const hasResults of [true, false]) {
        expect(eventCta(ev({ isPast: true, status, hasResults })).showSeats).toBe(false);
      }
    }
  });

  it("keeps seats on every upcoming event", () => {
    for (const status of ["open", "fast", "full"] as const) {
      for (const hasResults of [true, false]) {
        expect(eventCta(ev({ status, hasResults })).showSeats).toBe(true);
      }
    }
  });

  it("shows seats exactly when the event is not finished", () => {
    // The seat furniture and the dead-end button are the same decision, so they
    // must never disagree: no seats iff the CTA has given up on registration.
    for (const isPast of [true, false]) {
      for (const status of ["open", "fast", "full"] as const) {
        const cta = eventCta(ev({ isPast, status, hasResults: true }));
        const registrationLive = cta.primary === "register" || cta.primary === "waitlist";
        expect(cta.showSeats).toBe(registrationLive);
      }
    }
  });
});
