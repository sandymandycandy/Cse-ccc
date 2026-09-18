import { describe, it, expect, vi } from "vitest";
import type { Member } from "@/data/ccc";
import type { TeamProfileRow } from "@/lib/team/profiles";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { rowsToSeed } = await import("./team-profiles");

const m = (over: Partial<Member>): Member => ({
  id: "x",
  name: "X",
  role: "Head",
  layer: "clubs",
  vtu: "1",
  email: "x@y.z",
  ...over,
});

const rowFor = (memberId: string) => ({ memberId }) as TeamProfileRow;

describe("rowsToSeed", () => {
  it("returns an insert for every member with no row", () => {
    const seed = rowsToSeed([m({ id: "a" }), m({ id: "b" })], []);
    expect(seed.map((s) => s.member_id)).toEqual(["a", "b"]);
  });

  // The sync must never clobber an edit with the file's stale value.
  it("skips members that already have a row", () => {
    const seed = rowsToSeed([m({ id: "a" }), m({ id: "b" })], [rowFor("a")]);
    expect(seed.map((s) => s.member_id)).toEqual(["b"]);
  });

  it("returns nothing once every member has a row — so re-running is a no-op", () => {
    expect(rowsToSeed([m({ id: "a" })], [rowFor("a")])).toEqual([]);
  });

  it("copies the file's values, with undefined optionals as null", () => {
    const [seed] = rowsToSeed([m({ id: "a", name: "A", role: "Head", email: "a@b.c" })], []);
    expect(seed).toEqual({
      member_id: "a",
      name: "A",
      role: "Head",
      email: "a@b.c",
      year: null,
      department: null,
      description: null,
      portfolio: null,
    });
  });

  it("carries optionals across when the file has them", () => {
    const [seed] = rowsToSeed(
      [m({ id: "a", year: "IV", department: "CSE", description: "Bio", portfolio: "https://x.y" })],
      [],
    );
    expect(seed.year).toBe("IV");
    expect(seed.department).toBe("CSE");
    expect(seed.description).toBe("Bio");
    expect(seed.portfolio).toBe("https://x.y");
  });

  // Structure must never be written to team_profiles — it has no columns for it.
  it("never includes structure (layer, club, vtu) in the insert", () => {
    const [seed] = rowsToSeed([m({ id: "a", layer: "smt", club: "coding", vtu: "999" })], []);
    expect(Object.keys(seed).sort()).toEqual(
      ["department", "description", "email", "member_id", "name", "portfolio", "role", "year"].sort(),
    );
  });
});
