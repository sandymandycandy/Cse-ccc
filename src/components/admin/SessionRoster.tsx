"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  saveAndCloseAction,
  saveAttendanceAction,
  autosaveAttendanceAction,
  reopenSessionAction,
} from "@/app/admin/(app)/attendance/actions";
import { matchesQuery } from "@/lib/admin/roster-filter";
import { tallyMarks, type MarkState } from "@/lib/admin/attendance-marks";
import type { RosterMark } from "@/lib/admin/attendance-club";
import { useToast } from "./Toaster";

/** How long to wait after the last tap before saving. Long enough that marking a
 *  run of members is one request, short enough that little is ever at risk. */
const AUTOSAVE_DELAY_MS = 2500;

type Filter = "all" | "present" | "absent" | "unmarked";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "unmarked", label: "Unmarked" },
];

function sameMarks(a: ReadonlyMap<string, MarkState>, b: ReadonlyMap<string, MarkState>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function SessionRoster({
  sessionId,
  roster,
  canEdit,
  status,
}: {
  sessionId: string;
  roster: RosterMark[];
  canEdit: boolean;
  status: "open" | "closed";
}) {
  const closed = status === "closed";
  const server = useMemo(
    () => new Map<string, MarkState>(roster.map((r) => [r.memberId, r.mark])),
    [roster],
  );

  const [marks, setMarks] = useState<Map<string, MarkState>>(() => new Map(server));
  // What the server has actually confirmed. Everything between this and
  // `marks` is at risk, so the UI reports it honestly.
  const [saved, setSaved] = useState<Map<string, MarkState>>(() => new Map(server));
  const [saveState, setSaveState] = useState<"clean" | "saving" | "saved" | "error">("clean");
  const inFlight = useRef(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const toast = useToast();

  const total = roster.length;
  const { present, absent, unmarked, turnout } = tallyMarks(marks, total);

  function setMark(memberId: string, next: MarkState) {
    setMarks((prev) => {
      const copy = new Map(prev);
      copy.set(memberId, next);
      return copy;
    });
  }

  /** Bulk helpers act on the WHOLE roster, never the filtered view: "mark all
   *  present" with a search active would otherwise quietly skip everyone the
   *  search hid, which is the opposite of what it says. */
  function markAll(next: MarkState) {
    setMarks(new Map(roster.map((r) => [r.memberId, next])));
  }

  function markRestAbsent() {
    setMarks((prev) => {
      const copy = new Map(prev);
      for (const r of roster) if ((copy.get(r.memberId) ?? null) === null) copy.set(r.memberId, "absent");
      return copy;
    });
  }

  const dirty = !sameMarks(saved, marks);

  // Autosave. Re-runs whenever the marks change AND whenever a save lands (via
  // `saved`), which is what picks up the taps made while a request was open.
  useEffect(() => {
    if (!canEdit || closed) return;
    if (!dirty || inFlight.current) return;

    const timer = setTimeout(async () => {
      inFlight.current = true;
      setSaveState("saving");
      const sending = new Map(marks);
      try {
        const res = await autosaveAttendanceAction(sessionId, [...sending]);
        if (res.ok) {
          setSaved(sending);
          setSaveState("saved");
        } else setSaveState("error");
      } catch {
        // A redirected POST (an expired sign-in) lands here, not as ok:false.
        setSaveState("error");
      } finally {
        inFlight.current = false;
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [marks, dirty, canEdit, closed, sessionId]);

  if (total === 0) {
    return (
      <p className="body-text" style={{ color: "var(--ink-3)" }}>
        No approved members yet.
      </p>
    );
  }

  const shown = roster.filter((r) => {
    if (!matchesQuery(r.name, r.rollNo, q)) return false;
    const m = marks.get(r.memberId) ?? null;
    if (filter === "present") return m === "present";
    if (filter === "absent") return m === "absent";
    if (filter === "unmarked") return m === null;
    return true;
  });

  const counts: Record<Filter, number> = {
    all: total,
    present,
    absent,
    unmarked,
  };

  const saveNote =
    saveState === "error"
      ? "Not saved — your sign-in may have expired. Open /admin in another tab, sign in, then press Save draft."
      : saveState === "saving"
        ? "Saving…"
        : dirty
          ? "Unsaved changes"
          : saveState === "saved"
            ? "All changes saved"
            : null;

  return (
    <form action={closed ? reopenSessionAction : saveAndCloseAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      {/* Hidden inputs for the FULL roster (not just filtered rows) so a search
          filter never drops a mark on save. Unmarked members are submitted
          explicitly — "not in the present list" no longer means absent. */}
      {roster.map((r) => {
        const m = marks.get(r.memberId) ?? null;
        const field = m === null ? "unmarked" : m;
        return <input key={r.memberId} type="hidden" name={field} value={r.memberId} />;
      })}

      {/* ── summary ── */}
      <div className="sroster-summary">
        <div>
          <span className="sroster-figure">
            <strong>{present}</strong>
            <span>/ {total}</span>
          </span>
          <div className="label" style={{ marginTop: 9 }}>
            Marked present
          </div>
        </div>

        <div className="sroster-progress">
          <div className="sroster-track">
            <span style={{ width: `${total === 0 ? 0 : (present / total) * 100}%`, background: "var(--forest)" }} />
            <span style={{ width: `${total === 0 ? 0 : (absent / total) * 100}%`, background: "var(--rust)" }} />
          </div>
          <div className="sroster-stats">
            <span>{turnout}% turnout</span>
            <span>{absent} absent</span>
            <span style={unmarked > 0 ? { color: "var(--clay)" } : undefined}>
              {unmarked} unmarked
            </span>
          </div>
        </div>

        <span className={`abadge${closed ? "" : " abadge-approved"}`}>
          {closed ? "Closed" : "Open"}
        </span>
      </div>

      {/* ── filter ── */}
      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Search name or roll…"
              aria-label="Search members by name or roll number"
            />
          </div>
          <div className="view-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className="view-chip"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {canEdit && !closed ? (
        <div className="sroster-bulk">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => markAll("present")}>
            Mark all present
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={markRestAbsent}>
            Mark the rest absent
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => markAll(null)}>
            Clear marks
          </button>
          <span className="label" style={{ color: "var(--ink-4)", marginLeft: 6 }}>
            {shown.length === total
              ? `${total} on the roster`
              : `${shown.length} of ${total} shown`}
          </span>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="table-empty">
          <h2>Nobody matches</h2>
          <p>Try part of a name or a roll number.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="sroster-list">
          {shown.map((r) => {
            const m = marks.get(r.memberId) ?? null;
            // The index is the person's position in the FULL roster, so it
            // stays stable while the list is filtered — you can still call
            // "number 14" out loud.
            const i = roster.findIndex((x) => x.memberId === r.memberId);
            return (
              <li key={r.memberId} className="sroster-row" data-unmarked={m === null}>
                <span className="sroster-idx">{i + 1}</span>
                <span className="sroster-name">{r.name}</span>
                <span className="sroster-roll">{r.rollNo ?? "—"}</span>
                {canEdit && !closed ? (
                  <span className="seg" role="group" aria-label={`Attendance for ${r.name}`}>
                    <button
                      type="button"
                      data-on={m === "present"}
                      data-kind="present"
                      aria-pressed={m === "present"}
                      onClick={() => setMark(r.memberId, m === "present" ? null : "present")}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      data-on={m === "absent"}
                      data-kind="absent"
                      aria-pressed={m === "absent"}
                      onClick={() => setMark(r.memberId, m === "absent" ? null : "absent")}
                    >
                      Absent
                    </button>
                  </span>
                ) : (
                  <span
                    className="label"
                    style={{
                      color:
                        m === "present"
                          ? "var(--forest)"
                          : m === "absent"
                            ? "var(--rust)"
                            : "var(--clay)",
                    }}
                  >
                    {m === "present" ? "Present" : m === "absent" ? "Absent" : "Unmarked"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="sroster-foot">
        Turnout counts a member only from their join date. Marks save on their own
        as you go — “Save draft” keeps the session open, “Save &amp; close” finalises it.
      </p>

      {canEdit ? (
        <div className="sroster-actions">
          <button className="btn btn-primary">
            {closed ? "Reopen session" : "Save & close session"}
          </button>
          {closed ? null : (
            <button type="submit" formAction={saveAttendanceAction} className="btn">
              Save draft
            </button>
          )}
        </div>
      ) : null}

      {/* Reports autosave rather than gating the write: the marks are already
          on their way, so this says how far they got, and Revert is the way
          back to what the server holds. */}
      {canEdit && !closed && (dirty || saveState === "saving" || saveState === "error") ? (
        <div className="sroster-bar" role="status">
          <span>
            {present} present · {absent} absent · {saveNote}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setMarks(new Map(saved));
              toast("Reverted to the last save", "revert");
            }}
          >
            Revert
          </button>
        </div>
      ) : null}
    </form>
  );
}
