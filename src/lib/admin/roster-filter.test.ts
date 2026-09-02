import { describe, it, expect } from "vitest";
import { matchesQuery, matchesAny } from "./roster-filter";

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

describe("matchesAny — free-text search across every value on a row", () => {
  it("returns true for an empty or whitespace-only query", () => {
    expect(matchesAny(["Alice"], "")).toBe(true);
    expect(matchesAny(["Alice"], "   ")).toBe(true);
    expect(matchesAny([], "")).toBe(true);
  });

  it("matches any string value, case-insensitively", () => {
    const row = ["Alice Kumar", "VTU101", "alice@veltech.edu.in", "CSE"];
    expect(matchesAny(row, "kumar")).toBe(true);
    expect(matchesAny(row, "VELTECH")).toBe(true);
    expect(matchesAny(row, "cse")).toBe(true);
  });

  it("matches numeric and boolean values by their text", () => {
    expect(matchesAny(["Alice", 3], "3")).toBe(true);
    expect(matchesAny(["Alice", true], "true")).toBe(true);
  });

  it("skips null and undefined without throwing", () => {
    expect(matchesAny(["Alice", null, undefined], "ali")).toBe(true);
    expect(matchesAny([null, undefined], "ali")).toBe(false);
  });

  it("searches inside arrays — a multi-select answer", () => {
    expect(matchesAny([["Python", "Rust"]], "rust")).toBe(true);
  });

  it("searches inside nested objects — a team member's own details", () => {
    // The registrations row carries the team block as an array of member
    // objects; searching a member's name must find the team they belong to.
    const custom = [{ team: [{ m_name: "Bob Singh", m_roll: "VTU202" }] }];
    expect(matchesAny(custom, "bob")).toBe(true);
    expect(matchesAny(custom, "vtu202")).toBe(true);
    expect(matchesAny(custom, "zzz")).toBe(false);
  });

  it("returns false when nothing on the row contains the query", () => {
    expect(matchesAny(["Alice Kumar", "VTU101", 3], "zzz")).toBe(false);
  });

  it("trims the query before matching", () => {
    expect(matchesAny(["Alice"], "  ali  ")).toBe(true);
  });
});
