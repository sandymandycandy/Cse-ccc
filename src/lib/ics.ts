import { addDays, istDateKey } from "@/lib/datetime";

/**
 * RFC 5545 calendar rendering. Pure — no database, no request, no clock — so
 * the fiddly parts (octet folding, escaping, exclusive all-day ends) are
 * testable on their own. Calendar apps are unforgiving about all three.
 */
export interface IcsEvent {
  id: string;
  title: string;
  description: string | null;
  /** ISO 8601 UTC instant. */
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  location: string | null;
  /** Absolute URL of the public event page. */
  url: string;
  updatedAt: string;
  cancelled: boolean;
}

/** §3.3.11: backslash first, or the escapes we add get escaped again. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * §3.1: no content line exceeds 75 OCTETS, continuations begin with a space.
 * Counting characters instead of octets is the usual bug — one em dash is three
 * octets — and a naive slice can cut a codepoint in half, so this walks
 * codepoints and measures each one's encoded length.
 */
export function foldLine(line: string): string {
  const LIMIT = 75;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    // Continuation lines spend one octet on their leading space.
    const budget = out.length === 0 ? LIMIT : LIMIT - 1;
    if (bytes + size > budget) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : " " + part)).join("\r\n");
}

/** "20260920T043000Z" */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "20260920" — the IST calendar day, which is the day a student means. */
function dateStamp(iso: string): string {
  return istDateKey(iso).replace(/-/g, "");
}

function line(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

function vevent(ev: IcsEvent, host: string): string[] {
  const rows: string[] = ["BEGIN:VEVENT"];
  rows.push(`UID:${ev.id}@${host}`);
  rows.push(`DTSTAMP:${utcStamp(ev.updatedAt)}`);
  rows.push(`LAST-MODIFIED:${utcStamp(ev.updatedAt)}`);

  if (ev.isAllDay) {
    // DTEND is EXCLUSIVE for DATE values: a one-day event ends the next day, or
    // calendars render it a day short.
    rows.push(`DTSTART;VALUE=DATE:${dateStamp(ev.startsAt)}`);
    rows.push(`DTEND;VALUE=DATE:${addDays(istDateKey(ev.endsAt), 1).replace(/-/g, "")}`);
  } else {
    rows.push(`DTSTART:${utcStamp(ev.startsAt)}`);
    rows.push(`DTEND:${utcStamp(ev.endsAt)}`);
  }

  rows.push(line("SUMMARY", ev.title));
  if (ev.description) rows.push(line("DESCRIPTION", ev.description));
  if (ev.location) rows.push(line("LOCATION", ev.location));
  rows.push(line("URL", ev.url));
  // A cancelled event stays in the feed so subscribers SEE the cancellation
  // instead of watching the entry silently disappear.
  rows.push(`STATUS:${ev.cancelled ? "CANCELLED" : "CONFIRMED"}`);
  rows.push("END:VEVENT");
  return rows;
}

export function renderCalendar(
  events: IcsEvent[],
  opts: { host: string; name: string },
): string {
  const rows: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//CSE Club Council//${opts.host}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", opts.name),
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const ev of events) rows.push(...vevent(ev, opts.host));
  rows.push("END:VCALENDAR");
  return rows.join("\r\n") + "\r\n";
}
