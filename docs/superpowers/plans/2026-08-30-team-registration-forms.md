# Team Registration Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the event registration form builder with section-heading blocks, a structured team-members block, and an "Other" write-in on choice questions; make shortlisting email every team member and attendance work team-level.

**Architecture:** Add two new field kinds (`section`, `team`) and one flag (`allowOther`) to the existing flat `FormField` model. All new data lives inside the existing `events.registration_form` and `registrations.custom_answers` **jsonb** columns — **no DB migration, no RPC change**. The pure server-side boundary (`schema.ts` validate-form, `answers.ts` validate-answers) stays the single validation authority. A new pure `columns.ts` flattens team answers into spreadsheet columns shared by the admin table and the CSV so they can't diverge; a new pure `recipients.ts` collects team-member emails for the shortlist mail.

**Tech Stack:** Next 16 (App Router), React 19, TypeScript strict, Supabase (service-role), vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-team-registration-forms-design.md`

## Global Constraints

- **No DB migration and no RPC change.** `custom_answers` is already `jsonb`; the `register_for_event` v2 RPC already takes `p_custom_answers jsonb`. Do not touch SQL or `database.types.ts`.
- **`schema.ts` + `answers.ts` are the security boundary.** The server trusts only the event's stored schema; ignore any posted key not in it; bound every count and string length. Public submit stays session-less; 100 KB body cap already enforced upstream.
- **Team cap = 10 members, ≤ 8 per-member subfields.** Member subfield kinds ∈ `short_text | email | roll | phone`. Reuse the existing identity regexes in `answers.ts` (`EMAIL_RE`, `ROLL_RE`, `PHONE_RE`).
- **Members are informational** — not separate registrations, not individually deduped. Dedup stays leader-only (roll → email → none), unchanged.
- **No new capability.** `manage:events` builds the form; `manage:registrations` views/shortlists/marks attendance.
- **TDD for the four pure modules** (`schema`, `answers`, `columns`, `recipients`). Client components (`RegistrationFormBuilder`, `RegisterForm`) are typecheck + build + browser-walkthrough verified, per repo norms.
- **Verify gate must be green before merge:** `npm run typecheck && npm run lint && npm test && npm run build`.
- Commit style: `feat(registration): …` / `test(registration): …`, matching the repo.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/lib/registration-form/schema.ts` (modify) | new kinds/props + `validateFormSchema` invariants | 1 |
| `src/lib/registration-form/schema.test.ts` (modify) | schema tests | 1 |
| `src/lib/registration-form/answers.ts` (modify) | validate team + Other; widen `AnswerValue` | 2 |
| `src/lib/registration-form/answers.test.ts` (modify) | answers tests | 2 |
| `src/lib/registration-form/columns.ts` (create) | pure `answerColumns(schema)` flatten | 3 |
| `src/lib/registration-form/columns.test.ts` (create) | columns tests | 3 |
| `src/lib/registration-form/recipients.ts` (create) | pure `shortlistRecipients(schema, custom, leader)` | 4 |
| `src/lib/registration-form/recipients.test.ts` (create) | recipients tests | 4 |
| `src/app/admin/(app)/events/[id]/registrations/page.tsx` (modify) | use `answerColumns`; "Mark team present" + member count | 5 |
| `src/app/api/admin/registrations/export/route.ts` (modify) | use `answerColumns` | 5 |
| `src/lib/admin/registrations.ts` (modify) | include `custom_answers` in the shortlist select (Task 6 needs it) | 6 |
| `src/app/admin/(app)/events/[id]/registrations/actions.ts` (modify) | `shortlistAction` emails all members | 6 |
| `src/components/admin/RegistrationFormBuilder.tsx` (modify) | Section / Team blocks + "Allow Other" | 7 |
| `src/components/RegisterForm.tsx` (modify) | render section/team/Other; state + merge at submit | 8 |
| `docs/STATUS.md` (modify) | status entry | 9 |

---

### Task 1: Schema — `section` / `team` kinds, `allowOther`, validation

**Files:**
- Modify: `src/lib/registration-form/schema.ts`
- Test: `src/lib/registration-form/schema.test.ts`

**Interfaces:**
- Consumes: existing `Identity`, `CHOICE_KINDS`, `DEPARTMENTS`.
- Produces (used by every later task):
  - `FieldKind` gains `"section" | "team"`.
  - `interface MemberSubfield { key: string; label: string; kind: "short_text" | "email" | "roll" | "phone"; required: boolean }`
  - `FormField` gains optional `description?: string`, `allowOther?: boolean`, `members?: MemberSubfield[]`, `minMembers?: number`, `maxMembers?: number`.
  - `export const LAYOUT_KINDS: ReadonlySet<FieldKind>` (currently `{"section"}`).
  - `export const MAX_MEMBERS = 10`, `export const MAX_SUBFIELDS = 8`.

- [ ] **Step 1: Write failing tests** — append to `schema.test.ts`:

```ts
describe("section & team & allowOther", () => {
  const base = { id: "q1", kind: "short_text", identity: null, label: "Q", required: false };

  it("accepts a section block with a description and no options", () => {
    const r = validateFormSchema([{ ...base, kind: "section", label: "Team Details", description: "Fill for all members" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields[0].required).toBe(false); // forced false
  });
  it("rejects a section that carries options", () => {
    expect(validateFormSchema([{ ...base, kind: "section", options: ["a"] }]).ok).toBe(false);
  });
  it("rejects a section with an identity", () => {
    expect(validateFormSchema([{ ...base, kind: "section", identity: "name" }]).ok).toBe(false);
  });

  it("accepts a valid team block", () => {
    const r = validateFormSchema([{
      ...base, kind: "team", label: "Team members",
      minMembers: 1, maxMembers: 4,
      members: [
        { key: "name", label: "Name", kind: "short_text", required: true },
        { key: "email", label: "Email", kind: "email", required: true },
      ],
    }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields[0].members?.length).toBe(2);
  });
  it("rejects a team with no members", () => {
    expect(validateFormSchema([{ ...base, kind: "team", members: [], minMembers: 1, maxMembers: 4 }]).ok).toBe(false);
  });
  it("rejects a team with maxMembers over the cap", () => {
    expect(validateFormSchema([{ ...base, kind: "team", minMembers: 1, maxMembers: 99,
      members: [{ key: "n", label: "N", kind: "short_text", required: true }] }]).ok).toBe(false);
  });
  it("rejects a team where min > max", () => {
    expect(validateFormSchema([{ ...base, kind: "team", minMembers: 5, maxMembers: 3,
      members: [{ key: "n", label: "N", kind: "short_text", required: true }] }]).ok).toBe(false);
  });
  it("rejects a member subfield with an unknown kind", () => {
    expect(validateFormSchema([{ ...base, kind: "team", minMembers: 1, maxMembers: 2,
      members: [{ key: "n", label: "N", kind: "file", required: true }] }]).ok).toBe(false);
  });
  it("rejects duplicate member subfield keys", () => {
    expect(validateFormSchema([{ ...base, kind: "team", minMembers: 1, maxMembers: 2,
      members: [
        { key: "n", label: "A", kind: "short_text", required: true },
        { key: "n", label: "B", kind: "email", required: false },
      ] }]).ok).toBe(false);
  });

  it("keeps allowOther only on choice kinds", () => {
    const ok = validateFormSchema([{ ...base, kind: "radio", options: ["a"], allowOther: true }]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.fields[0].allowOther).toBe(true);
    const bad = validateFormSchema([{ ...base, kind: "short_text", allowOther: true }]);
    expect(bad.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/registration-form/schema.test.ts`
Expected: FAIL (section/team rejected as unknown kind; `allowOther`/`members` unhandled).

- [ ] **Step 3: Implement in `schema.ts`**

Replace the `FieldKind` type and add the new type/consts near the top:

```ts
export type FieldKind =
  | "short_text" | "paragraph" | "dropdown" | "radio"
  | "checkboxes" | "date" | "number" | "link"
  | "section" | "team";

export interface MemberSubfield {
  key: string;
  label: string;
  kind: "short_text" | "email" | "roll" | "phone";
  required: boolean;
}
```

Add to `FormField` (after `options?`):

```ts
  description?: string;   // section only
  allowOther?: boolean;   // choice kinds only
  members?: MemberSubfield[];  // team only
  minMembers?: number;    // team only
  maxMembers?: number;    // team only
```

Add the two kinds to the `KINDS` set, and new exports:

```ts
const KINDS: ReadonlySet<string> = new Set<FieldKind>([
  "short_text", "paragraph", "dropdown", "radio", "checkboxes",
  "date", "number", "link", "section", "team",
]);
export const LAYOUT_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(["section"]);
export const MAX_MEMBERS = 10;
export const MAX_SUBFIELDS = 8;
const MEMBER_KINDS: ReadonlySet<string> = new Set(["short_text", "email", "roll", "phone"]);
```

Add this helper above `validateFormSchema`:

```ts
function validateMembers(
  f: Record<string, unknown>, id: string, errors: string[],
): { members: MemberSubfield[]; minMembers: number; maxMembers: number } {
  const rawMembers = Array.isArray(f.members) ? f.members : [];
  if (rawMembers.length === 0) errors.push(`Team "${id}" needs at least one member field.`);
  if (rawMembers.length > MAX_SUBFIELDS) errors.push(`Team "${id}" has too many member fields (max ${MAX_SUBFIELDS}).`);
  const keys = new Set<string>();
  const members: MemberSubfield[] = [];
  for (const rm of rawMembers) {
    const m = (rm ?? {}) as Record<string, unknown>;
    const key = String(m.key ?? "").trim();
    const label = String(m.label ?? "").trim();
    const kind = String(m.kind ?? "");
    if (!key) errors.push(`A member field in "${id}" is missing a key.`);
    else if (keys.has(key)) errors.push(`Duplicate member field key "${key}" in "${id}".`);
    else keys.add(key);
    if (!MEMBER_KINDS.has(kind)) errors.push(`Member field "${key}" has an unknown type.`);
    if (!label || label.length > 80) errors.push(`Member field "${key}" needs a label ≤ 80 chars.`);
    members.push({ key, label, kind: kind as MemberSubfield["kind"], required: Boolean(m.required) });
  }
  const minMembers = Number.isInteger(f.minMembers) ? (f.minMembers as number) : 1;
  const maxMembers = Number.isInteger(f.maxMembers) ? (f.maxMembers as number) : 4;
  if (minMembers < 1) errors.push(`Team "${id}" min members must be ≥ 1.`);
  if (maxMembers < minMembers) errors.push(`Team "${id}" max members must be ≥ min.`);
  if (maxMembers > MAX_MEMBERS) errors.push(`Team "${id}" max members must be ≤ ${MAX_MEMBERS}.`);
  return { members, minMembers, maxMembers };
}
```

In the field loop of `validateFormSchema`, after the identity block and before the `isChoice` block, add section/team guards; then extend the `fields.push(...)`. Replace the existing `isChoice`/options block and push with:

```ts
    const isChoice = CHOICE_KINDS.has(kind as FieldKind);
    const isSection = kind === "section";
    const isTeam = kind === "team";

    if ((isSection || isTeam) && identity !== null) {
      errors.push(`"${id}" (${kind}) cannot be an identity block.`);
    }

    const options = Array.isArray(f.options)
      ? f.options.map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (isChoice) {
      if (!options || options.length === 0) errors.push(`"${id}" needs at least one option.`);
      else if (options.length > 20) errors.push(`"${id}" has too many options (max 20).`);
    } else if (options && options.length > 0) {
      errors.push(`"${id}" (${kind}) must not have options.`);
    }

    if (f.allowOther && !isChoice) errors.push(`"${id}" (${kind}) cannot use an "Other" option.`);

    let members: MemberSubfield[] | undefined;
    let minMembers: number | undefined;
    let maxMembers: number | undefined;
    if (isTeam) ({ members, minMembers, maxMembers } = validateMembers(f, id, errors));

    fields.push({
      id, kind: kind as FieldKind, identity: identity as Identity | null, label,
      help: f.help ? String(f.help).slice(0, 300) : undefined,
      required: isSection ? false : Boolean(f.required),
      options: isChoice ? options : undefined,
      description: isSection && f.description ? String(f.description).slice(0, 500) : undefined,
      allowOther: isChoice ? Boolean(f.allowOther) : undefined,
      members, minMembers, maxMembers,
    });
```

(Note: the label check `!label || label.length > 120` still applies to section/team — a heading/team block must have a label. That existing line stays.)

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/registration-form/schema.test.ts`
Expected: PASS (all, including the pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-form/schema.ts src/lib/registration-form/schema.test.ts
git commit -m "feat(registration): section & team block kinds + allowOther in form schema"
```

---

### Task 2: Answers — validate team members + "Other" write-in

**Files:**
- Modify: `src/lib/registration-form/answers.ts`
- Test: `src/lib/registration-form/answers.test.ts`

**Interfaces:**
- Consumes: `LAYOUT_KINDS`, `CHOICE_KINDS`, `FormField`, `MemberSubfield` from Task 1; existing `EMAIL_RE`, `ROLL_RE`, `PHONE_RE`.
- Produces: `export type AnswerValue = string | number | string[] | Record<string, string>[];` and `ValidatedAnswers.customAnswers: Record<string, AnswerValue>`. Team answers are stored as `Record<string,string>[]` (one object per member, keyed by subfield key).

- [ ] **Step 1: Write failing tests** — append to `answers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/registration-form/answers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `answers.ts`**

Update imports and the interface:

```ts
import { CHOICE_KINDS, LAYOUT_KINDS, type FormField, type MemberSubfield } from "./schema";
```

```ts
export type AnswerValue = string | number | string[] | Record<string, string>[];

export interface ValidatedAnswers {
  identity: {
    student_name?: string; roll_no?: string; email?: string;
    phone?: string; department?: string; year?: number;
  };
  customAnswers: Record<string, AnswerValue>;
}
```

Change the `customAnswers` local declaration in `validateAnswers` to `Record<string, AnswerValue> = {}`.

At the very top of the `for (const field of schema)` loop body, before `const raw = values[field.id]`, add:

```ts
    if (LAYOUT_KINDS.has(field.kind)) continue; // section: no answer
```

After `const raw = values[field.id];` and before the `missing` computation, add the team branch:

```ts
    if (field.kind === "team") {
      const err = validateTeam(field, raw, customAnswers);
      if (err) fieldErrors[field.id] = err;
      continue;
    }
```

In the choice branch, thread `allowOther`. Replace the existing `if (CHOICE_KINDS.has(field.kind)) { ... }` body with:

```ts
    if (CHOICE_KINDS.has(field.kind)) {
      const opts = field.options ?? [];
      const allowOther = !!field.allowOther;
      if (field.kind === "checkboxes") {
        const arr = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter(Boolean);
        const unknown = arr.filter((v) => !opts.includes(v));
        if (unknown.length > (allowOther ? 1 : 0)) { fieldErrors[field.id] = "Invalid choice."; continue; }
        const cleaned = arr.map((v) => (opts.includes(v) ? v : v.slice(0, 200)));
        pushCustom(field, cleaned, identity, customAnswers, fieldErrors);
      } else {
        const v = String(raw).trim();
        if (opts.includes(v)) {
          pushCustom(field, v, identity, customAnswers, fieldErrors);
        } else if (allowOther) {
          pushCustom(field, v.slice(0, 200), identity, customAnswers, fieldErrors);
        } else {
          fieldErrors[field.id] = "Invalid choice.";
        }
      }
      continue;
    }
```

Add these helpers at the bottom of the file:

```ts
/** Clean one member subfield by kind. "" = empty, null = invalid, else the value. */
function cleanMember(kind: MemberSubfield["kind"], raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  switch (kind) {
    case "email": { const lo = s.toLowerCase(); return lo.length <= 120 && EMAIL_RE.test(lo) ? lo : null; }
    case "roll": { const up = s.toUpperCase(); return ROLL_RE.test(up) ? up : null; }
    case "phone": return PHONE_RE.test(s) ? s : null;
    default: return s.slice(0, 200);
  }
}

/** Validate a team block; on success writes the member array into `custom`. Returns an error string or null. */
function validateTeam(
  field: FormField, raw: unknown, custom: Record<string, AnswerValue>,
): string | null {
  const subs = field.members ?? [];
  const min = field.minMembers ?? 1;
  const max = field.maxMembers ?? 10;
  const arr = Array.isArray(raw) ? raw : [];
  const kept: Record<string, string>[] = [];
  for (let idx = 0; idx < arr.length; idx++) {
    const src = (arr[idx] && typeof arr[idx] === "object" && !Array.isArray(arr[idx]))
      ? (arr[idx] as Record<string, unknown>) : {};
    const cleaned: Record<string, string> = {};
    let anyFilled = false;
    for (const sf of subs) {
      const res = cleanMember(sf.kind, src[sf.key]);
      if (res === null) return `Member ${idx + 1}: check ${sf.label}.`;
      if (res) { anyFilled = true; cleaned[sf.key] = res; }
    }
    if (!anyFilled) continue; // drop fully-empty member
    for (const sf of subs) {
      if (sf.required && !cleaned[sf.key]) return `Member ${idx + 1}: ${sf.label} is required.`;
    }
    kept.push(cleaned);
  }
  if (kept.length > max) return `Add at most ${max} members.`;
  if (field.required && kept.length < min) return `Add at least ${min} member${min > 1 ? "s" : ""}.`;
  if (kept.length > 0) custom[field.id] = kept;
  return null;
}
```

Also widen `pushCustom`'s `value` param and `custom` param types to accept the new shape:

```ts
function pushCustom(
  field: FormField, value: string | number | string[],
  identity: ValidatedAnswers["identity"],
  custom: Record<string, AnswerValue>,
  fieldErrors: Record<string, string>,
) {
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/registration-form/answers.test.ts`
Expected: PASS (including the pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-form/answers.ts src/lib/registration-form/answers.test.ts
git commit -m "feat(registration): validate team members + Other write-in in answers boundary"
```

---

### Task 3: Columns — pure `answerColumns` flatten (table + CSV share it)

**Files:**
- Create: `src/lib/registration-form/columns.ts`
- Test: `src/lib/registration-form/columns.test.ts`

**Interfaces:**
- Consumes: `FieldKind`, `FormField`, `LAYOUT_KINDS` from Task 1.
- Produces:
  - `interface AnswerColumn { key: string; label: string; kind: FieldKind; get(custom: Record<string, unknown> | null): string }`
  - `function answerColumns(schema: FormField[]): AnswerColumn[]` — one column per non-identity, non-section field; a `team` block expands to `maxMembers × members.length` columns.

- [ ] **Step 1: Write failing test** — create `columns.test.ts`:

```ts
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
      f({ id: "team", kind: "team", label: "Team", minMembers: 1, maxMembers: 2,
        members: [
          { key: "name", label: "Name", kind: "short_text", required: true },
          { key: "email", label: "Email", kind: "email", required: true },
        ] }),
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
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/lib/registration-form/columns.test.ts`
Expected: FAIL ("answerColumns is not a function" / module missing).

- [ ] **Step 3: Implement `columns.ts`**

```ts
import { LAYOUT_KINDS, type FieldKind, type FormField } from "./schema";

export interface AnswerColumn {
  key: string;
  label: string;
  kind: FieldKind;
  get(custom: Record<string, unknown> | null): string;
}

/**
 * Flatten a form schema into response columns for the admin table and the CSV
 * (shared so they cannot diverge). Identity blocks own their fixed columns
 * elsewhere; section blocks carry no data. A team block expands to one column
 * per (member slot × subfield).
 */
export function answerColumns(schema: FormField[]): AnswerColumn[] {
  const cols: AnswerColumn[] = [];
  for (const field of schema) {
    if (field.identity || LAYOUT_KINDS.has(field.kind)) continue;

    if (field.kind === "team") {
      const max = field.maxMembers ?? 1;
      const subs = field.members ?? [];
      for (let n = 1; n <= max; n++) {
        for (const sf of subs) {
          cols.push({
            key: `${field.id}.${n}.${sf.key}`,
            label: `${field.label} — Member ${n} ${sf.label}`,
            kind: "short_text",
            get: (custom) => {
              const list = custom?.[field.id];
              const member = Array.isArray(list) ? list[n - 1] : undefined;
              const v = member && typeof member === "object"
                ? (member as Record<string, unknown>)[sf.key] : undefined;
              return v != null ? String(v) : "";
            },
          });
        }
      }
      continue;
    }

    cols.push({
      key: field.id,
      label: field.label,
      kind: field.kind,
      get: (custom) => {
        const v = custom?.[field.id];
        return Array.isArray(v) ? v.join(", ") : v != null ? String(v) : "";
      },
    });
  }
  return cols;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/lib/registration-form/columns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-form/columns.ts src/lib/registration-form/columns.test.ts
git commit -m "feat(registration): shared answerColumns flatten for team responses"
```

---

### Task 4: Recipients — pure `shortlistRecipients`

**Files:**
- Create: `src/lib/registration-form/recipients.ts`
- Test: `src/lib/registration-form/recipients.test.ts`

**Interfaces:**
- Consumes: `FormField` from Task 1.
- Produces: `function shortlistRecipients(schema: FormField[], custom: Record<string, unknown> | null, leaderEmail: string | null | undefined, cap?: number): string[]` — deduped, lowercased, valid emails; leader first, then each team member email; capped (default 12).

- [ ] **Step 1: Write failing test** — create `recipients.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shortlistRecipients } from "./recipients";
import type { FormField } from "./schema";

const f = (o: Partial<FormField> & Pick<FormField, "id" | "kind">): FormField => ({
  identity: null, label: o.id, required: false, ...o,
});

const teamSchema = [
  f({ id: "team", kind: "team", label: "Team", minMembers: 1, maxMembers: 4,
    members: [
      { key: "name", label: "Name", kind: "short_text", required: true },
      { key: "email", label: "Email", kind: "email", required: true },
    ] }),
];

describe("shortlistRecipients", () => {
  it("returns leader + member emails, deduped and lowercased", () => {
    const out = shortlistRecipients(teamSchema,
      { team: [{ name: "A", email: "A@x.io" }, { name: "B", email: "b@x.io" }] },
      "lead@x.io");
    expect(out).toEqual(["lead@x.io", "a@x.io", "b@x.io"]);
  });
  it("drops a member row that duplicates the leader", () => {
    const out = shortlistRecipients(teamSchema, { team: [{ name: "L", email: "lead@x.io" }] }, "lead@x.io");
    expect(out).toEqual(["lead@x.io"]);
  });
  it("works when there is no team block (leader only)", () => {
    expect(shortlistRecipients([], null, "lead@x.io")).toEqual(["lead@x.io"]);
  });
  it("skips an invalid/blank leader but keeps valid member emails", () => {
    const out = shortlistRecipients(teamSchema, { team: [{ name: "A", email: "a@x.io" }] }, "");
    expect(out).toEqual(["a@x.io"]);
  });
  it("caps the number of recipients", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `N${i}`, email: `n${i}@x.io` }));
    expect(shortlistRecipients(teamSchema, { team: many }, "lead@x.io", 3).length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/lib/registration-form/recipients.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `recipients.ts`**

```ts
import { type FormField } from "./schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Recipients for the shortlist email: the leader's email plus every team-member
 * email captured in the stored answers. Deduped, lowercased, validated, capped.
 */
export function shortlistRecipients(
  schema: FormField[],
  custom: Record<string, unknown> | null,
  leaderEmail: string | null | undefined,
  cap = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (e: unknown) => {
    const v = String(e ?? "").trim().toLowerCase();
    if (v && EMAIL_RE.test(v) && !seen.has(v)) { seen.add(v); out.push(v); }
  };

  add(leaderEmail);
  for (const field of schema) {
    if (field.kind !== "team") continue;
    const emailKeys = (field.members ?? []).filter((s) => s.kind === "email").map((s) => s.key);
    const list = custom?.[field.id];
    if (!Array.isArray(list)) continue;
    for (const member of list) {
      if (member && typeof member === "object") {
        for (const k of emailKeys) add((member as Record<string, unknown>)[k]);
      }
    }
  }
  return out.slice(0, cap);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/lib/registration-form/recipients.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-form/recipients.ts src/lib/registration-form/recipients.test.ts
git commit -m "feat(registration): shortlistRecipients — leader + team member emails"
```

---

### Task 5: Admin responses — use `answerColumns`; team-level attendance label

**Files:**
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx`
- Modify: `src/app/api/admin/registrations/export/route.ts`

**Interfaces:**
- Consumes: `answerColumns` (Task 3). No unit test (server component + route); verified by typecheck + build + walkthrough.

- [ ] **Step 1: Update `page.tsx`**

Add the import:

```ts
import { answerColumns } from "@/lib/registration-form/columns";
```

Replace `const customFields = schema.filter((f) => !f.identity);` with:

```ts
  const columns = answerColumns(schema);
  const hasTeam = schema.some((f) => f.kind === "team");
```

In `<thead>`, replace the `{customFields.map((f) => <th key={f.id}>{f.label}</th>)}` line with:

```tsx
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
```

In `<tbody>`, replace the whole `{customFields.map((f) => { … })}` cell block with:

```tsx
                    {columns.map((c) => {
                      const v = c.get(r.customAnswers);
                      if (c.kind === "link" && isSafeHttpUrl(v)) {
                        return (
                          <td key={c.key}>
                            <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: "var(--forest)" }}>
                              link ↗
                            </a>
                          </td>
                        );
                      }
                      return <td key={c.key}>{v || "—"}</td>;
                    })}
```

Add a "team" indicator next to the name — replace the name cell:

```tsx
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
```

with:

```tsx
                    <td style={{ fontWeight: 500 }}>
                      {r.name}
                      {hasTeam ? (
                        <span className="label" style={{ marginLeft: 6, fontWeight: 400 }}>
                          · 👥 {teamSize(r.customAnswers, schema)}
                        </span>
                      ) : null}
                    </td>
```

Relabel the attendance button — replace `{r.attended ? "Undo" : "Mark present"}` with:

```tsx
                            {r.attended ? "Undo" : hasTeam ? "Mark team present" : "Mark present"}
```

Add this small helper at the bottom of the file (module scope, below the component):

```tsx
function teamSize(custom: Record<string, unknown> | null, schema: { id: string; kind: string }[]): number {
  const team = schema.find((f) => f.kind === "team");
  const list = team ? custom?.[team.id] : undefined;
  return Array.isArray(list) ? list.length : 0;
}
```

- [ ] **Step 2: Update the CSV route `export/route.ts`**

Add the import:

```ts
import { answerColumns } from "@/lib/registration-form/columns";
```

Replace `const customFields = schema.filter((f) => !f.identity);` with:

```ts
  const columns = answerColumns(schema);
```

In `headers`, replace `...customFields.map((f) => f.label)` with `...columns.map((c) => c.label)`.

In each row, replace the `...customFields.map((f) => { … })` block with:

```ts
    ...columns.map((c) => c.get(r.customAnswers)),
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. (Manual: on a team event the registrations table shows `Member N …` columns and "Mark team present"; CSV header carries the same columns.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/registrations/page.tsx" src/app/api/admin/registrations/export/route.ts
git commit -m "feat(registration): team columns in responses + CSV; team-level attendance label"
```

---

### Task 6: Shortlist emails every team member

**Files:**
- Modify: `src/lib/admin/registrations.ts` (add `custom_answers` to the shortlist read is done in the action; this file's `listRegistrations` already returns it — no change needed unless the action reads via its own query — see below)
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts`

**Interfaces:**
- Consumes: `shortlistRecipients` (Task 4), `getEventFormSchema` (`src/lib/admin/registrations.ts`, already exported). Verified by browser walkthrough / DB-effect read (server-action POSTs can't be curled — repo gotcha).

- [ ] **Step 1: Update `shortlistAction` in `actions.ts`**

Add imports:

```ts
import { getEventFormSchema } from "@/lib/admin/registrations";
import { shortlistRecipients } from "@/lib/registration-form/recipients";
```

Change the read to also select `custom_answers`:

```ts
  const { data: rows } = await admin
    .from("registrations")
    .select("id, email, student_name, shortlisted_at, custom_answers")
    .eq("event_id", eventId)
    .in("id", ids);
```

Load the schema once before the loop:

```ts
  const { schema } = await getEventFormSchema(eventId);
```

Replace the email loop with one that fans out to all members:

```ts
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  for (const r of rows ?? []) {
    if (r.shortlisted_at) continue; // already shortlisted → don't re-email
    const recipients = shortlistRecipients(
      schema,
      r.custom_answers as Record<string, unknown> | null,
      r.email,
    );
    for (const to of recipients) {
      await enqueueEmail({
        template: "registration_shortlisted",
        toEmail: to,
        toName: r.student_name ?? "",
        subject: `You're selected — ${ev.title}`,
        payload: { eventTitle: ev.title, url: base ? `${base}/events/${eventId}` : undefined },
        priority: 2,
      });
    }
  }
```

(`listRegistrations` in `registrations.ts` already returns `custom_answers`; no change there. This task only edits `actions.ts`.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Verify (walkthrough / DB effect)**

Since server-action POSTs can't be curled: in a browser (or by asserting the DB effect), shortlist a team submission on a `shortlist` event and confirm one queued `registration_shortlisted` row in `email_log` **per distinct member email** (plus the leader). A submission with no member emails still emails the leader. Delete test rows after (shared DB).

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/registrations/actions.ts"
git commit -m "feat(registration): shortlist email fans out to all team members"
```

---

### Task 7: Builder UI — Section, Team, and "Allow Other"

**Files:**
- Modify: `src/components/admin/RegistrationFormBuilder.tsx`

**Interfaces:**
- Consumes: `FieldKind`, `FormField`, `MemberSubfield`, `MAX_MEMBERS` from Task 1. Client component; verified by typecheck + build + browser walkthrough.

- [ ] **Step 1: Add the palette entries and defaults**

Add imports:

```ts
import { CHOICE_KINDS, defaultFormFor, MAX_MEMBERS, type FieldKind, type FormField, type Identity, type MemberSubfield } from "@/lib/registration-form/schema";
```

Add two "layout" palette buttons after the `Add question` row (new group):

```tsx
        <div className="label" style={{ marginTop: 10 }}>Add layout</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => addSection()}>+ Section heading</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => addTeam()}>+ Team members</button>
        </div>
```

Add the two creators next to `addCustom`:

```ts
  function addSection() {
    setFields((f) => [...f, {
      id: newId(), kind: "section", identity: null, label: "Section title", required: false, description: "",
    }]);
  }
  function addTeam() {
    setFields((f) => [...f, {
      id: newId(), kind: "team", identity: null, label: "Team members", required: false,
      minMembers: 1, maxMembers: 4,
      members: [
        { key: "name", label: "Name", kind: "short_text", required: true },
        { key: "email", label: "Email", kind: "email", required: true },
      ],
    }]);
  }
```

- [ ] **Step 2: Render per-kind config in each field card**

Inside the field card, after the existing options `<textarea>` block, add a section-description input, a team editor, and an "Allow Other" checkbox on choice cards. Insert:

```tsx
            {field.kind === "section" ? (
              <textarea
                style={{ marginTop: 8 }} rows={2} aria-label="Section description"
                value={field.description ?? ""}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Description (optional)"
              />
            ) : null}

            {!field.identity && CHOICE_KINDS.has(field.kind) ? (
              <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={!!field.allowOther}
                  onChange={(e) => update(i, { allowOther: e.target.checked })} />
                {" "}Allow an &ldquo;Other&rdquo; write-in
              </label>
            ) : null}

            {field.kind === "team" ? (
              <TeamEditor field={field} onChange={(patch) => update(i, patch)} />
            ) : null}
```

- [ ] **Step 3: Add the `TeamEditor` subcomponent** (bottom of the file)

```tsx
function TeamEditor({ field, onChange }: { field: FormField; onChange: (patch: Partial<FormField>) => void }) {
  const members = field.members ?? [];
  const setMember = (idx: number, patch: Partial<MemberSubfield>) =>
    onChange({ members: members.map((m, k) => (k === idx ? { ...m, ...patch } : m)) });
  const addMember = () =>
    onChange({ members: [...members, { key: `m${members.length}`, label: "Field", kind: "short_text", required: false }] });
  const removeMember = (idx: number) => onChange({ members: members.filter((_, k) => k !== idx) });

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ fontWeight: 400 }}>Min
          <input type="number" min={1} max={field.maxMembers ?? MAX_MEMBERS} value={field.minMembers ?? 1}
            onChange={(e) => onChange({ minMembers: Math.max(1, Number(e.target.value) || 1) })}
            style={{ width: 64, marginLeft: 6 }} />
        </label>
        <label style={{ fontWeight: 400 }}>Max
          <input type="number" min={field.minMembers ?? 1} max={MAX_MEMBERS} value={field.maxMembers ?? 4}
            onChange={(e) => onChange({ maxMembers: Math.min(MAX_MEMBERS, Number(e.target.value) || 1) })}
            style={{ width: 64, marginLeft: 6 }} />
        </label>
      </div>
      <div className="label" style={{ marginTop: 8 }}>Per-member fields</div>
      <div className="stack" style={{ gap: 6, marginTop: 4 }}>
        {members.map((m, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input aria-label="Member field label" value={m.label} style={{ flex: 1 }}
              onChange={(e) => setMember(idx, { label: e.target.value })} />
            <select aria-label="Member field type" value={m.kind}
              onChange={(e) => setMember(idx, { kind: e.target.value as MemberSubfield["kind"] })}>
              <option value="short_text">Text</option>
              <option value="email">Email</option>
              <option value="roll">VTU ID</option>
              <option value="phone">Phone</option>
            </select>
            <label style={{ display: "flex", gap: 4, alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" checked={m.required}
                onChange={(e) => setMember(idx, { required: e.target.checked })} /> Req
            </label>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeMember(idx)}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={addMember}>
        + Member field
      </button>
    </div>
  );
}
```

Note: the member `key` is auto-generated (`m0`, `m1`…) and never edited in the UI, keeping keys unique and stable; deleting/re-adding may repeat a key, so on add use `\`m${Date.now().toString(36)}\`` if you prefer collision-proof keys. (Server-side `validateFormSchema` rejects duplicate keys regardless.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. (Manual: create an event, add a Section, a Team block with min/max + member fields, and toggle "Allow Other" on a dropdown; Save and confirm it persists on reload.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RegistrationFormBuilder.tsx
git commit -m "feat(registration): builder UI for section, team, and Other blocks"
```

---

### Task 8: Public form — render Section, Team, Other

**Files:**
- Modify: `src/components/RegisterForm.tsx`

**Interfaces:**
- Consumes: `FormField`, `LAYOUT_KINDS` from Task 1. Client component; verified by typecheck + build + browser walkthrough.

- [ ] **Step 1: Add imports + local state**

```ts
import { defaultFormFor, LAYOUT_KINDS, type FormField } from "@/lib/registration-form/schema";
```

Inside `RegisterForm`, after `const fields = …`, seed team state (one empty member per team block, `minMembers` rows) and Other-text state:

```ts
  const [teams, setTeams] = useState<Record<string, Record<string, string>[]>>(() => {
    const init: Record<string, Record<string, string>[]> = {};
    for (const f of fields) {
      if (f.kind === "team") {
        const rows = Math.max(1, f.minMembers ?? 1);
        init[f.id] = Array.from({ length: rows }, () => ({}));
      }
    }
    return init;
  });
  const [otherText, setOtherText] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Build answers from state + FormData in `onSubmit`**

Replace the answer-collection loop in `onSubmit` with:

```ts
    const answers: Record<string, unknown> = {};
    for (const field of fields) {
      if (LAYOUT_KINDS.has(field.kind)) continue;
      if (field.kind === "team") {
        answers[field.id] = teams[field.id] ?? [];
      } else if (field.kind === "checkboxes") {
        let vals = fd.getAll(field.id).map(String);
        if (field.allowOther && vals.includes("__other__")) {
          vals = vals.filter((v) => v !== "__other__");
          if (otherText[field.id]) vals.push(otherText[field.id]);
        }
        answers[field.id] = vals;
      } else if ((field.kind === "radio" || field.kind === "dropdown") && field.allowOther) {
        let v = String(fd.get(field.id) ?? "");
        if (v === "__other__") v = otherText[field.id] ?? "";
        answers[field.id] = v;
      } else {
        answers[field.id] = String(fd.get(field.id) ?? "");
      }
    }
```

- [ ] **Step 3: Render Section and Team in the fields map**

Replace the `{fields.map((field) => <FieldInput … />)}` block with a switch that special-cases section/team:

```tsx
      {fields.map((field) => {
        if (field.kind === "section") {
          return (
            <div key={field.id} style={{ marginTop: 18, marginBottom: 4 }}>
              <h3 style={{ fontSize: 18 }}>{field.label}</h3>
              {field.description ? <p className="hint" style={{ marginTop: 4 }}>{field.description}</p> : null}
            </div>
          );
        }
        if (field.kind === "team") {
          return (
            <TeamField key={field.id} field={field} rows={teams[field.id] ?? [{}]}
              error={result?.fields?.[field.id]}
              onChange={(rows) => setTeams((t) => ({ ...t, [field.id]: rows }))} />
          );
        }
        return (
          <FieldInput key={field.id} field={field} error={result?.fields?.[field.id]}
            otherText={otherText[field.id] ?? ""}
            onOther={(v) => setOtherText((s) => ({ ...s, [field.id]: v }))} />
        );
      })}
```

- [ ] **Step 4: Extend `FieldInput` for the "Other" control**

Change its signature and add the "Other" control to the radio/dropdown/checkbox branches:

```tsx
function FieldInput({ field, error, otherText, onOther }: {
  field: FormField; error?: string; otherText?: string; onOther?: (v: string) => void;
}) {
```

For **radio**: after the options map, when `field.allowOther`, add:

```tsx
          {field.allowOther ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="radio" name={field.id} value="__other__" /> Other:
              <input type="text" aria-label="Other" value={otherText ?? ""}
                onChange={(e) => onOther?.(e.target.value)} style={{ marginLeft: 6 }} />
            </label>
          ) : null}
```

For **dropdown**: add an `<option value="__other__">Other…</option>` after the mapped options, and below the `<select>` a conditional text box (always render the box when `allowOther`, simplest):

```tsx
          {field.allowOther ? (
            <input type="text" aria-label="Other" placeholder="Other (if not listed)"
              value={otherText ?? ""} onChange={(e) => onOther?.(e.target.value)} style={{ marginTop: 6 }} />
          ) : null}
```

(When "Other…" is chosen the submit handler swaps `__other__` for the text; if the user typed text but picked a real option, the text is ignored.)

For **checkboxes**: after the options map, when `field.allowOther`:

```tsx
          {field.allowOther ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name={field.id} value="__other__" /> Other:
              <input type="text" aria-label="Other" value={otherText ?? ""}
                onChange={(e) => onOther?.(e.target.value)} style={{ marginLeft: 6 }} />
            </label>
          ) : null}
```

- [ ] **Step 5: Add the `TeamField` subcomponent** (bottom of the file)

```tsx
function TeamField({ field, rows, error, onChange }: {
  field: FormField; rows: Record<string, string>[]; error?: string;
  onChange: (rows: Record<string, string>[]) => void;
}) {
  const subs = field.members ?? [];
  const max = field.maxMembers ?? 10;
  const min = field.minMembers ?? 1;
  const setCell = (idx: number, key: string, v: string) =>
    onChange(rows.map((r, k) => (k === idx ? { ...r, [key]: v } : r)));
  const addRow = () => { if (rows.length < max) onChange([...rows, {}]); };
  const removeRow = (idx: number) => { if (rows.length > min) onChange(rows.filter((_, k) => k !== idx)); };

  return (
    <div className={`field${error ? " err" : ""}`}>
      <label>{field.label}{field.required ? "" : " (optional)"}</label>
      <div className="stack" style={{ gap: 10 }}>
        {rows.map((row, idx) => (
          <div key={idx} className="card" style={{ padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="label">Member {idx + 1}</span>
              {rows.length > min ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeRow(idx)}>Remove</button>
              ) : null}
            </div>
            {subs.map((sf) => (
              <div className="field" key={sf.key} style={{ marginTop: 6 }}>
                <label>{sf.label}{sf.required ? "" : " (optional)"}</label>
                <input
                  type={sf.kind === "email" ? "email" : sf.kind === "phone" ? "tel" : "text"}
                  value={row[sf.key] ?? ""} onChange={(e) => setCell(idx, sf.key, e.target.value)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {rows.length < max ? (
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={addRow}>
          + Add member
        </button>
      ) : null}
      {error ? <span className="hint" role="alert">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. (Manual: on `/events/[id]` for a team event, add/remove members, choose an "Other" option and type a value, submit; confirm the row lands with the member array + Other text in `custom_answers`.)

- [ ] **Step 7: Commit**

```bash
git add src/components/RegisterForm.tsx
git commit -m "feat(registration): public form renders section, team cards, and Other write-in"
```

---

### Task 9: Verify gate + STATUS.md

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green; test count = prior + the new schema/answers/columns/recipients cases.

- [ ] **Step 2: Update `docs/STATUS.md`**

Add a START-HERE entry under the current top block:

```markdown
> ### 🟡 SHIPPED TO BRANCH, PRE-MERGE — Team registration forms (`feat/team-registration-forms`, 2026-08-30)
> Full Google-Forms customization on the event registration builder: **section
> heading/description blocks**, a structured **team-members block** (min/max, cap 10,
> per-member name/VTU-ID/email/phone), and an **"Other" write-in** on choice
> questions. **Shortlisting emails every team member**; **attendance is team-level**
> (reuses `registrations.attended`, relabelled "Mark team present"). **Solo = the
> default** (no team block). **No DB migration, no RPC change** — all inside the
> existing `registration_form` / `custom_answers` jsonb. New pure modules
> `registration-form/{columns,recipients}.ts` (+ tests); `schema`/`answers` extended.
> Team answers flatten to `Member N …` columns in the admin table + CSV via the
> shared `answerColumns`. Gate: typecheck ✓ / lint ✓ / tests ✓ / build ✓.
> **Owed human walkthrough:** build a team+section+Other form → submit as a student
> (add/remove members, pick "Other") → shortlist the team and confirm one
> `registration_shortlisted` per member email → mark the team present. Plan + spec:
> `docs/superpowers/{plans,specs}/2026-08-30-team-registration-forms*`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): team registration forms shipped to branch"
```

---

## Self-review

**Spec coverage:** section blocks (T1/2/7/8), team block (T1/2/3/7/8), Other write-in (T1/2/7/8), solo default (no team block — inherent), team-level shortlist email (T4/6), team-level attendance relabel (T5), shared flatten helper (T3/5), no migration/RPC change (global constraint; nothing touches SQL), no new capability (unchanged). All covered.

**Placeholder scan:** every code step carries real code; no TBD/TODO/"handle edge cases".

**Type consistency:** `MemberSubfield` shape, `AnswerValue`, `AnswerColumn`, `shortlistRecipients` signature, `answerColumns` return, and the `teams`/`otherText` state shapes are consistent across tasks; the `__other__` sentinel is used in both the renderer (T8 step 4) and the submit merge (T8 step 2). `teamSize` helper defined in T5.
