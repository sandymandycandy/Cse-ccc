"use client";

import { useState } from "react";
import {
  saveAndCloseAction,
  reopenSessionAction,
} from "@/app/admin/(app)/attendance/actions";
import { matchesQuery } from "@/lib/admin/roster-filter";

interface Row { memberId: string; name: string; rollNo: string | null; present: boolean }

export function SessionRoster({
  sessionId, roster, canEdit, status,
}: {
  sessionId: string; roster: Row[]; canEdit: boolean; status: "open" | "closed";
}) {
  const closed = status === "closed";
  const [present, setPresent] = useState<Set<string>>(() => new Set(roster.filter((r) => r.present).map((r) => r.memberId)));
  const [q, setQ] = useState("");
  const toggle = (id: string) => setPresent((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const filtered = roster.filter((r) => matchesQuery(r.name, r.rollNo, q));
  // Bulk actions apply to the currently-visible (filtered) rows — so with a search
  // active they only affect the matches; with no search, the whole roster.
  const setAll = (on: boolean) => setPresent((prev) => {
    const next = new Set(prev);
    for (const r of filtered) { if (on) next.add(r.memberId); else next.delete(r.memberId); }
    return next;
  });

  if (roster.length === 0) return <p className="body-text" style={{ color: "var(--ink-3)" }}>No approved members yet.</p>;

  return (
    <form action={closed ? reopenSessionAction : saveAndCloseAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      {/* Present inputs for the FULL roster (not just filtered rows) so a search
          filter never drops a mark on save. */}
      {roster.map((r) => (present.has(r.memberId) ? <input key={r.memberId} type="hidden" name="present" value={r.memberId} /> : null))}
      <div className="att-count" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <span><strong>{present.size}</strong> of {roster.length} present</span>
        <span className={`abadge${closed ? "" : " abadge-approved"}`}>{closed ? "Closed" : "Open"}</span>
      </div>
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        placeholder="Search name or roll…"
        aria-label="Search members by name or roll number"
      />
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => setAll(true)}>Mark all present</button>
          <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>Clear</button>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>No members match “{q}”.</p>
      ) : (
        <ul className="sroster-list">
          {filtered.map((r, i) => {
            const on = present.has(r.memberId);
            return (
              <li key={r.memberId} className="rule sroster-row">
                <span className="sroster-name">
                  <span className="label sroster-idx">{i + 1}</span>
                  {r.name}
                  {r.rollNo ? <span className="label" style={{ display: "block", marginLeft: 30, fontWeight: 400, color: "var(--ink-3)" }}>{r.rollNo}</span> : null}
                </span>
                {canEdit ? (
                  <button type="button" className="btn btn-sm"
                    onClick={() => toggle(r.memberId)}
                    style={on ? { background: "var(--forest)", color: "#fff", borderColor: "var(--forest)" } : undefined}
                    aria-pressed={on}>
                    {on ? "Present" : "Absent"}
                  </button>
                ) : <span className="label" style={{ color: on ? "var(--forest)" : "var(--ink-3)" }}>{on ? "Present" : "Absent"}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary">
            {closed ? "Reopen session" : "Save & close session"}
          </button>
          <span className="hint">
            {closed
              ? "Reopen to edit this session again."
              : "Saves the marked attendance and closes the session."}
          </span>
        </div>
      ) : null}
    </form>
  );
}
