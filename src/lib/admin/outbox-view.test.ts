import { describe, it, expect } from "vitest";
import { DAILY_CEILING, ceilingPercent, statusTone } from "./outbox-view";

describe("statusTone", () => {
  it("maps every email_status the column can hold", () => {
    expect(statusTone("sent")).toBe("sent");
    expect(statusTone("pending")).toBe("pending");
    expect(statusTone("failed")).toBe("failed");
  });

  // The panel takes `status: string`, not the enum — a value added to
  // `email_status` later must not render an unstyled badge with no background.
  it("falls back to pending for a status it does not know", () => {
    expect(statusTone("bounced")).toBe("pending");
    expect(statusTone("")).toBe("pending");
  });
});

describe("ceilingPercent", () => {
  it("reports the share of the day's allowance used", () => {
    expect(ceilingPercent(0)).toBe(0);
    expect(ceilingPercent(250)).toBe(50);
    expect(ceilingPercent(DAILY_CEILING)).toBe(100);
  });

  it("rounds to a whole percent, so aria-valuenow is an integer", () => {
    expect(ceilingPercent(1)).toBe(0);
    expect(ceilingPercent(7)).toBe(1);
    expect(Number.isInteger(ceilingPercent(333))).toBe(true);
  });

  // 100 is what the panel colours the bar for, so it has to mean the allowance
  // is actually gone. Rounding to nearest would call the day over at 499.
  it("reaches 100 only when the allowance really is spent", () => {
    expect(ceilingPercent(499)).toBe(99);
    expect(ceilingPercent(500)).toBe(100);
  });

  // Gmail's real ceiling moves, and the cron can overshoot a little. The bar
  // must read "full", never overflow its track.
  it("clamps past the ceiling rather than overflowing the bar", () => {
    expect(ceilingPercent(900)).toBe(100);
  });

  it("clamps a nonsense count to zero instead of a negative width", () => {
    expect(ceilingPercent(-5)).toBe(0);
    expect(ceilingPercent(Number.NaN)).toBe(0);
  });

  it("does not divide by zero if the ceiling is ever configured away", () => {
    expect(ceilingPercent(10, 0)).toBe(0);
  });
});
