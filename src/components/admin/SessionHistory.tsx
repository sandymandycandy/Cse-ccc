"use client";

import { useState } from "react";
import Link from "next/link";
import { matchesAny } from "@/lib/admin/roster-filter";
import { pctOfStrength } from "@/lib/admin/attendance-analytics";
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

/**
 * Session history: the same table the page used to render inline, plus a search
 * box and a Date header that toggles newest ⇄ oldest. Both are client-side over
 * the rows the server already sent (as `AttendanceRoster` does) — instant, and
 * no round-trip. Newest-first is the load order and stays the default.
 */
export function SessionHistory({ sessions, strength }: { sessions: Row[]; strength: number }) {
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<SortDir>("newest");

  if (sessions.length === 0) {
    return <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p>;
  }

  const rows = sortSessions(
    sessions.filter((s) => matchesAny([s.title, istNumericDate(s.sessionDate ?? s.openedAt), s.status], q)),
    dir,
  );

  return (
    <>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search sessions…"
        aria-label="Search session history by title, date or status"
      />
      {rows.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions match “{q}”.</p>
      ) : (
        <div className="tablewrap cards">
          <table className="admin">
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
                <td data-primary="" style={{ fontWeight: 500 }}>{s.title}</td>
                <td data-label="Date">{istNumericDate(s.sessionDate ?? s.openedAt)}</td>
                <td data-label="Slot">{s.startTime && s.endTime ? `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "—"}</td>
                <td data-label="Status"><span className={`abadge${s.status === "closed" ? "" : " abadge-approved"}`}>{s.status === "closed" ? "Closed" : "Open"}</span></td>
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
