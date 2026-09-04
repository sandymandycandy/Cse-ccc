"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";

/**
 * Home-page prompt shown while a feedback window is open. Dismissal is stored
 * per-browser and keyed by the PERIOD ID, so dismissing one window's banner
 * does not suppress the next one.
 *
 * `localStorage` is an external store, so it is read through
 * useSyncExternalStore rather than an effect (which `react-hooks/
 * set-state-in-effect` rightly rejects). The server snapshot is "dismissed", so
 * nothing is rendered during SSR and there is no flash of a banner the reader
 * already dismissed — and no hydration mismatch.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Fallback for browsers where storage throws (private mode, blocked cookies):
 *  the dismissal still holds for this page view. */
const dismissedThisSession = new Set<string>();

const storageKey = (periodId: string) => `fb-dismissed:${periodId}`;

function readDismissed(periodId: string): boolean {
  if (dismissedThisSession.has(periodId)) return true;
  try {
    return localStorage.getItem(storageKey(periodId)) === "1";
  } catch {
    return false;
  }
}

function dismiss(periodId: string): void {
  dismissedThisSession.add(periodId);
  try {
    localStorage.setItem(storageKey(periodId), "1");
  } catch {
    /* storage blocked — the session fallback above carries it */
  }
  for (const onChange of listeners) onChange();
}

export function FeedbackBanner({ periodId }: { periodId: string }) {
  const getSnapshot = useCallback(() => readDismissed(periodId), [periodId]);
  const hidden = useSyncExternalStore(subscribe, getSnapshot, () => true);

  if (hidden) return null;

  return (
    <div className="fb-banner">
      <p>
        <strong>Feedback is open.</strong> Tell us how your club and its leads
        are doing — it goes only to the President and Vice President.
      </p>
      <div className="stack">
        <Link href="/feedback" className="btn btn-sm">
          Give feedback
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => dismiss(periodId)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
