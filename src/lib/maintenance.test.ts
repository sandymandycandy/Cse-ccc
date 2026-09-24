import { describe, expect, it } from "vitest";
import {
  parseMaintenanceFlag,
  resolveMaintenance,
  isExemptPath,
  maintenanceResponse,
} from "./maintenance";

describe("parseMaintenanceFlag", () => {
  it("reads affirmative values as on", () => {
    for (const v of ["1", "true", "TRUE", "on", "yes", " true "]) {
      expect(parseMaintenanceFlag(v)).toBe(true);
    }
  });

  it("reads negative values as off", () => {
    for (const v of ["0", "false", "FALSE", "off", "no", " 0 "]) {
      expect(parseMaintenanceFlag(v)).toBe(false);
    }
  });

  // A typo must not answer the question — it means "no override".
  it("treats absent or unrecognised values as no answer", () => {
    for (const v of [undefined, null, "", "   ", "maybe", "MAINTENANCE", "enabled", "2"]) {
      expect(parseMaintenanceFlag(v)).toBeNull();
    }
  });
});

describe("resolveMaintenance", () => {
  it("lets a recognised env value override the switch both ways", () => {
    expect(resolveMaintenance("on", false)).toBe(true);
    expect(resolveMaintenance("off", true)).toBe(false);
  });

  it("uses the admin switch when the env var says nothing", () => {
    expect(resolveMaintenance(undefined, true)).toBe(true);
    expect(resolveMaintenance("typo", false)).toBe(false);
  });

  // Cold instance, database unreachable: the committed default decides, and
  // that default is now "live" — the switch is the source of truth.
  it("falls back to the committed default (live) when nothing is known", () => {
    expect(resolveMaintenance(undefined, null)).toBe(false);
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
