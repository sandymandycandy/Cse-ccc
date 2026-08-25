"use client";

import { useEffect, useRef, useState } from "react";

interface Feedback { kind: "marked" | "already" | "error"; text: string; }

/** Continuous camera scanner. Decodes a member QR (a URL ending in the token),
 *  posts it to the scan route, and shows feedback. Debounces repeat decodes.
 *  html5-qrcode is imported dynamically inside the effect so the module is never
 *  evaluated during SSR (it touches browser APIs). */
export function QrScanner({ sessionId }: { sessionId: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [count, setCount] = useState(0);
  const lastRef = useRef<{ token: string; at: number } | null>(null);

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;

    async function onDecode(text: string) {
      // The QR encodes …/m/<memberId>.<sig>; take the last path segment as the token.
      const token = text.split("/").pop() ?? text;
      const now = Date.now();
      if (lastRef.current && lastRef.current.token === token && now - lastRef.current.at < 3000) return;
      lastRef.current = { token, at: now };
      try {
        const r = await fetch("/api/admin/attendance/club/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, token }),
        });
        const j = await r.json();
        if (r.ok && j.status === "marked") {
          setFeedback({ kind: "marked", text: `✓ ${j.member.name}` });
          setCount((c) => c + 1);
        } else if (r.ok && j.status === "already") {
          setFeedback({ kind: "already", text: `Already in: ${j.member.name}` });
        } else {
          setFeedback({ kind: "error", text: j.error ?? "Scan failed." });
        }
      } catch {
        setFeedback({ kind: "error", text: "Network error — try again." });
      }
    }

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      scanner = new Html5Qrcode("qr-reader");
      await scanner
        .start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onDecode, () => {})
        .catch(() => setFeedback({ kind: "error", text: "Couldn't start the camera. Grant permission and reload." }));
    })();

    return () => {
      scanner?.stop().catch(() => {});
    };
  }, [sessionId]);

  const color = feedback?.kind === "marked" ? "var(--forest)" : feedback?.kind === "already" ? "var(--ink-2)" : "var(--rust)";
  return (
    <div style={{ maxWidth: 360 }}>
      <div id="qr-reader" style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} />
      <div style={{ marginTop: 12, minHeight: 24, fontWeight: 500, color }}>{feedback?.text ?? "Point the camera at a member's QR."}</div>
      <div className="label" style={{ color: "var(--ink-3)" }}>Marked this run: {count}</div>
    </div>
  );
}
