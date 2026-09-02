import { describe, expect, it } from "vitest";
import { leaderLabel, memberHeading } from "./team-labels";

describe("memberHeading", () => {
  it("names row 0 the team leader", () => {
    expect(memberHeading(0)).toBe("Team leader");
  });

  it("numbers the rest from 2, since the leader is member 1", () => {
    expect(memberHeading(1)).toBe("Member 2");
    expect(memberHeading(4)).toBe("Member 5");
  });
});

describe("leaderLabel", () => {
  it("prefixes a plain label", () => {
    expect(leaderLabel("Full name")).toBe("Team leader full name");
    expect(leaderLabel("Roll number")).toBe("Team leader roll number");
  });

  it("drops a redundant member prefix instead of stacking words", () => {
    expect(leaderLabel("Team Member Name")).toBe("Team leader name");
    expect(leaderLabel("Member email")).toBe("Team leader email");
    expect(leaderLabel("Member's phone number")).toBe("Team leader phone number");
  });

  it("keeps an acronym's capitals", () => {
    expect(leaderLabel("VTU number")).toBe("Team leader VTU number");
    expect(leaderLabel("Team member VTU number")).toBe("Team leader VTU number");
  });

  it("falls back to the original label when stripping would empty it", () => {
    expect(leaderLabel("Member")).toBe("Team leader member");
  });

  it("leaves an already-specific label alone apart from the prefix", () => {
    expect(leaderLabel("Department")).toBe("Team leader department");
    expect(leaderLabel("Year")).toBe("Team leader year");
  });
});
