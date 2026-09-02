"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { matchesAny } from "@/lib/admin/roster-filter";

export interface SearchableRow {
  key: string;
  /** Everything this row should be findable by. `matchesAny` walks nested values. */
  values: unknown[];
  /** The row itself, rendered on the server so server actions keep working. */
  row: ReactNode;
}

/**
 * An admin table with a free-text search box over already-loaded rows.
 *
 * The rows arrive as server-rendered nodes: this component only decides which
 * of them to render, so the page keeps its server actions, its link handling
 * and its markup exactly as they were. Filtering is instant and needs no
 * round-trip.
 */
export function SearchableTable({
  head,
  rows,
  placeholder,
  ariaLabel,
  noun = "row",
  wrapStyle,
}: {
  head: ReactNode;
  rows: SearchableRow[];
  placeholder: string;
  ariaLabel: string;
  /** Singular noun for the result count — "row" → "3 of 40 rows". */
  noun?: string;
  wrapStyle?: CSSProperties;
}) {
  const [q, setQ] = useState("");
  const shown = rows.filter((r) => matchesAny(r.values, q));
  const searching = q.trim() !== "";

  return (
    <>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{ marginTop: 18 }}
      />

      {searching ? (
        <p className="label" style={{ color: "var(--ink-3)", marginTop: 2 }} aria-live="polite">
          {shown.length === 0
            ? `Nothing matches “${q.trim()}”`
            : `${shown.length} of ${rows.length} ${rows.length === 1 ? noun : `${noun}s`}`}
        </p>
      ) : null}

      {shown.length === 0 ? null : (
        <div className="tablewrap cards" style={wrapStyle}>
          <table className="admin">
            <thead>{head}</thead>
            <tbody>{shown.map((r) => r.row)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
