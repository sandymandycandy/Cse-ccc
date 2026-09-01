import { describe, it, expect } from "vitest";
import { shouldRetry, nextDelay, MAX_ATTEMPTS } from "./retry";

describe("shouldRetry", () => {
  it("retries transient transport failures", () => {
    expect(shouldRetry({ kind: "http", status: 429 })).toBe(true);
    expect(shouldRetry({ kind: "http", status: 503 })).toBe(true);
    expect(shouldRetry({ kind: "network" })).toBe(true);
  });
  it("retries a not_open body (clock skew — opening imminently)", () => {
    expect(shouldRetry({ kind: "status", status: "not_open" })).toBe(true);
  });
  it("stops on terminal outcomes", () => {
    for (const s of ["registered", "submitted", "waitlisted", "duplicate", "full", "closed"]) {
      expect(shouldRetry({ kind: "status", status: s })).toBe(false);
    }
    expect(shouldRetry({ kind: "http", status: 400 })).toBe(false);
    expect(shouldRetry({ kind: "http", status: 404 })).toBe(false);
  });
});

describe("nextDelay", () => {
  it("honors Retry-After (seconds → ms) when given", () => {
    expect(nextDelay(1, 3)).toBe(3000);
  });
  it("grows with attempt and stays within a jittered cap band", () => {
    const d0 = nextDelay(0);
    const d3 = nextDelay(3);
    expect(d0).toBeGreaterThanOrEqual(400);
    expect(d0).toBeLessThanOrEqual(400 + 400); // base + max jitter
    expect(d3).toBeGreaterThan(d0);
    expect(nextDelay(99)).toBeLessThanOrEqual(4000 + 400); // capped + jitter
  });
  it("exposes a sane attempt ceiling", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(12);
  });
});
