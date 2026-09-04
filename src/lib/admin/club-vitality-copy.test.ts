import { describe, it, expect } from "vitest";
import { diagnosis, lastMet, turnoutSummary, FLAG_LABEL, FLAG_TONE } from "./club-vitality-copy";
import type { ClubVitality, VitalityFlag } from "./club-vitality";

const row = (over: Partial<ClubVitality> = {}): ClubVitality => ({
  clubId: "c1",
  name: "Test Club",
  activeMembers: 20,
  sessionsInWindow: 4,
  sessionsAllTime: 4,
  daysSinceLastSession: 2,
  ratePct: 50,
  attended: 40,
  eligible: 80,
  flags: [],
  ...over,
});

describe("diagnosis", () => {
  it("states members, meetings and turnout with the attendance behind it", () => {
    // Rule 1: no percentage without its n. Ai Forge's real shape.
    expect(diagnosis(row({ activeMembers: 174, sessionsInWindow: 2, ratePct: 0, attended: 1, eligible: 268 })))
      .toBe("174 members · 2 meetings · 0% turnout (1 of 268)");
  });

  it("NEVER prints a percentage without its attendance", () => {
    for (const r of [
      row(),
      row({ activeMembers: 1, sessionsInWindow: 1 }),
      row({ ratePct: 100, attended: 80, eligible: 80 }),
    ]) {
      const text = diagnosis(r)!;
      if (text.includes("%")) expect(text).toMatch(/\(\d+ of \d+\)/);
    }
  });

  it("omits turnout entirely when nothing was eligible", () => {
    // ratePct is 0 by convention here, not by turnout — printing "0% turnout"
    // would accuse a club that has done nothing wrong.
    const text = diagnosis(row({ eligible: 0, attended: 0, ratePct: 0 }))!;
    expect(text).not.toContain("%");
    expect(text).toBe("20 members · 4 meetings");
  });

  it("returns null when the club has nothing on record at all", () => {
    // Its badges and its "Never met" line already say this twice over.
    expect(
      diagnosis(row({ activeMembers: 0, sessionsInWindow: 0, sessionsAllTime: 0, eligible: 0, attended: 0 })),
    ).toBeNull();
  });

  it("still reports a club that has members but has stopped meeting", () => {
    expect(diagnosis(row({ activeMembers: 12, sessionsInWindow: 0, sessionsAllTime: 3, eligible: 0, attended: 0 })))
      .toBe("12 members · no meetings");
  });

  it("singularises one member and one meeting", () => {
    expect(diagnosis(row({ activeMembers: 1, sessionsInWindow: 1, eligible: 1, attended: 1, ratePct: 100 })))
      .toBe("1 member · 1 meeting · 100% turnout (1 of 1)");
  });
});

describe("turnoutSummary", () => {
  it("counts the rate against MEETINGS, not eligible slots", () => {
    // "43% of 292" would read as 292 members; 292 is attendance slots.
    expect(turnoutSummary(row({ sessionsInWindow: 6, eligible: 292 }))).toBe("over 6 meetings");
  });

  it("is null when nothing was eligible, so the row shows no percentage", () => {
    expect(turnoutSummary(row({ eligible: 0 }))).toBeNull();
  });

  it("singularises one meeting", () => {
    expect(turnoutSummary(row({ sessionsInWindow: 1 }))).toBe("over 1 meeting");
  });
});

describe("lastMet", () => {
  it("reads as a person would say it", () => {
    expect(lastMet(null)).toBe("Never met");
    expect(lastMet(0)).toBe("Last met today");
    expect(lastMet(1)).toBe("Last met yesterday");
    expect(lastMet(4)).toBe("Last met 4 days ago");
  });
});

describe("flag presentation", () => {
  const ALL: VitalityFlag[] = ["empty", "dormant", "unmet-demand", "low-turnout"];

  it("labels and tones every flag the module can produce", () => {
    // A new flag with no label would render as blank chip; fail here instead.
    for (const f of ALL) {
      expect(FLAG_LABEL[f]).toBeTruthy();
      expect(["rejected", "pending"]).toContain(FLAG_TONE[f]);
    }
  });

  it("reserves the loudest tone for a club that is not running at all", () => {
    expect(FLAG_TONE.empty).toBe("rejected");
    expect(FLAG_TONE.dormant).toBe("rejected");
    expect(FLAG_TONE["low-turnout"]).toBe("pending");
    expect(FLAG_TONE["unmet-demand"]).toBe("pending");
  });
});
