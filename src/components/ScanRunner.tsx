"use client";

import { useEffect, useState } from "react";

const MSG: Record<string, { icon: string; title: string; body: string }> = {
  submitting: { icon: "…", title: "Checking you in…", body: "One moment." },
  ok: { icon: "✓", title: "You're checked in", body: "Your attendance is recorded. See you there!" },
  already: { icon: "✓", title: "Already checked in", body: "This phone already checked in for this session." },
  closed: { icon: "⏱", title: "Check-in closed", body: "This window has ended — ask the organiser to open it again." },
  bad_code: { icon: "↻", title: "Code expired", body: "The QR changes every few seconds. Scan the one on screen right now." },
  no_device: { icon: "📱", title: "Phone not set up", body: "Open the confirmation link from your registration email on this phone first, then scan again." },
  not_registered: { icon: "?", title: "No registration found", body: "We couldn't find your registration for this event." },
  error: { icon: "!", title: "Something went wrong", body: "Please scan the QR again." },
};

export function ScanRunner({ session, code }: { session: string; code: string }) {
  const [status, setStatus] = useState(code ? "submitting" : "bad_code");

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    fetch("/api/attendance/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, code }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setStatus(typeof j?.status === "string" ? j.status : "error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [session, code]);

  const m = MSG[status] ?? MSG.error;
  return (
    <div className="scan-result">
      <div className={"scan-icon" + (status === "ok" || status === "already" ? " good" : "")}>
        {m.icon}
      </div>
      <h1 style={{ marginTop: 10 }}>{m.title}</h1>
      <p className="lead" style={{ marginTop: 10 }}>
        {m.body}
      </p>
    </div>
  );
}
