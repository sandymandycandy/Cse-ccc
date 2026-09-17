"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setWinnerSourceAction } from "@/app/admin/(app)/events/[id]/certificates/actions";
import type { ListRow } from "@/lib/certificates/sheet";
import { ListEditor } from "./ListEditor";

/**
 * Where the Winners group's people come from (spec 2026-09-15 §4.1): the
 * event's published podium, or a list you upload yourself. Switching is refused
 * once certificates have been issued — the two sources identify people
 * differently, so switching would give someone a second live certificate.
 */
export function WinnersPanel({
  eventId,
  groupId,
  groupName,
  source,
  people,
  rows,
  offline,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  source: "results" | "sheet";
  /** Winners found on the podium — only meaningful for the results source. */
  people: number;
  rows: ListRow[];
  offline?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(next: "results" | "sheet") {
    if (offline) {
      setError("Switching only works on the real admin page.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await setWinnerSourceAction({ eventId, groupId, source: next });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="cd-list">
      <div className="stack">
        <span className="label">Winners come from</span>
        <button
          type="button"
          className="chip"
          aria-pressed={source === "results"}
          disabled={busy}
          onClick={() => switchTo("results")}
        >
          The published results
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={source === "sheet"}
          disabled={busy}
          onClick={() => switchTo("sheet")}
        >
          A list I enter
        </button>
      </div>

      {error ? (
        <p className="label" role="alert" style={{ color: "var(--rust)" }}>
          {error}
        </p>
      ) : null}

      {source === "results" ? (
        people > 0 ? (
          <p className="hint">
            {people} {people === 1 ? "person is" : "people are"} on this event&rsquo;s podium — ranks 1 to 3 of its last
            published round, everyone on a winning team included. Correct a placing in Results and it follows here.
          </p>
        ) : (
          <div className="cd-confirm">
            <p className="body-text">
              <strong>No published results yet.</strong> Publish the round&rsquo;s standings and its top three appear here
              automatically — or enter the winners yourself.
            </p>
            <div className="stack">
              <a className="btn btn-ghost btn-sm" href={`/admin/events/${eventId}/results`}>
                Open Results
              </a>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => switchTo("sheet")}>
                Use a list instead
              </button>
            </div>
          </div>
        )
      ) : (
        <ListEditor eventId={eventId} groupId={groupId} groupName={groupName} rows={rows} winners offline={offline} />
      )}
    </div>
  );
}
