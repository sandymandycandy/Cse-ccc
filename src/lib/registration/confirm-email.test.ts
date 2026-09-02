import { describe, it, expect } from "vitest";
import { registrationMail } from "./confirm-email";

const base = {
  eventTitle: "PITCH DESK",
  when: "2 Sep · 3:50 PM",
  venue: "Seminar Hall",
  teamName: null as string | null,
  position: null as number | null,
};

describe("registrationMail", () => {
  it("confirms a seat when the registration is registered", () => {
    const m = registrationMail({ ...base, status: "registered" });
    expect(m.subject).toBe("You're registered — PITCH DESK");
    expect(m.body).toMatch(/seat is confirmed/i);
  });

  it("says the application was received in shortlist mode", () => {
    const m = registrationMail({ ...base, status: "submitted" });
    expect(m.subject).toBe("Application received — PITCH DESK");
    // Nothing is promised: shortlist mode means a human still picks.
    expect(m.body).toMatch(/shortlisted/i);
    expect(m.body).not.toMatch(/seat is confirmed/i);
  });

  it("gives the waitlist position when waitlisted", () => {
    const m = registrationMail({ ...base, status: "waitlisted", position: 4 });
    expect(m.subject).toBe("You're on the waitlist — PITCH DESK");
    expect(m.details).toContainEqual({ label: "Waitlist position", value: "4" });
  });

  it("omits the position row when there is no position", () => {
    const m = registrationMail({ ...base, status: "waitlisted" });
    expect(m.details.some((d) => d.label === "Waitlist position")).toBe(false);
  });

  it("always names the event, when and where", () => {
    const m = registrationMail({ ...base, status: "registered" });
    expect(m.details).toContainEqual({ label: "Event", value: "PITCH DESK" });
    expect(m.details).toContainEqual({ label: "When", value: "2 Sep · 3:50 PM" });
    expect(m.details).toContainEqual({ label: "Where", value: "Seminar Hall" });
  });

  it("includes the team name only when there is one", () => {
    expect(registrationMail({ ...base, status: "registered", teamName: "Byte Squad" }).details)
      .toContainEqual({ label: "Team", value: "Byte Squad" });
    expect(registrationMail({ ...base, status: "registered" }).details
      .some((d) => d.label === "Team")).toBe(false);
  });

  it("skips a blank venue rather than printing an empty row", () => {
    const m = registrationMail({ ...base, status: "registered", venue: "" });
    expect(m.details.some((d) => d.label === "Where")).toBe(false);
  });

  it("tells every recipient why they got it — teammates did not fill the form", () => {
    // A member who never touched the form would otherwise wonder why they were
    // emailed at all.
    expect(registrationMail({ ...base, status: "registered" }).body).toMatch(/team/i);
  });
});
