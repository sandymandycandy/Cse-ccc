import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth/guards";

vi.mock("server-only", () => ({}));

const session = vi.fn<() => Promise<AdminSession | null>>();
vi.mock("@/lib/auth/guards", () => ({ getAdminSession: () => session() }));

const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const writeAudit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ writeAudit: (e: unknown) => writeAudit(e) }));

// A fake of exactly the two query chains the action uses.
const update = vi.fn();
const db = {
  current: { maintenance: false } as { maintenance: boolean } | null,
  updateError: null as { message: string } | null,
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.current, error: null }) }) }),
      update: (values: unknown) => {
        update(values);
        return { eq: async () => ({ error: db.updateError }) };
      },
    }),
  }),
}));

const { setMaintenanceAction } = await import("./actions");
const { ADMIN_ROLES } = await import("@/lib/auth/capabilities");
const { MAINTENANCE_ROLES } = await import("@/lib/admin/site-status");

const as = (role: AdminSession["role"]): AdminSession => ({
  id: "admin-1", role, clubId: null, email: "a@b.c", name: "Sandy K",
});
const form = (on: string) => {
  const fd = new FormData();
  fd.set("on", on);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.current = { maintenance: false };
  db.updateError = null;
});

describe("setMaintenanceAction", () => {
  it("sends a signed-out visitor to login and touches nothing", async () => {
    session.mockResolvedValue(null);
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin/login");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects every role outside Tech Head / President / VP", async () => {
    for (const role of ADMIN_ROLES.filter((r) => !MAINTENANCE_ROLES.includes(r))) {
      session.mockResolvedValue(as(role));
      await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin");
    }
    expect(update).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("turns maintenance on, stamps who did it, and audits before/after", async () => {
    session.mockResolvedValue(as("president"));
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ maintenance: true, updated_by: "admin-1" }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "maintenance_on",
        entity: "site_settings",
        before: { maintenance: false },
        after: { maintenance: true },
      }),
    );
  });

  it("turns maintenance off", async () => {
    db.current = { maintenance: true };
    session.mockResolvedValue(as("tech_head"));
    await expect(setMaintenanceAction(form("false"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ maintenance: false }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "maintenance_off" }));
  });

  // A double-click or a stale tab posts the state it already has.
  it("treats re-posting the current state as a harmless no-op", async () => {
    db.current = { maintenance: true };
    session.mockResolvedValue(as("vice_president"));
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ maintenance: true }));
  });

  it("rejects a malformed value without writing", async () => {
    session.mockResolvedValue(as("tech_head"));
    await expect(setMaintenanceAction(form("maybe"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not audit a write that failed", async () => {
    db.updateError = { message: "boom" };
    session.mockResolvedValue(as("tech_head"));
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin?maintenance=error");
    expect(writeAudit).not.toHaveBeenCalled();
  });
});
