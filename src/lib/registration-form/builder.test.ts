import { describe, expect, it } from "vitest";
import { canRestoreField, moveFormField, restoreFormField } from "./builder";
import { defaultFormFor, MAX_FIELDS, validateFormSchema, type FormField } from "./schema";

describe("registration form edits", () => {
  it("reorders a question without changing its identity, options or source array", () => {
    const original = defaultFormFor();
    const next = moveFormField(original, 4, -1);
    expect(next.map((field) => field.id)).toEqual(["name", "roll", "email", "department", "phone", "year"]);
    expect(next[3]).toBe(original[4]);
    expect(original[4].id).toBe("department");
    expect(validateFormSchema(next).ok).toBe(true);
  });

  it("keeps the first and last questions inside the form", () => {
    const fields = defaultFormFor();
    expect(moveFormField(fields, 0, -1)).toBe(fields);
    expect(moveFormField(fields, fields.length - 1, 1)).toBe(fields);
    expect(moveFormField(fields, -1, 1)).toBe(fields);
  });

  it("undo restores the exact question and its position", () => {
    const fields = defaultFormFor();
    const removed = fields[4];
    const remaining = fields.filter((field) => field.id !== removed.id);
    expect(restoreFormField(remaining, removed, 4)).toEqual(fields);
    expect(remaining).toHaveLength(5);
  });

  it("undo works after other questions have been removed", () => {
    const field = defaultFormFor()[4];
    expect(restoreFormField([], field, 4)).toEqual([field]);
  });

  it("never restores duplicate IDs or duplicate participant identities", () => {
    const fields = defaultFormFor();
    expect(canRestoreField(fields, fields[0])).toBe(false);
    expect(canRestoreField(fields, { ...fields[0], id: "different-id" })).toBe(false);
    expect(restoreFormField(fields, fields[0], 0)).toBe(fields);
  });

  it("does not let undo exceed the server's form limit", () => {
    const fields: FormField[] = Array.from({ length: MAX_FIELDS }, (_, index) => ({
      id: String(index), kind: "short_text", identity: null, label: "Question", required: false,
    }));
    const removed = defaultFormFor()[0];
    expect(canRestoreField(fields, removed)).toBe(false);
    expect(restoreFormField(fields, removed, 0)).toBe(fields);
  });

  it("preserves team member definitions when moving and restoring a team block", () => {
    const team: FormField = {
      id: "team", kind: "team", identity: null, label: "Team members", required: false,
      minMembers: 1, maxMembers: 3,
      members: [{ key: "name", label: "Name", kind: "short_text", required: true }],
    };
    const fields = [...defaultFormFor(), team];
    const moved = moveFormField(fields, fields.length - 1, -1);
    const withoutTeam = moved.filter((field) => field.id !== team.id);
    const restored = restoreFormField(withoutTeam, team, fields.length - 2);
    expect(restored).toEqual(moved);
    expect(validateFormSchema(restored).ok).toBe(true);
  });
});
