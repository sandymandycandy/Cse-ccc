import { describe, it, expect } from "vitest";
import { cohostSummary } from "./cohost-summary";

describe("cohostSummary", () => {
  it("says so when nothing is picked", () => {
    expect(cohostSummary([])).toBe("No co-hosts");
  });

  it("names a single club outright", () => {
    expect(cohostSummary(["Yoga Club"])).toBe("Yoga Club");
  });

  it("names the first and counts the rest", () => {
    expect(cohostSummary(["Yoga Club", "Nature Club"])).toBe("Yoga Club +1");
    expect(cohostSummary(["Yoga Club", "Nature Club", "Ai Forge Club"])).toBe("Yoga Club +2");
  });

  it("keeps the caller's order — the first name shown is the first given", () => {
    expect(cohostSummary(["Nature Club", "Yoga Club"])).toBe("Nature Club +1");
  });
});
