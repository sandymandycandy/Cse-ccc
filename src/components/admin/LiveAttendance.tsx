"use client";

import { useEffect, useState } from "react";

interface Feed {
  open: boolean;
  qr?: string;
  secondsLeft?: number;
  count?: number;
}

export function LiveAttendance({
  sessionId,
  closeAction,
}: {
  sessionId: string;
  closeAction: (formData: FormData) => Promise<void>;
}) {
  const [feed, setFeed] = useState<Feed | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/attendance/code?session=${sessionId}`, {
          cache: "no-store",
        });
        const j = (await r.json()) as Feed;
        if (active) setFeed(j);
      } catch {
        /* transient — keep the last frame */
      }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [sessionId]);

  if (!feed) return <p className="body-text">Starting check-in…</p>;

  return (
    <div className="att-live">
      <div className="att-count">
        <strong>{feed.count ?? 0}</strong>
        <span>checked in</span>
      </div>

      {feed.open ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={feed.qr} alt="Scan to check in" className="att-qr" width={280} height={280} />
          <p className="body-text" style={{ textAlign: "center" }}>
            Students scan this with their phone camera. Closes in{" "}
            <strong>{feed.secondsLeft ?? 0}s</strong>.
          </p>
          <form action={closeAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button type="submit" className="btn btn-ghost btn-sm">
              Close now
            </button>
          </form>
        </>
      ) : (
        <div className="note" style={{ textAlign: "center" }}>
          Check-in closed — {feed.count ?? 0} scanned.
          <br />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => window.location.reload()}
          >
            Open another
          </button>
        </div>
      )}
    </div>
  );
}
