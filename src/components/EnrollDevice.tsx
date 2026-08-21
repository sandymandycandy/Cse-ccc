"use client";

import { useEffect, useState } from "react";

/**
 * Enrolls the current phone for attendance self-scan on confirm (§8a). Runs once
 * on mount; attendance is optional, so a failure stays silent rather than
 * alarming a student who just confirmed their seat.
 */
export function EnrollDevice({ token }: { token: string }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/devices/enroll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (!cancelled && r.ok) setOk(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!ok) return null;
  return (
    <div className="note" style={{ marginTop: 22 }}>
      📱 This phone is now set up for attendance — scan the QR your organiser shows
      to check in.
    </div>
  );
}
