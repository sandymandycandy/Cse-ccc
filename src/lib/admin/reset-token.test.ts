import { describe, it, expect } from "vitest";
import { isResetLive } from "./reset-token";

const now = new Date("2026-09-03T12:00:00.000Z");
const iso = (msFromNow: number) => new Date(now.getTime() + msFromNow).toISOString();

describe("isResetLive", () => {
  it("is live when unconsumed and not yet expired", () => {
    expect(isResetLive({ expiresAt: iso(60_000), consumedAt: null }, now)).toBe(true);
  });

  it("is dead once expired", () => {
    expect(isResetLive({ expiresAt: iso(-1), consumedAt: null }, now)).toBe(false);
  });

  it("is dead once consumed, even well before expiry", () => {
    expect(
      isResetLive({ expiresAt: iso(3_600_000), consumedAt: iso(-5_000) }, now),
    ).toBe(false);
  });

  it("is dead exactly at the expiry instant — the window is half-open", () => {
    expect(isResetLive({ expiresAt: iso(0), consumedAt: null }, now)).toBe(false);
  });

  it("treats an unparseable expiry as dead, never as live", () => {
    expect(isResetLive({ expiresAt: "not a date", consumedAt: null }, now)).toBe(false);
  });
});
