"use client";

import { useEffect, useRef, useState } from "react";
import { formatCountdown, countdownLabel } from "@/lib/registration/countdown";

/**
 * Live "Registration opens in …" countdown shown before the open time. When it
 * elapses it reloads the page (after a small random delay) so the server
 * re-renders in the "open" phase with the real form — the jitter also spreads
 * the open-time herd. Residual clock skew is handled by RegisterForm's retry.
 */
export function RegistrationCountdown({ opensAt }: { opensAt: string }) {
  const target = new Date(opensAt).getTime();
  const [now, setNow] = useState<number>(() => Date.now());
  const reloadedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const parts = formatCountdown(target - now);

  useEffect(() => {
    if (!parts.done || reloadedRef.current) return;
    reloadedRef.current = true;
    const t = setTimeout(() => window.location.reload(), 500 + Math.floor(Math.random() * 1500));
    return () => clearTimeout(t);
  }, [parts.done]);

  if (parts.done) {
    return <div className="label">Opening now…</div>;
  }
  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>
        Registration opens in
      </div>
      <div
        suppressHydrationWarning
        style={{ font: "500 22px var(--mono)", color: "var(--forest)" }}
      >
        {countdownLabel(parts)}
      </div>
    </div>
  );
}
