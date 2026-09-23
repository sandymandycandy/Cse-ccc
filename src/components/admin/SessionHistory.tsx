"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CalendarX, Search, X } from "lucide-react";
import { matchesAny } from "@/lib/admin/roster-filter";
import { pctOfStrength } from "@/lib/admin/attendance-analytics";
import { ALL_VIEW, deriveViews, describeCount } from "@/lib/admin/table-views";
import { sortSessions, type SortDir } from "@/lib/admin/session-sort";
import { istNumericDate } from "@/lib/datetime";
import { SessionTitle } from "./SessionTitle";
import type { RenameResult } from "./AdminTable";

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

/** Shared club and Council history, with search, status filters and date sorting. */
export function SessionHistory({ sessions, strength, scope = "attendance", onRename }: {
  sessions: Row[];
  strength: number;
  scope?: "attendance" | "council";
  onRename?: (id: string, title: string) => Promise<RenameResult>;
}) {
  const noun = scope === "council" ? "meeting" : "session";
  const [q, setQ] = useState("");
  const [view, setView] = useState(ALL_VIEW);
  const [dir, setDir] = useState<SortDir>("newest");
  const searchRef = useRef<HTMLInputElement>(null);

  if (sessions.length === 0) {
    return (
      <div className="table-empty">
        <span className="table-empty-icon"><CalendarX size={24} aria-hidden="true" /></span>
        <h2>No {noun}s yet</h2>
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
              placeholder={`Search ${noun}s…`}
              aria-label={`Search ${noun} history by title, date or status`}
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
        <div className="listbar-meta"><p className="count-note" aria-live="polite">
          {describeCount({ shown: rows.length, total: sessions.length, noun, view, query: q })}
        </p>
        {q.trim() || view !== ALL_VIEW ? <button type="button" className="listbar-reset" onClick={clearFilters}>Reset filters <X size={13} aria-hidden="true" /></button> : null}
        <button type="button" className="listbar-reset session-sort" onClick={() => setDir((d) => d === "newest" ? "oldest" : "newest")}
          aria-label={dir === "newest" ? "Sorted newest first — sort oldest first" : "Sorted oldest first — sort newest first"}>
          {dir === "newest" ? "Newest first ↓" : "Oldest first ↑"}
        </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="table-empty">
          <span className="table-empty-icon"><Search size={24} aria-hidden="true" /></span>
          <h2>No matching {noun}s</h2>
          <p>Try another search, or clear the filters to see every session.</p>
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="session-history-list" aria-label={`${scope === "council" ? "Meeting" : "Session"} history`}>
          {rows.map((s) => {
            const pct = pctOfStrength(s.presentCount, strength);
            return <li key={s.id} className="session-history-row">
              <div className="session-history-name">
                <SessionTitle id={s.id} title={s.title} onRename={onRename} />
                <span className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>{STATUS_LABEL[s.status]}</span>
              </div>
              <div className="session-history-date">
                <time dateTime={(s.sessionDate ?? s.openedAt).slice(0, 10)}>{istNumericDate(s.sessionDate ?? s.openedAt)}</time>
                <span>{s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—"}</span>
              </div>
              <div className="session-turnout" title={`${s.presentCount} present · ${strength} current members`}>
                <span>{pct}% present</span>
                <progress value={Math.min(pct, 100)} max={100} aria-label={`Turnout for ${s.title}: ${pct}% of current roster`} />
                <small>{s.presentCount} of {strength} members</small>
              </div>
              <Link href={`/admin/${scope}/sessions/${s.id}`} className="session-open" aria-label={`Open ${s.title}`}>Open <span aria-hidden="true">→</span></Link>
            </li>;
          })}
        </ul>
      )}
    </>
  );
}
