import { describe, expect, it } from "vitest";
import { capacityValue } from "./event-capacity";

describe("capacityValue", () => {
  it("keeps a real seat cap", () => expect(capacityValue(120)).toBe(120));
  it("treats blank as unlimited", () => expect(capacityValue("")).toBeNull());
  it("treats 0 as unlimited, never as zero seats", () => expect(capacityValue(0)).toBeNull());
});
