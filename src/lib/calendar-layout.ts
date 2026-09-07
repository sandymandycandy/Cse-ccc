// Pure calendar layout math (BUILD_PLAN §5) — no I/O, no server-only, safe on
// the client. All "day keys" are IST civil dates ("YYYY-MM-DD"); all instants
// are compared in real UTC time, so IST rendering and overlap detection agree.

import type { CalendarEvent } from "@/lib/types";
import { addDays, addMonths, dayKeyStartUTC, dowMon0, istDateKey } from "@/lib/datetime";

export type CalView = "month" | "agenda";

/**
 * Week and day views were removed 2026-09-07. An hour-by-hour time grid is the
 * wrong instrument for a council calendar that runs a handful of events a
 * month — it rendered as near-empty whitespace. `normalizeView` deliberately
 * falls through to "month", so bookmarked `?view=week` / `?view=day` URLs still
 * land somewhere sensible instead of breaking.
 */
export const CAL_VIEWS: CalView[] = ["month", "agenda"];

export function normalizeView(v: string | undefined): CalView {
  return (CAL_VIEWS as string[]).includes(v ?? "") ? (v as CalView) : "month";
}

const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;

// ── query range ──────────────────────────────────────────────────────────────

/** First day-key shown by a view anchored at `anchor` (Monday-based weeks). */
export function viewStartKey(view: CalView, anchor: string): string {
  switch (view) {
    case "month": {
      const first = `${anchor.slice(0, 7)}-01`;
      return addDays(first, -dowMon0(first)); // back to the Monday of week 1
    }
    case "agenda":
      return anchor;
  }
}

/** Calendar days in the anchor's month. */
function daysInMonth(anchor: string): number {
  const first = `${anchor.slice(0, 7)}-01`;
  return Math.round(
    (dayKeyStartUTC(addMonths(first, 1)).getTime() - dayKeyStartUTC(first).getTime()) /
      MS_PER_DAY,
  );
}

/**
 * Monday→Sunday rows the anchor's month actually needs: 4 (a 28-day February
 * starting Monday), 5, or 6. The grid used to be a hardcoded 6 rows for "a
 * stable grid height", which left a permanently empty trailing week on most
 * months — ~112px of blank cells that made the page read as dead.
 */
export function monthWeekCount(anchor: string): number {
  const first = `${anchor.slice(0, 7)}-01`;
  return Math.ceil((dowMon0(first) + daysInMonth(anchor)) / 7);
}

/** Number of days a view spans from its start key. */
export function viewDayCount(view: CalView, anchor: string): number {
  switch (view) {
    case "month":
      return monthWeekCount(anchor) * 7;
    case "agenda":
      return 60; // "what's next" — a two-month look-ahead
  }
}

/**
 * The UTC instant window to query for a view — every event that *touches* the
 * visible days. An event intersects when `starts_at < end` and `ends_at > start`.
 */
export function queryRange(view: CalView, anchor: string): { startISO: string; endISO: string } {
  const startKey = viewStartKey(view, anchor);
  const endKey = addDays(startKey, viewDayCount(view, anchor)); // exclusive
  return {
    startISO: dayKeyStartUTC(startKey).toISOString(),
    endISO: dayKeyStartUTC(endKey).toISOString(),
  };
}

/** Step the anchor one period in `dir` (−1 back, +1 forward) for a view. */
export function stepAnchor(view: CalView, anchor: string, dir: -1 | 1): string {
  switch (view) {
    case "month":
      return addMonths(anchor, dir);
    case "agenda":
      return addDays(anchor, dir * 7);
  }
}

// ── club filter ──────────────────────────────────────────────────────────────

/**
 * The subset of `clubs` with at least one event in the loaded range, in the
 * caller's order. The filter row renders from this, so it offers only what is
 * actually filterable and disappears entirely on an empty month — rather than
 * advertising twelve clubs above a grid holding one event.
 */
export function clubsInRange<T extends { slug: string }>(
  events: readonly CalendarEvent[],
  clubs: readonly T[],
): T[] {
  const present = new Set(events.map((e) => e.clubSlug));
  return clubs.filter((c) => present.has(c.slug));
}

// ── month grid ───────────────────────────────────────────────────────────────

export interface MonthCell {
  key: string;
  /** Belongs to the anchor's month (vs. a leading/trailing spillover day). */
  inMonth: boolean;
  isToday: boolean;
}

/** Monday→Sunday rows covering the anchor's month — only as many as it needs. */
export function buildMonthGrid(anchor: string, today: string): MonthCell[][] {
  const month = anchor.slice(0, 7);
  const start = viewStartKey("month", anchor);
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < monthWeekCount(anchor); w++) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = addDays(start, w * 7 + i);
      row.push({ key, inMonth: key.slice(0, 7) === month, isToday: key === today });
    }
    weeks.push(row);
  }
  return weeks;
}

// ── multi-day handling ───────────────────────────────────────────────────────

/**
 * Does the event occupy this IST day at all? An event ending exactly at the
 * day's 00:00 does NOT occupy it (§5.4). All-day and multi-day spans included.
 */
export function occursOn(ev: CalendarEvent, dayKey: string): boolean {
  const dayStart = dayKeyStartUTC(dayKey).getTime();
  const dayEnd = dayStart + MINUTES_PER_DAY * 60_000;
  const s = new Date(ev.startsAt).getTime();
  const e = new Date(ev.endsAt).getTime();
  return s < dayEnd && e > dayStart;
}

/** True when the event spans more than one IST calendar day, or is all-day. */
export function isBanded(ev: CalendarEvent): boolean {
  if (ev.isAllDay) return true;
  return istDateKey(ev.startsAt) !== lastOccupiedDay(ev);
}

/**
 * The last IST day-key the event occupies. An event ending exactly at midnight
 * ends on the previous day (§5.4), so we look 1ms before `endsAt`.
 */
export function lastOccupiedDay(ev: CalendarEvent): string {
  return istDateKey(new Date(new Date(ev.endsAt).getTime() - 1));
}

export type SpanRole = "start" | "continue" | "single";

/** How a banded event reads on `dayKey`: its first day, or a continuation. */
export function spanRole(ev: CalendarEvent, dayKey: string): SpanRole {
  const first = istDateKey(ev.startsAt);
  const last = lastOccupiedDay(ev);
  if (first === last) return "single";
  return dayKey === first ? "start" : "continue";
}

// ── day grouping ─────────────────────────────────────────────────────────────

/** Events that occur on `dayKey`, soonest first — for month cells & the sheet. */
export function eventsOn(events: CalendarEvent[], dayKey: string): CalendarEvent[] {
  return events
    .filter((ev) => occursOn(ev, dayKey))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Group events by their first IST day, keys sorted ascending — agenda view. */
export function groupByDay(events: CalendarEvent[]): { day: string; events: CalendarEvent[] }[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = istDateKey(ev.startsAt);
    const bucket = map.get(key) ?? [];
    if (bucket.length === 0) map.set(key, bucket);
    bucket.push(ev);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, evs]) => ({ day, events: evs }));
}
