import { describe, it, expect } from "vitest";
import {
  LEADERSHIP_TITLES,
  initialsOf,
  leadershipRankOf,
  mapRosterRows,
  socialsOf,
  sortRoster,
  splitRoster,
  type RosterMember,
} from "./roster";

const m = (designation: string, name: string, rollNo: string | null = null): RosterMember => ({
  id: `${designation}:${name}`,
  name,
  rollNo,
  designation,
  linkedinUrl: null,
  instagramUrl: null,
  bio: null,
  photoUrl: null,
});

describe("initialsOf — the monogram shown in place of a photo", () => {
  it("takes the first letter of the first and last word", () => {
    expect(initialsOf("Abhinav Rajesh")).toBe("AR");
  });

  it("skips the middle words of a long name", () => {
    // Real roster row — 8 tokens. First + last, never a wall of letters.
    expect(initialsOf("Kollepara U N Jyothi Lakshmi Praneetha")).toBe("KP");
  });

  it("uppercases a lowercase name", () => {
    expect(initialsOf("navaneeth kumar")).toBe("NK");
  });

  it("keeps an already-uppercase name from doubling up", () => {
    // Real roster row, stored SHOUTING.
    expect(initialsOf("VENKATA MANIDHAR REDDY D")).toBe("VD");
  });

  it("splits on dots, so an initial-with-dot is its own word", () => {
    // Real roster row: "D.BHANU TEJA" would otherwise read as one token "D.BHANU".
    expect(initialsOf("D.BHANU TEJA")).toBe("DT");
  });

  it("handles a trailing dotted initial", () => {
    // Real roster row: the surname initial is glued to the end with a dot.
    expect(initialsOf("Rupa Sri.V")).toBe("RV");
  });

  it("handles a leading dotted initial with a space after it", () => {
    expect(initialsOf("R. Jayasurya")).toBe("RJ");
  });

  it("returns a single letter for a one-word name", () => {
    // Real roster rows: "LOGITH", "Akshay", "Rakshana" are stored as one word.
    expect(initialsOf("LOGITH")).toBe("L");
    expect(initialsOf("Rakshana")).toBe("R");
  });

  it("collapses runs of whitespace", () => {
    expect(initialsOf("  M   S   Adithya  ")).toBe("MA");
  });

  it("falls back to a placeholder rather than rendering an empty circle", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf("...")).toBe("?");
  });

  it("ignores punctuation-only tokens when picking the last word", () => {
    expect(initialsOf("Priya -")).toBe("P");
  });
});

describe("sortRoster — A→Z by role, then by name", () => {
  it("orders by designation", () => {
    const out = sortRoster([m("Magazine Club Head", "R"), m("AppNova Head", "H"), m("Nature Club - Head", "N")]);
    expect(out.map((x) => x.designation)).toEqual([
      "AppNova Head",
      "Magazine Club Head",
      "Nature Club - Head",
    ]);
  });

  it("ignores case when comparing designations", () => {
    // Real roster rows differ only in case: "Vice head" vs "Vice Head ...".
    const out = sortRoster([m("vice head", "B"), m("Club Head", "A")]);
    expect(out.map((x) => x.designation)).toEqual(["Club Head", "vice head"]);
  });

  it("breaks a designation tie on the name", () => {
    // Two people really do share "AI Forge - Vice Head".
    const out = sortRoster([
      m("AI Forge - Vice Head", "VENKATA MANIDHAR REDDY D"),
      m("AI Forge - Vice Head", "DASA MANISAI"),
    ]);
    expect(out.map((x) => x.name)).toEqual(["DASA MANISAI", "VENKATA MANIDHAR REDDY D"]);
  });

  it("breaks a name tie on the id, so the order never flickers between renders", () => {
    const a = { id: "a", name: "Same", rollNo: null, designation: "Head", linkedinUrl: null, instagramUrl: null, bio: null, photoUrl: null };
    const b = { id: "b", name: "Same", rollNo: null, designation: "Head", linkedinUrl: null, instagramUrl: null, bio: null, photoUrl: null };
    expect(sortRoster([b, a]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [m("Z Head", "Z"), m("A Head", "A")];
    sortRoster(input);
    expect(input.map((x) => x.designation)).toEqual(["Z Head", "A Head"]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortRoster([])).toEqual([]);
  });
});

describe("leadershipRankOf — the six council officers outrank the club heads", () => {
  it("ranks the six titles in BUILD_PLAN §3.1 order", () => {
    expect(LEADERSHIP_TITLES.map(leadershipRankOf)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("matches regardless of case or surrounding whitespace", () => {
    expect(leadershipRankOf("  president  ")).toBe(0);
    expect(leadershipRankOf("SOCIAL MEDIA HEAD")).toBe(5);
  });

  it("returns null for a club head, who belongs in the second tier", () => {
    expect(leadershipRankOf("AppNova Head")).toBeNull();
    expect(leadershipRankOf("Nature Club - Head")).toBeNull();
  });

  it("does NOT promote the bare 'Vice head' row to Vice President", () => {
    // A real row (K.Shashidhar Rao) reads "Vice head" with no club named. Treating
    // that as the council VP would silently promote a club vice head, so only the
    // exact title counts — the fix is to edit the designation in admin.
    expect(leadershipRankOf("Vice head")).toBeNull();
    expect(leadershipRankOf("Vice Head Cyber Sentinel Club")).toBeNull();
    expect(leadershipRankOf("Vice President")).toBe(1);
  });

  it("does not match a title that merely contains a leadership word", () => {
    expect(leadershipRankOf("Assistant to the President")).toBeNull();
    expect(leadershipRankOf("Technical Head of Coding Club")).toBeNull();
  });
});

describe("splitRoster — leadership tier above the A→Z club heads", () => {
  it("puts the officers first, in rank order, whatever order they arrive in", () => {
    const out = splitRoster([
      m("Social Media Head", "F"),
      m("President", "A"),
      m("Events Head", "D"),
      m("Vice President", "B"),
      m("Documentation Head", "E"),
      m("Technical Head", "C"),
    ]);
    expect(out.leadership.map((x) => x.name)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(out.heads).toEqual([]);
  });

  it("leaves the club heads sorted A→Z by role", () => {
    const out = splitRoster([
      m("Nature Club - Head", "N"),
      m("President", "P"),
      m("AppNova Head", "H"),
    ]);
    expect(out.leadership.map((x) => x.designation)).toEqual(["President"]);
    expect(out.heads.map((x) => x.designation)).toEqual(["AppNova Head", "Nature Club - Head"]);
  });

  it("returns an empty leadership tier before the officers are added", () => {
    // The live state today: 26 club heads, no officer rows yet. The page must
    // hide the leadership section rather than render an empty heading.
    const out = splitRoster([m("AppNova Head", "H"), m("Yoga Club - Vice Head", "Y")]);
    expect(out.leadership).toEqual([]);
    expect(out.heads).toHaveLength(2);
  });

  it("breaks a tie between two people holding the same office", () => {
    const out = splitRoster([m("President", "Zoe"), m("President", "Ana")]);
    expect(out.leadership.map((x) => x.name)).toEqual(["Ana", "Zoe"]);
  });

  it("handles an empty roster", () => {
    expect(splitRoster([])).toEqual({ leadership: [], heads: [] });
  });
});


describe("mapRosterRows — DB rows to public members, with links sanitised", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "1",
    full_name: "R. Jayasurya",
    roll_no: "27657",
    designation: "AI Forge - Head",
    ...over,
  });

  it("maps the public fields with no socials set", () => {
    expect(mapRosterRows([row()])).toEqual([
      {
        id: "1",
        name: "R. Jayasurya",
        rollNo: "27657",
        designation: "AI Forge - Head",
        linkedinUrl: null,
        instagramUrl: null,
        bio: null,
        photoUrl: null,
      },
    ]);
  });

  it("keeps well-formed http(s) links on both fields", () => {
    const out = mapRosterRows([
      row({ linkedin_url: "https://linkedin.com/in/x", instagram_url: "https://instagram.com/y" }),
    ]);
    expect(out[0].linkedinUrl).toBe("https://linkedin.com/in/x");
    expect(out[0].instagramUrl).toBe("https://instagram.com/y");
  });

  it("trims surrounding whitespace", () => {
    expect(mapRosterRows([row({ linkedin_url: "  https://example.com  " })])[0].linkedinUrl).toBe(
      "https://example.com",
    );
  });

  it("DROPS a javascript: URL on either field rather than rendering it", () => {
    // Defence in depth: the admin form rejects these on write, but a row inserted
    // by hand in the SQL editor must never reach an href either.
    const out = mapRosterRows([
      row({ linkedin_url: "javascript:alert(1)", instagram_url: "javascript:alert(2)" }),
    ]);
    expect(out[0].linkedinUrl).toBeNull();
    expect(out[0].instagramUrl).toBeNull();
  });

  it("drops other non-http schemes and unparseable values", () => {
    for (const bad of ["data:text/html,x", "mailto:a@b.c", "/relative", "not a url", ""]) {
      expect(mapRosterRows([row({ linkedin_url: bad })])[0].linkedinUrl).toBeNull();
    }
  });

  it("keeps one field when only the other is bad", () => {
    const out = mapRosterRows([
      row({ linkedin_url: "https://linkedin.com/in/x", instagram_url: "javascript:alert(1)" }),
    ]);
    expect(out[0].linkedinUrl).toBe("https://linkedin.com/in/x");
    expect(out[0].instagramUrl).toBeNull();
  });

  it("tolerates the columns being absent entirely (pre-migration reads)", () => {
    expect(mapRosterRows([row()])[0].linkedinUrl).toBeNull();
    expect(mapRosterRows([row()])[0].instagramUrl).toBeNull();
  });

  it("maps a missing roll number to null rather than a blank string", () => {
    expect(mapRosterRows([row({ roll_no: null })])[0].rollNo).toBeNull();
  });
});

describe("socialsOf — the fixed-order link row under a card", () => {
  const base = m("AI Forge - Head", "R. Jayasurya");

  it("returns nothing when the member has no links, so the row is omitted", () => {
    expect(socialsOf(base)).toEqual([]);
  });

  it("always lists LinkedIn before Instagram, so every card reads the same", () => {
    expect(
      socialsOf({ ...base, linkedinUrl: "https://li.test/x", instagramUrl: "https://ig.test/y" }),
    ).toEqual([
      { label: "LinkedIn", url: "https://li.test/x" },
      { label: "Instagram", url: "https://ig.test/y" },
    ]);
  });

  it("returns just the one that is set", () => {
    expect(socialsOf({ ...base, instagramUrl: "https://ig.test/y" })).toEqual([
      { label: "Instagram", url: "https://ig.test/y" },
    ]);
  });
});


describe("mapRosterRows — bio and photo", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "1", full_name: "R. Jayasurya", roll_no: "27657", designation: "President", ...over,
  });

  it("keeps a written bio, trimmed", () => {
    expect(mapRosterRows([row({ bio: "  Leads the council.  " })])[0].bio).toBe(
      "Leads the council.",
    );
  });

  it("treats a blank bio as none, so the profile shows its fallback copy", () => {
    for (const blank of ["", "   ", "\n\n"]) {
      expect(mapRosterRows([row({ bio: blank })])[0].bio).toBeNull();
    }
  });

  it("preserves line breaks inside a bio (rendered with white-space: pre-line)", () => {
    expect(mapRosterRows([row({ bio: "One.\nTwo." })])[0].bio).toBe("One.\nTwo.");
  });

  it("resolves a photo path through the injected resolver", () => {
    const out = mapRosterRows([row({ photo_path: "abc.jpg" })], (p) => `https://cdn.test/${p}`);
    expect(out[0].photoUrl).toBe("https://cdn.test/abc.jpg");
  });

  it("is null when there is no photo, so the monogram is used", () => {
    expect(mapRosterRows([row()], (p) => `https://cdn.test/${p}`)[0].photoUrl).toBeNull();
  });

  it("is null when no resolver is supplied, rather than leaking a bare path as a URL", () => {
    expect(mapRosterRows([row({ photo_path: "abc.jpg" })])[0].photoUrl).toBeNull();
  });
});
