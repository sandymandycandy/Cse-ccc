"use client";

import { useEffect, useState } from "react";

interface Feed { open: boolean; count: number; present: { memberId: string; name: string }[] }

export function LiveSession({ sessionId, initial }: { sessionId: string; initial: Feed }) {
  const [feed, setFeed] = useState<Feed>(initial);
  useEffect(() => {
    if (!initial.open) return; // closed session — nothing live to poll
    let active = true;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/attendance/club/feed?session=${sessionId}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as Feed;
        if (!active) return;
        setFeed(j);
        if (!j.open) clearInterval(iv); // session just closed — stop polling
      } catch { /* keep last frame */ }
    }, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [sessionId, initial.open]);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="att-count"><strong>{feed.count}</strong><span>present{feed.open ? " · live" : " · closed"}</span></div>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "grid", gap: 4 }}>
        {feed.present.map((p) => <li key={p.memberId} className="rule" style={{ paddingBottom: 6 }}>✓ {p.name}</li>)}
      </ul>
    </div>
  );
}
