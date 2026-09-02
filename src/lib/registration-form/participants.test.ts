import { describe, expect, it } from "vitest";
import { listParticipants, listTeams, teamSearchValues, teamLabel, teamMembersForPublic, type RosterEntry } from "./participants";
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

describe("teamSearchValues", () => {
  const team = {
    index: 2,
    name: "Byte Squad",
    people: [
      {
        index: 1, name: "Alice Kumar", roll: "VTU101", department: "CSE",
        year: "3", email: "alice@veltech.edu.in", phone: "9876543210",
        role: "leader" as const, team: 2, teamOf: "Alice Kumar",
      },
      {
        index: 2, name: "Bob Singh", roll: "VTU202", department: null,
        year: null, email: null, phone: null,
        role: "member" as const, team: 2, teamOf: "Alice Kumar",
      },
    ],
    answers: [{ key: "ppt", label: "PPT link", kind: "link" as const, value: "https://x.test/deck" }],
  };

  it("exposes every person's identity details", () => {
    const values = teamSearchValues(team);
    for (const v of ["Alice Kumar", "VTU101", "CSE", "3", "alice@veltech.edu.in", "9876543210"]) {
      expect(values).toContain(v);
    }
    expect(values).toContain("Bob Singh");
    expect(values).toContain("VTU202");
  });

  it("exposes answer VALUES but never answer labels", () => {
    const values = teamSearchValues(team);
    expect(values).toContain("https://x.test/deck");
    // A label is identical on every team, so matching it would match everything
    // and make the search useless.
    expect(values).not.toContain("PPT link");
  });

  it("does not leak the role or the internal indices", () => {
    const values = teamSearchValues(team);
    expect(values).not.toContain("leader");
    expect(values).not.toContain("member");
    expect(values).not.toContain(2);
  });
});

describe("team name on the roster", () => {
  const schema: FormField[] = [
    { id: "team", kind: "team", label: "Team", required: true, minMembers: 1, maxMembers: 3,
      members: [{ key: "name", label: "Name", kind: "short_text", required: true }] } as FormField,
  ];
  const entry = (over: Partial<RosterEntry>): RosterEntry => ({
    name: "Asha Rao", roll: "VTU101", department: null, year: null,
    email: null, phone: null, customAnswers: null, ...over,
  });

  it("carries the team's own name onto the group", () => {
    const [t] = listTeams([entry({ teamName: "Byte Squad" })], schema);
    expect(t.name).toBe("Byte Squad");
  });

  it("is null when the registration has none", () => {
    const [t] = listTeams([entry({})], schema);
    expect(t.name).toBeNull();
  });

  it("teamLabel prefers the name", () => {
    const [t] = listTeams([entry({ teamName: "Byte Squad" })], schema);
    expect(teamLabel(t)).toBe("Byte Squad");
  });

  it("teamLabel falls back to the index for rows predating the field", () => {
    const [t] = listTeams([entry({})], schema);
    expect(teamLabel(t)).toBe("Team 1");
  });

  it("teamLabel falls back when the name is only whitespace", () => {
    const [t] = listTeams([entry({ teamName: "   " })], schema);
    expect(teamLabel(t)).toBe("Team 1");
  });

  it("the team name is searchable", () => {
    const [t] = listTeams([entry({ teamName: "Byte Squad" })], schema);
    expect(teamSearchValues(t)).toContain("Byte Squad");
  });
});

describe("teamMembersForPublic — what may be published on a public results page", () => {
  const schema: FormField[] = [
    { id: "team", kind: "team", label: "Team", required: true, minMembers: 1, maxMembers: 3,
      members: [
        { key: "m_name", label: "Member Name", kind: "short_text", required: true },
        { key: "m_roll", label: "VTU number", kind: "roll", required: true },
        { key: "m_email", label: "Email", kind: "email", required: false },
        { key: "m_phone", label: "Phone", kind: "phone", required: false },
      ] } as FormField,
  ];
  const entry: RosterEntry = {
    name: "Asha Rao", roll: "VTU101", department: null, year: null,
    email: null, phone: null,
    customAnswers: {
      team: [
        { m_name: "Bob Singh", m_roll: "VTU202", m_email: "bob@x.io", m_phone: "9876543210" },
        { m_name: "Cara M", m_roll: "VTU303", m_email: "cara@x.io", m_phone: "9000000000" },
      ],
    },
  };

  it("returns each member's name and roll, not the leader's", () => {
    expect(teamMembersForPublic(entry, schema)).toEqual([
      { name: "Bob Singh", roll: "VTU202" },
      { name: "Cara M", roll: "VTU303" },
    ]);
  });

  it("NEVER leaks a member's email or phone number", () => {
    // This lands in a column anyone on the internet can read. Name and roll are
    // what the owner asked for; contact details would be a leak.
    const out = JSON.stringify(teamMembersForPublic(entry, schema));
    for (const secret of ["bob@x.io", "cara@x.io", "9876543210", "9000000000"]) {
      expect(out).not.toContain(secret);
    }
  });

  it("is empty for a solo event with no team block", () => {
    const solo = [{ id: "n", kind: "short_text", label: "Name", identity: "name", required: true } as FormField];
    expect(teamMembersForPublic({ ...entry, customAnswers: null }, solo)).toEqual([]);
  });

  it("is empty when the team block was left blank", () => {
    expect(teamMembersForPublic({ ...entry, customAnswers: { team: [] } }, schema)).toEqual([]);
  });

  it("skips a member row with no name", () => {
    const e = { ...entry, customAnswers: { team: [{ m_name: "", m_roll: "VTU999" }, { m_name: "Dee", m_roll: "VTU888" }] } };
    expect(teamMembersForPublic(e, schema)).toEqual([{ name: "Dee", roll: "VTU888" }]);
  });
});
