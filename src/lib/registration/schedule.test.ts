import { describe, it, expect } from "vitest";
import { parseSchedule } from "./schedule";

const START = "2026-09-05T10:00:00.000Z"; // event start (UTC)

describe("parseSchedule", () => {
  it("returns nulls when both fields are empty", () => {
    expect(parseSchedule("", "", START)).toEqual({ ok: true, opensAt: null, closesAt: null });
  });
  it("converts IST wall-clock inputs to UTC instants", () => {
    const r = parseSchedule("2026-09-01T17:00", "2026-09-03T17:00", START);
    expect(r).toEqual({
      ok: true,
      opensAt: "2026-09-01T11:30:00.000Z",
      closesAt: "2026-09-03T11:30:00.000Z",
    });
  });
  it("rejects opens after closes", () => {
    const r = parseSchedule("2026-09-03T17:00", "2026-09-01T17:00", START);
    expect(r.ok).toBe(false);
  });
  it("rejects opens after the event starts", () => {
    const r = parseSchedule("2026-09-06T17:00", "", START); // opens after Sep 5 start
    expect(r.ok).toBe(false);
  });
  it("rejects a malformed datetime", () => {
    expect(parseSchedule("not-a-date", "", START).ok).toBe(false);
  });
});
