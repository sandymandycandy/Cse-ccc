"use client";

import { useState } from "react";

/**
 * Share the page a student is looking at.
 *
 * Uses the native share sheet where the browser offers one (phones, which is
 * where results actually get passed around), and falls back to copying the link.
 * The label reports what happened rather than staying generic, and reverts so
 * the control is obviously reusable.
 */
export function ShareButton({ title }: { title: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissing the sheet lands here too, so fall through to copying
        // rather than reporting a failure the reader did not cause.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
      <span aria-live="polite">
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Share"}
      </span>
    </button>
  );
}
