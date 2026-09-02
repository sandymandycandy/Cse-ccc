import { describe, it, expect } from "vitest";
import { teamRecipients } from "./recipients";
import type { FormField } from "./schema";

const f = (o: Partial<FormField> & Pick<FormField, "id" | "kind">): FormField => ({
  identity: null, label: o.id, required: false, ...o,
});

const teamSchema = [
  f({
    id: "team", kind: "team", label: "Team", minMembers: 1, maxMembers: 4,
    members: [
      { key: "name", label: "Name", kind: "short_text", required: true },
      { key: "email", label: "Email", kind: "email", required: true },
    ],
  }),
];

describe("teamRecipients", () => {
  it("returns leader + member emails, deduped and lowercased", () => {
    const out = teamRecipients(teamSchema,
      { team: [{ name: "A", email: "A@x.io" }, { name: "B", email: "b@x.io" }] },
      "lead@x.io");
    expect(out).toEqual(["lead@x.io", "a@x.io", "b@x.io"]);
  });
  it("drops a member row that duplicates the leader", () => {
    const out = teamRecipients(teamSchema, { team: [{ name: "L", email: "lead@x.io" }] }, "lead@x.io");
    expect(out).toEqual(["lead@x.io"]);
  });
  it("works when there is no team block (leader only)", () => {
    expect(teamRecipients([], null, "lead@x.io")).toEqual(["lead@x.io"]);
  });
  it("skips an invalid/blank leader but keeps valid member emails", () => {
    const out = teamRecipients(teamSchema, { team: [{ name: "A", email: "a@x.io" }] }, "");
    expect(out).toEqual(["a@x.io"]);
  });
  it("caps the number of recipients", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `N${i}`, email: `n${i}@x.io` }));
    expect(teamRecipients(teamSchema, { team: many }, "lead@x.io", 3).length).toBe(3);
  });
});
