// Pure calendar layout math (BUILD_PLAN §5) — no I/O, no server-only, safe on
// the client. All "day keys" are IST civil dates ("YYYY-MM-DD"); all instants
// are compared in real UTC time, so IST rendering and overlap detection agree.

import type { CalendarEvent } from "@/lib/types";
import { addDays, addMonths, dayKeyStartUTC, dowMon0, istDateKey } from "@/lib/datetime";

export type CalView = "month" | "week" | "day" | "agenda";

export const CAL_VIEWS: CalView[] = ["month", "week", "day", "agenda"];

export function normalizeView(v: string | undefined): CalView {
  return (CAL_VIEWS as string[]).includes(v ?? "") ? (v as CalView) : "month";
}

const MINUTES_PER_DAY = 1440;

// ── query range ──────────────────────────────────────────────────────────────

/** First day-key shown by a view anchored at `anchor` (Monday-based weeks). */
export function viewStartKey(view: CalView, anchor: string): string {
  switch (view) {
    case "month": {
      const first = `${anchor.slice(0, 7)}-01`;
      return addDays(first, -dowMon0(first)); // back to the Monday of week 1
    }
    case "week":
      return addDays(anchor, -dowMon0(anchor));
    case "day":
      return anchor;
    case "agenda":
      return anchor;
  }
}

/** Number of days a view spans from its start key. */
export function viewDayCount(view: CalView): number {
  switch (view) {
    case "month":
      return 42; // 6 weeks, always — a stable grid height
    case "week":
      return 7;
    case "day":
      return 1;
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
  const endKey = addDays(startKey, viewDayCount(view)); // exclusive
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
    case "week":
    case "agenda":
      return addDays(anchor, dir * 7);
    case "day":
      return addDays(anchor, dir);
  }
}

// ── month grid ───────────────────────────────────────────────────────────────

export interface MonthCell {
  key: string;
  /** Belongs to the anchor's month (vs. a leading/trailing spillover day). */
  inMonth: boolean;
  isToday: boolean;
}

/** Six Monday→Sunday rows covering the anchor's month. */
export function buildMonthGrid(anchor: string, today: string): MonthCell[][] {
  const month = anchor.slice(0, 7);
  const start = viewStartKey("month", anchor);
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
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

// ── time-grid segments + lane packing (week / day views) ─────────────────────

export interface DaySegment {
  event: CalendarEvent;
  /** Minutes from IST midnight, clamped to [0, 1440]. */
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface PackedSegment extends DaySegment {
  lane: number;
  lanes: number;
}

/** The timed portion of `ev` clipped to `dayKey`, or null if it isn't on it. */
export function daySegment(ev: CalendarEvent, dayKey: string): DaySegment | null {
  const dayStart = dayKeyStartUTC(dayKey).getTime();
  const dayEnd = dayStart + MINUTES_PER_DAY * 60_000;
  const s = new Date(ev.startsAt).getTime();
  const e = new Date(ev.endsAt).getTime();
  if (s >= dayEnd || e <= dayStart) return null;
  const segStart = Math.max(s, dayStart);
  const segEnd = Math.min(e, dayEnd);
  return {
    event: ev,
    startMin: Math.round((segStart - dayStart) / 60_000),
    endMin: Math.round((segEnd - dayStart) / 60_000),
    continuesBefore: s < dayStart,
    continuesAfter: e > dayEnd,
  };
}

/**
 * Greedy interval packing (§5.3): overlapping segments split into side-by-side
 * lanes so nothing hides behind anything. Segments are grouped into clusters
 * (runs of mutual overlap); every segment in a cluster shares the cluster's lane
 * count, so a two-event overlap wastes no width.
 */
export function packDay(segments: DaySegment[]): PackedSegment[] {
  const sorted = [...segments].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );
  const out: PackedSegment[] = [];
  let cluster: PackedSegment[] = [];
  let laneEnds: number[] = []; // running end-minute per lane in the cluster

  const flush = () => {
    const lanes = laneEnds.length;
    for (const seg of cluster) seg.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const seg of sorted) {
    const clusterMaxEnd = laneEnds.length ? Math.max(...laneEnds) : -Infinity;
    if (cluster.length && seg.startMin >= clusterMaxEnd) flush();

    let lane = laneEnds.findIndex((end) => end <= seg.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.endMin);
    } else {
      laneEnds[lane] = seg.endMin;
    }
    cluster.push({ ...seg, lane, lanes: 1 });
  }
  if (cluster.length) flush();
  return out;
}

/** Split a day's events into the all-day band vs. the timed grid. */
export function splitDay(
  events: CalendarEvent[],
  dayKey: string,
): { banded: CalendarEvent[]; timed: DaySegment[] } {
  const banded: CalendarEvent[] = [];
  const timed: DaySegment[] = [];
  for (const ev of events) {
    if (!occursOn(ev, dayKey)) continue;
    if (isBanded(ev)) {
      banded.push(ev);
    } else {
      const seg = daySegment(ev, dayKey);
      if (seg) timed.push(seg);
    }
  }
  return { banded, timed };
}

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
