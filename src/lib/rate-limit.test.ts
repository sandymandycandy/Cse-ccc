import { describe, it, expect } from "vitest";
import { checkLoginLimits, checkContactLimits } from "./rate-limit";

// The limiter keeps state in a module-level Map, so each test uses a unique
// email/ip to avoid cross-test contamination within the run.

describe("checkLoginLimits — 3 attempts then a 1-minute lockout", () => {
  it("allows exactly 3 attempts, then locks out with a retry-after ≤ 60s", () => {
    const id = { ip: "203.0.113.7", email: "lockout-a@example.test" };
    expect(checkLoginLimits(id).ok).toBe(true); // 1
    expect(checkLoginLimits(id).ok).toBe(true); // 2
    expect(checkLoginLimits(id).ok).toBe(true); // 3

    const fourth = checkLoginLimits(id);
    expect(fourth.ok).toBe(false); // 4th is locked
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("locks a single account even across different IPs (per-account key)", () => {
    const email = "lockout-b@example.test";
    expect(checkLoginLimits({ ip: "198.51.100.1", email }).ok).toBe(true); // 1
    expect(checkLoginLimits({ ip: "198.51.100.2", email }).ok).toBe(true); // 2
    expect(checkLoginLimits({ ip: "198.51.100.3", email }).ok).toBe(true); // 3
    expect(checkLoginLimits({ ip: "198.51.100.4", email }).ok).toBe(false); // 4 → locked
  });
});

describe("checkContactLimits — caps submissions per IP", () => {
  it("allows a burst then trips with a positive retry-after", () => {
    const id = { ip: "203.0.113.55", email: "contact-a@example.test" };
    let last = checkContactLimits(id);
    for (let i = 0; i < 20 && last.ok; i++) last = checkContactLimits(id);
    expect(last.ok).toBe(false);
    expect(last.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("caps a single email even from rotating IPs (per-email key)", () => {
    const email = "contact-b@example.test";
    let last = checkContactLimits({ ip: "10.0.0.1", email });
    for (let i = 2; i < 20 && last.ok; i++) {
      last = checkContactLimits({ ip: `10.0.0.${i}`, email });
    }
    expect(last.ok).toBe(false);
  });
});
