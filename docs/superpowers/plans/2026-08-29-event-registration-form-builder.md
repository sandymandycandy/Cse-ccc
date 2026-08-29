# Custom Event Registration Form Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a club build a from-scratch, Google-Forms-style registration form when they create/edit an event (identity blocks + custom questions incl. a Drive/URL link field), with submit-=-confirmed registration, an explicit seats-vs-shortlist mode, and a shortlisting step that emails only the selected.

**Architecture:** A JSONB form schema on `events` (`registration_form`) drives a schema-based public form; answers land in identity columns (when identity blocks are present) plus a `custom_answers` JSONB on `registrations`. Two pure modules (`schema.ts`, `answers.ts`) own all validation and are the server-side security boundary. A reworked `register_for_event` RPC accepts optional identity + custom answers, dedups on roll→email→none, and honours `selection_mode`. Confirmation email/token is removed; shortlisting is an own-club admin action that sets `shortlisted_at` and enqueues a new email template.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript strict, Supabase (Postgres + service-role writes), Zod, vitest, Auth.js v5 (admin), Tailwind v4 "paper" design system.

**Spec:** `docs/superpowers/specs/2026-08-29-event-registration-form-builder-design.md` — read it alongside this plan.

## Global Constraints

- **This is NOT stock Next.js** (AGENTS.md): before writing Next-specific code, consult the relevant guide under `node_modules/next/dist/docs/`. Do not hand-edit `AGENTS.md`.
- **Branch:** work on `feat/event-registration-form-builder` (already created; spec committed there). Do not commit to `main`.
- **Migrations hit the LIVE/shared DB via Supabase MCP** (`apply_migration`). Dev and prod share one DB — when seeding test rows, delete them after. **Regenerate `src/lib/database.types.ts` via the MCP `generate_typescript_types`** and write its output to the file — the Supabase CLI is not installed and `npm run types:gen` truncates the file.
- **Server-action POSTs cannot be driven over curl** ("Failed to find Server Action"). Verify mutations in a browser, or apply the DB effect via MCP and assert the read path. Route-handler APIs curl fine.
- **All admin writes** go through `createAdminClient()` (service role) behind a `canManage(...)`/`requireCapability` guard and call `writeAudit(...)`.
- **Public POST** keeps: 100 KB body cap, honeypot (`website` must be empty), rate-limit (`checkRegistrationLimits`), Turnstile-ready (`verifyTurnstile`).
- **`dangerouslySetInnerHTML` is ESLint-banned.** Render text as React nodes.
- **Commit trailer** on every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe
  ```
- **Verify gate** (must stay green): `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`.

---

## Task 1: DB migration — form schema, selection mode, shortlist state, dedup

**Files:**
- Create: `supabase/migrations/20260829000000_event_registration_forms.sql`
- Modify (regenerate): `src/lib/database.types.ts`

**Interfaces:**
- Produces (DB): `events.selection_mode` (enum `selection_mode` = `seats|shortlist`, default `seats`), `events.registration_form jsonb` (nullable); `registrations.custom_answers jsonb` (nullable), `registrations.shortlisted_at timestamptz` (nullable); `student_name/roll_no/email` now nullable; partial-unique indexes `registrations_event_roll_unique` (WHERE roll_no is not null) and `registrations_event_email_unique` (WHERE email is not null and roll_no is null); index `registrations_shortlisted_idx`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260829000000_event_registration_forms.sql`:

```sql
-- ============================================================================
-- Event registration form builder — additive schema (spec 2026-08-29).
-- Adds per-event form schema + selection mode, custom answers + shortlist
-- state on registrations, and relaxes identity NOT NULLs so a from-scratch
-- form can omit roll/email. Dedup becomes partial-unique (only when present).
-- ============================================================================

do $$ begin create type selection_mode as enum ('seats','shortlist');
exception when duplicate_object then null; end $$;

alter table public.events
  add column if not exists selection_mode selection_mode not null default 'seats',
  add column if not exists registration_form jsonb;

alter table public.registrations
  add column if not exists custom_answers jsonb,
  add column if not exists shortlisted_at timestamptz;

alter table public.registrations alter column student_name drop not null;
alter table public.registrations alter column roll_no      drop not null;
alter table public.registrations alter column email        drop not null;

-- roll dedup only when a roll was actually collected
alter table public.registrations drop constraint if exists registrations_event_roll_unique;
create unique index if not exists registrations_event_roll_unique
  on public.registrations (event_id, roll_no) where roll_no is not null;

-- email dedup fallback — only for rows with no roll (roll-based forms use the index above)
create unique index if not exists registrations_event_email_unique
  on public.registrations (event_id, email) where email is not null and roll_no is null;

create index if not exists registrations_shortlisted_idx
  on public.registrations (event_id) where shortlisted_at is not null;
```

- [ ] **Step 2: Apply the migration to the live DB via MCP**

Use the Supabase MCP `apply_migration` with name `event_registration_forms` and the SQL above (project_ref `svkbleeibbrjryeovvjw`).

- [ ] **Step 3: Verify the columns exist**

Run an MCP `execute_sql`:

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema='public' and table_name='registrations'
  and column_name in ('custom_answers','shortlisted_at','roll_no','email','student_name')
order by column_name;
select column_name from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('selection_mode','registration_form');
```
Expected: `roll_no/email/student_name` show `is_nullable = YES`; the four new columns present.

- [ ] **Step 4: Regenerate DB types via MCP**

Call the Supabase MCP `generate_typescript_types` and overwrite `src/lib/database.types.ts` with the result. Confirm `events` now has `selection_mode` + `registration_form` and `registrations` has `custom_answers` + `shortlisted_at`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no code consumes the new columns yet; this proves the regenerated types are well-formed).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829000000_event_registration_forms.sql src/lib/database.types.ts
git commit -m "feat(events): additive schema for registration form builder

selection_mode + registration_form on events; custom_answers + shortlisted_at
on registrations; nullable identity columns + partial-unique dedup. Applied to
the live DB via MCP; types regenerated.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 2: Pure form-schema module (`schema.ts`)

**Files:**
- Create: `src/lib/registration-form/schema.ts`
- Test: `src/lib/registration-form/schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FieldKind = "short_text" | "paragraph" | "dropdown" | "radio"
    | "checkboxes" | "date" | "number" | "link";
  export type Identity = "name" | "roll" | "email" | "phone" | "department" | "year";
  export interface FormField {
    id: string; kind: FieldKind; identity: Identity | null;
    label: string; help?: string; required: boolean; options?: string[];
  }
  export const DEFAULT_FORM: FormField[];
  export function defaultFormFor(): FormField[];               // deep clone of DEFAULT_FORM
  export function validateFormSchema(input: unknown):
    | { ok: true; fields: FormField[] }
    | { ok: false; errors: string[] };
  export const CHOICE_KINDS: ReadonlySet<FieldKind>;           // dropdown|radio|checkboxes
  ```
- Consumes: `DEPARTMENTS` from `src/lib/departments.ts` (for the department identity default options).

- [ ] **Step 1: Write the failing test**

Create `src/lib/registration-form/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_FORM, defaultFormFor, validateFormSchema } from "./schema";

describe("DEFAULT_FORM", () => {
  it("is today's six identity fields, all required, in order", () => {
    expect(DEFAULT_FORM.map((f) => f.identity)).toEqual([
      "name", "roll", "email", "phone", "department", "year",
    ]);
    expect(DEFAULT_FORM.every((f) => f.required)).toBe(true);
  });
  it("defaultFormFor returns an independent clone", () => {
    const a = defaultFormFor();
    a[0].label = "X";
    expect(DEFAULT_FORM[0].label).not.toBe("X");
  });
});

describe("validateFormSchema", () => {
  const base = { id: "q1", kind: "short_text", identity: null, label: "Q", required: false };

  it("accepts a minimal valid form", () => {
    const r = validateFormSchema([base]);
    expect(r.ok).toBe(true);
  });
  it("rejects an empty form", () => {
    expect(validateFormSchema([]).ok).toBe(false);
  });
  it("rejects duplicate ids", () => {
    const r = validateFormSchema([base, { ...base }]);
    expect(r.ok).toBe(false);
  });
  it("rejects an unknown kind", () => {
    const r = validateFormSchema([{ ...base, kind: "file" }]);
    expect(r.ok).toBe(false);
  });
  it("requires ≥1 option for choice kinds", () => {
    expect(validateFormSchema([{ ...base, kind: "dropdown", options: [] }]).ok).toBe(false);
    expect(validateFormSchema([{ ...base, kind: "dropdown", options: ["a"] }]).ok).toBe(true);
  });
  it("rejects options on a non-choice kind", () => {
    expect(validateFormSchema([{ ...base, kind: "short_text", options: ["a"] }]).ok).toBe(false);
  });
  it("rejects two blocks with the same identity", () => {
    const r = validateFormSchema([
      { ...base, id: "a", identity: "roll" },
      { ...base, id: "b", identity: "roll" },
    ]);
    expect(r.ok).toBe(false);
  });
  it("rejects more than 40 fields", () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ ...base, id: `q${i}` }));
    expect(validateFormSchema(many).ok).toBe(false);
  });
  it("rejects a blank label", () => {
    expect(validateFormSchema([{ ...base, label: "  " }]).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/registration-form/schema.test.ts`
Expected: FAIL ("Cannot find module './schema'").

- [ ] **Step 3: Implement `schema.ts`**

Create `src/lib/registration-form/schema.ts`:

```ts
import { DEPARTMENTS } from "@/lib/departments";

export type FieldKind =
  | "short_text" | "paragraph" | "dropdown" | "radio"
  | "checkboxes" | "date" | "number" | "link";
export type Identity = "name" | "roll" | "email" | "phone" | "department" | "year";

export interface FormField {
  id: string;
  kind: FieldKind;
  identity: Identity | null;
  label: string;
  help?: string;
  required: boolean;
  options?: string[];
}

const KINDS: ReadonlySet<string> = new Set<FieldKind>([
  "short_text", "paragraph", "dropdown", "radio", "checkboxes", "date", "number", "link",
]);
export const CHOICE_KINDS: ReadonlySet<FieldKind> = new Set(["dropdown", "radio", "checkboxes"]);
const IDENTITIES: ReadonlySet<string> = new Set<Identity>([
  "name", "roll", "email", "phone", "department", "year",
]);

/** Today's fixed six-field form, expressed as identity blocks. */
export const DEFAULT_FORM: FormField[] = [
  { id: "name", kind: "short_text", identity: "name", label: "Full name", required: true },
  { id: "roll", kind: "short_text", identity: "roll", label: "Roll number", required: true,
    help: "Used to prevent duplicate registrations." },
  { id: "email", kind: "short_text", identity: "email", label: "College email", required: true,
    help: "vtuxxxxx@veltech.edu.in" },
  { id: "phone", kind: "short_text", identity: "phone", label: "Mobile number", required: true },
  { id: "department", kind: "dropdown", identity: "department", label: "Department",
    required: true, options: [...DEPARTMENTS] },
  { id: "year", kind: "dropdown", identity: "year", label: "Year", required: true,
    options: ["1", "2", "3", "4", "5"] },
];

export function defaultFormFor(): FormField[] {
  return DEFAULT_FORM.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined }));
}

const MAX_FIELDS = 40;

export function validateFormSchema(
  input: unknown,
): { ok: true; fields: FormField[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(input)) return { ok: false, errors: ["Form must be a list of fields."] };
  if (input.length === 0) errors.push("Add at least one field.");
  if (input.length > MAX_FIELDS) errors.push(`A form can have at most ${MAX_FIELDS} fields.`);

  const ids = new Set<string>();
  const identities = new Set<string>();
  const fields: FormField[] = [];

  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) { errors.push("Malformed field."); continue; }
    const f = raw as Record<string, unknown>;
    const id = String(f.id ?? "").trim();
    const kind = String(f.kind ?? "");
    const label = String(f.label ?? "").trim();
    const identity = f.identity == null ? null : String(f.identity);

    if (!id) errors.push("A field is missing an id.");
    else if (ids.has(id)) errors.push(`Duplicate field id "${id}".`);
    else ids.add(id);

    if (!KINDS.has(kind)) errors.push(`Unknown field type "${kind}".`);
    if (!label || label.length > 120) errors.push(`Field "${id}" needs a label ≤ 120 chars.`);

    if (identity !== null) {
      if (!IDENTITIES.has(identity)) errors.push(`Unknown identity "${identity}".`);
      else if (identities.has(identity)) errors.push(`Two blocks map to "${identity}".`);
      else identities.add(identity);
    }

    const isChoice = CHOICE_KINDS.has(kind as FieldKind);
    const options = Array.isArray(f.options)
      ? f.options.map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (isChoice) {
      if (!options || options.length === 0) errors.push(`"${id}" needs at least one option.`);
      else if (options.length > 20) errors.push(`"${id}" has too many options (max 20).`);
    } else if (options && options.length > 0) {
      errors.push(`"${id}" (${kind}) must not have options.`);
    }

    fields.push({
      id, kind: kind as FieldKind, identity: identity as Identity | null, label,
      help: f.help ? String(f.help).slice(0, 300) : undefined,
      required: Boolean(f.required),
      options: isChoice ? options : undefined,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fields };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/registration-form/schema.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-form/schema.ts src/lib/registration-form/schema.test.ts
git commit -m "feat(registration): pure form-schema module + validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 3: Pure answer-validation module (`answers.ts`)

**Files:**
- Create: `src/lib/registration-form/answers.ts`
- Test: `src/lib/registration-form/answers.test.ts`

**Interfaces:**
- Consumes: `FormField`, `CHOICE_KINDS` from `./schema`; `isSafeHttpUrl` from `@/lib/url`; `DEPARTMENTS` from `@/lib/departments`.
- Produces:
  ```ts
  export interface ValidatedAnswers {
    identity: {
      student_name?: string; roll_no?: string; email?: string;
      phone?: string; department?: string; year?: number;
    };
    customAnswers: Record<string, string | number | string[]>;
  }
  export function validateAnswers(schema: FormField[], values: Record<string, unknown>):
    | { ok: true; data: ValidatedAnswers }
    | { ok: false; fieldErrors: Record<string, string> };
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/registration-form/answers.test.ts`:

```ts
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
      expect(r.data.identity.roll_no).toBe("VTU12345");        // uppercased
      expect(r.data.identity.email).toBe("vtu12345@veltech.edu.in"); // lowercased
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/registration-form/answers.test.ts`
Expected: FAIL ("Cannot find module './answers'").

- [ ] **Step 3: Implement `answers.ts`**

Create `src/lib/registration-form/answers.ts`:

```ts
import { CHOICE_KINDS, type FormField } from "./schema";
import { isSafeHttpUrl } from "@/lib/url";
import { DEPARTMENTS } from "@/lib/departments";

export interface ValidatedAnswers {
  identity: {
    student_name?: string; roll_no?: string; email?: string;
    phone?: string; department?: string; year?: number;
  };
  customAnswers: Record<string, string | number | string[]>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLL_RE = /^[A-Z0-9]{6,15}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const NAME_RE = /^[\p{L}\p{M} .'-]+$/u;

export function validateAnswers(
  schema: FormField[],
  values: Record<string, unknown>,
): { ok: true; data: ValidatedAnswers } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const identity: ValidatedAnswers["identity"] = {};
  const customAnswers: Record<string, string | number | string[]> = {};

  for (const field of schema) {
    const raw = values[field.id];
    const missing =
      raw == null || (typeof raw === "string" && raw.trim() === "") ||
      (Array.isArray(raw) && raw.length === 0);

    if (missing) {
      if (field.required) fieldErrors[field.id] = "This field is required.";
      continue;
    }

    // choice kinds
    if (CHOICE_KINDS.has(field.kind)) {
      const opts = field.options ?? [];
      if (field.kind === "checkboxes") {
        const arr = (Array.isArray(raw) ? raw : [raw]).map(String);
        if (arr.some((v) => !opts.includes(v))) { fieldErrors[field.id] = "Invalid choice."; continue; }
        pushCustom(field, arr, identity, customAnswers, fieldErrors);
      } else {
        const v = String(raw);
        if (!opts.includes(v)) { fieldErrors[field.id] = "Invalid choice."; continue; }
        pushCustom(field, v, identity, customAnswers, fieldErrors);
      }
      continue;
    }

    if (field.kind === "number") {
      const n = Number(String(raw).trim());
      if (!Number.isFinite(n)) { fieldErrors[field.id] = "Enter a number."; continue; }
      pushCustom(field, n, identity, customAnswers, fieldErrors);
      continue;
    }

    if (field.kind === "link") {
      const v = String(raw).trim();
      if (v.length > 2000 || !isSafeHttpUrl(v)) { fieldErrors[field.id] = "Enter a valid link (https)."; continue; }
      pushCustom(field, v, identity, customAnswers, fieldErrors);
      continue;
    }

    // text-like (short_text, paragraph, date) — identity rules apply when set
    const v = String(raw).trim();
    if (field.identity) {
      const err = applyIdentity(field.identity, v, identity);
      if (err) fieldErrors[field.id] = err;
    } else {
      customAnswers[field.id] = v.slice(0, 4000);
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { identity, customAnswers } };
}

function pushCustom(
  field: FormField, value: string | number | string[],
  identity: ValidatedAnswers["identity"],
  custom: Record<string, string | number | string[]>,
  fieldErrors: Record<string, string>,
) {
  if (field.identity === "department") {
    if (!DEPARTMENTS.includes(value as (typeof DEPARTMENTS)[number])) {
      fieldErrors[field.id] = "Pick a department."; return;
    }
    identity.department = value as string;
  } else if (field.identity === "year") {
    const y = Number(value);
    if (!Number.isInteger(y) || y < 1 || y > 5) { fieldErrors[field.id] = "Pick a valid year."; return; }
    identity.year = y;
  } else {
    custom[field.id] = value;
  }
}

function applyIdentity(
  identity: NonNullable<FormField["identity"]>, v: string, out: ValidatedAnswers["identity"],
): string | null {
  switch (identity) {
    case "name":
      if (v.length < 2 || v.length > 80 || !NAME_RE.test(v)) return "Use letters, spaces, . ' - only";
      out.student_name = v; return null;
    case "roll": {
      const up = v.toUpperCase();
      if (!ROLL_RE.test(up)) return "Enter a valid roll number";
      out.roll_no = up; return null;
    }
    case "email": {
      const lo = v.toLowerCase();
      if (lo.length > 120 || !EMAIL_RE.test(lo)) return "Enter a valid email";
      out.email = lo; return null;
    }
    case "phone":
      if (!PHONE_RE.test(v)) return "Enter a 10-digit mobile number";
      out.phone = v; return null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/registration-form/answers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration-form/answers.ts src/lib/registration-form/answers.test.ts
git commit -m "feat(registration): pure answer validation against stored schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 4: Rework the `register_for_event` RPC (v2)

**Files:**
- Create: `supabase/migrations/20260829010000_register_for_event_v2.sql`

**Interfaces:**
- Produces (DB): `register_for_event(p_event_id uuid, p_student_name text, p_roll_no text, p_email text, p_phone text, p_department text, p_year int, p_custom_answers jsonb) returns table(status text, registration_id uuid)`. Statuses: `no_event | closed | duplicate | registered | submitted | waitlisted | full`.
- Consumes: `events.selection_mode`, the new nullable identity columns + `custom_answers`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260829010000_register_for_event_v2.sql`:

```sql
-- ============================================================================
-- register_for_event v2 — optional identity + custom_answers + selection mode.
-- Dedup: roll if present, else email if present, else none. Submit is now
-- immediately confirmed (confirmed_at = now()); no confirmation token/hold.
-- Adds a NEW overload (…, p_custom_answers jsonb) that COEXISTS with the old
-- 8-arg (…, p_confirm_token_hash text) function, so live prod (old code on
-- main) keeps working during the dev window. PostgREST resolves by the named
-- args each caller passes. The old overload is dropped later in a held
-- post-deploy migration, once the new code is deployed (see Task 12).
-- ============================================================================

create or replace function public.register_for_event(
  p_event_id       uuid,
  p_student_name   text,
  p_roll_no        text,
  p_email          text,
  p_phone          text,
  p_department     text,
  p_year           int,
  p_custom_answers jsonb
)
returns table (status text, registration_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_occupied int;
  v_existing uuid;
  v_new_id   uuid;
  v_pos      int;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    status := 'no_event'; registration_id := null; return next; return;
  end if;

  if v_event.approval_status <> 'approved' or v_event.status <> 'published'
     or (v_event.registration_opens_at is not null and now() < v_event.registration_opens_at)
     or (v_event.registration_closes_at is not null and now() > v_event.registration_closes_at) then
    status := 'closed'; registration_id := null; return next; return;
  end if;

  -- dedup: roll if present, else email if present, else none
  if p_roll_no is not null then
    select id into v_existing from public.registrations
     where event_id = p_event_id and roll_no = p_roll_no;
  elsif p_email is not null then
    select id into v_existing from public.registrations
     where event_id = p_event_id and email = p_email;
  end if;
  if v_existing is not null then
    status := 'duplicate'; registration_id := v_existing; return next; return;
  end if;

  -- shortlist mode: accept everyone, no capacity check
  if v_event.selection_mode = 'shortlist' then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, confirmed_at)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, now())
    returning id into v_new_id;
    status := 'submitted'; registration_id := v_new_id; return next; return;
  end if;

  -- seats mode: capacity check on confirmed rows (all rows are confirmed now)
  select count(*) into v_occupied from public.registrations
   where event_id = p_event_id and confirmed_at is not null;

  if v_event.capacity is null or v_occupied < v_event.capacity then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, confirmed_at)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, now())
    returning id into v_new_id;
    status := 'registered'; registration_id := v_new_id; return next; return;

  elsif v_event.waitlist_enabled and p_roll_no is not null then
    -- waitlist needs a roll+email (table columns are NOT NULL); only offered when present
    if exists (select 1 from public.waitlist where event_id = p_event_id and roll_no = p_roll_no) then
      status := 'duplicate'; registration_id := null; return next; return;
    end if;
    select coalesce(max(position), 0) + 1 into v_pos from public.waitlist where event_id = p_event_id;
    insert into public.waitlist (event_id, roll_no, email, position)
    values (p_event_id, p_roll_no, coalesce(p_email, ''), v_pos);
    status := 'waitlisted'; registration_id := null; return next; return;

  else
    status := 'full'; registration_id := null; return next; return;
  end if;
end;
$$;

revoke execute on function public.register_for_event(uuid,text,text,text,text,text,int,jsonb) from public, anon, authenticated;
grant  execute on function public.register_for_event(uuid,text,text,text,text,text,int,jsonb) to service_role;
```

- [ ] **Step 2: Apply via MCP**

Supabase MCP `apply_migration`, name `register_for_event_v2`.

- [ ] **Step 3: Integration-probe the RPC (service role, via MCP execute_sql)**

Pick a real published+approved event id (`select id, selection_mode, capacity from public.events where approval_status='approved' and status='published' limit 1;`). Then:

```sql
-- seats/registered path (roll dedup); returns 'registered' then 'duplicate'
select * from public.register_for_event('<EVENT_ID>','ZZ Verify','ZZVERIFY1',
  'zzverify1@veltech.edu.in','9876500000','CSE',2,'{"q1":"hello"}'::jsonb);
select * from public.register_for_event('<EVENT_ID>','ZZ Verify','ZZVERIFY1',
  'zzverify1@veltech.edu.in','9876500000','CSE',2,null);
-- confirm the row + custom_answers landed
select roll_no, confirmed_at is not null as confirmed, custom_answers
  from public.registrations where roll_no='ZZVERIFY1';
-- CLEAN UP (shared DB!)
delete from public.registrations where roll_no='ZZVERIFY1';
```
Expected: first call `registered`, second `duplicate`, the row confirmed with `custom_answers = {"q1":"hello"}`. **Delete the test row.**

- [ ] **Step 4: Regenerate types (RPC signature changed)**

Call MCP `generate_typescript_types` → overwrite `src/lib/database.types.ts`. Run `npm run typecheck` (the old route still references the old signature — expected to fail here; fixed in Task 5). Note the failure is confined to `src/app/api/registrations/route.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829010000_register_for_event_v2.sql src/lib/database.types.ts
git commit -m "feat(registration): register_for_event v2 (custom answers, modes, dedup)

Optional identity + custom_answers; dedup roll→email→none; selection_mode
seats/shortlist; submit is immediately confirmed. Applied via MCP.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 5: Rewrite the submit API (`/api/registrations`) + retire confirmation

**Files:**
- Modify: `src/app/api/registrations/route.ts`
- Delete: `src/app/registrations/confirm/page.tsx` (+ remove the now-empty `src/app/registrations/confirm/` dir)
- Reference (unchanged): `src/lib/registration-form/{schema,answers}.ts`, `src/lib/rate-limit.ts`, `src/lib/turnstile.ts`

**Interfaces:**
- Consumes: `validateAnswers`, `defaultFormFor`, `validateFormSchema` (to parse the stored `registration_form`), the v2 RPC.
- Produces: `POST /api/registrations` accepting JSON `{ eventId: string, answers: Record<string,unknown>, website?: string, turnstile?: string }`; responds `{ status }` or `400 { error, fields }`.

- [ ] **Step 1: Rewrite the route**

Replace `src/app/api/registrations/route.ts` with:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRegistrationLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { validateFormSchema, defaultFormFor } from "@/lib/registration-form/schema";
import { validateAnswers } from "@/lib/registration-form/answers";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 100_000) return Response.json({ error: "Payload too large." }, { status: 413 });

  let body: { eventId?: unknown; answers?: unknown; website?: unknown; turnstile?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) return Response.json({ error: "Event not found." }, { status: 404 });
  const answers = (body.answers && typeof body.answers === "object")
    ? (body.answers as Record<string, unknown>) : {};
  if (typeof body.website === "string" && body.website.length > 0) {
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!(await verifyTurnstile(typeof body.turnstile === "string" ? body.turnstile : undefined, ip))) {
    return Response.json({ error: "Verification failed. Please retry." }, { status: 400 });
  }

  let admin;
  try { admin = createAdminClient(); }
  catch {
    return Response.json(
      { error: "Registration isn't fully configured yet. Please try again soon." },
      { status: 503 },
    );
  }

  // Load the event's stored schema (service role) — the security boundary.
  const { data: ev } = await admin
    .from("events")
    .select("id, registration_form")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return Response.json({ error: "Event not found." }, { status: 404 });

  const parsedSchema = ev.registration_form
    ? validateFormSchema(ev.registration_form)
    : ({ ok: true, fields: defaultFormFor() } as const);
  const schema = parsedSchema.ok ? parsedSchema.fields : defaultFormFor();

  const result = validateAnswers(schema, answers);
  if (!result.ok) {
    return Response.json({ error: "Please check the form.", fields: result.fieldErrors }, { status: 400 });
  }
  const { identity } = result.data;

  // Rate-limit by ip + roll/email when present (dedup keys), else ip only.
  const limit = checkRegistrationLimits({
    ip, rollNo: identity.roll_no ?? "", email: identity.email ?? "",
  });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { data, error } = await admin.rpc("register_for_event", {
    p_event_id: eventId,
    p_student_name: identity.student_name ?? null,
    p_roll_no: identity.roll_no ?? null,
    p_email: identity.email ?? null,
    p_phone: identity.phone ?? null,
    p_department: identity.department ?? null,
    p_year: identity.year ?? null,
    p_custom_answers: result.data.customAnswers,
  });
  if (error) {
    console.error("register_for_event failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const status = data?.[0]?.status ?? "full";
  if (status === "no_event") return Response.json({ error: "Event not found." }, { status: 404 });
  if (status === "closed") {
    return Response.json({ status, error: "Registration for this event is closed." }, { status: 409 });
  }
  return Response.json({ status });
}
```

- [ ] **Step 2: Delete the confirmation page**

Remove `src/app/registrations/confirm/page.tsx` and the empty `src/app/registrations/confirm/` directory. (No confirmation email is sent any more, so nothing links here.)

```bash
git rm src/app/registrations/confirm/page.tsx
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. (`generateConfirmToken`/`enqueueEmail` imports are gone from the route; `src/lib/tokens.ts` may still export `generateConfirmToken` — leave it, it's harmless and small.)

- [ ] **Step 4: Curl-smoke the route rejection paths (routes curl fine)**

Start `npm run dev`, then:
```bash
curl -s -X POST localhost:3000/api/registrations -H 'content-type: application/json' \
  -d '{"eventId":"not-a-real-id","answers":{}}' -w '\n%{http_code}\n'   # 404
curl -s -X POST localhost:3000/api/registrations -H 'content-type: application/json' \
  -d '{"eventId":"<REAL_EVENT_ID>","answers":{}}' -w '\n%{http_code}\n'  # 400 with fields{} for required identity blocks
```
Expected: 404 then 400 with a `fields` object naming the missing required fields. (Do **not** submit a valid body here — it writes to the shared DB.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/registrations/route.ts
git commit -m "feat(registration): schema-driven submit API; remove one-tap confirmation

Loads the event's stored form schema, validates answers server-side, calls
register_for_event v2. Submit = confirmed; confirmation page + token/email path
removed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 6: Schema-driven public form (`RegisterForm`) + event page wiring

**Files:**
- Rewrite: `src/components/RegisterForm.tsx`
- Modify: `src/lib/queries.ts` (`getEventDetail` select + `EventDetail` type: add `registrationForm`, `selectionMode`)
- Modify: `src/app/events/[id]/page.tsx` (pass `schema` + `selectionMode` to `RegisterForm`)

**Interfaces:**
- Consumes: `FormField`, `defaultFormFor`, `validateFormSchema` from the schema module; `getEventDetail` now returns `registrationForm: FormField[] | null` and `selectionMode: "seats" | "shortlist"`.
- Produces: `<RegisterForm eventId schema isFull mode />` rendering the schema and POSTing `{ eventId, answers, website }`.

- [ ] **Step 1: Extend `getEventDetail`**

In `src/lib/queries.ts`, add `selection_mode, registration_form` to the `getEventDetail` select (line ~138) and to the returned object. Add to the `EventDetail` type:

```ts
// in the EventDetail interface:
registrationForm: import("@/lib/registration-form/schema").FormField[] | null;
selectionMode: "seats" | "shortlist";
```
In the return (after `posterUrl`):
```ts
    selectionMode: (row as { selection_mode?: "seats" | "shortlist" }).selection_mode ?? "seats",
    registrationForm: (() => {
      const rf = (row as { registration_form?: unknown }).registration_form;
      if (!rf) return null;
      const parsed = validateFormSchema(rf);
      return parsed.ok ? parsed.fields : null;
    })(),
```
Add `import { validateFormSchema } from "@/lib/registration-form/schema";` at the top.

- [ ] **Step 2: Rewrite `RegisterForm` as schema-driven**

Replace `src/components/RegisterForm.tsx`. Render each field by kind; collect answers keyed by field id; show inline `fields[id]` errors; keep the honeypot; success states by status.

```tsx
"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import { Note } from "./ui/Surface";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";

type Result = { status?: string; error?: string; fields?: Record<string, string> };
const TERMINAL = new Set(["registered", "submitted", "waitlisted", "duplicate"]);

export function RegisterForm({
  eventId, schema, isFull, mode = "seats",
}: {
  eventId: string;
  schema: FormField[] | null;
  isFull: boolean;
  mode?: "seats" | "shortlist";
}) {
  const fields = schema && schema.length > 0 ? schema : defaultFormFor();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.kind === "checkboxes") answers[field.id] = fd.getAll(field.id).map(String);
      else answers[field.id] = String(fd.get(field.id) ?? "");
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, answers, website: String(fd.get("website") ?? "") }),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      setResult(res.ok ? data : { error: data.error ?? "Something went wrong.", status: data.status, fields: data.fields });
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result && result.status && TERMINAL.has(result.status)) {
    return <ResultMessage status={result.status} mode={mode} />;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {result?.error ? (
        <div className="field err" style={{ marginBottom: 14 }}>
          <span className="hint" role="alert">{result.error}</span>
        </div>
      ) : null}

      {fields.map((field) => (
        <FieldInput key={field.id} field={field} error={result?.fields?.[field.id]} />
      ))}

      {/* honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

      <Button type="submit" variant="accent" className="w-full"
        style={{ marginTop: 4, borderRadius: "var(--r-sm)" }} disabled={submitting}>
        {submitting ? "Submitting…" : isFull ? "Join the waitlist" : mode === "shortlist" ? "Submit" : "Register"}
      </Button>
    </form>
  );
}

function FieldInput({ field, error }: { field: FormField; error?: string }) {
  const id = `rf-${field.id}`;
  const common = { id, name: field.id, required: field.required } as const;
  return (
    <div className={`field${error ? " err" : ""}`}>
      <label htmlFor={id}>{field.label}{field.required ? "" : " (optional)"}</label>
      {field.kind === "paragraph" ? (
        <textarea {...common} rows={4} maxLength={4000} />
      ) : field.kind === "dropdown" ? (
        <select {...common} defaultValue="">
          <option value="" disabled>Choose…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.kind === "radio" ? (
        <div className="stack" style={{ gap: 6 }}>
          {(field.options ?? []).map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="radio" name={field.id} value={o} required={field.required} /> {o}
            </label>
          ))}
        </div>
      ) : field.kind === "checkboxes" ? (
        <div className="stack" style={{ gap: 6 }}>
          {(field.options ?? []).map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name={field.id} value={o} /> {o}
            </label>
          ))}
        </div>
      ) : field.kind === "date" ? (
        <input {...common} type="date" />
      ) : field.kind === "number" ? (
        <input {...common} type="number" inputMode="numeric" />
      ) : field.kind === "link" ? (
        <input {...common} type="url" inputMode="url" placeholder="https://drive.google.com/…" />
      ) : (
        <input {...common} placeholder={field.identity === "email" ? "vtuxxxxx@veltech.edu.in"
          : field.identity === "roll" ? "vtuxxxxx" : undefined} />
      )}
      {error ? <span className="hint" role="alert">{error}</span>
        : field.help ? <span className="hint">{field.help}</span> : null}
    </div>
  );
}

function ResultMessage({ status, mode }: { status: string; mode: "seats" | "shortlist" }) {
  if (status === "registered" || status === "submitted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>{mode === "shortlist" ? "Submitted ✓" : "You're registered ✓"}</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          {mode === "shortlist"
            ? "Thanks — the club will review submissions and email you if you're selected."
            : "Your spot is confirmed. See you there!"}
        </p>
      </div>
    );
  }
  if (status === "waitlisted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>You&rsquo;re on the waitlist</h3>
        <p className="body-text" style={{ marginTop: 8 }}>This event is full — we&rsquo;ll email you if a seat opens up.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 style={{ fontSize: 22 }}>Already registered</h3>
      <p className="body-text" style={{ marginTop: 8 }}>You&rsquo;ve already submitted this form for this event.</p>
    </div>
  );
}
```

- [ ] **Step 3: Update the event detail page**

In `src/app/events/[id]/page.tsx`, change the `<RegisterForm ... />` usage (line ~160) to pass the schema + mode:

```tsx
<RegisterForm
  eventId={event.id}
  schema={event.registrationForm}
  isFull={isFull}
  mode={event.selectionMode}
/>
```

- [ ] **Step 4: Typecheck + build + render-smoke**

Run: `npm run typecheck && npm run build`, then `npm run dev` and load `/events/<REAL_EVENT_ID>`.
Expected: PASS; the register panel renders the default six fields (existing events have `registration_form = null`). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/RegisterForm.tsx src/lib/queries.ts src/app/events/[id]/page.tsx
git commit -m "feat(registration): schema-driven public register form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 7: Event create/edit — selection mode + store the form schema

**Files:**
- Modify: `src/app/admin/(app)/events/actions.ts` (`createEventAction`, `updateEventAction`; `CreateSchema`)
- Modify: `src/components/admin/EventForm.tsx` (add `selection_mode` control + a hidden `registrationForm` input seeded from `defaultFormFor`, replaced by the real builder in Task 8)
- Modify: `src/app/admin/(app)/events/[id]/edit/page.tsx` (pass the stored schema + mode into `EventForm` initial values)
- Reference: `getEventForEdit` in `src/lib/admin/...` (whatever `edit/page.tsx` already uses)

**Interfaces:**
- Consumes: `validateFormSchema`, `defaultFormFor` from the schema module.
- Produces: events persist `selection_mode` + `registration_form`; `EventForm` gains `initial.selectionMode` + `initial.registrationForm` (JSON string) and a `fixedClub`-style control.

- [ ] **Step 1: Parse + validate the new fields in the create action**

In `src/app/admin/(app)/events/actions.ts`, extend `CreateSchema` and `parseEvent`:

```ts
// add to CreateSchema.object({...}):
    selectionMode: z.enum(["seats", "shortlist"]).default("seats"),
    registrationForm: z.string().optional(),   // JSON; validated with validateFormSchema
// add to parseEvent(...) object:
    selectionMode: formData.get("selectionMode") || "seats",
    registrationForm: formData.get("registrationForm") || undefined,
```
Add a helper near the top of the file:

```ts
import { validateFormSchema, defaultFormFor } from "@/lib/registration-form/schema";

function parseRegistrationForm(json: string | undefined):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  if (!json) return { ok: true, value: defaultFormFor() };
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { ok: false, error: "The registration form is malformed." }; }
  const parsed = validateFormSchema(raw);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? "Fix the registration form." };
  return { ok: true, value: parsed.fields };
}
```

- [ ] **Step 2: Store on insert (createEventAction)**

In `createEventAction`, after destructuring `parsed.data`, validate + include the new columns in the insert:

```ts
const form = parseRegistrationForm(parsed.data.registrationForm);
if (!form.ok) return { error: form.error };
// …in the .insert({ ... }) object, add:
    selection_mode: parsed.data.selectionMode,
    registration_form: form.value,
```

- [ ] **Step 3: Store on update (updateEventAction)**

In `updateEventAction`, add the same `parseRegistrationForm` call and include in the `update` object:

```ts
    selection_mode: parsed.data.selectionMode,
    registration_form: form.value,
```
(Add `selection_mode`/`registration_form` to the local `update` type as well.)

- [ ] **Step 4: Add controls to `EventForm`**

In `src/components/admin/EventForm.tsx`: extend `EventFormInitial` with `selectionMode: "seats" | "shortlist"` and `registrationForm: string` (JSON). Add a selection-mode `<select>` above capacity, and a hidden input carrying the form JSON (the real builder replaces this hidden input in Task 8):

```tsx
<div className="field">
  <label htmlFor="selectionMode">Registration type</label>
  <select id="selectionMode" name="selectionMode" defaultValue={initial?.selectionMode ?? "seats"}>
    <option value="seats">Seats — first come, capacity-limited</option>
    <option value="shortlist">Shortlist — collect everyone, you pick later</option>
  </select>
  <span className="hint">Shortlist ignores capacity; you select applicants afterward.</span>
</div>

{/* Registration form schema — replaced by the visual builder in Task 8 */}
<input type="hidden" name="registrationForm"
  defaultValue={initial?.registrationForm ?? JSON.stringify(defaultFormFor())} />
```
Add `import { defaultFormFor } from "@/lib/registration-form/schema";`.

- [ ] **Step 5: Feed initial values on the edit page**

In `src/app/admin/(app)/events/[id]/edit/page.tsx`, include `selectionMode` + `registrationForm` (stringified) in the `initial` object passed to `EventForm`, reading them from the event row (extend the edit query/`getEventForEdit` select to include `selection_mode, registration_form`). Use `JSON.stringify(event.registration_form ?? defaultFormFor())`.

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Manual verify (browser — server-action POST)**

Log in as an auto-approve role, create an event leaving the form at default + mode `seats`; confirm the row saved (`select selection_mode, registration_form from events order by created_at desc limit 1;` via MCP) with `registration_form` = the 6 default fields. Delete the test event after (shared DB).

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/(app)/events/actions.ts" src/components/admin/EventForm.tsx "src/app/admin/(app)/events/[id]/edit/page.tsx"
git commit -m "feat(events): selection mode + store registration form schema on create/edit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 8: The visual form builder (`RegistrationFormBuilder`)

**Files:**
- Create: `src/components/admin/RegistrationFormBuilder.tsx`
- Modify: `src/components/admin/EventForm.tsx` (replace the hidden `registrationForm` input with `<RegistrationFormBuilder initialJson={...} />`)

**Interfaces:**
- Consumes: `FormField`, `FieldKind`, `Identity`, `CHOICE_KINDS`, `defaultFormFor` from the schema module.
- Produces: `<RegistrationFormBuilder initialJson={string} />` — a client editor whose state serialises to a hidden `<input name="registrationForm">` (JSON) consumed by Task 7's actions.

- [ ] **Step 1: Build the component**

Create `src/components/admin/RegistrationFormBuilder.tsx`. Client component managing an ordered `FormField[]`; a palette to add identity blocks (each addable once) and custom kinds; per-card label/required/help/options editors; move up/down; delete; live-serialise to the hidden input.

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  CHOICE_KINDS, defaultFormFor, type FieldKind, type FormField, type Identity,
} from "@/lib/registration-form/schema";

const IDENTITY_BLOCKS: { identity: Identity; kind: FieldKind; label: string; options?: string[] }[] = [
  { identity: "name", kind: "short_text", label: "Full name" },
  { identity: "roll", kind: "short_text", label: "Roll number" },
  { identity: "email", kind: "short_text", label: "College email" },
  { identity: "phone", kind: "short_text", label: "Mobile number" },
  { identity: "department", kind: "dropdown", label: "Department", options: ["CSE"] },
  { identity: "year", kind: "dropdown", label: "Year", options: ["1", "2", "3", "4", "5"] },
];

const CUSTOM_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "short_text", label: "Short text" },
  { kind: "paragraph", label: "Paragraph" },
  { kind: "dropdown", label: "Dropdown" },
  { kind: "radio", label: "Multiple choice" },
  { kind: "checkboxes", label: "Checkboxes" },
  { kind: "date", label: "Date" },
  { kind: "number", label: "Number" },
  { kind: "link", label: "Link (Drive/URL)" },
];

let counter = 0;
const newId = () => `q${Date.now().toString(36)}${(counter++).toString(36)}`;

export function RegistrationFormBuilder({ initialJson }: { initialJson: string }) {
  const [fields, setFields] = useState<FormField[]>(() => {
    try {
      const parsed = JSON.parse(initialJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as FormField[];
    } catch { /* fall through */ }
    return defaultFormFor();
  });

  const usedIdentities = useMemo(
    () => new Set(fields.map((f) => f.identity).filter(Boolean) as Identity[]),
    [fields],
  );
  const json = useMemo(() => JSON.stringify(fields), [fields]);

  function update(i: number, patch: Partial<FormField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const copy = [...f]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
    });
  }
  function remove(i: number) { setFields((f) => f.filter((_, idx) => idx !== i)); }
  function addIdentity(b: (typeof IDENTITY_BLOCKS)[number]) {
    setFields((f) => [...f, { id: b.identity, kind: b.kind, identity: b.identity,
      label: b.label, required: true, options: b.options ? [...b.options] : undefined }]);
  }
  function addCustom(kind: FieldKind) {
    setFields((f) => [...f, { id: newId(), kind, identity: null, label: "Untitled question",
      required: false, options: CHOICE_KINDS.has(kind) ? ["Option 1"] : undefined }]);
  }

  return (
    <div className="field">
      <label>Registration form</label>
      <span className="hint">Build the questions applicants answer. Identity blocks power duplicate-check, attendance and the shortlist email.</span>
      <input type="hidden" name="registrationForm" value={json} readOnly />

      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        {fields.map((field, i) => (
          <div key={field.id} className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input aria-label="Label" value={field.label}
                onChange={(e) => update(i, { label: e.target.value })}
                style={{ flex: 1 }} disabled={!!field.identity} />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(i)}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
              <span className="label">{field.identity ? `${field.identity} · ${field.kind}` : field.kind}</span>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                <input type="checkbox" checked={field.required}
                  onChange={(e) => update(i, { required: e.target.checked })} /> Required
              </label>
            </div>
            {!field.identity && CHOICE_KINDS.has(field.kind) ? (
              <textarea style={{ marginTop: 8 }} rows={3}
                aria-label="Options (one per line)"
                value={(field.options ?? []).join("\n")}
                onChange={(e) => update(i, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                placeholder="One option per line" />
            ) : null}
            {!field.identity ? (
              <input style={{ marginTop: 8 }} aria-label="Help text" value={field.help ?? ""}
                onChange={(e) => update(i, { help: e.target.value })} placeholder="Help text (optional)" />
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label">Add identity block</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {IDENTITY_BLOCKS.map((b) => (
            <button key={b.identity} type="button" className="btn btn-sm btn-ghost"
              disabled={usedIdentities.has(b.identity)} onClick={() => addIdentity(b)}>
              + {b.label}
            </button>
          ))}
        </div>
        <div className="label" style={{ marginTop: 10 }}>Add question</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {CUSTOM_KINDS.map((c) => (
            <button key={c.kind} type="button" className="btn btn-sm btn-ghost" onClick={() => addCustom(c.kind)}>
              + {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Swap it into `EventForm`**

In `src/components/admin/EventForm.tsx`, replace the hidden `registrationForm` input (from Task 7 Step 4) with:

```tsx
<RegistrationFormBuilder initialJson={initial?.registrationForm ?? JSON.stringify(defaultFormFor())} />
```
Add `import { RegistrationFormBuilder } from "./RegistrationFormBuilder";`.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verify (browser)**

New-event page: the builder shows the 6 default blocks; add a "Link (Drive/URL)" question + a "Multiple choice" question with options; reorder; mark one required; save. Confirm via MCP that `registration_form` persisted the edited schema. Load the event's public page → the new fields render. Delete the test event after.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RegistrationFormBuilder.tsx src/components/admin/EventForm.tsx
git commit -m "feat(events): visual registration form builder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 9: Admin responses view — dynamic columns

**Files:**
- Modify: `src/lib/admin/registrations.ts` (`RegistrationRow` + `listRegistrations`: add `customAnswers`, `shortlistedAt`; add `getEventFormSchema(eventId)`)
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx` (render custom columns; show shortlist status for shortlist events)

**Interfaces:**
- Produces: `listRegistrations` rows gain `customAnswers: Record<string, unknown> | null` and `shortlistedAt: string | null`; `getEventFormSchema(eventId): Promise<{ schema: FormField[]; selectionMode: "seats"|"shortlist" }>`.
- Consumes: `defaultFormFor`, `validateFormSchema`.

- [ ] **Step 1: Extend the data layer**

In `src/lib/admin/registrations.ts`: add `customAnswers` + `shortlistedAt` to `RegistrationRow` and the select (`custom_answers, shortlisted_at`), and add:

```ts
import { defaultFormFor, validateFormSchema, type FormField } from "@/lib/registration-form/schema";

export async function getEventFormSchema(
  eventId: string,
): Promise<{ schema: FormField[]; selectionMode: "seats" | "shortlist" }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events").select("registration_form, selection_mode").eq("id", eventId).maybeSingle();
  const rf = data?.registration_form;
  const parsed = rf ? validateFormSchema(rf) : null;
  return {
    schema: parsed && parsed.ok ? parsed.fields : defaultFormFor(),
    selectionMode: (data?.selection_mode as "seats" | "shortlist") ?? "seats",
  };
}
```
Map `customAnswers: r.custom_answers ?? null` and `shortlistedAt: r.shortlisted_at ?? null` in `listRegistrations`.

- [ ] **Step 2: Render dynamic columns**

In `registrations/page.tsx`: call `getEventFormSchema(id)`; derive the **custom** (non-identity) fields; render one `<th>`/`<td>` per custom field. For `link` answers render an `<a href>` (validate defensively with `isSafeHttpUrl` before rendering); arrays join with `, `. Keep the existing identity columns. Guidance snippet:

```tsx
const { schema, selectionMode } = await getEventFormSchema(id);
const customFields = schema.filter((f) => !f.identity);
// header: {customFields.map((f) => <th key={f.id}>{f.label}</th>)}
// cell:
{customFields.map((f) => {
  const v = r.customAnswers?.[f.id];
  if (f.kind === "link" && typeof v === "string" && isSafeHttpUrl(v)) {
    return <td key={f.id}><a href={v} target="_blank" rel="noopener noreferrer" style={{ color: "var(--forest)" }}>link ↗</a></td>;
  }
  return <td key={f.id}>{Array.isArray(v) ? v.join(", ") : v != null ? String(v) : "—"}</td>;
})}
```
Add `import { isSafeHttpUrl } from "@/lib/url";` and `getEventFormSchema` import.

- [ ] **Step 3: Typecheck + build + render-smoke**

Run: `npm run typecheck && npm run build`; load a registrations page for an event that has custom fields + at least one response (seed one via the RPC through MCP, then delete after viewing).
Expected: PASS; custom columns render; links are clickable.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/registrations.ts "src/app/admin/(app)/events/[id]/registrations/page.tsx"
git commit -m "feat(registration): dynamic response columns in the admin view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 10: Shortlisting flow + selection email

**Files:**
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts` (add `shortlistAction`, `unshortlistAction`)
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx` (shortlist controls for `shortlist` events)
- Reference: `enqueueEmail` (`src/lib/email`), `getEventForAttendance`, `canManage`, `writeAudit`

**Interfaces:**
- Consumes: `enqueueEmail` with a new `template: "registration_shortlisted"` (the generic renderer builds the body from `payload.url`); `manage:registrations` guard.
- Produces: `shortlistAction(formData)` / `unshortlistAction(formData)` server actions; `registrations.shortlisted_at` set/cleared; audited.

- [ ] **Step 1: Add the actions**

In `registrations/actions.ts` (create the file if only the attendance toggle lives elsewhere; follow the existing `toggleAttendanceAction` shape):

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { enqueueEmail } from "@/lib/email";
import { writeAudit } from "@/lib/admin/audit";

const uuid = z.string().uuid();

export async function shortlistAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const eventId = String(formData.get("eventId") ?? "");
  if (!uuid.safeParse(eventId).success) redirect("/admin/events");
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) redirect("/admin/events");

  const ids = formData.getAll("selected").map(String).filter((v) => uuid.safeParse(v).success);
  if (ids.length === 0) redirect(`/admin/events/${eventId}/registrations`);

  const admin = createAdminClient();
  // Email only the newly-selected (currently not shortlisted) rows that have an email.
  const { data: rows } = await admin
    .from("registrations")
    .select("id, email, student_name, shortlisted_at")
    .eq("event_id", eventId)
    .in("id", ids);
  const now = new Date().toISOString();
  await admin.from("registrations").update({ shortlisted_at: now }).in("id", ids);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  for (const r of rows ?? []) {
    if (r.shortlisted_at || !r.email) continue; // already shortlisted or no email → no mail
    await enqueueEmail({
      template: "registration_shortlisted",
      toEmail: r.email,
      toName: r.student_name ?? "",
      subject: `You're selected — ${ev.title}`,
      payload: { eventTitle: ev.title, url: base ? `${base}/events/${eventId}` : undefined },
      priority: 2,
    });
  }
  await writeAudit({
    actorId: session.id, action: "shortlist", entity: "event", entityId: eventId,
    after: { shortlisted: ids.length },
  });
  redirect(`/admin/events/${eventId}/registrations?shortlisted=1`);
}

export async function unshortlistAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const eventId = String(formData.get("eventId") ?? "");
  const regId = String(formData.get("registrationId") ?? "");
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(regId).success) redirect("/admin/events");
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) redirect("/admin/events");
  const admin = createAdminClient();
  await admin.from("registrations").update({ shortlisted_at: null }).eq("id", regId).eq("event_id", eventId);
  await writeAudit({ actorId: session.id, action: "unshortlist", entity: "event", entityId: eventId, after: { registrationId: regId } });
  redirect(`/admin/events/${eventId}/registrations`);
}
```

- [ ] **Step 2: Add the shortlist UI (shortlist events only)**

In `registrations/page.tsx`, when `selectionMode === "shortlist"` and `canEdit`: wrap the table in a single `<form action={shortlistAction}>`, add `<input type="hidden" name="eventId" value={id}/>`, a checkbox `<input type="checkbox" name="selected" value={r.id}/>` per row (with a **Shortlisted** badge when `r.shortlistedAt`), and a **"Shortlist selected & email"** submit button. Add a per-row `unshortlistAction` mini-form for shortlisted rows. Update the header count to `N submitted · M shortlisted`.

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Manual verify (browser — server-action POST)**

On a `shortlist` event with a couple of seeded submissions: select one → **Shortlist & email** → `shortlisted_at` set (check via MCP) and an `email_log` row queued with template `registration_shortlisted` (`select template,to_email,status from email_log order by created_at desc limit 3;`). Un-shortlist clears it. Delete seeded rows after.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/registrations/actions.ts" "src/app/admin/(app)/events/[id]/registrations/page.tsx"
git commit -m "feat(registration): shortlist + selection email for shortlist events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 11: CSV export — dynamic columns

**Files:**
- Modify: `src/app/api/admin/registrations/export/route.ts`

**Interfaces:**
- Consumes: `getEventFormSchema` (Task 9), `listRegistrations` (now with `customAnswers`).

- [ ] **Step 1: Emit custom columns**

Update the export route to append a column per custom field after the identity columns:

```ts
import { getEventFormSchema } from "@/lib/admin/registrations";
// …after loading regs:
const { schema } = await getEventFormSchema(eventId);
const customFields = schema.filter((f) => !f.identity);
const headers = ["Name", "Roll No", "Department", "Year", "Email", "Phone", "Confirmed", "Attended", "Method",
  "Shortlisted", ...customFields.map((f) => f.label)];
const rows = regs.map((r) => [
  r.name, r.roll, r.department, r.year, r.email, r.phone,
  r.confirmed ? "yes" : "no", r.attended ? "yes" : "no", r.method ?? "",
  r.shortlistedAt ? "yes" : "no",
  ...customFields.map((f) => {
    const v = r.customAnswers?.[f.id];
    return Array.isArray(v) ? v.join("; ") : v != null ? String(v) : "";
  }),
]);
const csv = toCsv(headers, rows);
```

- [ ] **Step 2: Typecheck + build + curl-smoke**

Run: `npm run typecheck && npm run build`. As a forged/admin session (or in-browser) hit `/api/admin/registrations/export?event=<ID>` and confirm the header row includes the custom field labels + `Shortlisted`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/admin/registrations/export/route.ts"
git commit -m "feat(registration): custom-answer columns in CSV export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Task 12: Full verify gate + STATUS update

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: Prod-parity read smoke (dev server)**

`npm run dev`, then confirm: `/events/<id>` 200 with the (default or custom) form; `/api/registrations` with `{eventId,answers:{}}` → 400 `fields`; `/admin/events/<id>/registrations` (no cookie) → 307→login. No new console errors on the event detail or admin registrations pages.

- [ ] **Step 3: Update STATUS.md**

Add a "SHIPPED to branch, pre-merge" entry under START HERE summarising Feature A: the migration names applied to the live DB, the removal of one-tap confirmation, the seats/shortlist modes, the builder, and the **owed human walkthrough** (create a shortlist event with a link question → submit as a student → shortlist + email → verify the queued `registration_shortlisted` mail). Note **Feature B** (manual attendance) is the next spec and depends on `shortlisted_at`.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): registration form builder shipped to branch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

- [ ] **Step 5: Integration handoff**

Use `superpowers:finishing-a-development-branch` to decide merge vs PR. Per repo workflow: fast-forward-merge to `main` → `git push origin main` auto-deploys to prod. Before merging, complete the owed human walkthrough (server-action POSTs can't be curled). **After the deploy succeeds**, apply a **held post-deploy migration** dropping the now-unused old RPC overload: `drop function if exists public.register_for_event(uuid,text,text,text,text,text,int,text);` (name `drop_register_v1`) — held until deploy so a `git revert` rollback of the deploy still has a working old RPC. **Then** start Feature B (manual event attendance) from its own spec.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- Selection mode (seats/shortlist) → Tasks 1, 4, 7. ✓
- Form schema JSONB + default template + back-compat → Tasks 1, 2, 6 (null ⇒ `defaultFormFor`). ✓
- Field types incl. link (no native upload) → Tasks 2, 3, 6, 8. ✓
- Smart identity blocks → mapped in Tasks 3, 4; builder in 8. ✓
- Custom answers storage → Tasks 1, 4, 9. ✓
- Nullable identity + partial-unique dedup → Task 1; dedup logic Task 4. ✓
- Confirmation removed (submit=confirmed) → Tasks 4, 5 (+ confirm page deleted). ✓
- Server-side validation as the security boundary → Task 3 + Task 5 (loads stored schema; ignores unknown keys). ✓
- Shortlisting + selection email → Task 10. ✓
- Responses view + CSV dynamic columns → Tasks 9, 11. ✓
- No new capability (reuse manage:events / manage:registrations) → Tasks 7, 10. ✓
- Feature B coupling (`shortlisted_at` defined) → Task 1. ✓

**Placeholder scan:** no TBD/TODO; every code step carries real code. UI "guidance snippet" steps (9 Step 2, 10 Step 2) include concrete code and exact wiring. ✓

**Type consistency:** `FormField`/`FieldKind`/`Identity`, `validateFormSchema` → `{ok, fields|errors}`, `validateAnswers` → `{ok, data{identity,customAnswers}|fieldErrors}`, RPC arg names (`p_custom_answers`, nullable identity), `getEventFormSchema` return shape, `RegistrationRow` additions (`customAnswers`, `shortlistedAt`) — used identically across Tasks 2–11. ✓
