import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventRow } from "./EventRow";
import type { EventSummary } from "@/lib/types";

/**
 * The site currently has no upcoming event, so the "seats still show" path
 * cannot be checked against live data. These render the row directly instead,
 * which also pins the regression that started this: a finished event was
 * reporting "12 seats left" and an open badge above an "Event ended" button.
 */

const row = (over: Partial<EventSummary> = {}): EventSummary => ({
  id: "e1",
  title: "Intro to ML",
  blurb: "A talk.",
  club: "Coding Club",
  day: "21",
  dateLabel: "Aug · Fri",
  timeLabel: "9:00 AM",
  venue: "Main Auditorium",
  registered: 18,
  capacity: 30,
  status: "open",
  hasResults: false,
  isPast: false,
  ...over,
});

const html = (event: EventSummary) => renderToStaticMarkup(<EventRow event={event} />);

describe("EventRow — seat furniture follows the event's life", () => {
  it("shows seats left, the fill bar and the badge on an upcoming event", () => {
    const out = html(row());
    expect(out).toContain("12 seats left");
    expect(out).toContain("18 of 30 seats filled");
    expect(out).toContain("Open");
    expect(out).toContain("Register");
  });

  it("shows the waitlist wording on a full upcoming event", () => {
    const out = html(row({ status: "full", registered: 30 }));
    expect(out).toContain("Waitlist");
    expect(out).toContain("Join waitlist");
    expect(out).toContain("30 of 30 seats filled");
  });

  it("drops every seat count on a finished event", () => {
    const out = html(row({ isPast: true }));
    expect(out).not.toContain("seats left");
    expect(out).not.toContain("seats filled");
    expect(out).not.toContain("progressbar");
    expect(out).toContain("Event ended");
  });

  it("drops the seat badge on a finished event", () => {
    // The badge said "Open" on an event nobody could register for.
    expect(html(row({ isPast: true, status: "open" }))).not.toContain(">Open<");
    expect(html(row({ isPast: true, status: "fast" }))).not.toContain("Filling fast");
  });

  it("still leads a finished event with its results", () => {
    const out = html(row({ isPast: true, hasResults: true }));
    expect(out).toContain("View results");
    expect(out).not.toContain("seats left");
  });

  it("keeps seats on an upcoming event that already has results", () => {
    // Multi-round events publish as they go while registration is still open.
    const out = html(row({ hasResults: true }));
    expect(out).toContain("12 seats left");
    expect(out).toContain("Register");
    expect(out).toContain("View results");
  });
});

describe("EventRow — an uncapped event has no seats to count", () => {
  // Capacity is optional on the admin form: blank means unlimited, stored as 0.
  const uncapped = (over: Partial<EventSummary> = {}) =>
    row({ capacity: 0, registered: 18, ...over });

  it("says Open entry instead of counting down from zero", () => {
    // capacity 0 made seatsLeft 0, so an unlimited event read "0 seats left".
    const out = html(uncapped());
    expect(out).toContain("Open entry");
    expect(out).not.toContain("0 seats left");
  });

  it("never prints a ratio against a zero capacity", () => {
    // "18/0" told the reader nothing and looked like a full event.
    expect(html(uncapped())).not.toContain("18/0");
  });

  it("drops the fill bar, which has no denominator", () => {
    const out = html(uncapped());
    expect(out).not.toContain("progressbar");
    expect(out).not.toContain("seats filled");
  });

  it("still offers registration", () => {
    expect(html(uncapped())).toContain("Register");
  });

  it("says nothing about seats once an uncapped event has finished", () => {
    const out = html(uncapped({ isPast: true }));
    expect(out).not.toContain("Open entry");
    expect(out).toContain("Event ended");
  });

  it("leaves a capped event counting seats as before", () => {
    const out = html(row());
    expect(out).toContain("12 seats left");
    expect(out).toContain("18/30");
    expect(out).not.toContain("Open entry");
  });
});
