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
