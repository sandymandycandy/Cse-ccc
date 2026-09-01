import { describe, it, expect } from "vitest";
import { validateAnswers } from "./answers";
import type { FormField } from "./schema";

const f = (o: Partial<FormField> & Pick<FormField, "id" | "kind">): FormField => ({
  identity: null, label: o.id, required: false, ...o,
});

describe("validateAnswers", () => {
  it("maps identity blocks to real columns and normalises them", () => {
    const schema = [
      f({ id: "name", kind: "short_text", identity: "name", required: true }),
      f({ id: "roll", kind: "short_text", identity: "roll", required: true }),
      f({ id: "email", kind: "short_text", identity: "email", required: true }),
      f({ id: "phone", kind: "short_text", identity: "phone", required: true }),
    ];
    const r = validateAnswers(schema, {
      name: "Asha Rao", roll: "vtu12345", email: "VTU12345@veltech.edu.in", phone: "9876543210",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.identity.roll_no).toBe("VTU12345");
      expect(r.data.identity.email).toBe("vtu12345@veltech.edu.in");
      expect(r.data.identity.student_name).toBe("Asha Rao");
    }
  });

  it("flags a missing required field", () => {
    const schema = [f({ id: "q", kind: "short_text", required: true })];
    const r = validateAnswers(schema, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.q).toBeTruthy();
  });

  it("rejects a bad email identity", () => {
    const schema = [f({ id: "email", kind: "short_text", identity: "email", required: true })];
    const r = validateAnswers(schema, { email: "not-an-email" });
    expect(r.ok).toBe(false);
  });

  it("enforces option membership for radio", () => {
    const schema = [f({ id: "size", kind: "radio", required: true, options: ["S", "M"] })];
    expect(validateAnswers(schema, { size: "M" }).ok).toBe(true);
    expect(validateAnswers(schema, { size: "XL" }).ok).toBe(false);
  });

  it("accepts an array of valid options for checkboxes", () => {
    const schema = [f({ id: "days", kind: "checkboxes", required: true, options: ["Mon", "Tue"] })];
    const r = validateAnswers(schema, { days: ["Mon", "Tue"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers.days).toEqual(["Mon", "Tue"]);
  });

  it("accepts a safe https link and rejects javascript:", () => {
    const schema = [f({ id: "doc", kind: "link", required: true })];
    expect(validateAnswers(schema, { doc: "https://drive.google.com/x" }).ok).toBe(true);
    expect(validateAnswers(schema, { doc: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("ignores answer keys not in the schema (never trusts the client)", () => {
    const schema = [f({ id: "q", kind: "short_text", required: false })];
    const r = validateAnswers(schema, { q: "hi", evil: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers).not.toHaveProperty("evil");
  });

  it("coerces and range-checks a number", () => {
    const schema = [f({ id: "n", kind: "number", required: true })];
    expect(validateAnswers(schema, { n: "42" }).ok).toBe(true);
    expect(validateAnswers(schema, { n: "abc" }).ok).toBe(false);
  });

  it("maps department and year identities into the identity map", () => {
    const schema = [
      f({ id: "department", kind: "dropdown", identity: "department", required: true, options: ["CSE", "IT"] }),
      f({ id: "year", kind: "dropdown", identity: "year", required: true, options: ["1", "2", "3", "4"] }),
    ];
    const r = validateAnswers(schema, { department: "CSE", year: "3" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.identity.department).toBe("CSE");
      expect(r.data.identity.year).toBe(3);
    }
  });

  it("accepts a typed-in department when the field allows 'Other'", () => {
    const schema = [
      f({ id: "department", kind: "dropdown", identity: "department", required: true, options: ["CSE", "IT"], allowOther: true }),
    ];
    const r = validateAnswers(schema, { department: "Biotechnology" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.identity.department).toBe("Biotechnology");
  });

  it("rejects an unlisted department when 'Other' is not allowed", () => {
    const schema = [
      f({ id: "department", kind: "dropdown", identity: "department", required: true, options: ["CSE", "IT"] }),
    ];
    expect(validateAnswers(schema, { department: "Biotechnology" }).ok).toBe(false);
  });
});

describe("team & other answers", () => {
  const team = f({
    id: "team", kind: "team", required: true, label: "Team",
    minMembers: 1, maxMembers: 3,
    members: [
      { key: "name", label: "Name", kind: "short_text", required: true },
      { key: "email", label: "Email", kind: "email", required: true },
    ],
  });

  it("accepts a valid team and stores an array of member objects", () => {
    const r = validateAnswers([team], { team: [{ name: "Asha", email: "A@x.io" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers.team).toEqual([{ name: "Asha", email: "a@x.io" }]);
  });
  it("drops a fully-empty member row", () => {
    const r = validateAnswers([team], { team: [{ name: "Asha", email: "a@x.io" }, { name: "", email: "" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.customAnswers.team as unknown[]).length).toBe(1);
  });
  it("rejects when a required team has no members", () => {
    expect(validateAnswers([team], { team: [] }).ok).toBe(false);
  });
  it("rejects more members than max", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `N${i}`, email: `n${i}@x.io` }));
    expect(validateAnswers([team], { team: four }).ok).toBe(false);
  });
  it("rejects a member with a bad email", () => {
    expect(validateAnswers([team], { team: [{ name: "Asha", email: "nope" }] }).ok).toBe(false);
  });
  it("rejects a member missing a required subfield", () => {
    expect(validateAnswers([team], { team: [{ name: "Asha" }] }).ok).toBe(false);
  });

  it("accepts an 'Other' write-in on a radio with allowOther", () => {
    const schema = [f({ id: "src", kind: "radio", required: true, options: ["A", "B"], allowOther: true })];
    const r = validateAnswers(schema, { src: "Somewhere else" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers.src).toBe("Somewhere else");
  });
  it("still rejects an unknown radio value when allowOther is false", () => {
    const schema = [f({ id: "src", kind: "radio", required: true, options: ["A", "B"] })];
    expect(validateAnswers(schema, { src: "X" }).ok).toBe(false);
  });
  it("accepts one Other value among checkboxes", () => {
    const schema = [f({ id: "days", kind: "checkboxes", required: true, options: ["Mon", "Tue"], allowOther: true })];
    const r = validateAnswers(schema, { days: ["Mon", "Custom day"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers.days).toEqual(["Mon", "Custom day"]);
  });
  it("skips section blocks entirely", () => {
    const schema = [f({ id: "s", kind: "section", required: true, label: "Heading" })];
    const r = validateAnswers(schema, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers).not.toHaveProperty("s");
  });
});
