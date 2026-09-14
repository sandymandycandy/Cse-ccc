"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { issueCertificatesBatchAction } from "@/app/admin/(app)/events/[id]/certificates/actions";
import type { IssueMode, RecipientCounts } from "@/lib/certificates/recipients";

interface Progress {
  done: number;
  failed: number;
  skipped: number;
  emails: number;
  remaining: number;
}

/**
 * Bulk issuing (spec §5.2): the browser calls one server batch at a time behind
 * a progress bar, so a long run survives the function timeout and can be
 * stopped. Closing the tab only stops it; the next run picks up where it left,
 * and nobody is ever issued twice.
 */
export function IssuePanel({
  eventId,
  groupId,
  groupName,
  counts,
  hasTemplate,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  counts: RecipientCounts;
  hasTemplate: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<IssueMode | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run(mode: IssueMode) {
    stop.current = false;
    setRunning(mode);
    setError(null);
    const p: Progress = {
      done: 0,
      failed: 0,
      skipped: 0,
      emails: 0,
      remaining: mode === "email" ? counts.pendingEmail : counts.pendingEmail + counts.noEmail,
    };
    setProgress({ ...p });
    try {
      while (!stop.current) {
        const res = await issueCertificatesBatchAction({ eventId, groupIds: [groupId], mode });
        if (!res.ok) {
          setError(res.error);
          break;
        }
        p.done += res.sent + res.recorded;
        p.failed += res.failed;
        p.skipped += res.skipped;
        p.emails += res.emails;
        p.remaining = res.remaining;
        setProgress({ ...p });
        if (res.processed === 0 || res.remaining === 0) break;
        if (res.sent + res.recorded + res.skipped === 0) {
          setError("Every certificate in the last batch failed. Check the email settings, then run again.");
          break;
        }
      }
    } catch {
      setError("Lost the connection while issuing. Run again to continue — nobody gets a certificate twice.");
    } finally {
      setRunning(null);
      router.refresh();
    }
  }

  const total = progress ? progress.done + progress.failed + progress.remaining : 0;

  return (
    <section style={{ marginTop: 18 }}>
      <p className="body-text">
        <strong>{groupName}</strong>: {counts.total} {counts.total === 1 ? "person" : "people"} · {counts.issued} issued ·{" "}
        {counts.pendingEmail} to email
        {counts.noEmail ? ` · ${counts.noEmail} without an address (issue then download)` : ""}
        {counts.revoked ? ` · ${counts.revoked} revoked` : ""}
      </p>

      <div className="stack" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-accent btn-sm"
          disabled={running !== null || !hasTemplate || counts.pendingEmail === 0}
          onClick={() => run("email")}
        >
          {running === "email" ? "Sending…" : `Issue & email (${counts.pendingEmail})`}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={running !== null || !hasTemplate || counts.pendingEmail + counts.noEmail === 0}
          onClick={() => run("record")}
        >
          {running === "record" ? "Issuing…" : "Issue only (no email)"}
        </button>
        {running ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (stop.current = true)}>
            Stop
          </button>
        ) : null}
        {!hasTemplate ? <span className="hint">Add a template in the Design tab first.</span> : null}
      </div>

      {progress ? (
        <div style={{ marginTop: 12, maxWidth: 520 }}>
          <progress value={progress.done + progress.failed} max={Math.max(1, total)} style={{ width: "100%" }} />
          <p className="hint">
            {progress.done} done{progress.emails ? ` in ${progress.emails} email${progress.emails === 1 ? "" : "s"}` : ""}
            {progress.failed ? ` · ${progress.failed} failed (retried next run)` : ""}
            {progress.skipped ? ` · ${progress.skipped} already issued` : ""} · {progress.remaining} left
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="label" role="alert" style={{ color: "var(--rust)", marginTop: 8 }}>
          {error}
        </p>
      ) : null}

      <p className="hint" style={{ marginTop: 14, maxWidth: 620 }}>
        Team members without an email of their own are sent to their team leader, who gets one message with every
        certificate for their team. See who gets what on the <strong>Recipients</strong> tab.
      </p>
    </section>
  );
}
