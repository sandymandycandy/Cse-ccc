import { describe, expect, it } from "vitest";
import { teamNameKey, teamNameIlike, TEAM_NAME_TAKEN } from "./team-name";

describe("team name matching", () => {
  it("treats case and extra spaces as the same name", () => {
    expect(teamNameKey("  Neural   Ninjas ")).toBe("Neural Ninjas");
    expect(teamNameIlike("Neural Ninjas")).toBe("Neural Ninjas"); // ilike is case-insensitive
  });

  it("escapes LIKE wildcards so a name can't match other teams", () => {
    expect(teamNameIlike("100%_AI")).toBe(String.raw`100\%\_AI`);
    expect(teamNameIlike(String.raw`a\b`)).toBe(String.raw`a\\b`);
  });

  it("tells the student what to do", () => {
    expect(TEAM_NAME_TAKEN).toMatch(/already taken/i);
  });
});
