"use client";

import { useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { matchesAny } from "@/lib/admin/roster-filter";
import { presentPositions, setPerson, teamMark } from "@/lib/admin/team-attendance";
import { groupReview, type GroupField } from "@/lib/registration/shortlist";
import { setMemberAttendanceAction, toggleAttendanceAction } from "@/app/admin/(app)/events/[id]/registrations/actions";
import { RegistrationCard } from "./RegistrationCard";

export interface BoardPerson {
  position: number;
  name: string;
  /** null on solo events. */
  role: "Leader" | "Member" | null;
  roll: string;
  /** "CSE · 3", or "". */
  deptYear: string;
  email: string | null;
  phone: string | null;
}
export interface BoardAnswer { label: string; value: string; href: string | null }
export interface BoardEntry {
  id: string;
  /** Team name, else the leader / registrant. */
  title: string;
  /** null on solo events. */
  leader: string | null;
  /** Solo: exactly the registrant. */
  people: BoardPerson[];
  attended: boolean;
  absent: number[];
  eligible: boolean;
  answers: BoardAnswer[];
  /** Everything the search box reaches, including team members inside the answers. */
  search: unknown[];
  /** Answer per groupable question id (see `groupFields`), null when unanswered. */
  choices: Record<string, string | null>;
}
export type BoardView = "All" | "Not marked" | "Present" | "Partly present";

const VIEWS: BoardView[] = ["All", "Not marked", "Present", "Partly present"];
const VIEW_MARK = { "Not marked": "unmarked", Present: "present", "Partly present": "partial" } as const;
const markOf = (e: BoardEntry) => teamMark(e.people.length, e.attended, e.absent);

export function filterEntries(entries: BoardEntry[], query: string, view: BoardView): BoardEntry[] {
  return entries.filter((e) => (view === "All" || markOf(e) === VIEW_MARK[view]) && matchesAny(e.search, query));
}

export function viewCounts(entries: BoardEntry[]): Record<BoardView, number> {
  const out: Record<BoardView, number> = { All: entries.length, "Not marked": 0, Present: 0, "Partly present": 0 };
  for (const e of entries) {
    const m = markOf(e);
    out[m === "unmarked" ? "Not marked" : m === "present" ? "Present" : "Partly present"]++;
  }
  return out;
}

type Patch = { id: string; attended: boolean; absent: number[] };
const SAVE_FAILED = "Could not save — refresh and try again.";

/**
 * The registrations list: one compact row per team (or solo registrant) with a
 * one-tap full-team mark, and a card with everyone on the team for exceptions.
 * Marks apply optimistically and settle when the server action revalidates.
 */
export function RegistrationsBoard({ eventId, entries, canEdit, isTeamEvent, rowLead, rowTail, groupFields = [], defaultGroup = null }: {
  eventId: string;
  entries: BoardEntry[];
  canEdit: boolean;
  isTeamEvent: boolean;
  /** Per-row node at the start of the row (shortlist checkbox), keyed by entry id.
   *  A record, not a function: it crosses the server→client boundary. */
  rowLead?: Record<string, ReactNode>;
  /** Per-row node after the mark action (shortlisted badge / undo), keyed by id. */
  rowTail?: Record<string, ReactNode>;
  /** Choice questions the list can be sectioned by; the theme one by default. */
  groupFields?: GroupField[];
  defaultGroup?: string | null;
}) {
  const [groupBy, setGroupBy] = useState<string>(defaultGroup ?? "");
  const [q, setQ] = useState("");
  const [view, setView] = useState<BoardView>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [shown, applyPatch] = useOptimistic(entries, (rows: BoardEntry[], p: Patch) =>
    rows.map((r) => (r.id === p.id ? { ...r, attended: p.attended, absent: p.absent } : r)));

  const counts = viewCounts(shown);
  const rows = filterEntries(shown, q, view);
  const open = shown.find((e) => e.id === openId) ?? null;
  const noun = isTeamEvent ? "team" : "registration";
  const field = groupFields.find((f) => f.id === groupBy) ?? null;
  const groups = groupReview(rows, field);
  const presentIn = (list: BoardEntry[]) =>
    list.reduce((n, e) => n + presentPositions(e.people.length, e.attended, e.absent).length, 0);

  function markTeam(e: BoardEntry, attend: boolean) {
    setError("");
    startTransition(async () => {
      applyPatch({ id: e.id, attended: attend, absent: [] });
      const f = new FormData();
      f.set("registrationId", e.id);
      f.set("eventId", eventId);
      f.set("attend", attend ? "1" : "0");
      try { await toggleAttendanceAction(f); } catch { setError(SAVE_FAILED); }
    });
  }

  function markPerson(e: BoardEntry, position: number, present: boolean) {
    const next = setPerson(e.people.length, e, position, present);
    if (!next) return;
    setError("");
    startTransition(async () => {
      applyPatch({ id: e.id, ...next });
      try {
        const res = await setMemberAttendanceAction({ eventId, registrationId: e.id, position, present });
        if (!res.ok) setError(res.error);
      } catch { setError(SAVE_FAILED); }
    });
  }

  function close() {
    const id = openId;
    setOpenId(null);
    setError("");
    if (id) rowRefs.current.get(id)?.focus();
  }

  const row = (e: BoardEntry) => {
    const size = e.people.length;
    const m = markOf(e);
    const here = presentPositions(size, e.attended, e.absent).length;
    return (
      <li key={e.id} className="regboard-row" data-mark={m}>
        <span className="regboard-lead">{rowLead?.[e.id]}</span>
        <button
          type="button"
          className="regboard-open"
          ref={(el) => { if (el) rowRefs.current.set(e.id, el); else rowRefs.current.delete(e.id); }}
          onClick={() => setOpenId(e.id)}
          aria-haspopup="dialog"
        >
          <strong>{e.title}</strong>
          {e.leader ? <span className="hint">Leader · {e.leader}</span> : null}
        </button>
        <span className="regboard-count">
          {isTeamEvent ? `${size} ${size === 1 ? "person" : "people"} · ${here} present` : ""}
        </span>
        <span className={m === "present" ? "abadge abadge-approved" : m === "partial" ? "abadge abadge-pending" : "abadge"}>
          {m === "present" ? "Present" : m === "partial" ? "Partly present" : "Not marked"}
        </span>
        <span className="regboard-action">
          {canEdit && e.eligible ? (
            <button
              type="button"
              className={`btn btn-sm ${e.attended ? "btn-ghost" : "btn-accent"}`}
              disabled={pending}
              onClick={() => markTeam(e, !e.attended)}
            >
              {e.attended ? "Undo" : isTeamEvent ? "Mark full team present" : "Mark present"}
            </button>
          ) : null}
          {rowTail?.[e.id]}
        </span>
      </li>
    );
  };

  function clearFilters() {
    setQ("");
    setView("All");
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
              placeholder={isTeamEvent ? "Search team, leader, member, roll…" : "Search name, roll, email, any answer…"}
              aria-label={`Search ${noun}s by any detail`}
            />
            {q ? (
              <button type="button" className="listbar-clear" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}>
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {groupFields.length > 0 ? (
            <label className="shortlist-groupby">
              <span className="label">Group by</span>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="">No grouping</option>
                {groupFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
          ) : null}
          <div className="view-chips">
            {VIEWS.map((v) => (
              <button key={v} type="button" className="view-chip" aria-pressed={view === v} onClick={() => setView(v)}>
                {v}<span>{counts[v]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="listbar-meta">
          <p className="count-note" aria-live="polite">Showing {rows.length} of {shown.length} {noun}s</p>
          {q.trim() || view !== "All" ? (
            <button type="button" className="listbar-reset" onClick={clearFilters}>Reset filters <X size={13} aria-hidden="true" /></button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="table-empty">
          <span className="table-empty-icon"><Search size={24} aria-hidden="true" /></span>
          <h2>No matching {noun}s</h2>
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : field ? (
        groups.map((g) => (
          <details className="review-group" key={g.key} open>
            <summary>
              <span className="review-group-title">{g.label}</span>
              <span className="review-group-count">
                {g.items.length} {g.items.length === 1 ? noun : `${noun}s`} · {presentIn(g.items)} {presentIn(g.items) === 1 ? "person" : "people"} present
              </span>
            </summary>
            <ul className="regboard" aria-label={g.label}>{g.items.map(row)}</ul>
          </details>
        ))
      ) : (
        <ul className="regboard" aria-label={`${noun}s`}>{rows.map(row)}</ul>
      )}
      {error && !open ? <p role="alert" className="regcard-error">{error}</p> : null}

      {open ? (
        <RegistrationCard
          entry={open}
          canEdit={canEdit}
          onClose={close}
          pending={pending}
          error={error}
          onMark={(position, present) => markPerson(open, position, present)}
        />
      ) : null}
    </>
  );
}
