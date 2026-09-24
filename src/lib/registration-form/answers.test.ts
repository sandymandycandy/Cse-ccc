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
    const r = validateAnswers([team], ({ team: [{ name: "Asha", email: "A@x.io" }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customAnswers.team).toEqual([{ name: "Asha", email: "a@x.io" }]);
  });
  it("drops a fully-empty member row", () => {
    const r = validateAnswers([team], ({ team: [{ name: "Asha", email: "a@x.io" }, { name: "", email: "" }] }));
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
    expect(validateAnswers([team], ({ team: [{ name: "Asha", email: "nope" }] })).ok).toBe(false);
  });
  it("rejects a member missing a required subfield", () => {
    expect(validateAnswers([team], ({ team: [{ name: "Asha" }] })).ok).toBe(false);
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

describe("team name as an identity block", () => {
  const teamName = f({ id: "team_name", kind: "short_text", identity: "team_name", label: "Team name", required: true });

  it("returns the team name on the identity, so it lands in its own column", () => {
    const r = validateAnswers([teamName], { team_name: "Byte Squad" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.identity.team_name).toBe("Byte Squad");
  });

  it("trims surrounding whitespace", () => {
    const r = validateAnswers([teamName], { team_name: "  Byte Squad  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.identity.team_name).toBe("Byte Squad");
  });

  it("is required when the block is marked required", () => {
    const r = validateAnswers([teamName], {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.team_name).toBeTruthy();
  });

  it("rejects a one-character name and one longer than 80", () => {
    expect(validateAnswers([teamName], { team_name: "A" }).ok).toBe(false);
    expect(validateAnswers([teamName], { team_name: "x".repeat(81) }).ok).toBe(false);
    expect(validateAnswers([teamName], { team_name: "x".repeat(80) }).ok).toBe(true);
  });

  it("a club that omits the block simply collects no team name", () => {
    // The owner chose a removable block over an automatic one, so this is
    // allowed: the event just stores null.
    const solo = f({ id: "name", kind: "short_text", identity: "name", required: true });
    const r = validateAnswers([solo], { name: "Asha Rao" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.identity.team_name).toBeUndefined();
  });

  it("an optional block accepts being left blank", () => {
    const optional = { ...teamName, required: false };
    const r = validateAnswers([optional], {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.identity.team_name).toBeUndefined();
  });
});

// AI FORGE EXPO, 2026-09-24: students were getting a bare 400 for inputs a
// person would call correct.
describe("forgiving the way students actually type", () => {
  const team = f({
    id: "team", kind: "team", required: true, minMembers: 1, maxMembers: 4,
    members: [
      { key: "name", kind: "short_text", label: "NAME", required: true },
      { key: "vtu", kind: "roll", label: "VTU NUMBER", required: true },
    ],
  });

  it("accepts a 5-digit VTU number, and one with spaces or a dash", () => {
    for (const vtu of ["12345", "VTU 12345", "vtu-12345"]) {
      const r = validateAnswers([team], { team: [{ name: "Asha", vtu }] });
      expect(r.ok, vtu).toBe(true);
    }
    const r = validateAnswers([team], { team: [{ name: "Asha", vtu: "vtu 12345" }] });
    expect(r.ok && r.data.customAnswers.team).toEqual([{ name: "Asha", vtu: "VTU12345" }]);
  });

  it("still rejects something that is not a roll number", () => {
    expect(validateAnswers([team], { team: [{ name: "Asha", vtu: "12" }] }).ok).toBe(false);
  });

  it("accepts a link typed without https://, stored with it", () => {
    const schema = [f({ id: "doc", kind: "link", required: true })];
    const r = validateAnswers(schema, { doc: "drive.google.com/file/d/abc" });
    expect(r.ok && r.data.customAnswers.doc).toBe("https://drive.google.com/file/d/abc");
  });

  it("still refuses a non-web scheme or plain words", () => {
    const schema = [f({ id: "doc", kind: "link", required: true })];
    expect(validateAnswers(schema, { doc: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateAnswers(schema, { doc: "my ppt" }).ok).toBe(false);
  });
});

describe("phone numbers as students type them", () => {
  const schema = [f({ id: "ph", kind: "short_text", identity: "phone", required: true })];
  it("accepts +91, spaces, dashes and a leading 0, stored as 10 digits", () => {
    for (const ph of ["+91 98765 43210", "98765-43210", "09876543210", "919876543210"]) {
      const r = validateAnswers(schema, { ph });
      expect(r.ok && r.data.identity.phone, ph).toBe("9876543210");
    }
  });
  it("still rejects a number that is not a mobile", () => {
    expect(validateAnswers(schema, { ph: "12345" }).ok).toBe(false);
  });
});
