import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteStatus } from "@/lib/admin/site-status";

vi.mock("@/app/admin/(app)/maintenance/actions", () => ({ setMaintenanceAction: vi.fn() }));
const { MaintenanceCard, MaintenanceConfirm } = await import("./MaintenanceCard");

const status = (over: Partial<SiteStatus> = {}): SiteStatus => ({
  maintenance: false, forced: false, available: true,
  updatedAt: "2026-09-24T07:10:00Z", updatedByName: "Sandy K", ...over,
});
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("MaintenanceCard", () => {
  it("shows the live state, who flipped it, and an enabled take-down button", () => {
    const out = html(<MaintenanceCard status={status()} />);
    expect(out).toContain("Live");
    expect(out).toContain("Sandy K");
    expect(out).toMatch(/<button type="button" class="btn btn-ghost">Put site in maintenance<\/button>/);
  });

  it("offers to bring the site back when in maintenance", () => {
    const out = html(<MaintenanceCard status={status({ maintenance: true })} />);
    expect(out).toContain("In maintenance");
    expect(out).toContain("Bring site back live");
  });

  it("disables the button and explains when the env var is forcing the state", () => {
    const out = html(<MaintenanceCard status={status({ forced: true, maintenance: true })} />);
    expect(out).toContain("MAINTENANCE_MODE setting in Vercel");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Bring site back live/);
  });

  it("disables the button when the switch can't be read", () => {
    const out = html(<MaintenanceCard status={status({ available: false })} />);
    expect(out).toMatch(/switch unavailable/i);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Put site in maintenance/);
  });
});

describe("MaintenanceConfirm", () => {
  it("posts on=true with a take-down warning when the site is live", () => {
    const out = html(<MaintenanceConfirm on={false} onCancel={() => {}} />);
    expect(out).toContain("takes the public site down for everyone");
    expect(out).toContain('name="on" value="true"');
    expect(out).toContain(">Confirm</button>");
    expect(out).toContain(">Cancel</button>");
  });

  it("posts on=false with a bring-back message when in maintenance", () => {
    const out = html(<MaintenanceConfirm on={true} onCancel={() => {}} />);
    expect(out).toContain("brings the public site back for everyone");
    expect(out).toContain('name="on" value="false"');
  });
});

// The action redirects to the same /admin URL, and React keeps client state
// across that re-render — so the card must be remounted when the switch
// changes, or the confirm step stays open offering the OPPOSITE flip.
describe("maintenanceCardKey", () => {
  it("changes when the switch flips, so the card remounts closed", async () => {
    const { maintenanceCardKey } = await import("./MaintenanceCard");
    const before = status({ maintenance: false, updatedAt: "2026-09-24T07:10:00Z" });
    const after = status({ maintenance: true, updatedAt: "2026-09-24T07:11:00Z" });
    expect(maintenanceCardKey(after)).not.toBe(maintenanceCardKey(before));
  });

  it("changes on a re-post of the same state (new updated_at)", async () => {
    const { maintenanceCardKey } = await import("./MaintenanceCard");
    const a = status({ maintenance: true, updatedAt: "2026-09-24T07:10:00Z" });
    const b = status({ maintenance: true, updatedAt: "2026-09-24T07:12:00Z" });
    expect(maintenanceCardKey(b)).not.toBe(maintenanceCardKey(a));
  });
});
