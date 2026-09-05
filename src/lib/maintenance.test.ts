import { describe, expect, it } from "vitest";
import { isMaintenanceMode, isExemptPath, maintenanceResponse } from "./maintenance";

describe("isMaintenanceMode", () => {
  // The committed default is the switch; these tests assert the OVERRIDE
  // behaviour, which is what has to keep working whichever way the default is
  // currently set. Reading it here rather than hard-coding true/false means
  // flipping the switch does not require editing this file.
  const fallback = isMaintenanceMode(undefined);

  it("falls back to the committed default when the variable is absent", () => {
    expect(isMaintenanceMode(null)).toBe(fallback);
    expect(isMaintenanceMode("")).toBe(fallback);
    expect(isMaintenanceMode("   ")).toBe(fallback);
  });

  it("an affirmative value forces maintenance on", () => {
    for (const v of ["1", "true", "TRUE", "on", "yes", " true "]) {
      expect(isMaintenanceMode(v)).toBe(true);
    }
  });

  it("a negative value forces maintenance off", () => {
    for (const v of ["0", "false", "FALSE", "off", "no", " 0 "]) {
      expect(isMaintenanceMode(v)).toBe(false);
    }
  });

  // A typo must not silently answer the question. Falling through to the
  // committed default means a mistyped variable cannot quietly un-maintenance
  // a site that was deliberately taken down.
  it("ignores unrecognised values rather than guessing", () => {
    for (const v of ["maybe", "MAINTENANCE", "enabled", "2"]) {
      expect(isMaintenanceMode(v)).toBe(fallback);
    }
  });
});

describe("isExemptPath", () => {
  it("keeps the admin panel reachable during maintenance", () => {
    expect(isExemptPath("/admin")).toBe(true);
    expect(isExemptPath("/admin/login")).toBe(true);
    expect(isExemptPath("/admin/attendance/scan")).toBe(true);
  });

  it("gates every public route", () => {
    for (const p of ["/", "/clubs", "/events", "/feedback", "/calendar", "/api/registrations"]) {
      expect(isExemptPath(p)).toBe(false);
    }
  });

  // A public route must not sneak through by merely containing "/admin", and
  // "/administration" must not be mistaken for the admin panel.
  it("does not match lookalike paths", () => {
    expect(isExemptPath("/administration")).toBe(false);
    expect(isExemptPath("/clubs/admin")).toBe(false);
  });
});

describe("maintenanceResponse", () => {
  it("is a 503 so crawlers treat it as temporary, not as the site's content", () => {
    const res = maintenanceResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns self-contained HTML with no external dependency", async () => {
    const body = await maintenanceResponse().text();
    expect(body).toContain("maintenance");
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/src=["']http/i);
  });
});
