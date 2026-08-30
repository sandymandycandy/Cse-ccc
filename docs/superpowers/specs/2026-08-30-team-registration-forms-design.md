# Team Registration Forms — full Google-Forms customization — Design

**Status:** approved design, pre-implementation
**Date:** 2026-08-30
**Spec ref:** extends `2026-08-29-event-registration-form-builder-design.md`
(Feature A); BUILD_PLAN §9 (registration), §12.4 (registration PII), SECURITY_SPEC §5
**Owner ask (2026-08-30):** make the event registration builder "fully customizable
like Google Forms" — add **section headings**, collect a **team of members** (e.g.
up to 4, each with name/VTU-ID/email), let choice questions have an **"Other"
write-in**, work for **solo events** with no team, and make **shortlisting and
attendance work at the team level**.

> This is **Feature C**, a direct follow-on to Feature A (the form builder, already
> on `main`). It adds three building blocks + team-aware shortlist/attendance. It
> **reverses** Feature A's YAGNI calls on *sections* and *team blocks*, which the
> owner has now explicitly requested. **No DB migration** — everything lives inside
> the `jsonb` columns Feature A already added.

## Goal

Let a club design essentially any registration form the way Google Forms allows,
and make a team the first-class unit for events that need it:

1. **Section heading / description blocks** — a non-input title + optional
   descriptive text to group a form ("Idea Details", "Team Members", "Submission").
2. **Structured team-members block** — the admin sets a min/max member count and
   which per-member fields to collect; the student fills a repeatable "member card"
   with **"+ Add member"** up to the max.
3. **"Other" write-in** on dropdown / multiple-choice / checkboxes.
4. **Solo = the default** — an event with no team block is exactly today's
   individual registration; nothing extra to fill.
5. **Team-level shortlisting + attendance** — because one registration already **is**
   one team (leader = registrant, members captured inside the row), shortlist state
   (`shortlisted_at`) and attendance (`attended`) are already team-keyed. The only
   real additions are: the shortlist email goes to **every member**, and the
   attendance control is **relabelled** for team events.

Guiding test: "a club builds a pitch-competition form — sections, a team of up to 4,
a Domain dropdown with an 'Other' box, a 'paste your Drive link' field — opens it,
shortlists teams (emailing all members), and marks teams present, without touching
code. The same builder, with no team block, still runs a plain solo event."

## What already exists (reused, not rebuilt)

- **Form model + security boundary** — `src/lib/registration-form/schema.ts`
  (`FormField`, `validateFormSchema`, `DEFAULT_FORM`) and
  `src/lib/registration-form/answers.ts` (`validateAnswers` → `{identity,
  customAnswers}`). These are the server-side authority; the client builder/renderer
  is convenience only.
- **Storage** — `events.registration_form jsonb` (the form) and
  `registrations.custom_answers jsonb` (the answers). Both already exist. The
  `register_for_event` v2 RPC takes `p_custom_answers jsonb` and passes it straight
  through — **nested member lists need no RPC or schema change.**
- **Builder UI** — `src/components/admin/RegistrationFormBuilder.tsx` (palette +
  field cards + reorder + options editor → hidden JSON input).
- **Public form** — `src/components/RegisterForm.tsx` (schema-driven renderer) →
  `POST /api/registrations` (loads the **stored** schema, `validateAnswers`, RPC).
- **Admin responses** — `.../events/[id]/registrations/page.tsx` (a column per
  non-identity field) + CSV `.../api/admin/registrations/export/route.ts`.
- **Shortlist** — `shortlistAction`/`unshortlistAction`
  (`.../registrations/actions.ts`); today emails **only the leader** (`r.email`).
- **Attendance** — `registrations.attended` + `checkin_method` set by the per-row
  `toggleAttendanceAction` (manual) or the event QR self-scan; `getEventForAttendance`.
- **Email** — `enqueueEmail` + the single generic branded renderer; the
  `registration_shortlisted` template name already exists (no renderer work).
- **`isSafeHttpUrl`**, `canManage`/`grantFor`, `writeAudit`, the identity regexes in
  `answers.ts` (email/roll/phone/name) — all reused.

## The new building blocks

### 1. Section heading (`kind: "section"`)

A **layout block**, not an input. Carries a `label` (the heading) and optional
`description` (a paragraph of guidance). No answer is collected; `required` is
ignored; it never appears as a response column or in the CSV. Enables the "manual
team layout" too — a club can drop a "Team Members" heading and hand-add fields the
old Google-Forms way (this falls out for free).

### 2. Team-members block (`kind: "team"`)

Admin configures, on the block:

- `label` (e.g. "Team Members"),
- `minMembers` (≥ 1) and `maxMembers` (≥ min, **cap 10**; default 4),
- `members: MemberSubfield[]` — an ordered list (1–8) of per-member fields, each
  `{ key, label, kind, required }` where `kind ∈ { short_text | email | roll |
  phone }` (validated by kind, reusing the identity regexes).

The student sees one member card + **"+ Add member"** up to `maxMembers`, and can
remove down to `minMembers`. Because `minMembers` can be 1, a "team" form also
handles a lone entrant gracefully. The **answer** for the block is an **array of
member objects** keyed by subfield key, stored in `custom_answers[blockId]`.

Members are **informational** — they are **not** separate registrations and are
**not** individually duplicate-checked. Dedup stays on the leader (Feature A:
roll → email → none). (Blocking the same student across two teams is out of scope —
see YAGNI.)

### 3. "Other" write-in (`allowOther: true`)

A boolean on `dropdown` / `radio` / `checkboxes`. When set, the public form shows an
**"Other"** choice plus a text box; the typed value is captured (length-capped) and
stored as the answer instead of being rejected as an invalid choice. For checkboxes,
the write-in is one extra entry alongside the ticked options.

## Schema shape (extends `FormField`, same flat interface)

We keep the existing single flat interface (consistent with today's code — optional
props per kind) rather than a tagged union (a large rewrite for no user gain).

```ts
type FieldKind =
  | "short_text" | "paragraph" | "dropdown" | "radio"
  | "checkboxes" | "date" | "number" | "link"
  | "section" | "team";                         // NEW

interface MemberSubfield {
  key: string;                                   // slug, unique within the block
  label: string;                                 // ≤ 80
  kind: "short_text" | "email" | "roll" | "phone";
  required: boolean;
}

interface FormField {
  id: string;
  kind: FieldKind;
  identity: Identity | null;
  label: string;                                 // section: the heading title
  help?: string;
  required: boolean;
  options?: string[];                            // choice kinds
  // NEW (all optional, per-kind):
  description?: string;                          // section only, ≤ 500
  allowOther?: boolean;                          // choice kinds only
  members?: MemberSubfield[];                    // team only, 1–8
  minMembers?: number;                           // team only, ≥ 1
  maxMembers?: number;                           // team only, ≥ min, ≤ 10
}
```

Classification helpers added to `schema.ts`:

- `LAYOUT_KINDS = new Set(["section"])` — non-answerable (no data, no column).
- `CHOICE_KINDS` unchanged (`dropdown | radio | checkboxes`).
- `team` is answerable but **expands** into multiple response columns (below).

### Schema invariants (validated server-side on event save — the boundary)

Existing invariants keep holding (1–40 fields; unique ids; label 1–120; choice kinds
1–20 options; non-choice kinds carry no options; ≤ 1 block per identity). Added:

- **section**: `identity` must be null; no `options`; `description` ≤ 500; `required`
  coerced to false.
- **team**: `identity` null; no `options`; `members` length 1–8 with unique
  non-empty keys, each label ≤ 80 and `kind` in the allowed set; `minMembers`
  integer ≥ 1; `maxMembers` integer, `minMembers ≤ maxMembers ≤ 10`.
- **allowOther**: only permitted on choice kinds; ignored/false elsewhere.

## Answer storage (`registrations.custom_answers`)

`custom_answers[fieldId]` gains one shape and widens the value type:

```ts
type AnswerValue = string | number | string[] | Record<string, string>[];
//   scalar/choice/link  → string        checkboxes → string[]
//   team                → Record<string,string>[]  (one object per member)
```

- **section** → nothing stored (no key).
- **team** → e.g. `[{ name:"Asha", roll:"VTU1234", email:"…" }, { … }]`.
- **choice + Other** → the write-in **text** is the stored value (radio/dropdown), or
  an extra element in the array (checkboxes).

`ValidatedAnswers.customAnswers` widens to `Record<string, AnswerValue>`. Because the
column is `jsonb` and the RPC takes `p_custom_answers jsonb`, **nothing changes in
the DB or the RPC.**

## Answer validation (`answers.ts` — reject at the boundary)

- **section** — skipped entirely (no required check, no value).
- **team** — coerce `raw` to an array of member objects; drop fully-empty members;
  require count ≥ `minMembers` when the block is `required` (else 0 allowed);
  reject count > `maxMembers`. For each kept member, validate each subfield by kind
  (email regex + lowercase; roll regex + uppercase; phone regex; short_text trimmed
  and length-capped — name 80, email 120, roll 15, phone 10, text 200) and enforce
  its `required`. Store the cleaned array. Errors surface as one message per block
  keyed by `fieldId` (e.g. "Member 2: enter a valid email") — the flat `fieldErrors`
  map is unchanged.
- **choice + Other** — if `allowOther` and the value isn't a known option, accept it
  as the write-in (trim, cap 200) instead of rejecting; for checkboxes, allow **one**
  unknown value as the Other text. If `allowOther` is false, reject unknown values as
  today.

This preserves Feature A's rule: the server trusts **only the event's stored
schema**, ignores any posted key not in it, and bounds every count and string so a
crafted body can't bloat (100 KB cap still applies).

## Public form rendering (`RegisterForm.tsx`)

- **section** → an `<h3>` + optional `<p>`; no input; skipped when collecting answers.
- **team** → managed in React state (an array of member rows). Each row renders the
  subfield inputs; **"+ Add member"** (≤ max) and **Remove** (≥ min). At submit, the
  block's answer is built from state as `Record<string,string>[]`.
- **Other** → radio/checkbox get an extra "Other" control + a text box shown when
  selected; dropdown gets an "Other" `<option>` + conditional text box. The resolved
  value(s) are injected into the `answers` object.
- Scalar/identity fields keep working from `FormData` as today. (Net: `RegisterForm`
  becomes partly controlled — team + Other live in state; the submit handler merges
  state answers with the FormData answers.) Inline per-field errors unchanged.

## Team-aware shortlisting (`shortlistAction`)

Shortlisting a row already shortlists the whole team (one row = one team). Change:
**email every member, not just the leader.**

- After setting `shortlisted_at`, load the event schema (`getEventFormSchema`),
  find any `team` block and its `email`-kind subfield(s).
- For each **newly**-selected row, collect recipient addresses = leader `email` +
  each member email from `custom_answers[teamBlockId]`; **dedup**, cap at ~12
  addresses/team; enqueue `registration_shortlisted` to each (same subject/payload →
  generic renderer). Idempotent (already-shortlisted rows aren't re-emailed). Audited.
- `unshortlistAction` unchanged (no email).

## Team-level attendance

No schema and no new action logic — attendance is already the per-registration
`attended` flag, and a registration is a team.

- In `.../registrations/page.tsx`, when the event's schema contains a `team` block,
  relabel the control **"Mark present" → "Mark team present"** and show the member
  count (e.g. "Team · 4") beside the name. The leader's event-QR self-scan already
  marks the row.
- `toggleAttendanceAction` is untouched. Solo events (no team block) read exactly as
  today. Per-member attendance is explicitly **out of scope** (owner: team-level).

## Responses view + CSV — one shared flatten helper

To keep the admin table and the CSV from diverging (the codebase's
`attendance-math`/`diffPresence` pattern: share the pure logic so two views can't
disagree), add:

`src/lib/registration-form/columns.ts` (pure, unit-tested):

```ts
interface AnswerColumn {
  key: string;                       // stable header key
  label: string;                     // column header
  kind: FieldKind;                   // so the page can render `link` as an anchor
  get(custom: Record<string, unknown> | null): string;
}
function answerColumns(schema: FormField[]): AnswerColumn[];
```

- Skips identity blocks **and** `section` blocks.
- Scalar/choice/link/Other → one column; value stringified (checkbox arrays joined).
- **team → expands** to `maxMembers × members.length` columns, header
  `"<block> — Member <n> <subfield>"`, `get` pulling
  `custom[blockId]?.[n-1]?.[subkey] ?? ""`.

Both `registrations/page.tsx` and the CSV route consume `answerColumns(schema)`
(replacing today's `schema.filter(f => !f.identity)`). The page still special-cases
`kind === "link"` to render a clickable anchor via the column's `kind`.

## Capability

**No new capability.** `manage:events` (build the form) and `manage:registrations`
(view responses, shortlist, mark attendance) — both already own-club scoped. Public
submit stays session-less.

## Components / files

| Layer | File | Change |
|---|---|---|
| Types/logic | `src/lib/registration-form/schema.ts` | new kinds `section`/`team`, `MemberSubfield`, `allowOther`/`description`/`members`/`min`/`maxMembers`; `LAYOUT_KINDS`; extend `validateFormSchema` |
| Types/logic | `src/lib/registration-form/answers.ts` | validate/collect team lists + Other write-ins; widen `AnswerValue` |
| Columns (new) | `src/lib/registration-form/columns.ts` | pure `answerColumns(schema)` — shared by table + CSV; team flatten |
| Builder UI | `src/components/admin/RegistrationFormBuilder.tsx` | `+ Section heading`, `+ Team members` (min/max + subfield editor), `Allow "Other"` on choice cards, description on section |
| Public form | `src/components/RegisterForm.tsx` | render section/team/Other; team + Other in state; merge answers at submit |
| Shortlist | `.../events/[id]/registrations/actions.ts` | `shortlistAction` also emails member addresses (deduped, capped) |
| Responses UI | `.../events/[id]/registrations/page.tsx` | use `answerColumns`; "Mark team present" label + member count |
| CSV | `.../api/admin/registrations/export/route.ts` | use `answerColumns` |
| Submit API | `src/app/api/registrations/route.ts` | unchanged shape — already loads schema + `validateAnswers` + RPC (verify only) |

**No migration. No RPC change. `database.types.ts` unchanged** (`custom_answers` is
already `jsonb`).

## Data flow

1. Organiser builds the form: adds sections, a team block (min/max + subfields),
   choice questions with "Other", link fields — saved to `events.registration_form`
   after server-side `validateFormSchema`.
2. A student opens the event page → fills sections/team-cards/Other/scalars →
   submits JSON `{ eventId, answers }`.
3. Server `validateAnswers` against the **stored** schema → identity + custom answers
   (team = array of member objects) → RPC insert (confirmed; `registered` /
   `submitted` / `waitlisted` / `duplicate`).
4. Organiser opens **Registrations** → team members appear as flattened `Member N …`
   columns (+ CSV). For a shortlist event: select teams → **Shortlist & email** →
   **all members** of each selected team get the "selected" mail.
5. **Attendance**: the organiser marks each **team** present (or the leader self-scans
   the event QR) → `attended` set for the team.

## Back-compat

- Existing forms (no `section`/`team`/`allowOther`) validate and render exactly as
  today; the default 6-field identity form is unchanged.
- Existing registrations have scalar/array `custom_answers`; `answerColumns` handles
  them identically. Solo events are the no-team-block default.

## Error handling

- Invalid schema on save (bad member/subfield/min-max, section with options, etc.) →
  action returns a clear message; nothing stored.
- Team answer errors (too few/many members, bad member email/roll/phone) → 400
  `{ fields: { teamBlockId: "Member N: …" } }`, shown inline under the block.
- "Other" text over the cap → per-field error. Unknown choice with `allowOther`
  false → rejected as today.
- Shortlist emailing a team with no member emails → still emails the leader; a member
  row missing an email is skipped, not fatal.

## Testing

- **Unit (vitest):**
  - `validateFormSchema` — section (no options, description cap), team (member count
    1–8, min≤max≤10, subfield kinds/keys), `allowOther` only on choice kinds.
  - `validateAnswers` — team: min/max enforcement, per-member kind validation
    (email/roll/phone/name), empty-member drop, required vs optional block; Other:
    accept write-in for radio/dropdown, one Other in checkboxes, reject when
    `allowOther` false; section skipped.
  - `answerColumns` — identity + section excluded; team flattened to
    `maxMembers × subfields` columns with correct headers and `get` extraction;
    scalar/link/checkbox columns unchanged.
- **Route/manual:** JSON submit with a team + Other happy-path; a rejected team
  submit shows the inline block error. Server-action POSTs (shortlist email to all
  members; team present toggle) verified in a browser or via direct DB effect + read
  assertion (curl gotcha). Seed then delete on the shared DB.
- **Prod smoke:** `/events/[id]` 200 with a team form; `/api/registrations`
  rejection paths 400 with no write.

## Out of scope (YAGNI)

- **Per-member attendance** — team-level only (owner decision). Revisit if individual
  participation certificates need it; the team block already stores per-member data
  to build on.
- **Cross-team duplicate blocking** (same student on two teams) — members stay
  informational; dedup is leader-only.
- **Native file upload** — Drive/URL link field stays (Feature A decision).
- **Conditional/branching logic, page breaks, response editing after submit,
  drag-and-drop** — up/down reorder is enough.
- **Multi-stage shortlist rounds** — single stage (Feature A).

## Open decisions — resolved (owner, 2026-08-30)

- Team collection: **both** a structured team block **and** section-heading + manual
  fields.
- Extra blocks: **section headings + description** and **"Other" write-in**; **no**
  native file upload.
- Solo events: supported as the **default** (no team block).
- Shortlisting: team-level; **email all members** of a selected team.
- Attendance: **team-level** (reuse `attended`; relabel), **not** per-member.
