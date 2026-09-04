import { describe, it, expect } from "vitest";
import { groupAdminsByClub, type GroupableAdmin } from "./admin-grouping";

const a = (over: Partial<GroupableAdmin>): GroupableAdmin => ({
  id: Math.random().toString(36).slice(2),
  name: "Someone",
  role: "club_head",
  clubId: null,
  club: null,
  ...over,
});

describe("groupAdminsByClub", () => {
  it("puts council-wide admins first, then clubs A-Z", () => {
    const groups = groupAdminsByClub([
      a({ clubId: "y", club: "Yoga" }),
      a({ role: "president", clubId: null, club: null }),
      a({ clubId: "c", club: "Coding" }),
      a({ clubId: "m", club: "Magazine" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Council-wide",
      "Coding",
      "Magazine",
      "Yoga",
    ]);
  });

  it("omits the council group entirely when every admin has a club", () => {
    const groups = groupAdminsByClub([a({ clubId: "c", club: "Coding" })]);
    expect(groups.map((g) => g.label)).toEqual(["Coding"]);
  });

  it("groups by club ID, not by display name", () => {
    // Two clubs may share a short_name; grouping on the string would merge
    // them and silently show one club's admins under another's heading.
    const groups = groupAdminsByClub([
      a({ id: "1", clubId: "x", club: "Animatrix" }),
      a({ id: "2", clubId: "z", club: "Animatrix" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.admins.length === 1)).toBe(true);
  });

  it("orders a club's admins head first, then vice, then anyone else", () => {
    const groups = groupAdminsByClub([
      a({ name: "Tina", role: "tech_head", clubId: "c", club: "Coding" }),
      a({ name: "Vik", role: "vice_head", clubId: "c", club: "Coding" }),
      a({ name: "Hana", role: "club_head", clubId: "c", club: "Coding" }),
    ]);
    expect(groups[0].admins.map((x) => x.name)).toEqual(["Hana", "Vik", "Tina"]);
  });

  it("orders the council group by seniority", () => {
    const groups = groupAdminsByClub([
      a({ name: "Gia", role: "gallery_manager" }),
      a({ name: "Pat", role: "president" }),
      a({ name: "Tom", role: "tech_head" }),
      a({ name: "Fay", role: "faculty_advisor" }),
    ]);
    expect(groups[0].admins.map((x) => x.name)).toEqual(["Fay", "Pat", "Tom", "Gia"]);
  });

  it("breaks ties on name so the order is stable between renders", () => {
    const groups = groupAdminsByClub([
      a({ name: "Zara", role: "club_head", clubId: "c", club: "Coding" }),
      a({ name: "Adam", role: "club_head", clubId: "c", club: "Coding" }),
    ]);
    expect(groups[0].admins.map((x) => x.name)).toEqual(["Adam", "Zara"]);
  });

  it("keeps a club with several heads together rather than splitting it", () => {
    // Coding really does have three club_head accounts; the page exists partly
    // to make that visible in one place.
    const groups = groupAdminsByClub([
      a({ name: "One", role: "club_head", clubId: "c", club: "Coding" }),
      a({ name: "Two", role: "club_head", clubId: "c", club: "Coding" }),
      a({ name: "Three", role: "club_head", clubId: "c", club: "Coding" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].admins).toHaveLength(3);
  });

  it("never drops or duplicates an admin", () => {
    const input = [
      a({ id: "1", clubId: "c", club: "Coding" }),
      a({ id: "2", role: "president" }),
      a({ id: "3", clubId: "y", club: "Yoga" }),
      a({ id: "4", clubId: "c", club: "Coding" }),
    ];
    const out = groupAdminsByClub(input).flatMap((g) => g.admins);
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map((x) => x.id)).size).toBe(input.length);
  });

  it("returns nothing for nobody", () => {
    expect(groupAdminsByClub([])).toEqual([]);
  });

  it("falls back to a readable heading when a club has no name", () => {
    const groups = groupAdminsByClub([a({ clubId: "c", club: null })]);
    expect(groups[0].label.length).toBeGreaterThan(0);
  });
});
