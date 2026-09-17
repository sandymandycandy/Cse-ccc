import { istDateKey } from "@/lib/datetime";

export type SortDir = "newest" | "oldest";

interface Sortable {
  sessionDate: string | null;
  openedAt: string;
}

/**
 * Re-order already-loaded attendance sessions by date, newest- or oldest-first.
 *
 * Pure and client-safe: `SessionHistory` runs this in the browser over the rows
 * the server already sent, so flipping the order needs no round-trip. The server
 * keeps its own ordering and its `.limit(200)` — re-ordering the *fetch* would
 * make that limit hand back the oldest 200 instead of the most recent 200.
 *
 * Keyed on the IST calendar day the table actually prints — `istDateKey` of
 * `sessionDate ?? openedAt`, the same value `istNumericDate` stamps into the
 * Date cell. Two consequences worth keeping:
 *
 *  - A session with no `session_date` sorts by its own opened-at day instead of
 *    falling to the bottom. The server orders `session_date` nulls last while
 *    the table displays the fallback, so today an undated session shows a recent
 *    date and yet sits under everything. Sorting on the displayed value ends that.
 *  - `opened_at` is a UTC instant, and IST is +5:30, so anything opened after
 *    18:30 UTC belongs to the *next* IST day. Keying on the raw string would file
 *    such a row a day earlier than its own date cell reads.
 *
 * Keys are `YYYY-MM-DD` and the tie-break is an ISO instant, so both compare as
 * plain strings — lexicographic order is chronological order for these formats,
 * and no `Date` is constructed inside the comparator.
 */
export function sortSessions<T extends Sortable>(rows: readonly T[], dir: SortDir): T[] {
  // Ascending is the natural comparison; "newest" is the same order flipped.
  const sign = dir === "newest" ? -1 : 1;
  // Decorate once: the key costs an Intl format, and a comparator runs O(n log n) times.
  return rows
    .map((row) => ({ row, key: istDateKey(row.sessionDate ?? row.openedAt) }))
    .sort((a, b) => sign * (asc(a.key, b.key) || asc(a.row.openedAt, b.row.openedAt)))
    .map((d) => d.row);
}

/** Ascending string compare, -1 / 0 / 1. */
const asc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
