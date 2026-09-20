/**
 * Derived saved views + the count line for the admin list toolbar.
 *
 * Pure, because these are the two rules most likely to read wrong and least
 * likely to be noticed: a chip whose count disagrees with the table under it,
 * and a count line that still says "18 rows" while a filter is on.
 *
 * "Derived, not authored" is the point — nobody configures the chips. They are
 * whatever distinct statuses the loaded rows actually carry, in first-seen
 * order, so a screen cannot advertise a view that matches nothing.
 */

/** The label the "everything" chip always carries. */
export const ALL_VIEW = "All";

export interface ViewChip {
  label: string;
  /** Rows carrying this status, counted BEFORE the text search is applied. */
  count: number;
}

/**
 * One chip per distinct status, prefixed by All.
 *
 * Returns `[]` — not just `[All]` — when no row carries a status, which is what
 * tells the toolbar to suppress the whole chip row. A lone "All" chip is a
 * control that cannot do anything.
 */
export function deriveViews(statuses: (string | null | undefined)[]): ViewChip[] {
  const counts = new Map<string, number>();
  for (const s of statuses) {
    if (s == null || s === "") continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  return [
    { label: ALL_VIEW, count: statuses.length },
    ...[...counts].map(([label, count]) => ({ label, count })),
  ];
}

/**
 * The line under the toolbar.
 *
 * Unfiltered it is just the total. Filtered it names every active narrowing in
 * the order the user applied it, so "why am I only seeing seven?" is answered
 * without touching the controls.
 */
export function describeCount({
  shown,
  total,
  noun = "row",
  nounPlural,
  view = ALL_VIEW,
  query = "",
}: {
  shown: number;
  total: number;
  noun?: string;
  /** Needed wherever `noun + "s"` is wrong — "entry" would read "entrys". */
  nounPlural?: string;
  view?: string;
  query?: string;
}): string {
  const many = nounPlural ?? `${noun}s`;
  const plural = (n: number) => (n === 1 ? noun : many);
  const q = query.trim();
  const filtered = q !== "" || view !== ALL_VIEW;

  if (!filtered) return `${total} ${plural(total)}`;

  const parts = [`${shown} of ${total} ${plural(total)}`];
  if (view !== ALL_VIEW) parts.push(view);
  if (q !== "") parts.push(`“${q}”`);
  return parts.join(" · ");
}

/**
 * Tables this wide stop fitting the content column, so they get the edge fade
 * and the "scroll sideways" hint. Six is where it started to bite in the
 * prototype; below it the fade is noise on a table that is already whole.
 */
export const WIDE_TABLE_COLUMNS = 6;

export function isWideTable(columnCount: number): boolean {
  return columnCount >= WIDE_TABLE_COLUMNS;
}
