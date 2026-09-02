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
    });
  });

  it("a finished event with no results offers nothing to click", () => {
    // "Register" on a finished event is a dead end — it was there before.
    expect(eventCta(ev({ isPast: true }))).toEqual({
      primary: "ended",
      secondaryResults: false,
    });
  });

  it("an open upcoming event still leads with Register", () => {
    expect(eventCta(ev())).toEqual({ primary: "register", secondaryResults: false });
    expect(eventCta(ev({ status: "fast" }))).toEqual({
      primary: "register",
      secondaryResults: false,
    });
  });

  it("a full upcoming event still leads with the waitlist", () => {
    expect(eventCta(ev({ status: "full" }))).toEqual({
      primary: "waitlist",
      secondaryResults: false,
    });
  });

  it("an upcoming event that already has results keeps Register primary", () => {
    // Registration is the point while it is still open; results ride alongside.
    expect(eventCta(ev({ hasResults: true }))).toEqual({
      primary: "register",
      secondaryResults: true,
    });
    expect(eventCta(ev({ hasResults: true, status: "full" }))).toEqual({
      primary: "waitlist",
      secondaryResults: true,
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
