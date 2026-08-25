import { describe, it, expect, beforeAll } from "vitest";
import { makeMemberSession, readMemberSession } from "./session";

const payload = { memberId: "m-1", clubId: "c-1", epoch: 3 };

beforeAll(() => { process.env.NEXTAUTH_SECRET = "test-secret-value-please"; });

describe("member session token", () => {
  it("round-trips a valid payload", () => {
    const t = makeMemberSession(payload, 1_000);
    expect(readMemberSession(t, 2_000)).toEqual(payload);
  });

  it("rejects a tampered body", () => {
    const t = makeMemberSession(payload, 1_000);
    const [body, sig] = t.split(".");
    const bad = `${body}x.${sig}`;
    expect(readMemberSession(bad, 2_000)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const t = makeMemberSession(payload, 1_000);
    expect(readMemberSession(t.slice(0, -2) + "zz", 2_000)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = makeMemberSession(payload, 1_000, 60_000); // exp = 61_000
    expect(readMemberSession(t, 62_000)).toBeNull();
  });

  it("rejects empty / malformed input", () => {
    expect(readMemberSession(undefined)).toBeNull();
    expect(readMemberSession("")).toBeNull();
    expect(readMemberSession("no-dot")).toBeNull();
  });
});
