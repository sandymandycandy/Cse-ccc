"use client";

import { useState } from "react";
import {
  saveAttendanceAction,
  saveAndCloseAction,
  reopenSessionAction,
} from "@/app/admin/(app)/council/actions";

interface Row { memberId: string; name: string; designation: string; present: boolean }

export function CouncilSessionRoster({
  sessionId, roster, canEdit, status,
}: {
  sessionId: string; roster: Row[]; canEdit: boolean; status: "open" | "closed";
}) {
  const closed = status === "closed";
  const [present, setPresent] = useState<Set<string>>(() => new Set(roster.filter((r) => r.present).map((r) => r.memberId)));
  const toggle = (id: string) => setPresent((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setAll = (on: boolean) => setPresent(on ? new Set(roster.map((r) => r.memberId)) : new Set());

  if (roster.length === 0) return <p className="body-text" style={{ color: "var(--ink-3)" }}>No approved members yet.</p>;

  return (
    <form action={saveAttendanceAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="att-count" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <span><strong>{present.size}</strong> of {roster.length} present</span>
        <span className={`abadge${closed ? "" : " abadge-approved"}`}>{closed ? "Closed" : "Open"}</span>
      </div>
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => setAll(true)}>Mark all present</button>
          <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>Clear</button>
        </div>
      ) : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
        {roster.map((r, i) => {
          const on = present.has(r.memberId);
          return (
            <li key={r.memberId} className="rule" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>
                <span className="label" style={{ display: "inline-block", minWidth: 30, color: "var(--ink-3)" }}>{i + 1}</span>
                {r.name}
                <span className="label" style={{ display: "block", marginLeft: 30, fontWeight: 400, color: "var(--ink-3)" }}>{r.designation}</span>
              </span>
              {on ? <input type="hidden" name="present" value={r.memberId} /> : null}
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
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary">Save attendance (draft)</button>
          {closed ? (
            <button className="btn" formAction={reopenSessionAction}>Reopen session</button>
          ) : (
            <button className="btn" formAction={saveAndCloseAction}>Save &amp; close session</button>
          )}
          <span className="hint">
            {closed
              ? "Reopen to keep editing. Draft saves keep the session open."
              : "“Save (draft)” keeps the session open so you can keep marking. Closing finalises it."}
          </span>
        </div>
      ) : null}
    </form>
  );
}
