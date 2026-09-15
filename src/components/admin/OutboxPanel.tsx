"use client";

import { useState, useTransition } from "react";
import { drainBatchAction, retryFailedAction } from "@/app/admin/(app)/outbox/actions";

/** Roughly what a free Gmail app-password account will send in a day. */
const DAILY_CEILING = 500;

/**
 * Queue state and the two buttons that move it.
 *
 * The "sent today" tile carries the daily ceiling because the alternative is a
 * send that silently stops working partway through with no explanation on screen.
 */
export function OutboxPanel({
  pending,
  failed,
  sentToday,
  canDrain,
  recent,
}: {
  pending: number;
  failed: number;
  sentToday: number;
  canDrain: boolean;
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

  return (
    <div>
      <div className="admin-stats">
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
          <div className="hint" style={{ marginTop: 4 }}>
            of about {DAILY_CEILING} Gmail allows
          </div>
        </div>
      </div>

      {note ? (
        <div role="status" className="note" style={{ marginTop: 16 }}>
          {note}
        </div>
      ) : null}

      {canDrain ? (
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
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

      {recent.length > 0 ? (
        <div className="tablewrap cards" style={{ marginTop: 22 }}>
          <table>
            <thead>
              <tr>
                <th>To</th>
                <th>Subject</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td data-label="To" data-primary>{r.toEmail}</td>
                  <td data-label="Subject">{r.subject}</td>
                  <td data-label="Status">
                    {r.status}
                    {r.error ? ` — ${r.error}` : ""}
                  </td>
                  <td data-label="When">{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="body-text" style={{ marginTop: 22 }}>
          Nothing has been sent yet.
        </p>
      )}
    </div>
  );
}
