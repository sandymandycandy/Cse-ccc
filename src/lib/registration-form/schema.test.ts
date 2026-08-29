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
