import { describe, it, expect } from "vitest";
import { validateTeamProfile } from "./team-profile-validate";

const fd = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const base = {
    name: "A Person",
    role: "Head",
    email: "a@veltech.edu.in",
    focalX: "50",
    focalY: "50",
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
};

describe("validateTeamProfile", () => {
  it("accepts a valid form", () => {
    const { values, fieldErrors } = validateTeamProfile(fd());
    expect(fieldErrors).toBeUndefined();
    expect(values?.name).toBe("A Person");
  });

  it("requires a name", () => {
    expect(validateTeamProfile(fd({ name: "  " })).fieldErrors).toEqual({ name: "Enter a name." });
  });

  it("requires a role", () => {
    expect(validateTeamProfile(fd({ role: "" })).fieldErrors).toEqual({ role: "Enter a role." });
  });

  it("rejects an email with no @", () => {
    expect(validateTeamProfile(fd({ email: "nope" })).fieldErrors).toEqual({
      email: "That does not look like an email address.",
    });
  });

  // isSafeHttpUrl parses with new URL(), so a javascript: scheme is a valid URL
  // with the wrong protocol — exactly the case a naive startsWith would miss.
  it("rejects a portfolio URL that is not http(s)", () => {
    expect(validateTeamProfile(fd({ portfolio: "javascript:alert(1)" })).fieldErrors).toEqual({
      portfolio: "Enter a full https:// link, or leave it blank.",
    });
  });

  it("rejects a focal point outside 0-100", () => {
    expect(validateTeamProfile(fd({ focalX: "140" })).fieldErrors).toEqual({
      focalX: "Must be between 0 and 100.",
    });
  });

  it("turns blank optionals into null, not empty strings", () => {
    const { values } = validateTeamProfile(fd({ year: "", department: "  ", portfolio: "" }));
    expect(values?.year).toBeNull();
    expect(values?.department).toBeNull();
    expect(values?.portfolio).toBeNull();
  });

  it("reports every bad field at once, not just the first", () => {
    const errs = validateTeamProfile(fd({ name: "", role: "", email: "x" })).fieldErrors!;
    expect(Object.keys(errs).sort()).toEqual(["email", "name", "role"]);
  });
});
