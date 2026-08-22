import { describe, it, expect } from "vitest";
import { makeIdleToken, readIdleToken, isIdleExpired, IDLE_MS } from "./idle";

const SECRET = "test-secret-abc";

describe("idle token (HMAC-signed last-seen)", () => {
  it("round-trips a timestamp", () => {
    const ts = 1_700_000_000_000;
    expect(readIdleToken(makeIdleToken(ts, SECRET), SECRET)).toBe(ts);
  });

  it("rejects a token signed with a different secret", () => {
    const tok = makeIdleToken(Date.now(), SECRET);
    expect(readIdleToken(tok, "other-secret")).toBeNull();
  });

  it("rejects a tampered timestamp (signature no longer matches)", () => {
    const tok = makeIdleToken(1_700_000_000_000, SECRET);
    const forged = tok.replace("1700000000000", "1899999999999");
    expect(readIdleToken(forged, SECRET)).toBeNull();
  });

  it("returns null for absent or malformed values", () => {
    expect(readIdleToken(undefined, SECRET)).toBeNull();
    expect(readIdleToken(null, SECRET)).toBeNull();
    expect(readIdleToken("", SECRET)).toBeNull();
    expect(readIdleToken("no-dot", SECRET)).toBeNull();
  });
});

describe("isIdleExpired", () => {
  const now = 10_000_000;
  it("treats a null last-seen as fresh (not expired) — covers just-logged-in", () => {
    expect(isIdleExpired(null, now)).toBe(false);
  });
  it("is not expired within the window", () => {
    expect(isIdleExpired(now - (IDLE_MS - 1), now)).toBe(false);
  });
  it("is expired past the window", () => {
    expect(isIdleExpired(now - (IDLE_MS + 1), now)).toBe(true);
  });
  it("uses a 2-minute window", () => {
    expect(IDLE_MS).toBe(2 * 60 * 1000);
  });
});
