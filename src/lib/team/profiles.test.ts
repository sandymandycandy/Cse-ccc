import { describe, it, expect } from "vitest";
import { mergeProfiles, photoOverrides, type TeamProfileRow } from "./profiles";
import type { Member } from "@/data/ccc";

const member = (over: Partial<Member> = {}): Member => ({
  id: "a-person",
  name: "A Person",
  role: "Head",
  layer: "clubs",
  club: "coding",
  vtu: "10001",
  email: "vtu10001@veltech.edu.in",
  ...over,
});

const row = (over: Partial<TeamProfileRow> = {}): TeamProfileRow => ({
  memberId: "a-person",
  name: "Edited Name",
  role: "Vice Head",
  year: "III",
  department: "CSE",
  email: "edited@veltech.edu.in",
  description: "Edited bio",
  portfolio: null,
  photoPath: null,
  photoWidth: null,
  photoHeight: null,
  photoBlur: null,
  focalX: 50,
  focalY: 50,
  ...over,
});

describe("mergeProfiles", () => {
  it("uses the row's values when a member has one", () => {
    const [m] = mergeProfiles([member()], [row()]);
    expect(m.name).toBe("Edited Name");
    expect(m.role).toBe("Vice Head");
    expect(m.description).toBe("Edited bio");
  });

  it("keeps the file's values when a member has no row", () => {
    const [m] = mergeProfiles([member()], []);
    expect(m.name).toBe("A Person");
    expect(m.email).toBe("vtu10001@veltech.edu.in");
  });

  it("ignores a row whose member_id matches nobody in the file", () => {
    const merged = mergeProfiles([member()], [row({ memberId: "ghost" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("A Person");
  });

  it("falls back per-field: a null column keeps the file's value", () => {
    const [m] = mergeProfiles(
      [member({ year: "IV", department: "CSE (AIML)" })],
      [row({ year: null, department: null })],
    );
    expect(m.year).toBe("IV");
    expect(m.department).toBe("CSE (AIML)");
  });

  it("never takes structure from a row", () => {
    const [m] = mergeProfiles([member()], [row()]);
    expect(m.layer).toBe("clubs");
    expect(m.club).toBe("coding");
    expect(m.vtu).toBe("10001");
  });

  it("preserves the file's order", () => {
    const people = [member({ id: "one", name: "One" }), member({ id: "two", name: "Two" })];
    const merged = mergeProfiles(people, [row({ memberId: "two", name: "Two edited" })]);
    expect(merged.map((m) => m.id)).toEqual(["one", "two"]);
    expect(merged[1].name).toBe("Two edited");
  });
});

describe("photoOverrides", () => {
  it("returns nothing for a row with no uploaded photo", () => {
    expect(photoOverrides([row()])).toEqual({});
  });

  it("returns the photo, its dimensions and its focal point", () => {
    const out = photoOverrides([
      row({ photoPath: "abc.jpg", photoWidth: 800, photoHeight: 1000, photoBlur: "data:x", focalX: 40, focalY: 30 }),
    ]);
    expect(out["a-person"]).toEqual({
      path: "abc.jpg",
      width: 800,
      height: 1000,
      blur: "data:x",
      focal: { x: 40, y: 30 },
    });
  });

  it("skips a photo_path with no dimensions — coverPosition would divide by null", () => {
    expect(photoOverrides([row({ photoPath: "abc.jpg", photoWidth: null, photoHeight: null })])).toEqual({});
  });
});
