import { describe, it, expect } from "vitest";
import { formatCountdown, countdownLabel } from "./countdown";

describe("formatCountdown", () => {
  it("breaks a duration into d/h/m/s", () => {
    const ms = (((2 * 24 + 4) * 60 + 12) * 60 + 5) * 1000; // 2d 4h 12m 5s
    expect(formatCountdown(ms)).toEqual({ days: 2, hours: 4, minutes: 12, seconds: 5, done: false });
  });
  it("clamps to zero and marks done at/below 0", () => {
    expect(formatCountdown(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
    expect(formatCountdown(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
  it("rounds sub-second remainders down to whole seconds", () => {
    expect(formatCountdown(1999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1, done: false });
  });
});

describe("countdownLabel", () => {
  it("drops leading zero units but keeps trailing ones", () => {
    expect(countdownLabel(formatCountdown(65_000))).toBe("1m 05s");
    expect(countdownLabel(formatCountdown(3_600_000))).toBe("1h 00m 00s");
  });
  it("shows all units for a multi-day span", () => {
    const ms = (((2 * 24 + 4) * 60 + 12) * 60 + 5) * 1000;
    expect(countdownLabel(formatCountdown(ms))).toBe("2d 04h 12m 05s");
  });
});
