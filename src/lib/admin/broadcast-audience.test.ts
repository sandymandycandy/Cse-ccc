import { describe, expect, it } from "vitest";
import {
  INLINE_MAX,
  audienceLabel,
  applyExclusions,
  dedupeRecipients,
  isAudienceAllowed,
  parseAudience,
  shouldQueue,
  type Audience,
} from "./broadcast-audience";

const tech = { role: "tech_head" as const, clubId: null };
const head = { role: "club_head" as const, clubId: "club-a" };
const gallery = { role: "gallery_manager" as const, clubId: "club-a" };

const heads: Audience = { kind: "heads" };
const council: Audience = { kind: "council" };
const allMembers: Audience = { kind: "all_members" };
const ownClub: Audience = { kind: "club_members", clubId: "club-a" };
const otherClub: Audience = { kind: "club_members", clubId: "club-b" };
const event: Audience = { kind: "event", eventId: "e1", scope: "confirmed" };

describe("shouldQueue", () => {
  it("sends inline at exactly the threshold", () => {
    expect(shouldQueue(INLINE_MAX)).toBe(false);
  });

  it("queues one above the threshold", () => {
    expect(shouldQueue(INLINE_MAX + 1)).toBe(true);
  });

  it("sends inline for an empty list", () => {
    expect(shouldQueue(0)).toBe(false);
  });
});

describe("isAudienceAllowed", () => {
  it("lets a council role reach every audience", () => {
    for (const a of [heads, council, allMembers, ownClub, otherClub, event]) {
      expect(isAudienceAllowed(tech, a, ["club-b"])).toBe(true);
    }
  });

  it("lets a club head reach their own club's members", () => {
    expect(isAudienceAllowed(head, ownClub, [])).toBe(true);
  });

  it("refuses a club head another club's members", () => {
    expect(isAudienceAllowed(head, otherClub, [])).toBe(false);
  });

  it("refuses a club head the council-wide audiences", () => {
    expect(isAudienceAllowed(head, heads, [])).toBe(false);
    expect(isAudienceAllowed(head, council, [])).toBe(false);
    expect(isAudienceAllowed(head, allMembers, [])).toBe(false);
  });

  it("judges an event by the event's real club, not the form", () => {
    expect(isAudienceAllowed(head, event, ["club-a"])).toBe(true);
    expect(isAudienceAllowed(head, event, ["club-b"])).toBe(false);
    expect(isAudienceAllowed(head, event, [])).toBe(false);
  });

  it("lets a co-host's head reach the registrants of an event their club co-hosts", () => {
    // club-coding owns the event; club-a co-hosts it.
    expect(isAudienceAllowed(head, event, ["club-coding", "club-a"])).toBe(true);
    expect(isAudienceAllowed(head, event, ["club-coding", "club-b"])).toBe(false);
  });

  it("refuses an own-scoped admin who has no club of their own", () => {
    const orphan = { role: "club_head" as const, clubId: null };
    expect(isAudienceAllowed(orphan, ownClub, [])).toBe(false);
    expect(isAudienceAllowed(orphan, event, ["club-a"])).toBe(false);
  });

  it("refuses a role without the capability entirely", () => {
    for (const a of [heads, ownClub, event]) {
      expect(isAudienceAllowed(gallery, a, ["club-a"])).toBe(false);
    }
  });
});

describe("parseAudience", () => {
  it("parses each kind", () => {
    expect(parseAudience({ kind: "heads" })).toEqual(heads);
    expect(parseAudience({ kind: "council" })).toEqual(council);
    expect(parseAudience({ kind: "all_members" })).toEqual(allMembers);
    expect(parseAudience({ kind: "club_members", clubId: "club-a" })).toEqual(ownClub);
    expect(parseAudience({ kind: "event", eventId: "e1", scope: "confirmed" })).toEqual(event);
  });

  it("parses an event with the waitlist included", () => {
    expect(parseAudience({ kind: "event", eventId: "e1", scope: "all" })).toEqual({
      kind: "event",
      eventId: "e1",
      scope: "all",
    });
  });

  it("defaults an event to confirmed when the scope is missing or unknown", () => {
    expect(parseAudience({ kind: "event", eventId: "e1" })).toEqual({
      kind: "event",
      eventId: "e1",
      scope: "confirmed",
    });
    expect(parseAudience({ kind: "event", eventId: "e1", scope: "everyone" })).toEqual({
      kind: "event",
      eventId: "e1",
      scope: "confirmed",
    });
  });

  it("rejects a kind that needs an id but has none", () => {
    expect(parseAudience({ kind: "club_members" })).toBeNull();
    expect(parseAudience({ kind: "event" })).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseAudience({ kind: "everyone" })).toBeNull();
    expect(parseAudience({})).toBeNull();
  });
});

describe("audienceLabel", () => {
  it("names each audience in words a human reads before sending", () => {
    expect(audienceLabel(heads)).toMatch(/heads/i);
    expect(audienceLabel(allMembers)).toMatch(/all club members/i);
    expect(audienceLabel(council)).toMatch(/council/i);
    expect(audienceLabel(event)).toMatch(/confirmed/i);
    expect(audienceLabel({ kind: "event", eventId: "e1", scope: "all" })).toMatch(/waitlist/i);
  });
});

describe("dedupeRecipients", () => {
  it("collapses the same address in different cases", () => {
    const out = dedupeRecipients([
      { email: "A@x.com", name: "Aa" },
      { email: "a@x.com", name: "Bb" },
    ]);
    expect(out).toEqual([{ email: "a@x.com", name: "Aa" }]);
  });

  it("drops blank and malformed addresses", () => {
    const out = dedupeRecipients([
      { email: "", name: "x" },
      { email: "   ", name: "y" },
      { email: "not-an-email", name: "z" },
      { email: "ok@x.com", name: null },
    ]);
    expect(out).toEqual([{ email: "ok@x.com", name: null }]);
  });

  it("keeps order and trims whitespace", () => {
    const out = dedupeRecipients([
      { email: " b@x.com ", name: "B" },
      { email: "a@x.com", name: "A" },
    ]);
    expect(out.map((r) => r.email)).toEqual(["b@x.com", "a@x.com"]);
  });

  it("returns nothing for an empty list", () => {
    expect(dedupeRecipients([])).toEqual([]);
  });
});

// ── layer 2, typed addresses and exclusions ──────────────────────────────────

const officeBearers: Audience = { kind: "office_bearers" };
const custom: Audience = { kind: "custom", emails: ["a@x.test", "b@x.test"] };

describe("office_bearers", () => {
  it("is a council-wide audience, not a club head's to send", () => {
    expect(isAudienceAllowed(tech, officeBearers, [])).toBe(true);
    expect(isAudienceAllowed(head, officeBearers, ["club-a"])).toBe(false);
    expect(isAudienceAllowed(gallery, officeBearers, ["club-a"])).toBe(false);
  });

  it("parses and labels itself", () => {
    expect(parseAudience({ kind: "office_bearers" })).toEqual(officeBearers);
    expect(audienceLabel(officeBearers)).toBe("Council office-bearers");
  });
});

describe("custom addresses", () => {
  // ⚠️ The one audience that can reach ANY address, including people who are
  // not in the system at all. A club head reaching it would be a straight
  // escape from the club scope every other audience keeps them inside.
  it("is refused to anyone who is not council-wide", () => {
    expect(isAudienceAllowed(tech, custom, [])).toBe(true);
    expect(isAudienceAllowed(head, custom, ["club-a"])).toBe(false);
    expect(isAudienceAllowed(gallery, custom, ["club-a"])).toBe(false);
  });

  it("splits on commas, semicolons, spaces and newlines", () => {
    const a = parseAudience({ kind: "custom", emails: "a@x.test, b@x.test;c@x.test\nd@x.test e@x.test" });
    expect(a).toEqual({
      kind: "custom",
      emails: ["a@x.test", "b@x.test", "c@x.test", "d@x.test", "e@x.test"],
    });
  });

  it("lowercases and dedupes, so one person is not mailed twice", () => {
    expect(parseAudience({ kind: "custom", emails: "A@x.test, a@x.test" })).toEqual({
      kind: "custom",
      emails: ["a@x.test"],
    });
  });

  it("is nothing without at least one usable address", () => {
    expect(parseAudience({ kind: "custom", emails: "" })).toBeNull();
    expect(parseAudience({ kind: "custom", emails: "not-an-email" })).toBeNull();
    expect(parseAudience({ kind: "custom" })).toBeNull();
  });

  it("refuses a pasted list past the cap rather than silently truncating it", () => {
    const many = Array.from({ length: 201 }, (_, i) => `u${i}@x.test`).join(",");
    expect(parseAudience({ kind: "custom", emails: many })).toBeNull();
    const atCap = Array.from({ length: 200 }, (_, i) => `u${i}@x.test`).join(",");
    expect(parseAudience({ kind: "custom", emails: atCap })).not.toBeNull();
  });

  it("labels itself by size, since there is no roster name to fall back on", () => {
    expect(audienceLabel(custom)).toBe("2 typed addresses");
    expect(audienceLabel({ kind: "custom", emails: ["a@x.test"] })).toBe("1 typed address");
  });
});

describe("applyExclusions", () => {
  const list = [
    { email: "a@x.test", name: "A" },
    { email: "b@x.test", name: "B" },
    { email: "c@x.test", name: null },
  ];

  it("drops the people who were unticked", () => {
    expect(applyExclusions(list, ["b@x.test"])).toEqual([
      { email: "a@x.test", name: "A" },
      { email: "c@x.test", name: null },
    ]);
  });

  it("matches regardless of the case the form posted", () => {
    expect(applyExclusions(list, ["B@X.TEST"])).toHaveLength(2);
  });

  it("leaves the list alone when nothing was unticked", () => {
    expect(applyExclusions(list, [])).toEqual(list);
  });

  /**
   * ⚠️ THE reason the form posts exclusions rather than inclusions. The server
   * resolves the audience authoritatively and this only ever SUBTRACTS, so a
   * tampered request can make a send smaller but can never inject an address
   * the sender was not already allowed to reach.
   */
  it("can never add an address that was not already in the audience", () => {
    const out = applyExclusions(list, ["victim@elsewhere.test"]);
    expect(out).toEqual(list);
    expect(out.map((r) => r.email)).not.toContain("victim@elsewhere.test");
  });

  it("can empty the list, which the caller must treat as nobody to email", () => {
    expect(applyExclusions(list, ["a@x.test", "b@x.test", "c@x.test"])).toEqual([]);
  });
});
