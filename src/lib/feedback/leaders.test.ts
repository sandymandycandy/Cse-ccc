import { describe, it, expect } from "vitest";
import { resolveLeaders, type LeaderCandidate } from "./leaders";

const head = (id: string, name: string): LeaderCandidate => ({
  id,
  name,
  role: "club_head",
  isActive: true,
});
const vice = (id: string, name: string): LeaderCandidate => ({
  id,
  name,
  role: "vice_head",
  isActive: true,
});
const none = { headId: null, viceHeadId: null };

describe("resolveLeaders", () => {
  it("uses the sole active head when nothing is curated", () => {
    const r = resolveLeaders([head("h1", "R.jayasurya"), vice("v1", "Manidhar")], none);
    expect(r.head).toEqual({ id: "h1", name: "R.jayasurya" });
    expect(r.viceHead).toEqual({ id: "v1", name: "Manidhar" });
  });

  it("returns null for a role with no candidate at all", () => {
    const r = resolveLeaders([head("h1", "Rakshana A")], none);
    expect(r.viceHead).toBeNull();
  });

  it("returns null when a role is ambiguous and uncurated", () => {
    const r = resolveLeaders([head("h1", "Coding Head"), head("h2", "Navaneeth")], none);
    expect(r.head).toBeNull();
  });

  it("prefers the curated pick over the ambiguity", () => {
    const r = resolveLeaders([head("h1", "Coding Head"), head("h2", "Navaneeth")], {
      headId: "h2",
      viceHeadId: null,
    });
    expect(r.head).toEqual({ id: "h2", name: "Navaneeth" });
  });

  it("prefers the curated pick even when there is only one candidate", () => {
    const r = resolveLeaders([head("h1", "A"), head("h2", "B")], {
      headId: "h1",
      viceHeadId: null,
    });
    expect(r.head).toEqual({ id: "h1", name: "A" });
  });

  it("ignores a curated pick pointing at a deactivated account", () => {
    const r = resolveLeaders(
      [{ id: "h1", name: "Gone", role: "club_head", isActive: false }, head("h2", "Here")],
      { headId: "h1", viceHeadId: null },
    );
    expect(r.head).toEqual({ id: "h2", name: "Here" });
  });

  it("ignores a curated pick pointing at an unknown id", () => {
    const r = resolveLeaders([head("h1", "Only")], { headId: "ghost", viceHeadId: null });
    expect(r.head).toEqual({ id: "h1", name: "Only" });
  });

  it("never lets a curated head resolve to a vice-head account", () => {
    const r = resolveLeaders([vice("v1", "Vice")], { headId: "v1", viceHeadId: null });
    expect(r.head).toBeNull();
  });

  it("excludes inactive candidates from the sole-candidate fallback", () => {
    const r = resolveLeaders(
      [head("h1", "Active"), { id: "h2", name: "Inactive", role: "club_head", isActive: false }],
      none,
    );
    expect(r.head).toEqual({ id: "h1", name: "Active" });
  });
  // ---- typed names: a leader the club has, but who has no admin account ----

  it("names a typed vice head when the club has no vice-head account", () => {
    const r = resolveLeaders([head("h1", "Kishore S")], {
      ...none,
      viceHeadName: "Kaviya R",
    });
    expect(r.viceHead).toEqual({ id: null, name: "Kaviya R" });
  });

  it("prefers a typed name over the sole-candidate fallback", () => {
    const r = resolveLeaders([vice("v1", "On file")], {
      ...none,
      viceHeadName: "Typed instead",
    });
    expect(r.viceHead).toEqual({ id: null, name: "Typed instead" });
  });

  it("prefers a curated account over a typed name", () => {
    const r = resolveLeaders([vice("v1", "On file")], {
      headId: null,
      viceHeadId: "v1",
      viceHeadName: "Typed instead",
    });
    expect(r.viceHead).toEqual({ id: "v1", name: "On file" });
  });

  it("falls back to a typed name when the curated pick is stale", () => {
    const r = resolveLeaders([], { headId: "ghost", viceHeadId: null, headName: "Typed Head" });
    expect(r.head).toEqual({ id: null, name: "Typed Head" });
  });

  it("ignores a whitespace-only typed name", () => {
    const r = resolveLeaders([vice("v1", "On file")], { ...none, viceHeadName: "   " });
    expect(r.viceHead).toEqual({ id: "v1", name: "On file" });
  });

  it("trims a typed name", () => {
    const r = resolveLeaders([], { ...none, headName: "  Padded Name  " });
    expect(r.head).toEqual({ id: null, name: "Padded Name" });
  });

  it("still resolves to nobody when there is neither an account nor a typed name", () => {
    const r = resolveLeaders([head("h1", "Kishore S")], { ...none, viceHeadName: "" });
    expect(r.viceHead).toBeNull();
  });
});
