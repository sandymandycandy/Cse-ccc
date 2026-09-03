import { describe, it, expect } from "vitest";
import { lockoutMessage } from "./lockout";

describe("lockoutMessage", () => {
  it("pluralises seconds", () => {
    expect(lockoutMessage(45)).toBe("Too many attempts. Try again in 45 seconds.");
  });

  it("uses the singular at one second", () => {
    expect(lockoutMessage(1)).toBe("Too many attempts. Try again in 1 second.");
  });

  it("rounds a partial second up, so the message never expires early", () => {
    expect(lockoutMessage(2.1)).toBe("Too many attempts. Try again in 3 seconds.");
  });

  it("never says zero or a negative", () => {
    expect(lockoutMessage(0)).toBe("Too many attempts. Try again in 1 second.");
    expect(lockoutMessage(-5)).toBe("Too many attempts. Try again in 1 second.");
  });
});
