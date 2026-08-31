import { describe, it, expect } from "vitest";
import { isAttendanceEligible } from "./attendance-eligibility";

describe("isAttendanceEligible", () => {
  it("seats: every confirmed registrant is eligible regardless of shortlist state", () => {
    expect(isAttendanceEligible({ shortlistedAt: null }, "seats")).toBe(true);
    expect(
      isAttendanceEligible({ shortlistedAt: "2026-08-31T00:00:00Z" }, "seats"),
    ).toBe(true);
  });

  it("shortlist: only shortlisted registrants are eligible", () => {
    expect(
      isAttendanceEligible({ shortlistedAt: "2026-08-31T00:00:00Z" }, "shortlist"),
    ).toBe(true);
    expect(isAttendanceEligible({ shortlistedAt: null }, "shortlist")).toBe(false);
  });
});
