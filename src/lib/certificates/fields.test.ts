import { describe, it, expect } from "vitest";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";
import {
  applyTransform,
  buildFieldCatalogue,
  designContextFor,
  fieldLabel,
  fieldNameValue,
  formatEventDate,
  memberValues,
  sheetValues,
  teamOf,
  registrantValues,
  titleCase,
  type CertEventInfo,
  type RegistrationForFields,
} from "./fields";

const projectQ: FormField = { id: "project", kind: "short_text", identity: null, label: "Project title", required: false };
const section: FormField = { id: "s1", kind: "section", identity: null, label: "About you", required: false };
const teamBlock: FormField = {
  id: "team",
  kind: "team",
  identity: null,
  label: "Team members",
  required: true,
  members: [
    { key: "n", label: "Member name", kind: "short_text", required: true },
    { key: "r", label: "VTU number", kind: "roll", required: false },
  ],
  minMembers: 1,
  maxMembers: 3,
};

const event: CertEventInfo = {
  title: "Hack Night",
  startsAt: "2026-09-14T04:30:00Z",
  endsAt: "2026-09-14T12:30:00Z",
  venue: "Lab 3",
  clubName: "Coding Club",
};

const reg: RegistrationForFields = {
  name: "asha r",
  roll: "VTU1001",
  department: "CSE",
  year: 3,
  email: "vtu1001@veltech.edu.in",
  phone: null,
  teamName: "Byte Me",
  customAnswers: { project: "Smart Bins", team: [{ n: "Ravi K", r: "VTU1002" }, { n: "", r: "" }] },
};

describe("buildFieldCatalogue", () => {
  it("offers person, event and certificate groups on a plain form", () => {
    const groups = buildFieldCatalogue({ formSchema: defaultFormFor() });
    expect(groups.map((g) => g.id)).toEqual(["person", "event", "cert"]);
  });

  it("adds team and form-answer groups when the form has them, skipping layout blocks", () => {
    const groups = buildFieldCatalogue({ formSchema: [...defaultFormFor(), section, projectQ, teamBlock] });
    expect(groups.map((g) => g.id)).toEqual(["person", "team", "event", "form", "cert"]);
    expect(groups.find((g) => g.id === "form")!.fields).toEqual([{ key: "form.project", label: "Project title" }]);
  });

  it("adds sheet columns when given", () => {
    const groups = buildFieldCatalogue({ formSchema: [], sheetColumns: ["Role"] });
    expect(groups.find((g) => g.id === "sheet")!.fields).toEqual([{ key: "sheet.Role", label: "Role" }]);
  });

  it("labels keys, falling back to the raw key", () => {
    const groups = buildFieldCatalogue({ formSchema: [projectQ] });
    expect(fieldLabel(groups, "form.project")).toBe("Project title");
    expect(fieldLabel(groups, "form.gone")).toBe("form.gone");
    expect(fieldNameValue(groups)("person.name")).toBe("{Name}");
  });
});

describe("designContextFor", () => {
  it("allows this form's answer fields and the given sheet columns", () => {
    const ctx = designContextFor([...defaultFormFor(), section, projectQ, teamBlock], ["Role"]);
    expect([...ctx.formFieldIds]).toEqual(["project"]);
    expect([...ctx.sheetColumns]).toEqual(["Role"]);
  });
});

describe("transforms", () => {
  it("title-cases names typed any old way", () => {
    expect(titleCase("asha r")).toBe("Asha R");
    expect(titleCase("JOHN o'NEIL-SMITH")).toBe("John O'neil-Smith");
    expect(titleCase("dr. k.s. ravi")).toBe("Dr. K.S. Ravi");
  });

  it("keeps the editor's {Field} placeholders readable", () => {
    expect(titleCase("{Name}")).toBe("{Name}");
    expect(titleCase("{Team name}")).toBe("{Team Name}");
  });

  it("applies upper / none", () => {
    expect(applyTransform("Asha", "upper")).toBe("ASHA");
    expect(applyTransform("asha", "none")).toBe("asha");
  });
});

describe("formatEventDate", () => {
  it("prints one IST day", () => {
    expect(formatEventDate("2026-09-14T04:30:00Z", "2026-09-14T12:30:00Z")).toBe("14 September 2026");
  });

  it("uses IST, not UTC, for the day boundary", () => {
    // 20:00 UTC on the 13th is 01:30 IST on the 14th.
    expect(formatEventDate("2026-09-13T20:00:00Z", null)).toBe("14 September 2026");
  });

  it("prints the shortest honest range", () => {
    expect(formatEventDate("2026-09-14T04:30:00Z", "2026-09-15T12:30:00Z")).toBe("14–15 September 2026");
    expect(formatEventDate("2026-09-30T04:30:00Z", "2026-10-02T12:30:00Z")).toBe("30 September – 2 October 2026");
    expect(formatEventDate("2026-12-31T04:30:00Z", "2027-01-01T12:30:00Z")).toBe("31 December 2026 – 1 January 2027");
  });
});

describe("registrantValues", () => {
  it("resolves a solo participant", () => {
    const v = registrantValues({
      event,
      schema: [...defaultFormFor(), projectQ],
      registration: { ...reg, teamName: null },
      groupLabel: "Participation",
    });
    expect(v).toMatchObject({
      "person.name": "asha r",
      "person.year": "3",
      "person.phone": "",
      "person.role": "Participant",
      "team.members": "",
      "team.size": "",
      "event.title": "Hack Night",
      "event.date": "14 September 2026",
      "event.club": "Coding Club",
      "form.project": "Smart Bins",
      "cert.group": "Participation",
    });
  });

  it("resolves a team member: own identity, the team's shared answers", () => {
    const schema = [...defaultFormFor(), teamBlock, projectQ];
    const team = teamOf(reg, schema);
    expect(team.map((p) => p.name)).toEqual(["asha r", "Ravi K"]);
    const member = team.find((p) => !p.isLeader)!;
    const v = memberValues({ event, schema, registration: reg, member, groupLabel: "Participation" });
    expect(v).toMatchObject({
      "person.name": "Ravi K",
      "person.roll": "VTU1002",
      "person.role": "Team member",
      "person.department": "", // the form never asked members for one
      "team.name": "Byte Me",
      "team.members": "asha r, Ravi K",
      "team.size": "2",
      "form.project": "Smart Bins",
      "event.title": "Hack Night",
    });
  });

  it("resolves a sheet row: its own columns, no team, event details shared", () => {
    const v = sheetValues({
      event,
      columns: ["Role", "Shift"],
      row: { name: " Kim ", email: "kim@x.com", data: { Role: "Judge", Shift: 2 } },
      groupLabel: "Judges",
    });
    expect(v).toMatchObject({
      "person.name": "Kim",
      "person.email": "kim@x.com",
      "person.roll": "",
      "person.role": "Judges",
      "sheet.Role": "Judge",
      "sheet.Shift": "2",
      "team.name": "",
      "event.date": "14 September 2026",
      "cert.group": "Judges",
    });
  });

  it("resolves a team leader with the whole team, skipping blank member rows", () => {
    const v = registrantValues({
      event,
      schema: [...defaultFormFor(), teamBlock],
      registration: reg,
      groupLabel: "Participation",
    });
    expect(v["person.role"]).toBe("Team leader");
    expect(v["team.name"]).toBe("Byte Me");
    expect(v["team.members"]).toBe("asha r, Ravi K");
    expect(v["team.size"]).toBe("2");
  });
});
