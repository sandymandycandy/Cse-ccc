import { describe, it, expect } from "vitest";
import { matchesQuery } from "./roster-filter";

describe("matchesQuery", () => {
  it("matches a name substring, case-insensitively", () => {
    expect(matchesQuery("Alice Kumar", "vtu101", "ali")).toBe(true);
    expect(matchesQuery("Alice Kumar", "vtu101", "KUMAR")).toBe(true);
  });

  it("matches a roll substring, case-insensitively", () => {
    expect(matchesQuery("Alice Kumar", "VTU101", "vtu1")).toBe(true);
    expect(matchesQuery("Alice Kumar", "VTU101", "101")).toBe(true);
  });

  it("returns true for an empty or whitespace-only query", () => {
    expect(matchesQuery("Alice", "vtu1", "")).toBe(true);
    expect(matchesQuery("Alice", "vtu1", "   ")).toBe(true);
  });

  it("returns false when neither name nor roll contains the query", () => {
    expect(matchesQuery("Alice Kumar", "vtu101", "zzz")).toBe(false);
  });

  it("handles a null roll number safely", () => {
    expect(matchesQuery("Alice", null, "ali")).toBe(true);
    expect(matchesQuery("Alice", null, "101")).toBe(false);
  });

  it("trims the query before matching", () => {
    expect(matchesQuery("Alice", "vtu101", "  ali  ")).toBe(true);
  });
});
