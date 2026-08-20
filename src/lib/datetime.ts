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
