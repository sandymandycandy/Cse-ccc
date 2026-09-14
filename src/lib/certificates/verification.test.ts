import { describe, it, expect } from "vitest";
import { atLeast, toVerifyResult, type VerifyRow } from "./verification";

const row = (over: Partial<VerifyRow> = {}): VerifyRow => ({
  serial: "CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ0",
  type: "participation",
  recipient_name: "Asha R",
  issued_at: "2026-09-14T06:00:00Z",
  revoked_at: null,
  superseded_by: null,
  group_label: "Volunteers",
  event: { title: "Hack Night", starts_at: "2026-09-12T04:30:00Z", ends_at: "2026-09-13T12:00:00Z", club_name: "Coding Club" },
  ...over,
});

describe("toVerifyResult", () => {
  it("a live certificate shows who, what, when and which group", () => {
    expect(toVerifyResult(row())).toEqual({
      state: "valid",
      serial: row().serial,
      name: "Asha R",
      eventTitle: "Hack Night",
      clubName: "Coding Club",
      eventDate: "12–13 September 2026",
      groupLabel: "Volunteers",
      issuedDate: "14 September 2026",
    });
  });

  it("falls back to the certificate type when no group label was stored", () => {
    expect(toVerifyResult(row({ group_label: null }))).toMatchObject({ groupLabel: "Participation" });
    expect(toVerifyResult(row({ group_label: "  ", type: "winner" }))).toMatchObject({ groupLabel: "Winner" });
  });

  it("a superseded certificate names the event but not the person", () => {
    const r = toVerifyResult(row({ revoked_at: "2026-09-15T00:00:00Z", superseded_by: "5f0c6a52-0000-4000-8000-000000000000" }));
    expect(r).toEqual({ state: "superseded", serial: row().serial, eventTitle: "Hack Night", issuedDate: "14 September 2026" });
    expect(JSON.stringify(r)).not.toContain("Asha");
  });

  it("a revoked certificate names the event and the date but not the person", () => {
    const r = toVerifyResult(row({ revoked_at: "2026-09-15T00:00:00Z" }));
    expect(r).toEqual({ state: "revoked", serial: row().serial, eventTitle: "Hack Night", revokedDate: "15 September 2026" });
    expect(JSON.stringify(r)).not.toContain("Asha");
  });

  it("no row, or a row whose event is gone, is not a valid certificate", () => {
    expect(toVerifyResult(null)).toEqual({ state: "unknown" });
    expect(toVerifyResult(row({ event: null }))).toEqual({ state: "unknown" });
  });
});

describe("atLeast", () => {
  function fakeClock(start = 1000) {
    let t = start;
    const slept: number[] = [];
    return {
      slept,
      advance: (ms: number) => {
        t += ms;
      },
      clock: {
        now: () => t,
        sleep: async (ms: number) => {
          slept.push(ms);
          t += ms;
        },
      },
    };
  }

  it("pads a fast answer up to the minimum", async () => {
    const c = fakeClock();
    const v = await atLeast(450, async () => {
      c.advance(30);
      return "hit";
    }, c.clock);
    expect(v).toBe("hit");
    expect(c.slept).toEqual([420]);
  });

  it("adds nothing to an answer that already took longer", async () => {
    const c = fakeClock();
    await atLeast(450, async () => {
      c.advance(900);
      return null;
    }, c.clock);
    expect(c.slept).toEqual([]);
  });

  it("still pads when the work throws, then rethrows", async () => {
    const c = fakeClock();
    await expect(
      atLeast(450, async () => {
        c.advance(10);
        throw new Error("db down");
      }, c.clock),
    ).rejects.toThrow("db down");
    expect(c.slept).toEqual([440]);
  });
});
