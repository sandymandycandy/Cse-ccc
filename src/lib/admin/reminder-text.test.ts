import { describe, expect, it } from "vitest";
import { reminderText, type ReminderEvent } from "./reminder-text";

const base: ReminderEvent = {
  title: "Hackathon 2026",
  startsAt: "2026-09-20T04:30:00.000Z", // 10:00 IST, Sunday
  endsAt: "2026-09-20T07:30:00.000Z", // 13:00 IST
  isAllDay: false,
  venue: "Seminar Hall 2",
};

describe("reminderText", () => {
  // The date strings here are whatever the shared `datetime.ts` helpers
  // produce. They format with `en-US`, so the order is American — the doc
  // comments there claim "21 Aug 2026" but the code yields "Aug 21, 2026". The
  // reminder must read like the rest of the site, so it follows the code.
  it("names the event and its date in the subject", () => {
    expect(reminderText(base).subject).toBe("Reminder: Hackathon 2026 is on Sep 20, 2026");
  });

  it("gives the full date, the time range and the venue in the body", () => {
    const { body } = reminderText(base);
    expect(body).toContain("Sunday, September 20, 2026");
    expect(body).toContain("10:00 AM – 1:00 PM");
    expect(body).toContain("Seminar Hall 2");
  });

  it("says all day instead of a time range for an all-day event", () => {
    const { body } = reminderText({ ...base, isAllDay: true });
    expect(body).toContain("all day");
    expect(body).not.toContain("10:00 AM");
  });

  it("falls back to TBA when no venue is set, matching the public pages", () => {
    expect(reminderText({ ...base, venue: null }).body).toContain("TBA");
  });

  it("never returns an empty subject or body", () => {
    const out = reminderText({ ...base, title: "X", venue: null });
    expect(out.subject.length).toBeGreaterThan(10);
    expect(out.body.length).toBeGreaterThan(30);
  });
});
