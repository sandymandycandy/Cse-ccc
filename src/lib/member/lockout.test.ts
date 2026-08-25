import { describe, it, expect } from "vitest";
import { isLocked, nextFailureState, MAX_FAILED, LOCKOUT_MS } from "./lockout";

describe("member lockout", () => {
  it("is not locked when locked_until is null or past", () => {
    expect(isLocked(null, 1000)).toBe(false);
    expect(isLocked(new Date(500).toISOString(), 1000)).toBe(false);
  });

  it("is locked while locked_until is in the future", () => {
    expect(isLocked(new Date(2000).toISOString(), 1000)).toBe(true);
  });

  it("does not lock before MAX_FAILED", () => {
    const s = nextFailureState(MAX_FAILED - 2, 1000); // → MAX_FAILED-1
    expect(s.failed_attempts).toBe(MAX_FAILED - 1);
    expect(s.locked_until).toBeNull();
  });

  it("locks on the MAX_FAILED-th failure", () => {
    const s = nextFailureState(MAX_FAILED - 1, 1000); // → MAX_FAILED
    expect(s.failed_attempts).toBe(MAX_FAILED);
    expect(s.locked_until).toBe(new Date(1000 + LOCKOUT_MS).toISOString());
  });
});
