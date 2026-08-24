import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.ATTENDANCE_HMAC_SECRET = "test-secret-attendance";
});

// Import AFTER the env is set (the module reads the secret lazily, but be safe).
const { memberToken, verifyMemberToken } = await import("./attendance");

describe("member QR token", () => {
  const id = "11111111-1111-1111-1111-111111111111";

  it("round-trips a valid token back to the member id", () => {
    const t = memberToken(id);
    expect(t.startsWith(id + ".")).toBe(true);
    expect(verifyMemberToken(t)).toBe(id);
  });

  it("rejects a tampered signature", () => {
    const t = memberToken(id);
    const bad = t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
    expect(verifyMemberToken(bad)).toBe(null);
  });

  it("rejects a token whose id was swapped (sig no longer matches)", () => {
    const t = memberToken(id);
    const otherId = "22222222-2222-2222-2222-222222222222";
    const forged = otherId + "." + t.split(".")[1];
    expect(verifyMemberToken(forged)).toBe(null);
  });

  it("rejects malformed tokens", () => {
    expect(verifyMemberToken("")).toBe(null);
    expect(verifyMemberToken("nodot")).toBe(null);
    expect(verifyMemberToken("a.b.c")).toBe(null);
  });
});
