import { describe, it, expect } from "vitest";
import {
  DEFAULT_CERTIFICATE_CONFIG,
  validateCertificateConfig,
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
