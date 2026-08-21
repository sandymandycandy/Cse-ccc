// All event times are stored as timestamptz and rendered in IST (BUILD_PLAN §6).

const IST = "Asia/Kolkata";

function fmt(d: Date | string, opts: Intl.DateTimeFormatOptions, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: IST }).format(
    typeof d === "string" ? new Date(d) : d,
  );
}

/** Big day number, e.g. "21" or "5". */
export const istDayNum = (d: Date | string) => fmt(d, { day: "numeric" });

/** "Aug · Fri" — month + weekday, the event-row date stamp. */
export const istDateLabel = (d: Date | string) =>
  `${fmt(d, { month: "short" })} · ${fmt(d, { weekday: "short" })}`;

/** "9:00 AM". */
export const istTime = (d: Date | string) =>
  fmt(d, { hour: "numeric", minute: "2-digit", hour12: true });

/** "Fri". */
export const istWeekdayShort = (d: Date | string) => fmt(d, { weekday: "short" });

/** "Friday, 21 August 2026". */
export const istFullDate = (d: Date | string) =>
  fmt(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Human time range in IST. Same-day → "9:00 AM – 12:00 PM"; spanning days →
 * "Fri 9:00 AM → Sat 9:00 AM".
 */
export function istTimeRange(start: Date | string, end: Date | string): string {
  if (istDateKey(start) === istDateKey(end)) {
    return `${istTime(start)} – ${istTime(end)}`;
  }
  return `${istWeekdayShort(start)} ${istTime(start)} → ${istWeekdayShort(end)} ${istTime(end)}`;
}

/** Stable IST calendar-day key, "YYYY-MM-DD" (en-CA yields ISO order). */
export const istDateKey = (d: Date | string) =>
  fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");

/**
 * The seven dates (Mon→Sun) of the IST week containing `now`, each anchored at
 * UTC noon so IST-timezone formatting lands on the intended calendar day.
 */
export function istWeekDates(now: Date = new Date()): Date[] {
  const [y, m, d] = istDateKey(now).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  const mondayOffset = (anchor.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day;
  });
}

// ── calendar day-key arithmetic (the calendar's civil-day currency) ──────────
// IST is UTC+5:30 with no DST, so an IST calendar day maps to a fixed UTC window.
// A "day key" is a civil date string "YYYY-MM-DD"; arithmetic on it is done on a
// UTC anchor so it stays timezone-independent (no IST/Intl round-trips per step).

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Today's IST day-key, "YYYY-MM-DD". */
export const todayKey = () => istDateKey(new Date());

/** Is `s` a well-formed "YYYY-MM-DD" that round-trips (rejects e.g. 2026-02-31)? */
export function isValidDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** UTC instant of IST 00:00 on `key` — the day's inclusive start. */
export function dayKeyStartUTC(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** A safely-mid-day UTC instant that formats to `key` in IST (for labels). */
function dayKeyNoonUTC(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12) - IST_OFFSET_MS);
}

/** Civil day-key `n` days from `key` (n may be negative). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Day-key `n` whole IST-calendar months from `key`, clamped to month length. */
export function addMonths(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = base.getUTCFullYear();
  const tm = base.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad2(tm + 1)}-${pad2(Math.min(d, lastDay))}`;
}

/** Day of week for a day-key: 0 = Monday … 6 = Sunday. */
export function dowMon0(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Day-of-month number for a day-key, e.g. 21. */
export const dayOfMonth = (key: string) => Number(key.split("-")[2]);

/** "YYYY-MM" of a day-key — a stable per-month bucket. */
export const monthOf = (key: string) => key.slice(0, 7);

/** Minutes since IST midnight (0–1439) for an instant. */
export function istMinutesOfDay(d: Date | string): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: IST,
  }).format(typeof d === "string" ? new Date(d) : d);
  const [h, min] = s.split(":").map(Number);
  return h * 60 + min;
}

/** "August 2026" from a day-key. */
export const istMonthYear = (key: string) =>
  fmt(dayKeyNoonUTC(key), { month: "long", year: "numeric" });

/** "Friday" from a day-key. */
export const istWeekdayLong = (key: string) =>
  fmt(dayKeyNoonUTC(key), { weekday: "long" });

/** "Fri" from a day-key. */
export const istWeekdayShortKey = (key: string) =>
  fmt(dayKeyNoonUTC(key), { weekday: "short" });

/** "Fri, 21 Aug" from a day-key — the agenda / day-sheet date stamp. */
export const istShortDay = (key: string) =>
  fmt(dayKeyNoonUTC(key), { weekday: "short", day: "numeric", month: "short" });

/** "12:00 AM"→"11 PM" clock label for an IST minute-of-day (grid gutter). */
export function istHourLabel(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const anchor = new Date(Date.UTC(2000, 0, 1, h, 0) - IST_OFFSET_MS);
  return fmt(anchor, { hour: "numeric", hour12: true });
}
