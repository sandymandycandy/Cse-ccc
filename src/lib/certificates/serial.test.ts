import { describe, it, expect } from "vitest";
import { encodeCrockford, newCertificateSerial, normalizeSerial, SERIAL_RE } from "./serial";

describe("encodeCrockford", () => {
  it("encodes 128 bits as 26 symbols, most significant first", () => {
    expect(encodeCrockford(new Uint8Array(16))).toBe("0".repeat(26));
    // 130 bits of room with the top two always zero, so the first symbol is at most 7.
    expect(encodeCrockford(new Uint8Array(16).fill(0xff))).toBe("7" + "Z".repeat(25));
    const one = new Uint8Array(16);
    one[15] = 1;
    expect(encodeCrockford(one)).toBe("0".repeat(25) + "1");
  });
});

describe("newCertificateSerial", () => {
  it("is CSE-<IST year>- then 26 symbols grouped 5-5-5-5-6", () => {
    const s = newCertificateSerial();
    expect(s).toMatch(SERIAL_RE);
    expect(s.replace(/^CSE-\d{4}-/, "").replace(/-/g, "")).toHaveLength(26);
  });

  it("takes the year in IST, not UTC", () => {
    // 31 Dec 2025 19:00 UTC is already 1 Jan 2026 in India.
    expect(newCertificateSerial(undefined, new Date("2025-12-31T19:00:00Z"))).toMatch(/^CSE-2026-/);
  });

  it("uses all 16 random bytes", () => {
    const fixed = (n: number) => new Uint8Array(n).fill(0xff);
    expect(newCertificateSerial(fixed, new Date("2026-09-14T00:00:00Z"))).toBe("CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZZ");
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newCertificateSerial()));
    expect(seen.size).toBe(2000);
  });
});

describe("normalizeSerial", () => {
  const canonical = "CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ0";

  it("accepts the canonical form unchanged", () => {
    expect(normalizeSerial(canonical)).toBe(canonical);
  });

  it("forgives case, spaces, missing dashes and look-alike letters", () => {
    expect(normalizeSerial(`  cse-2026-7zzzz zzzzz-zzzzz-zzzzz-zzzzzO `)).toBe(canonical);
    expect(normalizeSerial(`CSE2026 7${"Z".repeat(24)}O`)).toBe(canonical);
    expect(normalizeSerial("CSE-2026-I0000-L0000-00000-00000-000000")).toBe("CSE-2026-10000-10000-00000-00000-000000");
  });

  it("keeps v1 serials (8 hex digits) valid", () => {
    expect(normalizeSerial("cse-2026-9f3ac1b2")).toBe("CSE-2026-9F3AC1B2");
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "CSE-PREVIEW",
      "CSE-2026-12345",
      `CSE-2026-U${"0".repeat(25)}`,
      `CSE-2026-${"0".repeat(27)}`,
      "x".repeat(200),
      "../admin",
    ]) {
      expect(normalizeSerial(bad), bad).toBeNull();
    }
  });
});
