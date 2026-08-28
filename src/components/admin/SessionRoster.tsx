"use client";

import { useState } from "react";
import { saveAttendanceAction } from "@/app/admin/(app)/attendance/actions";

interface Row { memberId: string; name: string; present: boolean }

export function SessionRoster({ sessionId, roster, canEdit }: { sessionId: string; roster: Row[]; canEdit: boolean }) {
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
      <div className="att-count" style={{ marginBottom: 12 }}>
        <strong>{present.size}</strong><span>of {roster.length} present</span>
      </div>
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => setAll(true)}>Mark all present</button>
          <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>Clear</button>
        </div>
      ) : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
        {roster.map((r) => {
          const on = present.has(r.memberId);
          return (
            <li key={r.memberId} className="rule" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
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
      {canEdit ? <button className="btn btn-primary" style={{ marginTop: 16 }}>Save attendance</button> : null}
    </form>
  );
}
