import { describe, expect, it } from "vitest";
import { diffAudit, fieldLabel, idsIn } from "./audit-diff";

describe("diffAudit", () => {
  it("lists only the fields that moved, from → to", () => {
    const changes = diffAudit(
      { title: "Hackathon", venue_text: "Hall A", capacity: 50 },
      { title: "Hackathon", venue_text: "Hall B", capacity: 50 },
    );
    expect(changes).toEqual([
      { field: "venue_text", label: "Venue", kind: "changed", from: "Hall A", to: "Hall B" },
    ]);
  });

  it("treats the same instant in two spellings as unchanged", () => {
    expect(
      diffAudit({ starts_at: "2026-08-31T15:16:00+00:00" }, { starts_at: "2026-08-31T15:16:00.000Z" }),
    ).toEqual([]);
  });

  it("formats instants in IST and booleans as Yes/No", () => {
    const [time, flag] = diffAudit(
      { starts_at: "2026-08-31T03:30:00Z", waitlist_enabled: true },
      { starts_at: "2026-08-31T04:30:00Z", waitlist_enabled: false },
    );
    expect(time.from).toBe("Aug 31, 2026, 9:00 AM");
    expect(time.to).toBe("Aug 31, 2026, 10:00 AM");
    expect(flag).toMatchObject({ label: "Waitlist", from: "Yes", to: "No" });
  });

  it("shows empty values as null and resolves ids through the names map", () => {
    const id = "d5cfdc10-0188-4491-8b0f-e157176e415a";
    const changes = diffAudit({ venue_text: null, club_id: null }, { venue_text: "Lab 3", club_id: id }, new Map([[id, "AI Forge"]]));
    expect(changes).toEqual([
      { field: "venue_text", label: "Venue", kind: "changed", from: null, to: "Lab 3" },
      { field: "club_id", label: "Club", kind: "changed", from: null, to: "AI Forge" },
    ]);
  });

  it("never reports a before-only key as cleared, and shows after-only keys as set", () => {
    // club_member onboarding: context in before, the change in after.
    expect(
      diffAudit({ name: "Vyshnavipriya", active: true, clubId: "x" }, { onboarded: true }),
    ).toEqual([{ field: "onboarded", label: "Onboarded", kind: "set", from: null, to: "Yes" }]);
    // club profile edit by a club head: structural keys absent from after.
    expect(diffAudit({ name: "A", slug: "a", isActive: true }, { name: "B" })).toEqual([
      { field: "name", label: "Name", kind: "changed", from: "A", to: "B" },
    ]);
  });

  it("lists every field as set when there is no before, and removed when there is no after", () => {
    expect(diffAudit(null, { title: "X" })).toEqual([
      { field: "title", label: "Title", kind: "set", from: null, to: "X" },
    ]);
    expect(diffAudit({ title: "X" }, null)).toEqual([
      { field: "title", label: "Title", kind: "removed", from: "X", to: null },
    ]);
    expect(diffAudit(null, null)).toEqual([]);
  });
});

describe("fieldLabel / idsIn", () => {
  it("humanises unknown keys", () => {
    expect(fieldLabel("photoReplaced")).toBe("Photo replaced");
    expect(fieldLabel("some_thing")).toBe("Some thing");
  });

  it("collects nested uuids", () => {
    const id = "68e0b8c4-fd22-4cde-9cbc-6cc682bf48f5";
    expect(idsIn({ a: id, b: [id, "x"], c: { d: 1 } })).toEqual([id, id]);
  });
});
