import { describe, expect, it } from "vitest";
import { leaderLabel } from "./team-labels";

describe("leaderLabel", () => {
  it("prefixes the identity fields the owner asked for", () => {
    expect(leaderLabel("Full name")).toBe("Team leader full name");
    expect(leaderLabel("Roll number")).toBe("Team leader roll number");
  });

  it("prefixes the rest of the identity block consistently", () => {
    expect(leaderLabel("College email")).toBe("Team leader college email");
    expect(leaderLabel("Mobile number")).toBe("Team leader mobile number");
    expect(leaderLabel("Department")).toBe("Team leader department");
    expect(leaderLabel("Year")).toBe("Team leader year");
  });

  it("keeps an acronym's capitals", () => {
    expect(leaderLabel("VTU number")).toBe("Team leader VTU number");
  });

  it("leaves a label that already names the leader alone", () => {
    expect(leaderLabel("Team leader name")).toBe("Team leader name");
    expect(leaderLabel("TEAM LEADER EMAIL")).toBe("TEAM LEADER EMAIL");
  });

  it("drops a redundant member prefix instead of stacking words", () => {
    expect(leaderLabel("Team Member Name")).toBe("Team leader name");
    expect(leaderLabel("Member's phone number")).toBe("Team leader phone number");
  });

  it("falls back to the original label when stripping would empty it", () => {
    expect(leaderLabel("Member")).toBe("Team leader member");
  });

  it("tolerates padding", () => {
    expect(leaderLabel("  Full name  ")).toBe("Team leader full name");
  });
});
