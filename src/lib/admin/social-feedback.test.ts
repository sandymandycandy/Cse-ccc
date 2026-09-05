import { describe, it, expect } from "vitest";
import { summarizeSocial, type SocialResponse } from "./social-feedback";

const r = (o: Partial<SocialResponse> = {}): SocialResponse => ({
  vtu: "vtu1",
  socialTeamRating: null,
  socialLeadRating: null,
  socialLeadName: null,
  createdAt: "2026-09-04T10:00:00Z",
  ...o,
});

describe("summarizeSocial", () => {
  it("is empty, not NaN, when nobody rated social media", () => {
    const s = summarizeSocial([r(), r({ vtu: "vtu2" })]);
    expect(s).toEqual({
      students: 0,
      teamAvg: null,
      teamRatings: 0,
      leadAvg: null,
      leadRatings: 0,
      leadName: null,
      thin: true,
    });
  });

  it("averages the team rating across students", () => {
    const s = summarizeSocial([
      r({ vtu: "a", socialTeamRating: 5 }),
      r({ vtu: "b", socialTeamRating: 4 }),
    ]);
    expect(s.teamAvg).toBe(4.5);
    expect(s.teamRatings).toBe(2);
    expect(s.students).toBe(2);
  });

  it("rounds to one decimal, like every other average on the page", () => {
    const s = summarizeSocial([
      r({ vtu: "a", socialTeamRating: 5 }),
      r({ vtu: "b", socialTeamRating: 4 }),
      r({ vtu: "c", socialTeamRating: 4 }),
    ]);
    expect(s.teamAvg).toBe(4.3); // 13/3 = 4.33 → 4.3
  });

  // The reason this module exists. Social media is council-wide, but a student
  // in three clubs may legitimately submit three club responses — which would
  // otherwise let one person's opinion count three times.
  it("counts each student ONCE even when they submitted several times", () => {
    const s = summarizeSocial([
      r({ vtu: "a", socialTeamRating: 1, createdAt: "2026-09-01T10:00:00Z" }),
      r({ vtu: "a", socialTeamRating: 1, createdAt: "2026-09-02T10:00:00Z" }),
      r({ vtu: "a", socialTeamRating: 1, createdAt: "2026-09-03T10:00:00Z" }),
      r({ vtu: "b", socialTeamRating: 5 }),
    ]);
    expect(s.students).toBe(2);
    expect(s.teamRatings).toBe(2);
    expect(s.teamAvg).toBe(3); // (1 + 5) / 2, not (1+1+1+5)/4 = 2
  });

  it("keeps a repeat submitter's MOST RECENT rating", () => {
    const s = summarizeSocial([
      r({ vtu: "a", socialTeamRating: 1, createdAt: "2026-09-01T10:00:00Z" }),
      r({ vtu: "a", socialTeamRating: 5, createdAt: "2026-09-05T10:00:00Z" }),
    ]);
    expect(s.teamAvg).toBe(5);
    expect(s.teamRatings).toBe(1);
  });

  it("averages the lead rating independently of the team rating", () => {
    // A student may rate the team and not the person, or the other way round.
    const s = summarizeSocial([
      r({ vtu: "a", socialTeamRating: 4, socialLeadRating: null }),
      r({ vtu: "b", socialTeamRating: null, socialLeadRating: 2, socialLeadName: "Gagan" }),
    ]);
    expect(s.teamAvg).toBe(4);
    expect(s.teamRatings).toBe(1);
    expect(s.leadAvg).toBe(2);
    expect(s.leadRatings).toBe(1);
    expect(s.students).toBe(2);
  });

  it("reports the lead's name from the snapshot on the responses", () => {
    const s = summarizeSocial([r({ vtu: "a", socialLeadRating: 4, socialLeadName: "Gagan" })]);
    expect(s.leadName).toBe("Gagan");
  });

  it("marks a thin sample so it is never treated as a verdict", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      r({ vtu: `v${i}`, socialTeamRating: 3 }),
    );
    expect(summarizeSocial(many).thin).toBe(false);
    expect(summarizeSocial(many.slice(0, 4)).thin).toBe(true);
  });
});
