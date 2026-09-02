import { describe, it, expect } from "vitest";
import { splitRegistrations } from "./waitlist";
import type { RegistrationRow } from "@/lib/admin/registrations";

const row = (over: Partial<RegistrationRow>): RegistrationRow => ({
  id: "x",
  name: "A",
  roll: "r",
  department: null,
  year: null,
  email: "e",
  phone: null,
  teamName: null,
  confirmed: true,
  attended: false,
  method: null,
  customAnswers: null,
  shortlistedAt: null,
  waitlistPosition: null,
  ...over,
});

describe("splitRegistrations", () => {
  it("separates confirmed from waitlisted and orders the waitlist by position", () => {
    const rows = [
      row({ id: "c1", confirmed: true }),
      row({ id: "w2", confirmed: false, waitlistPosition: 2 }),
      row({ id: "w1", confirmed: false, waitlistPosition: 1 }),
    ];
    const { confirmed, waitlist } = splitRegistrations(rows);
    expect(confirmed.map((r) => r.id)).toEqual(["c1"]);
    expect(waitlist.map((r) => r.id)).toEqual(["w1", "w2"]);
  });
  it("ignores unconfirmed rows without a position", () => {
    const rows = [row({ id: "u", confirmed: false, waitlistPosition: null })];
    const { confirmed, waitlist } = splitRegistrations(rows);
    expect(confirmed).toHaveLength(0);
    expect(waitlist).toHaveLength(0);
  });
});
