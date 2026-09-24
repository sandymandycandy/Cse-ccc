import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { canToggleMaintenance, describeSiteStatus, MAINTENANCE_ROLES } = await import("./site-status");
const { ADMIN_ROLES } = await import("@/lib/auth/capabilities");

describe("canToggleMaintenance", () => {
  it("allows exactly Tech Head, President and VP", () => {
    expect([...MAINTENANCE_ROLES].sort()).toEqual(["president", "tech_head", "vice_president"]);
    for (const role of ADMIN_ROLES) {
      expect(canToggleMaintenance(role)).toBe(MAINTENANCE_ROLES.includes(role));
    }
  });

  // Owner decision 2026-09-24: unrestricted elsewhere, but not this lever.
  it("does not allow the Faculty Advisor", () => {
    expect(canToggleMaintenance("faculty_advisor")).toBe(false);
  });
});

describe("describeSiteStatus", () => {
  const row = { maintenance: true, updated_at: "2026-09-24T07:10:00Z", updater: { full_name: "Sandy K" } };

  it("reports the switch and who last flipped it", () => {
    expect(describeSiteStatus(undefined, row)).toEqual({
      maintenance: true,
      forced: false,
      available: true,
      updatedAt: "2026-09-24T07:10:00Z",
      updatedByName: "Sandy K",
    });
  });

  it("marks the state as forced when the env var decides", () => {
    const s = describeSiteStatus("off", row);
    expect(s.maintenance).toBe(false);
    expect(s.forced).toBe(true);
  });

  it("falls back to live and flags unavailable when the row can't be read", () => {
    expect(describeSiteStatus(undefined, null)).toEqual({
      maintenance: false,
      forced: false,
      available: false,
      updatedAt: null,
      updatedByName: null,
    });
  });

  it("handles a row never flipped by an admin", () => {
    expect(describeSiteStatus(undefined, { ...row, updater: null }).updatedByName).toBeNull();
  });
});

// The action redirects to the same /admin URL and React keeps client state
// across that re-render — so the card must be remounted when the switch
// changes, or the confirm step stays open offering the OPPOSITE flip.
//
// It lives HERE, not in MaintenanceCard.tsx: page.tsx calls it on the server,
// and every export of a "use client" file is a client reference that throws
// when called server-side (that shipped once and broke the dashboard).
describe("maintenanceCardKey", async () => {
  const { maintenanceCardKey } = await import("./site-status");
  const s = (maintenance: boolean, updatedAt: string | null) => ({
    maintenance, forced: false, available: true, updatedAt, updatedByName: null,
  });

  it("changes when the switch flips, so the card remounts closed", () => {
    expect(maintenanceCardKey(s(true, "2026-09-24T07:11:00Z")))
      .not.toBe(maintenanceCardKey(s(false, "2026-09-24T07:10:00Z")));
  });

  it("changes on a re-post of the same state (new updated_at)", () => {
    expect(maintenanceCardKey(s(true, "2026-09-24T07:12:00Z")))
      .not.toBe(maintenanceCardKey(s(true, "2026-09-24T07:10:00Z")));
  });
});

// Guard for the bug above: a "use client" module may export only components
// (PascalCase). A helper exported from one looks callable from a Server
// Component, type-checks, passes unit tests — and throws in production.
describe("client module exports", () => {
  it("MaintenanceCard.tsx exports only components", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/admin/MaintenanceCard.tsx", "utf8");
    expect(src.startsWith('"use client"')).toBe(true);
    const names = [...src.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toMatch(/^[A-Z]/);
  });
});
