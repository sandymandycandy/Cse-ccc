import { describe, it, expect } from "vitest";
import { resolveSocialLead, type SocialCandidate } from "./social-lead";

const lead = (id: string, name: string, isActive = true): SocialCandidate => ({ id, name, isActive });

describe("resolveSocialLead", () => {
  it("names the sole active social media head", () => {
    expect(resolveSocialLead([lead("s1", "Gagan sashank Votra")])).toEqual({
      id: "s1",
      name: "Gagan sashank Votra",
    });
  });

  it("names nobody when the council has no social media head", () => {
    expect(resolveSocialLead([])).toBeNull();
  });

  it("refuses to guess between two active heads", () => {
    // Same rule as the club leaders: a wrong name attached to a rating is worse
    // than a missing one.
    expect(resolveSocialLead([lead("s1", "One"), lead("s2", "Two")])).toBeNull();
  });

  it("ignores a deactivated account when picking the sole candidate", () => {
    const r = resolveSocialLead([lead("s1", "Gone", false), lead("s2", "Here")]);
    expect(r).toEqual({ id: "s2", name: "Here" });
  });

  it("names nobody when the only head on file is deactivated", () => {
    expect(resolveSocialLead([lead("s1", "Gone", false)])).toBeNull();
  });
});
