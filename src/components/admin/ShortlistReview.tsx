"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { TeamGroup } from "@/lib/registration-form/participants";
import {
  REVIEW_VIEWS,
  STATE_LABEL,
  decisionOf,
  filterReview,
  groupReview,
  pendingCount,
  reviewCounts,
  searchedCounts,
  segmentClick,
  type GroupField,
  type ReviewView,
  type ShortlistDecision,
  type ShortlistState,
} from "@/lib/registration/shortlist";
import { finaliseShortlistAction, setShortlistDecisionAction } from "@/app/admin/(app)/events/[id]/shortlist/actions";
import { TeamCard } from "./ParticipantsRoster";

export interface ReviewItem {
  id: string;
  team: TeamGroup;
  state: ShortlistState;
  search: unknown[];
  /** Answer per groupable question id (see `groupFields`), null when unanswered. */
  choices: Record<string, string | null>;
}

const CHOICES: { decision: ShortlistDecision; label: string }[] = [
  { decision: null, label: "Not decided" },
  { decision: "shortlist", label: "Shortlist" },
  { decision: "waitlist", label: "Waiting list" },
];
const stateFor = (d: ShortlistDecision): ShortlistState =>
  d === "shortlist" ? "picked" : d === "waitlist" ? "waitlist" : "undecided";
const BADGE: Record<ShortlistState, string> = {
  undecided: "abadge abadge-past",
  waitlist: "abadge abadge-pending",
  picked: "abadge abadge-approved",
  finalised: "abadge abadge-approved",
};

/** "12 teams · 3 shortlisted · 2 waiting" for one theme section. */
function groupSummary(items: ReviewItem[]): string {
  const c = reviewCounts(items.map((i) => i.state));
  return [
    `${c.All} ${c.All === 1 ? "team" : "teams"}`,
    c.Shortlisted ? `${c.Shortlisted} shortlisted` : "",
    c["Waiting list"] ? `${c["Waiting list"]} waiting` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * Review every registration on a shortlist event: put each team in a category
 * (silent, saved at once), then Finalise to email the shortlisted. Teams are
 * sectioned by a choice question — the theme, by default. A finalised team
 * being moved out gets an inline confirm — it was already told.
 */
export function ShortlistReview({ eventId, items, canEdit, groupFields = [], defaultGroup = null }: {
  eventId: string;
  items: ReviewItem[];
  canEdit: boolean;
  groupFields?: GroupField[];
  defaultGroup?: string | null;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ReviewView>("All");
  const [groupBy, setGroupBy] = useState<string>(defaultGroup ?? "");
  const [confirmOut, setConfirmOut] = useState<{ id: string; decision: ShortlistDecision } | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [shown, patch] = useOptimistic(items, (rows: ReviewItem[], p: { id: string; state: ShortlistState }) =>
    rows.map((r) => (r.id === p.id ? { ...r, state: p.state } : r)));

  const states = shown.map((i) => i.state);
  // Counts follow the search, so a chip never promises cards the search hides.
  const counts = searchedCounts(shown, q);
  const searching = q.trim() !== "";
  const toSend = pendingCount(states);
  const rows = filterReview(shown, q, view);
  const field = groupFields.find((f) => f.id === groupBy) ?? null;
  const groups = groupReview(rows, field);

  function choose(item: ReviewItem, decision: ShortlistDecision) {
    const out = segmentClick(item.state, decision, confirmOut?.id === item.id);
    if (out.kind === "noop") return;
    if (out.kind === "cancel") return setConfirmOut(null);
    if (out.kind === "ask") return setConfirmOut({ id: item.id, decision: out.decision });
    save(item, out.decision);
  }

  function save(item: ReviewItem, decision: ShortlistDecision) {
    setConfirmOut(null);
    setError("");
    setNotice("");
    startTransition(async () => {
      patch({ id: item.id, state: stateFor(decision) });
      try {
        const res = await setShortlistDecisionAction({ eventId, registrationId: item.id, decision });
        if (!res.ok) setError(res.error);
      } catch {
        setError("Could not save — refresh and try again.");
      }
    });
  }

  function finalise() {
    setConfirmFinal(false);
    setError("");
    startTransition(async () => {
      try {
        const res = await finaliseShortlistAction({ eventId });
        if (!res.ok) return setError(res.error);
        setNotice(
          res.teams === 0
            ? "Nothing new to send — every shortlisted team was already emailed."
            : `${res.teams} ${res.teams === 1 ? "team" : "teams"} emailed and added to attendance.${res.queued ? " The emails are queued in the Outbox." : ""}`,
        );
      } catch {
        setError("Could not finalise — refresh and try again.");
      }
    });
  }

  if (items.length === 0) return <div className="cal-empty">No registrations yet.</div>;

  const card = (item: ReviewItem) => (
    <TeamCard
      key={item.id}
      team={item.team}
      badge={<span className={BADGE[item.state]}>{item.state === "finalised" ? "Emailed" : STATE_LABEL[item.state]}</span>}
    >
      {canEdit ? (
        <div className="shortlist-choice">
          <div className="seg" role="radiogroup" aria-label={`Category for ${item.team.name ?? `team ${item.team.index}`}`}>
            {CHOICES.map((c) => (
              <button key={c.label} type="button" role="radio"
                aria-checked={decisionOf(item.state) === c.decision}
                data-on={decisionOf(item.state) === c.decision}
                data-kind={c.decision ?? "none"}
                onClick={() => choose(item, c.decision)}>
                {c.label}
              </button>
            ))}
          </div>
          {confirmOut?.id === item.id ? (
            <p className="shortlist-warn" role="alert">
              This team was already told they&rsquo;re selected — you&rsquo;ll need to tell them yourself.
              Their attendance will be cleared.{" "}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => save(item, confirmOut.decision)}>Confirm</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmOut(null)}>Cancel</button>
            </p>
          ) : null}
        </div>
      ) : null}
    </TeamCard>
  );

  return (
    <div className={canEdit ? "shortlist-review has-bar" : "shortlist-review"}>
      {canEdit ? (
        // On phones this bar pins to the bottom of the screen (CSS), so
        // Finalise stays in reach after scrolling through every team.
        <div className="shortlist-bar">
          {confirmFinal ? (
            <span className="shortlist-confirm" role="alert">
              Email {toSend} {toSend === 1 ? "team" : "teams"} that they&rsquo;re selected?
              <button type="button" className="btn btn-accent btn-sm" onClick={finalise} disabled={pending}>Confirm</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmFinal(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="btn btn-accent btn-sm" disabled={toSend === 0 || pending} onClick={() => setConfirmFinal(true)}>
              Finalise &amp; email ({toSend})
            </button>
          )}
          <span className="hint shortlist-hint-long">Choosing a category sends nothing. Finalise emails the shortlisted and adds them to attendance.</span>
          <span className="hint shortlist-hint-short">Categories save silently. Finalise sends the emails.</span>
        </div>
      ) : null}
      {notice ? (
        <p className="note" role="status" style={{ marginTop: 14 }}>
          {notice} <Link href={`/admin/events/${eventId}/registrations`}>Open attendance</Link>
        </p>
      ) : null}
      {error ? (
        <p className="note" role="alert" style={{ marginTop: 14, borderLeftColor: "var(--rust)" }}>{error}</p>
      ) : null}

      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true"><Search size={17} /></span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, roll, email, team, answers…" aria-label="Search registrations" />
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
        </div>
        <div className="listbar-row" role="group" aria-label="Filter by category">
          {REVIEW_VIEWS.map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => setView(v)}>
              {v} ({counts[v]})
            </button>
          ))}
        </div>
        {searching ? (
          <p className="count-note" aria-live="polite">
            {counts.All === 0
              ? `Nothing matches “${q.trim()}”`
              : `${counts.All} of ${shown.length} ${shown.length === 1 ? "entry" : "entries"} match`}
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="cal-empty">{searching ? "No matches in this category." : "Nothing here."}</div>
      ) : field ? (
        groups.map((g) => (
          <details className="review-group" key={g.key} open>
            <summary>
              <span className="review-group-title">{g.label}</span>
              <span className="review-group-count">{groupSummary(g.items)}</span>
            </summary>
            <div className="team-grid">{g.items.map(card)}</div>
          </details>
        ))
      ) : (
        <div className="team-grid">{rows.map(card)}</div>
      )}
    </div>
  );
}
