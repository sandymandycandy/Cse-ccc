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
  pendingCount,
  searchedCounts,
  segmentClick,
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

/**
 * Review every registration on a shortlist event: put each team in a category
 * (silent, saved at once), then Finalise to email the shortlisted. A finalised
 * team being moved out gets an inline confirm — it was already told.
 */
export function ShortlistReview({ eventId, items, canEdit }: { eventId: string; items: ReviewItem[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ReviewView>("All");
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

  return (
    <>
      {canEdit ? (
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
          <span className="hint">Choosing a category sends nothing. Finalise emails the shortlisted and adds them to attendance.</span>
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
      ) : (
        <div className="team-grid">
          {rows.map((item) => (
            <TeamCard
              key={item.id}
              team={item.team}
              badge={<span className={BADGE[item.state]} style={{ marginRight: 8 }}>{item.state === "finalised" ? "Emailed" : STATE_LABEL[item.state]}</span>}
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
          ))}
        </div>
      )}
    </>
  );
}
