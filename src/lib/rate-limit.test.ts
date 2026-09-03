import { describe, it, expect } from "vitest";
import { checkLoginLimits, checkContactLimits, peekLoginLimits } from "./rate-limit";

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

describe("peekLoginLimits — reports the lock without spending an attempt", () => {
  it("does not consume: peeking many times still leaves all 3 chances", () => {
    const id = { ip: "203.0.113.40", email: "peek-a@example.test" };
    for (let i = 0; i < 10; i++) expect(peekLoginLimits(id).ok).toBe(true);

    // All three real attempts must still be available after that peeking.
    expect(checkLoginLimits(id).ok).toBe(true); // 1
    expect(checkLoginLimits(id).ok).toBe(true); // 2
    expect(checkLoginLimits(id).ok).toBe(true); // 3
    expect(checkLoginLimits(id).ok).toBe(false); // 4 → locked
  });

  it("is ok before any attempt has been made", () => {
    expect(peekLoginLimits({ ip: "203.0.113.41", email: "peek-b@example.test" }).ok).toBe(true);
  });

  it("reports locked with a retry-after once the 3 attempts are spent", () => {
    const id = { ip: "203.0.113.42", email: "peek-c@example.test" };
    checkLoginLimits(id);
    checkLoginLimits(id);
    checkLoginLimits(id);

    const peeked = peekLoginLimits(id);
    expect(peeked.ok).toBe(false);
    expect(peeked.retryAfterSeconds).toBeGreaterThan(0);
    expect(peeked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("agrees with checkLoginLimits at every point in the window", () => {
    const id = { ip: "203.0.113.43", email: "peek-d@example.test" };
    for (let i = 0; i < 3; i++) {
      expect(peekLoginLimits(id).ok).toBe(true);
      expect(checkLoginLimits(id).ok).toBe(true);
    }
    expect(peekLoginLimits(id).ok).toBe(false);
    expect(checkLoginLimits(id).ok).toBe(false);
  });

  it("locks on the account key even from a fresh IP", () => {
    const email = "peek-e@example.test";
    checkLoginLimits({ ip: "198.51.100.20", email });
    checkLoginLimits({ ip: "198.51.100.21", email });
    checkLoginLimits({ ip: "198.51.100.22", email });
    expect(peekLoginLimits({ ip: "198.51.100.99", email }).ok).toBe(false);
  });
});

// Models the exact call sequence `loginAction` performs per submit: peek before
// `signIn`, `authorize` consumes one attempt, peek again to report a fresh lock.
// Browser verification of the form is still owed; this pins the counting so the
// "lock appears on the 2nd submit" regression cannot land unnoticed.
describe("the login action's peek → consume → peek sequence", () => {
  const submit = (id: { ip: string; email: string }) => {
    const before = peekLoginLimits(id);
    if (!before.ok) return { locked: true, spent: false };
    checkLoginLimits(id); // what `authorize` does
    return { locked: !peekLoginLimits(id).ok, spent: true };
  };

  it("gives exactly 3 chances, and reports the lock on the 3rd", () => {
    const id = { ip: "203.0.113.60", email: "seq-a@example.test" };
    expect(submit(id)).toEqual({ locked: false, spent: true }); // 1
    expect(submit(id)).toEqual({ locked: false, spent: true }); // 2
    expect(submit(id)).toEqual({ locked: true, spent: true }); // 3 → says so now
  });

  it("a 4th submit is refused without spending anything further", () => {
    const id = { ip: "203.0.113.61", email: "seq-b@example.test" };
    submit(id);
    submit(id);
    submit(id);
    expect(submit(id)).toEqual({ locked: true, spent: false });
  });
});
