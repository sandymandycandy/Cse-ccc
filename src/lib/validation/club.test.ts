import { describe, it, expect } from "vitest";
import {
  ClubCreateSchema,
  ClubProfileSchema,
  ClubStructuralSchema,
  SLUG_RE,
  HEX_COLOR_RE,
} from "./club";

const validCreate = {
  name: "Coding Club",
  shortName: "CC",
  slug: "coding-club",
  category: "tech",
  color: "#1f7a4d",
  tagline: "We build things",
  description: "A club for programmers.",
  isActive: true,
  sort: "3",
};

describe("SLUG_RE", () => {
  it("accepts lowercase-hyphen slugs", () => {
    expect(SLUG_RE.test("coding-club")).toBe(true);
    expect(SLUG_RE.test("gdg")).toBe(true);
    expect(SLUG_RE.test("web3-dev-2")).toBe(true);
  });
  it("rejects uppercase, spaces, and stray hyphens", () => {
    expect(SLUG_RE.test("Coding-Club")).toBe(false);
    expect(SLUG_RE.test("coding club")).toBe(false);
    expect(SLUG_RE.test("-coding")).toBe(false);
    expect(SLUG_RE.test("coding-")).toBe(false);
    expect(SLUG_RE.test("coding--club")).toBe(false);
  });
});

describe("HEX_COLOR_RE", () => {
  it("accepts 6-digit hex", () => {
    expect(HEX_COLOR_RE.test("#1f7a4d")).toBe(true);
    expect(HEX_COLOR_RE.test("#ABCDEF")).toBe(true);
  });
  it("rejects shorthand, missing hash, and non-hex", () => {
    expect(HEX_COLOR_RE.test("1f7a4d")).toBe(false);
    expect(HEX_COLOR_RE.test("#fff")).toBe(false);
    expect(HEX_COLOR_RE.test("#12345g")).toBe(false);
  });
});

describe("ClubCreateSchema", () => {
  it("accepts a valid club and coerces sort to a number", () => {
    const r = ClubCreateSchema.safeParse(validCreate);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sort).toBe(3);
      expect(r.data.category).toBe("tech");
    }
  });

  it("lowercases the slug", () => {
    const r = ClubCreateSchema.safeParse({ ...validCreate, slug: "Coding-Club" });
    // .toLowerCase() runs before the regex, so this is valid and normalised.
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.slug).toBe("coding-club");
  });

  it("turns empty tagline/description into null", () => {
    const r = ClubCreateSchema.safeParse({ ...validCreate, tagline: "", description: "  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tagline).toBeNull();
      expect(r.data.description).toBeNull();
    }
  });

  it("rejects an invalid slug", () => {
    expect(ClubCreateSchema.safeParse({ ...validCreate, slug: "not a slug" }).success).toBe(false);
  });

  it("rejects a non-hex colour", () => {
    expect(ClubCreateSchema.safeParse({ ...validCreate, color: "green" }).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(ClubCreateSchema.safeParse({ ...validCreate, category: "sports" }).success).toBe(false);
  });

  it("requires a name and short name", () => {
    expect(ClubCreateSchema.safeParse({ ...validCreate, name: "x" }).success).toBe(false);
    expect(ClubCreateSchema.safeParse({ ...validCreate, shortName: "" }).success).toBe(false);
  });

  it("rejects a negative sort", () => {
    expect(ClubCreateSchema.safeParse({ ...validCreate, sort: "-1" }).success).toBe(false);
  });
});

describe("ClubProfileSchema / ClubStructuralSchema split", () => {
  it("profile schema ignores structural fields", () => {
    const r = ClubProfileSchema.safeParse({
      name: "Coding Club",
      shortName: "CC",
      tagline: "hi",
      description: "there",
    });
    expect(r.success).toBe(true);
  });

  it("structural schema validates slug/category/colour/active/sort", () => {
    const r = ClubStructuralSchema.safeParse({
      slug: "coding-club",
      category: "media",
      color: "#000000",
      isActive: false,
      sort: "0",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });
});
