import { describe, it, expect } from "vitest";
import {
  DEFAULT_CERTIFICATE_CONFIG,
  validateCertificateConfig,
  computeNamePlacement,
  type CertificateConfig,
} from "./config";

describe("validateCertificateConfig", () => {
  it("accepts a well-formed config and lowercases the colour", () => {
    const cfg = validateCertificateConfig({
      nameXPct: 55,
      nameYPct: 47,
      fontPct: 4.5,
      align: "center",
      color: "#AABBCC",
    });
    expect(cfg).toEqual({
      nameXPct: 55,
      nameYPct: 47,
      fontPct: 4.5,
      align: "center",
      color: "#aabbcc",
    });
  });

  it("falls back to the default on junk / out-of-range / bad colour", () => {
    expect(validateCertificateConfig(null)).toEqual(DEFAULT_CERTIFICATE_CONFIG);
    expect(validateCertificateConfig({ nameXPct: 200 })).toEqual(DEFAULT_CERTIFICATE_CONFIG);
    expect(
      validateCertificateConfig({ ...DEFAULT_CERTIFICATE_CONFIG, color: "red" }),
    ).toEqual(DEFAULT_CERTIFICATE_CONFIG);
    expect(
      validateCertificateConfig({ ...DEFAULT_CERTIFICATE_CONFIG, align: "middle" }),
    ).toEqual(DEFAULT_CERTIFICATE_CONFIG);
  });

  it("coerces numeric strings (form values arrive as strings)", () => {
    const cfg = validateCertificateConfig({
      nameXPct: "60",
      nameYPct: "50",
      fontPct: "5",
      align: "left",
      color: "#000000",
    });
    expect(cfg.nameXPct).toBe(60);
    expect(cfg.fontPct).toBe(5);
  });
});

describe("computeNamePlacement", () => {
  const base: CertificateConfig = {
    nameXPct: 50,
    nameYPct: 50,
    fontPct: 10,
    align: "center",
    color: "#000000",
  };

  it("centres the text on the anchor and converts to a bottom-left baseline", () => {
    const p = computeNamePlacement(1000, 700, base, 200);
    expect(p.size).toBe(70); // 10% of 700
    expect(p.x).toBe(400); // anchor 500 - half of 200
    // baseline from top = 350 + 70*0.35 = 374.5 ; y from bottom = 700 - 374.5
    expect(p.y).toBeCloseTo(325.5, 5);
  });

  it("left-aligns from the anchor", () => {
    const p = computeNamePlacement(1000, 700, { ...base, align: "left" }, 200);
    expect(p.x).toBe(500);
  });

  it("right-aligns so the text ends at the anchor", () => {
    const p = computeNamePlacement(1000, 700, { ...base, align: "right" }, 200);
    expect(p.x).toBe(300);
  });
});
