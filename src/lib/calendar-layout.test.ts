import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/types";
import {
  CAL_VIEWS,
  buildMonthGrid,
  clubsInRange,
  filterByClubs,
  normalizeView,
  queryRange,
  stepAnchor,
} from "@/lib/calendar-layout";

/** Minimal CalendarEvent — only the fields the layout math reads. */
function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1",
    title: "Talk",
    startsAt: "2026-09-02T04:00:00.000Z",
    endsAt: "2026-09-02T06:00:00.000Z",
    isAllDay: false,
    club: "Coding",
    clubSlug: "coding",
    clubSlugs: ["coding"],
    clubColor: "#3f5e4c",
    venue: "Lab 1",
    registered: 0,
    capacity: 50,
    status: "open",
    cancelled: false,
    ...over,
  };
}

describe("CAL_VIEWS", () => {
  it("offers only month and agenda", () => {
    expect(CAL_VIEWS).toEqual(["month", "agenda"]);
  });
});

describe("normalizeView", () => {
  it("keeps agenda", () => {
    expect(normalizeView("agenda")).toBe("agenda");
  });

  it("falls back to month for a legacy ?view=week URL", () => {
    expect(normalizeView("week")).toBe("month");
  });

  it("falls back to month for a legacy ?view=day URL", () => {
    expect(normalizeView("day")).toBe("month");
  });

  it("falls back to month when absent", () => {
    expect(normalizeView(undefined)).toBe("month");
  });
});

describe("buildMonthGrid", () => {
  it("returns 5 rows for a month that needs 5 (Sept 2026 starts Tuesday)", () => {
    expect(buildMonthGrid("2026-09-15", "2026-09-07")).toHaveLength(5);
  });

  it("returns 6 rows for a month that needs 6 (Aug 2026 starts Saturday)", () => {
    expect(buildMonthGrid("2026-08-15", "2026-09-07")).toHaveLength(6);
  });

  it("returns 4 rows for a 28-day month starting Monday (Feb 2027)", () => {
    expect(buildMonthGrid("2027-02-15", "2026-09-07")).toHaveLength(4);
  });

  it("still starts on Monday and covers every day of the month", () => {
    const weeks = buildMonthGrid("2026-09-15", "2026-09-07");
    const keys = weeks.flat().map((c) => c.key);
    expect(keys[0]).toBe("2026-08-31");
    expect(keys).toContain("2026-09-01");
    expect(keys).toContain("2026-09-30");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("marks today and flags spillover days as out of month", () => {
    const weeks = buildMonthGrid("2026-09-15", "2026-09-07");
    const cells = weeks.flat();
    expect(cells.find((c) => c.key === "2026-09-07")?.isToday).toBe(true);
    expect(cells.find((c) => c.key === "2026-08-31")?.inMonth).toBe(false);
    expect(cells.find((c) => c.key === "2026-09-01")?.inMonth).toBe(true);
  });
});

describe("queryRange", () => {
  it("spans exactly the rendered month grid, not a fixed 42 days", () => {
    const { startISO, endISO } = queryRange("month", "2026-09-15");
    const days =
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 86_400_000;
    expect(days).toBe(35);
  });

  it("widens to 42 days for a 6-row month", () => {
    const { startISO, endISO } = queryRange("month", "2026-08-15");
    const days =
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 86_400_000;
    expect(days).toBe(42);
  });
});

describe("stepAnchor", () => {
  it("moves a month at a time in month view", () => {
    expect(stepAnchor("month", "2026-09-15", 1)).toBe("2026-10-15");
    expect(stepAnchor("month", "2026-09-15", -1)).toBe("2026-08-15");
  });

  it("moves a week at a time in agenda view", () => {
    expect(stepAnchor("agenda", "2026-09-15", 1)).toBe("2026-09-22");
  });
});

describe("clubsInRange", () => {
  const clubs = [
    { slug: "coding", shortName: "Coding" },
    { slug: "yoga", shortName: "Yoga" },
    { slug: "ai-forge", shortName: "Ai Forge" },
  ];

  it("keeps only clubs that have an event, in the given club order", () => {
    const events = [
      ev({ id: "a", clubSlug: "ai-forge", clubSlugs: ["ai-forge"] }),
      ev({ id: "b", clubSlug: "coding", clubSlugs: ["coding"] }),
    ];
    expect(clubsInRange(events, clubs).map((c) => c.slug)).toEqual([
      "coding",
      "ai-forge",
    ]);
  });

  it("returns nothing when there are no events, so the filter row disappears", () => {
    expect(clubsInRange([], clubs)).toEqual([]);
  });

  it("ignores an event whose club is not in the list", () => {
    expect(clubsInRange([ev({ clubSlug: "ghost", clubSlugs: ["ghost"] })], clubs)).toEqual([]);
  });

  it("does not duplicate a club with several events", () => {
    const events = [ev({ id: "a" }), ev({ id: "b" }), ev({ id: "c" })];
    expect(clubsInRange(events, clubs)).toHaveLength(1);
  });

  it("offers a chip for a club that only co-hosts an event", () => {
    const events = [ev({ clubSlug: "coding", clubSlugs: ["coding", "ai-forge"] })];
    expect(clubsInRange(events, clubs).map((c) => c.slug)).toEqual(["coding", "ai-forge"]);
  });
});

describe("filterByClubs", () => {
  const solo = ev({ id: "solo", clubSlug: "yoga", clubSlugs: ["yoga"] });
  const joint = ev({ id: "joint", clubSlug: "coding", clubSlugs: ["coding", "ai-forge"] });

  it("shows everything when no club is chosen", () => {
    expect(filterByClubs([solo, joint], null).map((e) => e.id)).toEqual(["solo", "joint"]);
  });

  // ⚠️ The point of §3: filtering by the club that co-ran an event must find it.
  it("finds a co-hosted event under its SECONDARY club", () => {
    expect(filterByClubs([solo, joint], new Set(["ai-forge"])).map((e) => e.id)).toEqual(["joint"]);
  });

  it("still finds it under its primary", () => {
    expect(filterByClubs([solo, joint], new Set(["coding"])).map((e) => e.id)).toEqual(["joint"]);
  });

  it("hides events no chosen club hosts", () => {
    expect(filterByClubs([solo, joint], new Set(["nature"]))).toEqual([]);
  });
});
