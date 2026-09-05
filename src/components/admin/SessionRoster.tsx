"use client";

import { useEffect, useRef, useState } from "react";
import {
  saveAndCloseAction,
  saveAttendanceAction,
  autosaveAttendanceAction,
  reopenSessionAction,
} from "@/app/admin/(app)/attendance/actions";
import { matchesQuery } from "@/lib/admin/roster-filter";
import { isDirty, autosaveAction } from "@/lib/admin/autosave";

interface Row { memberId: string; name: string; rollNo: string | null; present: boolean }

/** How long to wait after the last tap before saving. Long enough that marking a
 *  run of members is one request, short enough that little is ever at risk. */
const AUTOSAVE_DELAY_MS = 2500;

export function SessionRoster({
  sessionId, roster, canEdit, status,
}: {
  sessionId: string; roster: Row[]; canEdit: boolean; status: "open" | "closed";
}) {
  const closed = status === "closed";
  const [present, setPresent] = useState<Set<string>>(() => new Set(roster.filter((r) => r.present).map((r) => r.memberId)));
  // What the server has actually confirmed. Everything between this and
  // `present` is at risk, so the UI reports it honestly.
  const [saved, setSaved] = useState<Set<string>>(() => new Set(roster.filter((r) => r.present).map((r) => r.memberId)));
  const [saveState, setSaveState] = useState<"clean" | "saving" | "saved" | "error">("clean");
  const inFlight = useRef(false);
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

  // Autosave. Re-runs whenever the marks change AND whenever a save lands (via
  // `saved`), which is what picks up the taps made while a request was open —
  // `autosaveAction` returns "wait" for those, so nothing else would.
  useEffect(() => {
    if (!canEdit || closed) return;
    if (autosaveAction({ dirty: isDirty(saved, present), inFlight: inFlight.current }) !== "save") return;

    const timer = setTimeout(async () => {
      inFlight.current = true;
      setSaveState("saving");
      const sending = new Set(present);
      try {
        const res = await autosaveAttendanceAction(sessionId, [...sending]);
        if (res.ok) { setSaved(sending); setSaveState("saved"); }
        else setSaveState("error");
      } catch {
        // A redirected POST (an expired sign-in) lands here rather than as ok:false.
        setSaveState("error");
      } finally {
        inFlight.current = false;
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [present, saved, canEdit, closed, sessionId]);

  if (roster.length === 0) return <p className="body-text" style={{ color: "var(--ink-3)" }}>No approved members yet.</p>;

  const unsaved = isDirty(saved, present);
  const saveNote =
    saveState === "error"
      ? "Not saved — your sign-in may have expired. Open /admin in another tab, sign in, then press Save draft."
      : saveState === "saving"
        ? "Saving…"
        : unsaved
          ? "Unsaved changes"
          : saveState === "saved"
            ? "All changes saved"
            : null;

  return (
    <form action={closed ? reopenSessionAction : saveAndCloseAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      {/* Present inputs for the FULL roster (not just filtered rows) so a search
          filter never drops a mark on save. */}
      {roster.map((r) => (present.has(r.memberId) ? <input key={r.memberId} type="hidden" name="present" value={r.memberId} /> : null))}
      <div className="att-count" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span><strong>{present.size}</strong> of {roster.length} present</span>
        <span className={`abadge${closed ? "" : " abadge-approved"}`}>{closed ? "Closed" : "Open"}</span>
        {saveNote ? (
          <span className="hint" style={saveState === "error" ? { color: "var(--rust)" } : undefined} role="status">
            {saveNote}
          </span>
        ) : null}
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
                <span className="label sroster-idx">{i + 1}</span>
                <span className="sroster-name">{r.name}</span>
                <span className="sroster-roll">{r.rollNo ?? "—"}</span>
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
          {closed ? null : (
            <button type="submit" formAction={saveAttendanceAction} className="btn">
              Save draft
            </button>
          )}
          <span className="hint">
            {closed
              ? "Reopen to edit this session again."
              : "Marks save on their own as you go. “Save draft” keeps the session open; “Save & close” finalises it."}
          </span>
        </div>
      ) : null}
    </form>
  );
}
