import { describe, it, expect } from "vitest";
import { coverPositionFrom } from "./framing";

// Every expected value below is worked by hand from the formula, not produced
// by running the code — a snapshot of the function's own output would pass no
// matter what the function did.
//
// A 800x1000 portrait has aspect 0.8.
const portrait = (focalY: number, focalX = 50) => ({
  width: 800,
  height: 1000,
  focal: { x: focalX, y: focalY },
});

describe("coverPositionFrom", () => {
  it("falls back to 50% 35% when there is no framing", () => {
    expect(coverPositionFrom(undefined, 1)).toBe("50% 35%");
  });

  // Container no wider than the photo: nothing is cropped vertically, so the
  // focal point is used as-is.
  it("uses the focal point directly when the container is not wider than the photo", () => {
    expect(coverPositionFrom(portrait(30, 40), 0.5)).toBe("40% 30%");
    expect(coverPositionFrom(portrait(30, 40), 0.8)).toBe("40% 30%");
  });

  // Container 1:1, photo 0.8 → visible = 0.8, so 20% of the height is cropped.
  it("pins to the top when the face sits high", () => {
    // center = (40-4)/100 = 0.36; start = clamp(0.36 - 0.4, 0, 0.2) = 0 → 0.0%
    expect(coverPositionFrom(portrait(40), 1)).toBe("50% 0.0%");
  });

  it("offsets proportionally for a face in the middle band", () => {
    // center = (60-4)/100 = 0.56; start = clamp(0.16, 0, 0.2) = 0.16 → 0.16/0.2 = 80.0%
    expect(coverPositionFrom(portrait(60), 1)).toBe("50% 80.0%");
  });

  it("pins to the bottom when the face sits low", () => {
    // center = (90-4)/100 = 0.86; start = clamp(0.46, 0, 0.2) = 0.2 → 100.0%
    expect(coverPositionFrom(portrait(90), 1)).toBe("50% 100.0%");
  });

  it("honours a larger headroom", () => {
    // headroom 6: center = (60-6)/100 = 0.54; start = 0.14 → 0.14/0.2 = 70.0%
    expect(coverPositionFrom(portrait(60), 1, 6)).toBe("50% 70.0%");
  });
});
