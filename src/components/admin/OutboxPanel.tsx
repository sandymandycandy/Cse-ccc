"use client";

import { useState, useTransition } from "react";
import { drainBatchAction, retryFailedAction } from "@/app/admin/(app)/outbox/actions";
import { DAILY_CEILING, ceilingPercent, statusTone } from "@/lib/admin/outbox-view";

/**
 * Queue state and the two buttons that move it.
 *
 * The daily ceiling is drawn, not just stated: the alternative is a send that
 * silently stops working partway through with no explanation on screen. It sits
 * below the tiles rather than inside the "sent today" one because it describes
 * the whole queue — and because a third of a phone row is no place for it.
 */
export function OutboxPanel({
  pending,
  failed,
  sentToday,
  canDrain,
  canSeeLog,
  recent,
}: {
  pending: number;
  failed: number;
  sentToday: number;
  canDrain: boolean;
  /**
   * ⚠️ Whether this viewer may see WHO was mailed.
   *
   * `email_log` has no club, sender or actor column, so the recent list cannot
   * be scoped per club — it is the last 20 rows org-wide for everyone. A club
   * head holds `manage:broadcast: own`, enough to open this page, and those
   * rows carry admin password-reset and invite traffic for other people. So
   * the addresses are for org-wide grants only, and the page does not even
   * query them otherwise.
   */
  canSeeLog: boolean;
  recent: {
    id: string;
    toEmail: string;
    subject: string;
    status: string;
    error: string | null;
    when: string;
  }[];
}) {
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const used = ceilingPercent(sentToday);

  // Chips are derived from the rows' own statuses, exactly as AdminTable does
  // it — nobody configures them, and a status that never appears never gets a
  // chip that always reads zero.
  const [view, setView] = useState("all");
  const kinds = Array.from(new Set(recent.map((r) => r.status)));
  const views = [
    { key: "all", label: "All", n: recent.length },
    ...kinds.map((k) => ({ key: k, label: k, n: recent.filter((r) => r.status === k).length })),
  ];
  const shown = view === "all" ? recent : recent.filter((r) => r.status === view);

  return (
    <div>
      <div className="admin-stats outbox-tiles">
        <div className="admin-stat">
          <div className="n">{pending}</div>
          <div className="label">Pending</div>
        </div>
        <div className="admin-stat">
          <div className="n">{failed}</div>
          <div className="label">Failed</div>
        </div>
        <div className="admin-stat">
          <div className="n">{sentToday}</div>
          <div className="label">Sent today</div>
        </div>
      </div>

      <div className="ceiling">
        <div
          className="bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={used}
          aria-label="Share of today's Gmail allowance used"
        >
          <i style={{ width: `${used}%` }} data-full={used >= 100 ? "true" : undefined} />
        </div>
        <span className="hint">
          {sentToday} of about {DAILY_CEILING} Gmail allows in a day
          {pending > 0 ? ` · ${pending} still waiting` : ""}
        </span>
      </div>

      {note ? (
        <div role="status" className="note" style={{ marginTop: 16 }}>
          {note}
        </div>
      ) : null}

      {canDrain ? (
        <div className="outbox-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || pending === 0}
            onClick={() =>
              start(async () => {
                const r = await drainBatchAction();
                setNote(r.error ?? `Sent ${r.sent ?? 0}, failed ${r.failed ?? 0}.`);
              })
            }
          >
            {busy ? "Sending…" : "Send next batch"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || failed === 0}
            onClick={() =>
              start(async () => {
                const r = await retryFailedAction();
                setNote(r.error ?? `Requeued ${r.retried ?? 0}.`);
              })
            }
          >
            Retry failed
          </button>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 16 }}>
          Your queued mail sends when the council presses send, or overnight.
        </p>
      )}

      {!canSeeLog ? (
        <p className="hint" style={{ marginTop: 22 }}>
          The counts above cover every send, including other clubs&rsquo;. Who was
          emailed is not shown here — the log is org-wide and cannot be narrowed
          to one club.
        </p>
      ) : recent.length > 0 ? (
        <>
          {/* The same view chips every AdminTable screen has. This table is a
              raw one — it has no rename column and no bulk actions — so it did
              not inherit them, and "which of these failed?" was a manual scan. */}
          <div className="outbox-views">
            {views.map((v) => (
              <button
                type="button"
                key={v.key}
                className="chip"
                aria-pressed={view === v.key}
                onClick={() => setView(v.key)}
              >
                {v.label}
                <span className="outbox-view-n">{v.n}</span>
              </button>
            ))}
          </div>
          <p className="outbox-rows">
            {shown.length === recent.length
              ? `${recent.length} ${recent.length === 1 ? "row" : "rows"}`
              : `${shown.length} of ${recent.length} rows`}
          </p>
        <div className="tablewrap cards" style={{ marginTop: 14 }}>
          {/* ⚠️ `admin` is load-bearing, not decoration: every th/td rule and
              the `.tablewrap.cards` phone collapse are scoped to `table.admin`.
              Without it the header falls back to centred, the cells lose their
              padding and borders, and the card mode only half applies. */}
          <table className="admin">
            <thead>
              <tr>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
                <th>When (IST)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td data-label="To" data-primary className="outbox-to">
                    {r.toEmail}
                  </td>
                  <td data-label="Subject">{r.subject}</td>
                  {/* The reason a send failed belongs to the status, on its own
                      line — concatenated into the cell it used to run past the
                      edge of a phone with no way to read the end of it. */}
                  <td data-label="Status">
                    <span className={`badge badge-${statusTone(r.status)}`}>{r.status}</span>
                    {r.error ? <span className="hint outbox-error">{r.error}</span> : null}
                  </td>
                  <td data-label="When (IST)" className="outbox-when">{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <p className="body-text" style={{ marginTop: 22 }}>
          Nothing has been sent yet.
        </p>
      )}
    </div>
  );
}
