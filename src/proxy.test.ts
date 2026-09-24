import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/maintenance-switch", () => ({ getMaintenanceSwitch: vi.fn() }));

const { getMaintenanceSwitch } = await import("@/lib/maintenance-switch");
const { proxy } = await import("./proxy");
const switchMock = vi.mocked(getMaintenanceSwitch);

const req = (path: string) => new NextRequest(new URL(path, "https://site.test"));

describe("proxy maintenance gate", () => {
  beforeEach(() => {
    switchMock.mockReset();
    vi.stubEnv("MAINTENANCE_MODE", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("serves the maintenance page on public routes when the switch is on", async () => {
    switchMock.mockResolvedValue(true);
    const res = await proxy(req("/events"));
    expect(res.status).toBe(503);
  });

  it("lets public routes through when the switch is off", async () => {
    switchMock.mockResolvedValue(false);
    const res = await proxy(req("/events"));
    expect(res.status).not.toBe(503);
  });

  it("stays live when the switch is unknown (cold instance, DB down)", async () => {
    switchMock.mockResolvedValue(null);
    const res = await proxy(req("/"));
    expect(res.status).not.toBe(503);
  });

  it("never reads the switch for the admin panel", async () => {
    switchMock.mockResolvedValue(true);
    const res = await proxy(req("/admin/login"));
    expect(res.status).not.toBe(503);
    expect(switchMock).not.toHaveBeenCalled();
  });

  it("lets a recognised env value win without touching the database", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "off");
    switchMock.mockResolvedValue(true);
    expect((await proxy(req("/events"))).status).not.toBe(503);
    vi.stubEnv("MAINTENANCE_MODE", "on");
    switchMock.mockResolvedValue(false);
    expect((await proxy(req("/events"))).status).toBe(503);
    expect(switchMock).not.toHaveBeenCalled();
  });
});
