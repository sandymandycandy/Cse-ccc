"use client";

import { useState } from "react";
import type { SiteStatus } from "@/lib/admin/site-status";
import { setMaintenanceAction } from "@/app/admin/(app)/maintenance/actions";
import { istDateMedium, istTime } from "@/lib/datetime";

/**
 * Use as the card's `key`. The action redirects back to the same /admin URL and
 * React keeps client state across that re-render, so without a new key the
 * confirm step would stay open — now offering the opposite flip.
 */
export function maintenanceCardKey(status: SiteStatus): string {
  return `${status.maintenance}-${status.updatedAt ?? "never"}`;
}

/** Dashboard control for the public site's maintenance switch (TH / President / VP only). */
export function MaintenanceCard({ status }: { status: SiteStatus }) {
  const [confirming, setConfirming] = useState(false);
  const on = status.maintenance;
  const blocked = status.forced || !status.available;

  return (
    <section className="dashboard-site" data-state={on ? "maintenance" : "live"} aria-labelledby="site-status-title">
      <div className="dashboard-site-copy">
        <span className="dashboard-kicker">Public site</span>
        <h2 id="site-status-title">{on ? "🔧 In maintenance" : "🟢 Live"}</h2>
        {status.forced ? (
          <p>Forced {on ? "on" : "off"} by the MAINTENANCE_MODE setting in Vercel — remove it there to use this switch.</p>
        ) : !status.available ? (
          <p>Switch unavailable — the setting couldn&apos;t be read. Try again shortly.</p>
        ) : status.updatedByName && status.updatedAt ? (
          <p>
            Turned {on ? "on" : "off"} by {status.updatedByName} · {istDateMedium(status.updatedAt)}, {istTime(status.updatedAt)}
          </p>
        ) : null}
      </div>

      {confirming ? (
        <MaintenanceConfirm on={on} onCancel={() => setConfirming(false)} />
      ) : (
        <button type="button" className="btn btn-ghost" disabled={blocked} onClick={() => setConfirming(true)}>
          {on ? "Bring site back live" : "Put site in maintenance"}
        </button>
      )}
    </section>
  );
}

/** The confirm step: posts the OPPOSITE of the current state. */
export function MaintenanceConfirm({ on, onCancel }: { on: boolean; onCancel: () => void }) {
  return (
    <form action={setMaintenanceAction} className="dashboard-site-confirm">
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <p>
        {on
          ? "This brings the public site back for everyone. Continue?"
          : "This takes the public site down for everyone. Continue?"}
      </p>
      <button type="submit" className="btn btn-primary btn-sm">Confirm</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}
