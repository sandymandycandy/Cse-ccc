"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { matchesAny } from "@/lib/admin/roster-filter";
import { describeCount } from "@/lib/admin/table-views";

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
 * ⚠️ Prefer `AdminTable` for new list screens — it brings derived view chips,
 * inline rename and the shared empty state. This one survives for the
 * registrations screen alone, because that table has a leading **checkbox**
 * column for shortlisting, and `AdminTable` gives its first cell to the rename
 * affordance. Shortlisting is a selection workflow, not the destructive bulk
 * action the redesign removed, so it stays.
 *
 * The rows arrive as server-rendered nodes: this component only decides which
 * of them to render, so the page keeps its server actions, its link handling
 * and its markup exactly as they were.
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

  return (
    <>
      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              aria-label={ariaLabel}
            />
          </div>
        </div>
        <p className="count-note" aria-live="polite">
          {describeCount({ shown: shown.length, total: rows.length, noun, query: q })}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="table-empty">
          <h2>Nothing matches</h2>
          <p>Try a shorter search, or go back to every row.</p>
          {q.trim() !== "" ? (
            <button type="button" className="btn btn-ghost" onClick={() => setQ("")}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="tablewrap cards" style={wrapStyle}>
          <table className="admin" data-density="comfortable">
            <thead>{head}</thead>
            <tbody>{shown.map((r) => r.row)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
