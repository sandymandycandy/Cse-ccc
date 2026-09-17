import { describe, expect, it } from "vitest";
import { escapeText, foldLine, renderCalendar, type IcsEvent } from "./ics";

const timed: IcsEvent = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Hackathon 2026",
  description: "24 hours, bring a laptop.",
  startsAt: "2026-09-20T04:30:00.000Z", // 10:00 IST
  endsAt: "2026-09-20T07:30:00.000Z",
  isAllDay: false,
  location: "Seminar Hall 2",
  url: "https://cse-ccc.vercel.app/events/11111111-2222-3333-4444-555555555555",
  updatedAt: "2026-09-15T06:00:00.000Z",
  cancelled: false,
};

const opts = { host: "cse-ccc.vercel.app", name: "CSE Club Council" };

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeText("Hackathon 2026")).toBe("Hackathon 2026");
  });
});

describe("foldLine", () => {
  it("leaves a short line unfolded", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds a long line into chunks of at most 75 octets", () => {
    const folded = foldLine("DESCRIPTION:" + "x".repeat(200)).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    }
    // every continuation line begins with one space
    for (const part of folded.slice(1)) expect(part.startsWith(" ")).toBe(true);
    // unfolding restores the original
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      "DESCRIPTION:" + "x".repeat(200),
    );
  });

  it("counts octets, not characters, and never splits a codepoint", () => {
    const folded = foldLine("SUMMARY:" + "—".repeat(40)).split("\r\n");
    for (const part of folded) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
      expect(part.includes("�")).toBe(false);
    }
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      "SUMMARY:" + "—".repeat(40),
    );
  });
});

describe("renderCalendar", () => {
  it("emits a well-formed calendar for a timed event", () => {
    const out = renderCalendar([timed], opts);
    expect(out.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(out.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(out).toContain("VERSION:2.0");
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain(`UID:${timed.id}@cse-ccc.vercel.app`);
    expect(out).toContain("DTSTART:20260920T043000Z");
    expect(out).toContain("DTEND:20260920T073000Z");
    expect(out).toContain("SUMMARY:Hackathon 2026");
    expect(out).toContain("LOCATION:Seminar Hall 2");
    expect(out).toContain("LAST-MODIFIED:20260915T060000Z");
  });

  it("uses CRLF for every line break", () => {
    const out = renderCalendar([timed], opts);
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("writes an all-day event as a DATE with an exclusive end", () => {
    const out = renderCalendar(
      [{ ...timed, isAllDay: true, endsAt: "2026-09-20T18:29:00.000Z" }],
      opts,
    );
    expect(out).toContain("DTSTART;VALUE=DATE:20260920");
    expect(out).toContain("DTEND;VALUE=DATE:20260921");
  });

  it("marks a cancelled event rather than dropping it", () => {
    const out = renderCalendar([{ ...timed, cancelled: true }], opts);
    expect(out).toContain("STATUS:CANCELLED");
    expect(out).toContain("SUMMARY:Hackathon 2026");
  });

  it("gives a live event STATUS:CONFIRMED", () => {
    expect(renderCalendar([timed], opts)).toContain("STATUS:CONFIRMED");
  });

  it("keeps the UID stable across renders so a re-poll updates in place", () => {
    const a = renderCalendar([timed], opts);
    const b = renderCalendar([timed], opts);
    expect(a.match(/UID:.*/)?.[0]).toBe(b.match(/UID:.*/)?.[0]);
  });

  it("still produces a valid calendar with no events", () => {
    const out = renderCalendar([], opts);
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("END:VCALENDAR");
    expect(out).not.toContain("BEGIN:VEVENT");
  });

  it("omits DESCRIPTION and LOCATION when they are null", () => {
    const out = renderCalendar([{ ...timed, description: null, location: null }], opts);
    expect(out).not.toContain("DESCRIPTION:");
    expect(out).not.toContain("LOCATION:");
  });
});
