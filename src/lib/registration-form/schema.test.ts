import { describe, it, expect } from "vitest";
import { DEFAULT_FORM, defaultFormFor, validateFormSchema } from "./schema";

describe("DEFAULT_FORM", () => {
  it("is today's six identity fields, all required, in order", () => {
    expect(DEFAULT_FORM.map((f) => f.identity)).toEqual([
      "name", "roll", "email", "phone", "department", "year",
    ]);
    expect(DEFAULT_FORM.every((f) => f.required)).toBe(true);
  });
  it("defaultFormFor returns an independent clone", () => {
    const a = defaultFormFor();
    a[0].label = "X";
    expect(DEFAULT_FORM[0].label).not.toBe("X");
  });
});

describe("validateFormSchema", () => {
  const base = { id: "q1", kind: "short_text", identity: null, label: "Q", required: false };

  it("accepts a minimal valid form", () => {
    const r = validateFormSchema([base]);
    expect(r.ok).toBe(true);
  });
  it("rejects an empty form", () => {
    expect(validateFormSchema([]).ok).toBe(false);
  });
  it("rejects duplicate ids", () => {
    const r = validateFormSchema([base, { ...base }]);
    expect(r.ok).toBe(false);
  });
  it("rejects an unknown kind", () => {
    const r = validateFormSchema([{ ...base, kind: "file" }]);
    expect(r.ok).toBe(false);
  });
  it("requires ≥1 option for choice kinds", () => {
    expect(validateFormSchema([{ ...base, kind: "dropdown", options: [] }]).ok).toBe(false);
    expect(validateFormSchema([{ ...base, kind: "dropdown", options: ["a"] }]).ok).toBe(true);
  });
  it("rejects options on a non-choice kind", () => {
    expect(validateFormSchema([{ ...base, kind: "short_text", options: ["a"] }]).ok).toBe(false);
  });
  it("rejects two blocks with the same identity", () => {
    const r = validateFormSchema([
      { ...base, id: "a", identity: "roll" },
      { ...base, id: "b", identity: "roll" },
    ]);
    expect(r.ok).toBe(false);
  });
  it("rejects more than 40 fields", () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ ...base, id: `q${i}` }));
    expect(validateFormSchema(many).ok).toBe(false);
  });
  it("rejects a blank label", () => {
    expect(validateFormSchema([{ ...base, label: "  " }]).ok).toBe(false);
  });
});

describe("section & team & allowOther", () => {
  const base = { id: "q1", kind: "short_text", identity: null, label: "Q", required: false };

  it("accepts a section block with a description and no options", () => {
    const r = validateFormSchema([
      { ...base, kind: "section", label: "Team Details", description: "Fill for all members" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields[0].required).toBe(false); // forced false
  });
  it("rejects a section that carries options", () => {
    expect(validateFormSchema([{ ...base, kind: "section", options: ["a"] }]).ok).toBe(false);
  });
  it("rejects a section with an identity", () => {
    expect(validateFormSchema([{ ...base, kind: "section", identity: "name" }]).ok).toBe(false);
  });

  it("accepts a valid team block", () => {
    const r = validateFormSchema([
      {
        ...base, kind: "team", label: "Team members",
        minMembers: 1, maxMembers: 4,
        members: [
          { key: "name", label: "Name", kind: "short_text", required: true },
          { key: "email", label: "Email", kind: "email", required: true },
        ],
      },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields[0].members?.length).toBe(2);
  });
  it("rejects a team with no members", () => {
    expect(
      validateFormSchema([{ ...base, kind: "team", members: [], minMembers: 1, maxMembers: 4 }]).ok,
    ).toBe(false);
  });
  it("rejects a team with maxMembers over the cap", () => {
    expect(
      validateFormSchema([
        { ...base, kind: "team", minMembers: 1, maxMembers: 99,
          members: [{ key: "n", label: "N", kind: "short_text", required: true }] },
      ]).ok,
    ).toBe(false);
  });
  it("rejects a team where min > max", () => {
    expect(
      validateFormSchema([
        { ...base, kind: "team", minMembers: 5, maxMembers: 3,
          members: [{ key: "n", label: "N", kind: "short_text", required: true }] },
      ]).ok,
    ).toBe(false);
  });
  it("rejects a member subfield with an unknown kind", () => {
    expect(
      validateFormSchema([
        { ...base, kind: "team", minMembers: 1, maxMembers: 2,
          members: [{ key: "n", label: "N", kind: "file", required: true }] },
      ]).ok,
    ).toBe(false);
  });
  it("rejects duplicate member subfield keys", () => {
    expect(
      validateFormSchema([
        { ...base, kind: "team", minMembers: 1, maxMembers: 2,
          members: [
            { key: "n", label: "A", kind: "short_text", required: true },
            { key: "n", label: "B", kind: "email", required: false },
          ] },
      ]).ok,
    ).toBe(false);
  });

  it("keeps allowOther only on choice kinds", () => {
    const ok = validateFormSchema([{ ...base, kind: "radio", options: ["a"], allowOther: true }]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.fields[0].allowOther).toBe(true);
    const bad = validateFormSchema([{ ...base, kind: "short_text", allowOther: true }]);
    expect(bad.ok).toBe(false);
  });
});
