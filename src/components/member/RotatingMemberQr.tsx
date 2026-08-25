"use client";

import { useEffect, useRef, useState } from "react";

/** Shows the member's QR and silently refreshes it before it expires (spec §6a). */
export function RotatingMemberQr({ initialQr, initialTtl }: { initialQr: string; initialTtl: number }) {
  const [qr, setQr] = useState(initialQr);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Refresh a couple of seconds BEFORE expiry so the on-screen QR is always live.
    const schedule = (ttl: number) => {
      const delay = Math.max(3, ttl - 2) * 1000;
      timer.current = setTimeout(async () => {
        try {
          const r = await fetch("/api/member/qr", { cache: "no-store" });
          const j = await r.json();
          if (!cancelled && j.qr) { setQr(j.qr); schedule(j.ttlSeconds ?? ttl); return; }
        } catch { /* transient — retry on the same cadence */ }
        if (!cancelled) schedule(ttl);
      }, delay);
    };
    schedule(initialTtl);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [initialTtl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={qr} alt="Your attendance QR" width={240} height={240}
         style={{ width: 240, height: 240, border: "1px solid var(--rule)", borderRadius: 12, padding: 12 }} />
  );
}
