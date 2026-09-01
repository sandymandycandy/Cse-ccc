import { describe, it, expect } from "vitest";
import { registrationPhase } from "./phase";

const T = (iso: string) => new Date(iso).getTime();

describe("registrationPhase", () => {
  it("is 'open' when there is no schedule", () => {
    expect(registrationPhase(T("2026-09-01T00:00:00Z"), null, null)).toBe("open");
  });
  it("is 'before' strictly before the open time", () => {
    expect(registrationPhase(T("2026-09-01T10:00:00Z"), "2026-09-01T11:30:00Z", null)).toBe("before");
  });
  it("is 'open' between open and close", () => {
    expect(
      registrationPhase(T("2026-09-01T12:00:00Z"), "2026-09-01T11:30:00Z", "2026-09-03T11:30:00Z"),
    ).toBe("open");
  });
  it("is 'closed' after the close time", () => {
    expect(
      registrationPhase(T("2026-09-04T00:00:00Z"), "2026-09-01T11:30:00Z", "2026-09-03T11:30:00Z"),
    ).toBe("closed");
  });
  it("opens exactly at the open instant (inclusive)", () => {
    expect(registrationPhase(T("2026-09-01T11:30:00Z"), "2026-09-01T11:30:00Z", null)).toBe("open");
  });
});
