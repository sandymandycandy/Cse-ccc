import { describe, expect, it } from "vitest";
import {
  INLINE_MAX,
  audienceLabel,
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
      expect(isAudienceAllowed(tech, a, "club-b")).toBe(true);
    }
  });

  it("lets a club head reach their own club's members", () => {
    expect(isAudienceAllowed(head, ownClub, null)).toBe(true);
  });

  it("refuses a club head another club's members", () => {
    expect(isAudienceAllowed(head, otherClub, null)).toBe(false);
  });

  it("refuses a club head the council-wide audiences", () => {
    expect(isAudienceAllowed(head, heads, null)).toBe(false);
    expect(isAudienceAllowed(head, council, null)).toBe(false);
    expect(isAudienceAllowed(head, allMembers, null)).toBe(false);
  });

  it("judges an event by the event's real club, not the form", () => {
    expect(isAudienceAllowed(head, event, "club-a")).toBe(true);
    expect(isAudienceAllowed(head, event, "club-b")).toBe(false);
    expect(isAudienceAllowed(head, event, null)).toBe(false);
  });

  it("refuses an own-scoped admin who has no club of their own", () => {
    const orphan = { role: "club_head" as const, clubId: null };
    expect(isAudienceAllowed(orphan, ownClub, null)).toBe(false);
    expect(isAudienceAllowed(orphan, event, "club-a")).toBe(false);
  });

  it("refuses a role without the capability entirely", () => {
    for (const a of [heads, ownClub, event]) {
      expect(isAudienceAllowed(gallery, a, "club-a")).toBe(false);
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
