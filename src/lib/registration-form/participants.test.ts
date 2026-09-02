import { describe, expect, it } from "vitest";
import { listParticipants, listTeams, type RosterEntry } from "./participants";
import { defaultFormFor, type FormField } from "./schema";

const teamField: FormField = {
  id: "team",
  kind: "team",
  identity: null,
  label: "Team members",
  required: true,
  minMembers: 1,
  maxMembers: 4,
  members: [
    { key: "m_name", label: "Team Member Name", kind: "short_text", required: true },
    { key: "m_mail", label: "Email Id", kind: "email", required: true },
    { key: "m_roll", label: "VTU number", kind: "roll", required: true },
    { key: "m_ph", label: "Phone number", kind: "phone", required: false },
    { key: "m_dept", label: "Department", kind: "short_text", required: false },
    { key: "m_yr", label: "Year", kind: "short_text", required: false },
  ],
};

const leader: RosterEntry = {
  name: "Anitha",
  roll: "vtu001",
  department: "CSE",
  year: 3,
  email: "anitha@veltech.edu.in",
  phone: "9000000000",
  customAnswers: null,
};

describe("listParticipants", () => {
  it("marks everyone solo when the form has no team block", () => {
    const out = listParticipants([leader], defaultFormFor());
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("solo");
    expect(out[0].index).toBe(1);
  });

  it("puts the registrant first as the leader, then their members", () => {
    const out = listParticipants(
      [
        {
          ...leader,
          customAnswers: {
            team: [
              { m_name: "Ravi", m_roll: "vtu002", m_mail: "r@v.in", m_ph: "9", m_dept: "IT", m_yr: "2" },
              { m_name: "Priya", m_roll: "vtu003" },
            ],
          },
        },
      ],
      [...defaultFormFor(), teamField],
    );
    expect(out.map((p) => [p.index, p.name, p.role])).toEqual([
      [1, "Anitha", "leader"],
      [2, "Ravi", "member"],
      [3, "Priya", "member"],
    ]);
  });

  it("reads a member's fields off the club's own labels and kinds", () => {
    const [, ravi] = listParticipants(
      [
        {
          ...leader,
          customAnswers: {
            team: [
              { m_name: "Ravi", m_roll: "vtu002", m_mail: "r@v.in", m_ph: "98765", m_dept: "IT", m_yr: "2" },
            ],
          },
        },
      ],
      [teamField],
    );
    expect(ravi).toMatchObject({
      name: "Ravi",
      roll: "vtu002",
      email: "r@v.in",
      phone: "98765",
      department: "IT",
      year: "2",
    });
  });

  it("numbers straight down across several registrations and names the team", () => {
    const out = listParticipants(
      [
        { ...leader, customAnswers: { team: [{ m_name: "Ravi", m_roll: "vtu002" }] } },
        { ...leader, name: "Bala", roll: "vtu010", customAnswers: { team: [] } },
      ],
      [teamField],
    );
    expect(out.map((p) => [p.index, p.name, p.team, p.teamOf])).toEqual([
      [1, "Anitha", 1, "Anitha"],
      [2, "Ravi", 1, "Anitha"],
      [3, "Bala", 2, "Bala"],
    ]);
  });

  it("skips a member row left completely blank", () => {
    const out = listParticipants(
      [{ ...leader, customAnswers: { team: [{ m_name: "", m_roll: "" }, { m_name: "Ravi" }] } }],
      [teamField],
    );
    expect(out.map((p) => p.name)).toEqual(["Anitha", "Ravi"]);
  });

  it("survives a malformed or missing team answer", () => {
    expect(listParticipants([{ ...leader, customAnswers: { team: "nope" } }], [teamField])).toHaveLength(1);
    expect(listParticipants([{ ...leader, customAnswers: null }], [teamField])).toHaveLength(1);
    expect(
      listParticipants([{ ...leader, customAnswers: { team: [null, 7] } }], [teamField]),
    ).toHaveLength(1);
  });

  it("normalises a missing year to null rather than an empty string", () => {
    const [solo] = listParticipants([{ ...leader, year: null }], defaultFormFor());
    expect(solo.year).toBeNull();
  });
});

describe("listTeams", () => {
  const linkField: FormField = {
    id: "ppt",
    kind: "link",
    identity: null,
    label: "Submit your PPT link",
    required: true,
  };
  const sectionField: FormField = {
    id: "sec",
    kind: "section",
    identity: null,
    label: "About your idea",
    required: false,
  };

  it("groups each registration into one team, leader first", () => {
    const teams = listTeams(
      [
        {
          ...leader,
          customAnswers: {
            ppt: "https://docs.google.com/x",
            team: [{ m_name: "Ravi", m_roll: "vtu002" }],
          },
        },
      ],
      [...defaultFormFor(), teamField, linkField],
    );
    expect(teams).toHaveLength(1);
    expect(teams[0].index).toBe(1);
    expect(teams[0].people.map((p) => [p.name, p.role])).toEqual([
      ["Anitha", "leader"],
      ["Ravi", "member"],
    ]);
  });

  it("carries the team's own answers, like the link", () => {
    const [t] = listTeams(
      [{ ...leader, customAnswers: { ppt: "https://docs.google.com/x", team: [] } }],
      [teamField, linkField],
    );
    expect(t.answers).toEqual([
      { key: "ppt", label: "Submit your PPT link", kind: "link", value: "https://docs.google.com/x" },
    ]);
  });

  it("keeps identity, roster and layout blocks out of the team answers", () => {
    const [t] = listTeams(
      [{ ...leader, customAnswers: { ppt: "https://x.test", team: [] } }],
      [...defaultFormFor(), sectionField, teamField, linkField],
    );
    expect(t.answers.map((a) => a.key)).toEqual(["ppt"]);
  });

  it("numbers people across teams while grouping them per team", () => {
    const teams = listTeams(
      [
        { ...leader, customAnswers: { team: [{ m_name: "Ravi", m_roll: "vtu002" }] } },
        { ...leader, name: "Bala", roll: "vtu010", customAnswers: { team: [] } },
      ],
      [teamField],
    );
    expect(teams.map((t) => t.people.map((p) => p.index))).toEqual([[1, 2], [3]]);
  });

  it("renders a checkbox answer as a readable list", () => {
    const [t] = listTeams(
      [{ ...leader, customAnswers: { tracks: ["AI", "Web"], team: [] } }],
      [
        teamField,
        { id: "tracks", kind: "checkboxes", identity: null, label: "Tracks", required: false, options: ["AI", "Web"] },
      ],
    );
    expect(t.answers[0].value).toBe("AI, Web");
  });

  it("gives an unanswered field an empty value rather than dropping it", () => {
    const [t] = listTeams([{ ...leader, customAnswers: { team: [] } }], [teamField, linkField]);
    expect(t.answers[0].value).toBe("");
  });

  it("treats a solo event as one-person teams", () => {
    const teams = listTeams([leader], defaultFormFor());
    expect(teams).toHaveLength(1);
    expect(teams[0].people).toHaveLength(1);
    expect(teams[0].people[0].role).toBe("solo");
  });
});
