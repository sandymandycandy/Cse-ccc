import { describe, it, expect } from "vitest";
import { istLocalToUTC, istLocalInput, istNumericDate } from "./datetime";

// IST is UTC+5:30 with no DST, so 09:00 IST == 03:30 UTC on the same date.

describe("istLocalToUTC", () => {
  it("reads a datetime-local value as IST wall-clock and returns the UTC instant", () => {
    expect(istLocalToUTC("2026-08-21T09:00")).toBe("2026-08-21T03:30:00.000Z");
  });

  it("handles an IST time that rolls back to the previous UTC day", () => {
    // 04:00 IST on the 21st is 22:30 UTC on the 20th.
    expect(istLocalToUTC("2026-08-21T04:00")).toBe("2026-08-20T22:30:00.000Z");
  });

  it("returns null for a malformed value", () => {
    expect(istLocalToUTC("not-a-date")).toBeNull();
    expect(istLocalToUTC("2026-08-21")).toBeNull();
  });
});

describe("istLocalInput", () => {
  it("formats a UTC instant back to an IST datetime-local string", () => {
    expect(istLocalInput("2026-08-21T03:30:00.000Z")).toBe("2026-08-21T09:00");
  });

  it("crosses the IST date boundary correctly", () => {
    // 20:00 UTC on the 21st is 01:30 IST on the 22nd.
    expect(istLocalInput("2026-08-21T20:00:00.000Z")).toBe("2026-08-22T01:30");
  });
});

describe("istLocalToUTC ↔ istLocalInput round-trip", () => {
  for (const wall of [
    "2026-08-21T09:00",
    "2026-01-01T00:00",
    "2026-12-31T23:59",
    "2026-08-21T00:15",
  ]) {
    it(`round-trips ${wall}`, () => {
      const utc = istLocalToUTC(wall);
      expect(utc).not.toBeNull();
      expect(istLocalInput(utc as string)).toBe(wall);
    });
  }
});

describe("istNumericDate", () => {
  it("formats an instant as dd/mm/yyyy in IST", () => {
    expect(istNumericDate("2026-08-21T03:30:00.000Z")).toBe("21/08/2026");
  });

  it("uses the IST calendar day, not the UTC day", () => {
    // 20:00 UTC on the 21st is already the 22nd in IST.
    expect(istNumericDate("2026-08-21T20:00:00.000Z")).toBe("22/08/2026");
  });
});
