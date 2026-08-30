import { describe, it, expect } from "vitest";
import { answerColumns } from "./columns";
import type { FormField } from "./schema";

const f = (o: Partial<FormField> & Pick<FormField, "id" | "kind">): FormField => ({
  identity: null, label: o.id, required: false, ...o,
});

describe("answerColumns", () => {
  it("excludes identity and section blocks", () => {
    const cols = answerColumns([
      f({ id: "name", kind: "short_text", identity: "name" }),
      f({ id: "s", kind: "section", label: "Heading" }),
      f({ id: "idea", kind: "paragraph", label: "Idea" }),
    ]);
    expect(cols.map((c) => c.key)).toEqual(["idea"]);
  });

  it("flattens a team into maxMembers × subfields columns", () => {
    const cols = answerColumns([
      f({
        id: "team", kind: "team", label: "Team", minMembers: 1, maxMembers: 2,
        members: [
          { key: "name", label: "Name", kind: "short_text", required: true },
          { key: "email", label: "Email", kind: "email", required: true },
        ],
      }),
    ]);
    expect(cols.map((c) => c.label)).toEqual([
      "Team — Member 1 Name", "Team — Member 1 Email",
      "Team — Member 2 Name", "Team — Member 2 Email",
    ]);
    expect(cols[3].get({ team: [{ name: "A", email: "a@x.io" }, { name: "B", email: "b@x.io" }] })).toBe("b@x.io");
    expect(cols[1].get({ team: [{ name: "A", email: "a@x.io" }] })).toBe("a@x.io");
    expect(cols[3].get({ team: [{ name: "A", email: "a@x.io" }] })).toBe(""); // missing 2nd member
  });

  it("joins checkbox arrays and stringifies scalars", () => {
    const cols = answerColumns([f({ id: "days", kind: "checkboxes", label: "Days", options: ["Mon", "Tue"] })]);
    expect(cols[0].get({ days: ["Mon", "Tue"] })).toBe("Mon, Tue");
    expect(cols[0].get(null)).toBe("");
  });
});
