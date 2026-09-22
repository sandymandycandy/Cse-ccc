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

  // The page is served for EVERY public URL, so a relative asset reference
  // would 404 on any nested route (/events/123 would fetch /events/app.css).
  // Everything but the web fonts therefore has to be inline, and the fonts
  // degrade to system fonts if Google is unreachable.
  it("is one self-contained file with no same-origin asset requests", async () => {
    const body = await maintenanceResponse().text();
    expect(body).toContain("maintenance");
    expect(body).not.toMatch(/<script[^>]+\bsrc=/i);
    expect(body).not.toMatch(/<link[^>]+\bhref=["'](?!https:\/\/fonts\.)/i);
    expect(body).not.toMatch(/<img\b/i);
  });

  // PAGE is a template literal, so a backtick, a ${...} or a backslash in the
  // HTML is silently swallowed (or worse, evaluated) on the way out. The page's
  // JS is written to avoid regex escapes for exactly this reason; this test is
  // what stops the next edit from quietly reintroducing one.
  it("contains nothing the template literal would mangle", async () => {
    const body = await maintenanceResponse().text();
    expect(body).not.toContain("\\");
    expect(body).not.toContain("`");
    expect(body).not.toContain("${");
  });

  // The toggle here writes the same cookie ThemeToggle.tsx writes, so a theme
  // picked while the site is down survives into the site coming back.
  it("shares the site's theme cookie rather than inventing its own", async () => {
    const body = await maintenanceResponse().text();
    expect(body).toContain('document.cookie = "theme=" + next');
    expect(body).not.toContain("localStorage");
  });
});
