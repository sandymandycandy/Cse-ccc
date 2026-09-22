"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Inbox, Search, X } from "lucide-react";
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
  const searchRef = useRef<HTMLInputElement>(null);
  const shown = rows.filter((r) => matchesAny(r.values, q));

  return (
    <>
      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true"><Search size={17} /></span>
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              aria-label={ariaLabel}
            />
            {q ? <button type="button" className="listbar-clear" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button> : null}
          </div>
        </div>
        <p className="count-note" aria-live="polite">
          {describeCount({ shown: shown.length, total: rows.length, noun, query: q })}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="table-empty">
          <span className="table-empty-icon">{q.trim() ? <Search size={24} aria-hidden="true" /> : <Inbox size={24} aria-hidden="true" />}</span>
          <h2>{q.trim() ? "No matching results" : "Nothing here yet"}</h2>
          <p>{q.trim() ? "Try another search or clear it to see everything." : "New entries will appear here when added."}</p>
          {q.trim() !== "" ? (
            <button type="button" className="btn btn-ghost" onClick={() => setQ("")}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="tablewrap cards" style={wrapStyle} tabIndex={0} role="region" aria-label="Search results">
          <table className="admin" data-density="comfortable" aria-label="Search results">
            <thead>{head}</thead>
            <tbody>{shown.map((r) => r.row)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
