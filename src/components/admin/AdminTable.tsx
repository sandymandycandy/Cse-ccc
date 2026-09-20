"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { matchesAny } from "@/lib/admin/roster-filter";
import { ALL_VIEW, deriveViews, describeCount, isWideTable } from "@/lib/admin/table-views";
import { useToast } from "./Toaster";

export interface AdminTableColumn {
  label: string;
  /** Prose that needs room. Everything else stays on one line. */
  wrap?: boolean;
  /* The two below feed the existing `.tablewrap.cards` phone layout, which
     turns each row into a card of label → value pairs. */
  /** Rides one shared line on a phone instead of its own labelled row. */
  compact?: boolean;
  /** The button row, which spans the card so it stays a real tap target. */
  action?: boolean;
}

export interface AdminTableRow {
  key: string;
  /** One node per column, server-rendered so server actions keep working. */
  cells: ReactNode[];
  /** Everything this row should be findable by. `matchesAny` walks nested values. */
  values: unknown[];
  /** Drives the derived view chips. Omit on screens with no status column. */
  status?: string;
  /** Current value of the first cell. Presence is what shows the pencil. */
  rename?: string;
}

/** What a screen's rename server action has to return. */
export type RenameResult = { ok: true } | { ok: false; error?: string };

/**
 * The admin list surface: toolbar (search + derived views + count), the table,
 * and the empty state that replaces it.
 *
 * Rows arrive as server-rendered cells, so a page keeps its links, badges and
 * server actions; this component only decides which rows to render and owns the
 * first cell while it is being renamed.
 *
 * There are deliberately no row checkboxes and no bulk-action bar — destructive
 * bulk operations are out of scope for this admin.
 */
export function AdminTable({
  columns,
  rows,
  heading,
  noun = "row",
  nounPlural,
  density = "comfortable",
  onRename,
  wrapStyle,
  wrapClassName,
}: {
  columns: AdminTableColumn[];
  rows: AdminTableRow[];
  /** Used for the search placeholder: "Search events…". */
  heading: string;
  noun?: string;
  /** Needed wherever `noun + "s"` is wrong — "entry" would read "entrys". */
  nounPlural?: string;
  density?: "comfortable" | "compact";
  /** Omit to suppress renaming entirely (audit and outbox are log screens). */
  onRename?: (key: string, value: string) => Promise<RenameResult>;
  wrapStyle?: CSSProperties;
  /** Extra classes on the table wrapper, for screens with bespoke phone rules. */
  wrapClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState(ALL_VIEW);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Escape fires before blur, so without this the discard would be immediately
  // undone by the blur handler committing the same input.
  const discarded = useRef(false);
  const toast = useToast();

  const views = deriveViews(rows.map((r) => r.status));
  const byView = view === ALL_VIEW ? rows : rows.filter((r) => r.status === view);
  const shown = byView.filter((r) => matchesAny(r.values, query));

  const filtered = query.trim() !== "" || view !== ALL_VIEW;
  const wide = isWideTable(columns.length);

  function clearFilters() {
    setQuery("");
    setView(ALL_VIEW);
  }

  async function commit() {
    if (!editing || !onRename) return;
    const { key, value } = editing;
    const original = rows.find((r) => r.key === key)?.rename ?? "";
    const trimmed = value.trim();
    // A no-op rename shouldn't cost a request or claim it saved something.
    if (trimmed === "" || trimmed === original) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      const res = await onRename(key, trimmed);
      if (res.ok) toast("Saved");
      else toast(res.error ?? "Could not save that", "revert");
    } catch {
      // A redirected POST (an expired sign-in) lands here, not as ok:false.
      toast("Not saved — your sign-in may have expired", "revert");
    } finally {
      setSaving(false);
      setEditing(null);
    }
  }

  return (
    <>
      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${heading.toLowerCase()}…`}
              aria-label={`Search ${heading.toLowerCase()}`}
            />
          </div>
          {views.length > 0 ? (
            <div className="view-chips">
              {views.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  className="view-chip"
                  aria-pressed={v.label === view}
                  onClick={() => setView(v.label)}
                >
                  {v.label}
                  <span>{v.count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="count-note" aria-live="polite">
          {describeCount({
            shown: shown.length,
            total: rows.length,
            noun,
            nounPlural,
            view,
            query,
          })}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="table-empty">
          <h2>Nothing matches</h2>
          <p>Try a shorter search, or go back to every row.</p>
          {filtered ? (
            <button type="button" className="btn btn-ghost" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div
            className={`tablewrap cards${wrapClassName ? ` ${wrapClassName}` : ""}`}
            style={wrapStyle}
          >
            <table className="admin" data-density={density}>
              <thead>
                <tr>
                  {/* Keyed by position, not label: two columns can legitimately
                      share a heading (the feedback summary has "Club" twice). */}
                  {columns.map((c, i) => (
                    <th key={i}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const open = editing?.key === r.key;
                  return (
                    <tr key={r.key}>
                      {r.cells.map((cell, i) => {
                        const col = columns[i];
                        const first = i === 0;
                        return (
                          <td
                            key={i}
                            data-label={col?.label}
                            data-wrap={col?.wrap ? "true" : undefined}
                            data-compact={col?.compact ? "true" : undefined}
                            data-action={col?.action ? "true" : undefined}
                            data-primary={first ? "true" : undefined}
                          >
                            {first && open ? (
                              <input
                                className="rename-input"
                                // The input replaces the cell the user just
                                // clicked, so focus has to follow it there.
                                autoFocus
                                disabled={saving}
                                value={editing.value}
                                aria-label="New name"
                                onChange={(e) => setEditing({ key: r.key, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commit();
                                  } else if (e.key === "Escape") {
                                    discarded.current = true;
                                    setEditing(null);
                                  }
                                }}
                                onBlur={() => {
                                  if (discarded.current) {
                                    discarded.current = false;
                                    return;
                                  }
                                  void commit();
                                }}
                              />
                            ) : (
                              <>
                                {cell}
                                {first && onRename && r.rename !== undefined ? (
                                  <button
                                    type="button"
                                    className="rename-btn"
                                    title="Rename here"
                                    aria-label={`Rename ${r.rename}`}
                                    onClick={() =>
                                      setEditing({ key: r.key, value: r.rename ?? "" })
                                    }
                                  >
                                    <PencilIcon />
                                  </button>
                                ) : null}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {wide ? <p className="table-scroll-hint">Scroll sideways for more →</p> : null}
        </>
      )}
    </>
  );
}

/** Lucide `pencil`, inlined — the one icon this surface uses. */
function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}
