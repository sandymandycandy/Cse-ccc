"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CalendarX, Search, X } from "lucide-react";
import { matchesAny } from "@/lib/admin/roster-filter";
import { pctOfStrength } from "@/lib/admin/attendance-analytics";
import { ALL_VIEW, deriveViews, describeCount } from "@/lib/admin/table-views";
import { sortSessions, type SortDir } from "@/lib/admin/session-sort";
import { istNumericDate } from "@/lib/datetime";

/** Structurally the `SessionRow` the page hands over. Declared here rather than
 *  imported because `attendance-club.ts` is `server-only`; `page.tsx` passes the
 *  real rows in, so a field disappearing upstream still fails the typecheck. */
interface Row {
  id: string;
  title: string;
  status: "open" | "closed";
  openedAt: string;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  presentCount: number;
}

const STATUS_LABEL: Record<Row["status"], string> = { open: "Open", closed: "Closed" };

/**
 * Session history: the club's past roll calls, with the same toolbar every other
 * admin list screen has — search, derived Open/Closed chips, a count line and a
 * real empty state.
 *
 * ⚠️ Deliberately NOT on `AdminTable`, which every other list screen uses.
 * `AdminTable` has no column sorting, and this table's Date header toggles
 * newest ⇄ oldest — a feature added on purpose in `7e96f6f`. Adopting the shared
 * component would have silently dropped it. The toolbar markup below is
 * therefore a copy of `AdminTable`'s by necessity; if sorting ever lands there,
 * this should collapse into it.
 */
export function SessionHistory({ sessions, strength }: { sessions: Row[]; strength: number }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState(ALL_VIEW);
  const [dir, setDir] = useState<SortDir>("newest");
  const searchRef = useRef<HTMLInputElement>(null);

  if (sessions.length === 0) {
    return (
      <div className="table-empty">
        <span className="table-empty-icon"><CalendarX size={24} aria-hidden="true" /></span>
        <h2>No sessions yet</h2>
        <p>Create one above and it will show up here once you have taken the register.</p>
      </div>
    );
  }

  const views = deriveViews(sessions.map((s) => STATUS_LABEL[s.status]));
  const byView = view === ALL_VIEW ? sessions : sessions.filter((s) => STATUS_LABEL[s.status] === view);
  const rows = sortSessions(
    byView.filter((s) =>
      matchesAny([s.title, istNumericDate(s.sessionDate ?? s.openedAt), s.status], q),
    ),
    dir,
  );

  function clearFilters() {
    setQ("");
    setView(ALL_VIEW);
    searchRef.current?.focus();
  }

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
              placeholder="Search sessions…"
              aria-label="Search session history by title, date or status"
            />
            {q ? (
              <button
                type="button"
                className="listbar-clear"
                aria-label="Clear search"
                onClick={() => { setQ(""); searchRef.current?.focus(); }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {views.length > 0 ? (
            <div className="view-chips">
              {views.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  className="view-chip"
                  aria-pressed={view === v.label}
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
          {describeCount({ shown: rows.length, total: sessions.length, noun: "session", view, query: q })}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="table-empty">
          <span className="table-empty-icon"><Search size={24} aria-hidden="true" /></span>
          <h2>No matching sessions</h2>
          <p>Try another search, or clear the filters to see every session.</p>
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="tablewrap cards" tabIndex={0} role="region" aria-label="Session history">
          <table className="admin" data-density="comfortable" aria-label="Session history">
            <thead><tr>
              <th>Session</th>
              <th aria-sort={dir === "newest" ? "descending" : "ascending"}>
                <button
                  type="button"
                  className="th-sort"
                  onClick={() => setDir((d) => (d === "newest" ? "oldest" : "newest"))}
                  aria-label={dir === "newest" ? "Sorted newest first — sort oldest first" : "Sorted oldest first — sort newest first"}
                >
                  Date <span aria-hidden="true">{dir === "newest" ? "▼" : "▲"}</span>
                </button>
              </th>
              <th>Slot</th><th>Status</th><th>Present</th><th>% strength</th><th></th>
            </tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}>
                <td data-primary="" className="att-row-title">{s.title}</td>
                <td data-label="Date">{istNumericDate(s.sessionDate ?? s.openedAt)}</td>
                <td data-label="Slot">{s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—"}</td>
                <td data-label="Status"><span className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>{STATUS_LABEL[s.status]}</span></td>
                <td data-label="Present">{s.presentCount}</td>
                <td data-label="% strength">{pctOfStrength(s.presentCount, strength)}%</td>
                <td data-action=""><Link href={`/admin/attendance/sessions/${s.id}`} className="btn btn-sm">Open</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
