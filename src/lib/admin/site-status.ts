import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/auth/capabilities";
import { parseMaintenanceFlag, resolveMaintenance } from "@/lib/maintenance";

/**
 * Who may take the public site down (owner decision 2026-09-24). Deliberately
 * NOT the Faculty Advisor, who is otherwise unrestricted — do not "fix" this by
 * switching to a capability check.
 */
export const MAINTENANCE_ROLES: readonly AdminRole[] = ["tech_head", "president", "vice_president"];

export function canToggleMaintenance(role: AdminRole): boolean {
  return MAINTENANCE_ROLES.includes(role);
}

export type SiteSettingsRow = {
  maintenance: boolean;
  updated_at: string;
  updater: { full_name: string } | null;
};

export interface SiteStatus {
  /** What visitors get (modulo the proxy's ≤10 s cache). */
  maintenance: boolean;
  /** MAINTENANCE_MODE is deciding; the button can't change anything. */
  forced: boolean;
  /** The switch row could be read. */
  available: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export function describeSiteStatus(
  envValue: string | undefined | null,
  row: SiteSettingsRow | null,
): SiteStatus {
  return {
    maintenance: resolveMaintenance(envValue, row?.maintenance ?? null),
    forced: parseMaintenanceFlag(envValue) !== null,
    available: row !== null,
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updater?.full_name ?? null,
  };
}

/**
 * Use as the MaintenanceCard's `key` (see page.tsx). The action redirects back
 * to the same /admin URL and React keeps client state across that re-render,
 * so without a new key the confirm step would stay open — now offering the
 * opposite flip. Kept here, not in the "use client" card file: page.tsx calls it
 * on the server, where a client module's exports are references that throw.
 */
export function maintenanceCardKey(status: SiteStatus): string {
  return `${status.maintenance}-${status.updatedAt ?? "never"}`;
}

/**
 * Fresh, uncached-by-TTL read for the admin panel (the dashboard card and the
 * banner). Never throws: an unreadable row reports `available: false`.
 */
export const getSiteStatus = cache(async function getSiteStatus(): Promise<SiteStatus> {
  let row: SiteSettingsRow | null = null;
  try {
    const { data, error } = await createAdminClient()
      .from("site_settings")
      .select("maintenance, updated_at, updater:admin_users(full_name)")
      .eq("id", true)
      .maybeSingle();
    if (error) console.error("site_settings read failed:", error.message);
    else row = (data as SiteSettingsRow | null) ?? null;
  } catch (err) {
    console.error("site_settings read failed:", err instanceof Error ? err.message : err);
  }
  return describeSiteStatus(process.env.MAINTENANCE_MODE, row);
});
