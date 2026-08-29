# Custom Event Registration Form Builder — Design

**Status:** approved design, pre-implementation
**Date:** 2026-08-29
**Spec ref:** BUILD_PLAN §9 (registration), §12.4 (registration PII), SECURITY_SPEC §5
**Owner ask (2026-08-29):** make "Register Now" a Google-Forms-style builder created
with the event; from-scratch fields incl. a **Drive/URL link** field (no native file
upload); smart identity blocks; explicit seats-vs-shortlist mode; drop one-tap
confirmation; add a shortlisting round with a "selected for the next round" email.

> This is **Feature A** of a two-feature batch. **Feature B** (manual event
> attendance replacing the QR self-scan) is a separate spec and ships after A.
> A defines the `shortlisted_at` state; B's roster consumes it (lists **only
> shortlisted** registrants).

## Goal

Replace the fixed six-field public registration form with a **per-event form the
club builds when they create the event** — add / remove / reorder questions of
many types (text, paragraph, dropdown, radio, checkboxes, date, number, **Drive/URL
link**) plus **identity blocks** (name, roll, email, phone, department, year) that
keep the downstream pipeline working when included. Registration becomes **submit =
confirmed** (no email confirmation step). Events choose a **selection mode**:
seat-limited first-come, or **shortlist** (collect everyone, the club head selects
some and emails them).

The guiding test: "a club spins up an application form — free-form questions, maybe
a 'paste your Drive link' field — collects submissions, shortlists, and emails the
selected, without anyone touching code."

**File collection = a link field, not native upload.** Students paste a share link
(Google Drive/Docs, etc.); we store the validated URL. This keeps the submit path
JSON-only and avoids a storage bucket, multipart handling, size/type policy, and
signed-URL plumbing. (Native upload was considered and deliberately dropped.)

## What already exists (reused, not rebuilt)

- **`events`** + `event_clubs`, `createEventAction`/`updateEventAction`
  (`src/app/admin/(app)/events/actions.ts`), and the `EventForm`
  (`src/components/admin/EventForm.tsx`) — the builder embeds here.
- **`registrations`** table with `student_name, roll_no, email, phone, department,
  year, confirmed_at, attended` + a spare `team_members jsonb`, and
  `UNIQUE(event_id, roll_no)`.
- **`register_for_event` / `confirm_registration` RPCs**
  (`…0008_register_confirm_rpcs.sql`) — service-role only, SECURITY DEFINER.
- **Public submit** `RegisterForm` (`src/components/RegisterForm.tsx`) →
  `POST /api/registrations` (`src/app/api/registrations/route.ts`) with Zod
  (`src/lib/validation/registration.ts`), rate-limit, honeypot, Turnstile-ready.
- **Admin views** `…/events/[id]/registrations/page.tsx` (+ per-row attendance
  toggle) and CSV export `…/api/admin/registrations/export/route.ts`.
- **Email** — `enqueueEmail` + the single generic branded renderer
  (`src/lib/email/templates.ts`) auto-builds an action button from the payload's
  `url`/`confirmUrl`/`inviteUrl`. A new template name needs **no** renderer work.
- **`isSafeHttpUrl`** (`src/lib/url.ts`) — the existing safe-URL check (used by the
  resources vertical + markdown link check); reused to validate link answers.
- **Reusables** — `canManage`/`grantFor` guards, `writeAudit`, `resolveOwningClub`.

## Selection mode (new per-event concept)

`events.selection_mode` enum `seats | shortlist`, default `seats`, chosen in the
event form.

- **`seats`** — capacity-limited, first-come. A valid submit inserts a **confirmed**
  registration (`confirmed_at = now()`) and takes a seat; over capacity →
  `waitlisted` (existing waitlist) or `full`. Capacity field applies.
- **`shortlist`** — no seat cap. Every valid submit is accepted (`confirmed_at =
  now()`, `shortlisted_at = null`) → status `submitted`. The club head shortlists
  later. Capacity is hidden in the form and ignored by the RPC.

## Registrant lifecycle (one-tap confirmation removed)

- **Confirmation gate deleted.** Insert sets `confirmed_at = now()` so existing
  "confirmed" reads keep working verbatim — capacity counting
  (`register_for_event`), and the change/cancel notify queries
  (`.not("confirmed_at","is",null)` in `events/actions.ts`). No confirm token,
  no `registration_received` email, no `/registrations/confirm` page.
- **New `registrations.shortlisted_at timestamptz`** (null = not selected). Set by
  the shortlist action; cleared by un-shortlist.
- `attended` unchanged — set by Feature B's manual roster, for shortlisted rows.

Retired in this change: `confirm_registration` RPC (kept in DB, unused, dropped in
a later held migration — mirrors the member-portal drop pattern), the
`/registrations/confirm` route, and the `registration_received` template usage.

## Schema changes (one additive migration + one RPC rewrite)

`migration: event_registration_forms`

```sql
-- selection mode
do $$ begin create type selection_mode as enum ('seats','shortlist');
exception when duplicate_object then null; end $$;
alter table public.events
  add column if not exists selection_mode selection_mode not null default 'seats',
  add column if not exists registration_form jsonb;   -- null ⇒ default identity template

-- registrations: custom answers + shortlist state; relax identity NOT NULLs
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
-- email dedup fallback (used only when no roll block is present)
create unique index if not exists registrations_event_email_unique
  on public.registrations (event_id, email) where email is not null and roll_no is null;

create index if not exists registrations_shortlisted_idx
  on public.registrations (event_id) where shortlisted_at is not null;
```

- **No Storage bucket.** Link answers are plain URLs — nothing is uploaded.
- Regenerate `src/lib/database.types.ts` via the Supabase **MCP**
  `generate_typescript_types` (the CLI truncates it — see STATUS gotcha).

### Form schema shape (`events.registration_form`)

Ordered array; `null`/absent ⇒ the default identity template (6 identity blocks =
today's form) so **every existing event and every "just use the defaults" event
renders unchanged**.

```ts
type FieldKind =
  | "short_text" | "paragraph" | "dropdown" | "radio"
  | "checkboxes" | "date" | "number" | "link";
type Identity = "name" | "roll" | "email" | "phone" | "department" | "year";

interface FormField {
  id: string;            // stable slug, unique within the form (answer key)
  kind: FieldKind;       // identity blocks use the natural kind (roll→short_text…)
  identity: Identity | null;
  label: string;
  help?: string;
  required: boolean;
  options?: string[];    // required & non-empty for dropdown/radio/checkboxes
}
```

- **Identity blocks** carry `identity` set and use built-in validation regardless
  of `kind`: email pattern + `.toLowerCase()`, roll `^[A-Z0-9]{6,15}$` +
  `.toUpperCase()`, phone `^[6-9]\d{9}$`, department ∈ `DEPARTMENTS`, year 1–5,
  name `^[\p{L}\p{M} .'-]+$`. At most one block per identity.
- **`link` fields** collect one safe `https` URL (a "paste your Drive link" field).
- **Schema invariants** (validated server-side on event save): 1–40 fields; unique
  ids; label 1–120; choice kinds (`dropdown/radio/checkboxes`) have 1–20 non-empty
  options; non-choice kinds carry no options; at most one block per identity.

### Answer storage (`registrations`)

- Identity blocks → the real columns (`student_name/roll_no/email/phone/department/
  year`).
- Everything else → `custom_answers jsonb`, keyed by field id:
  - scalar kinds (`short_text/paragraph/dropdown/radio/date/number`) → string/number;
  - `checkboxes` → `string[]`;
  - `link` → a validated `https` URL string (e.g. a Google Drive share link).

### Link field policy

A `link` answer is a single URL validated with `isSafeHttpUrl` (`src/lib/url.ts`) —
`http`/`https` only, no `javascript:`/`data:` schemes. Stored as-is; the public form
shows a hint suggesting a Drive/Docs "anyone with the link" share URL. Max length
2000 chars. No upload, no storage object.

## Dedup rules (in the reworked RPC, under the event row lock)

1. Form has a **roll** block → dedup on `(event_id, roll_no)` (partial unique is the
   hard guard; RPC returns `duplicate` on a prior row).
2. Else form has an **email** block → dedup on `(event_id, email)`.
3. Else → **no dedup**; every submit is a new row.

Seat/waitlist counting is by row (confirmed), independent of identity, so it works
in every case.

## Capability

**No new capability.** Reuse `manage:events` (build the form on the event) and
`manage:registrations` (view responses, shortlist, email) — both already own-club
for club/vice heads. Public submit stays session-less.

## Components / files

| Layer | File | Responsibility |
|---|---|---|
| Types/logic | `src/lib/registration-form/schema.ts` | `FormField` types, `DEFAULT_FORM` template, `validateFormSchema`, `defaultFormFor(event)` — pure |
| Types/logic | `src/lib/registration-form/answers.ts` | `validateAnswers(schema, values)` → `{identity, customAnswers}` or `{fieldErrors}` — pure |
| Builder UI | `src/components/admin/RegistrationFormBuilder.tsx` | client editor: palette, field cards, reorder, options editor → hidden JSON input |
| Event form | `src/components/admin/EventForm.tsx` (extend) | embed builder + `selection_mode` control |
| Event actions | `src/app/admin/(app)/events/actions.ts` (extend) | parse+validate `registrationForm` JSON & `selectionMode`; store on `events` |
| Public form | `src/components/RegisterForm.tsx` (rewrite) | schema-driven renderer; JSON submit |
| Submit API | `src/app/api/registrations/route.ts` (rewrite) | load schema; `validateAnswers`; call RPC |
| RPC | `supabase/migrations/…_register_v2.sql` | `register_for_event` v2 (optional identity + `custom_answers` + mode + dedup) |
| Shortlist | `src/app/admin/(app)/events/[id]/registrations/actions.ts` (extend) | `shortlistAction` / `unshortlistAction` → set `shortlisted_at` + enqueue email |
| Responses UI | `src/app/admin/(app)/events/[id]/registrations/page.tsx` (extend) | dynamic columns; shortlist controls |
| Responses data | `src/lib/admin/registrations.ts` (extend) | return `custom_answers` + schema for column headers |
| CSV | `src/app/api/admin/registrations/export/route.ts` (extend) | dynamic columns from schema |
| Email | `src/lib/email/templates.ts` (data only) | `registration_shortlisted` name (generic renderer, no code) |

### Pure logic (unit-tested, no I/O)

- `validateFormSchema(json)` — enforces the schema invariants above; returns typed
  `FormField[]` or a list of problems. Used by event create/update **and** the
  builder.
- `validateAnswers(schema, values)` — per field: required check, type coercion,
  option membership (radio/dropdown/checkboxes), identity regexes, `link` safe-URL
  check. Returns `{ identity: {...}, customAnswers: {...} }` or
  `{ fieldErrors: {id: msg} }`. **This is the security boundary** — the client
  builder/renderer is convenience; the server never trusts posted field lists, only
  the event's stored schema, and rejects any answer key not in it.

### Builder UI (`RegistrationFormBuilder`)

- "Add block" palette: identity blocks (disabled once added) + custom kinds
  (short text, paragraph, dropdown, radio, checkboxes, date, number, **link**).
- Ordered field cards: label, required toggle, help, options editor (choice kinds),
  move up/down, delete. Identity cards show a lock icon + fixed validation note.
- Serializes to a hidden `registrationForm` input (JSON). Seeded with `DEFAULT_FORM`
  on new events; hydrated from `events.registration_form` on edit.
- Matches "paper" admin styling; no drag lib required (up/down buttons), keeping it
  mobile-friendly and dependency-free.

### Submit API (rewrite of `/api/registrations`)

1. Body size cap (100 KB, existing). JSON body: `{ eventId, answers: {fieldId: value},
   website, turnstile }`.
2. Load event + `registration_form` (service role); resolve effective schema
   (`defaultFormFor` when null) and `selection_mode`.
3. Rate-limit (existing), honeypot (`website` empty), Turnstile-ready.
4. `validateAnswers` against the **stored** schema → identity map + custom answers,
   or 400 with `{ fields: {...} }` (the public form renders these inline, like the
   join form does).
5. Call `register_for_event` v2 with optional identity + `custom_answers` + mode.
6. Response: `{ status }` where status ∈ `registered | submitted | waitlisted |
   duplicate | closed | full`. No `confirmUrl` (confirmation removed).

### RPC v2 (`register_for_event`)

Signature gains `p_custom_answers jsonb` and makes identity params nullable; drops
`p_confirm_token_hash`. Behaviour:

- Lock event; reject if not approved/published or outside the reg window → `closed`.
- Dedup per the rules above → `duplicate`.
- `shortlist` mode: insert accepted row (`confirmed_at = now()`) → `submitted`.
- `seats` mode: count confirmed rows; under capacity → insert (`confirmed_at =
  now()`) → `registered`; else waitlist (if enabled) → `waitlisted` else `full`.
- Insert writes nullable identity columns + `custom_answers`.
- Granted to `service_role` only (unchanged posture). Old holds logic (30-min
  unconfirmed hold) is removed — submit is immediately confirmed.

### Shortlisting flow (admin)

- On the registrations page for a `shortlist` event: a checkbox per row + a
  **"Shortlist selected & email"** button (and per-row **Un-shortlist**).
- `shortlistAction(formData)` — guard `manage:registrations` own-club; set
  `shortlisted_at = now()` on the selected rows that have an email; enqueue
  **`registration_shortlisted`** to each newly-selected person only
  (`subject: "You're selected — <event>"`, payload `{ eventTitle, url }`
  → generic renderer). Idempotent: rows already shortlisted are not re-emailed.
  Audited.
- `unshortlistAction` — clear `shortlisted_at` (no email). Audited.

### Responses view + CSV (dynamic columns)

- `listRegistrations(eventId)` also returns the event's schema + each row's
  `custom_answers`.
- Table renders: identity columns present in the schema, then one column per custom
  field (link answers as a clickable URL). Shortlist events show a **Shortlisted**
  column + the shortlist controls; the header counts show `N submitted · M
  shortlisted`.
- CSV export emits the same dynamic columns (links as the URL string).

## Data flow

1. Organiser creates an event → picks **selection mode** → **builds the form**
   (defaults pre-seeded) → save; schema validated server-side, stored on `events`.
2. Public event page renders the schema-driven form; a student submits (JSON).
3. Server validates against the stored schema, calls RPC → row inserted
   **confirmed**; `registered` (seat) / `submitted` (shortlist) / `waitlisted` /
   `duplicate`.
4. Organiser opens **Registrations** → sees dynamic columns (incl. any pasted
   links). For a shortlist event: selects people → **Shortlist & email** → selected
   get the "next round" mail; `shortlisted_at` set.
5. (Feature B) The event's **Attendance** roster lists **only shortlisted** rows for
   manual present/absent marking → `attended`.

## Back-compat & migration

- Existing events: `registration_form` NULL ⇒ default 6-field identity template;
  `selection_mode` defaults `seats` — **behaviour identical to today** minus the
  now-removed confirmation step.
- Existing registrations: already have `confirmed_at`; `custom_answers`/
  `shortlisted_at` null — render fine.
- The additive migration applied to the **live/shared DB** via MCP (dev and prod
  share it — see STATUS gotcha); `database.types.ts` regenerated via MCP.

## Error handling

- Invalid form schema on event save → action returns a clear message; nothing
  stored. (Builder also blocks obviously-broken states client-side.)
- Answer validation failure → 400 `{ fields:{id:msg} }`; the public form shows each
  inline (reuse the join-form inline-error pattern), never a silent generic error.
- A `link` answer that isn't a safe `http(s)` URL → per-field error.
- Over capacity (seats) → `waitlisted` or `full` surfaced in the UI.
- Duplicate (roll/email per rules) → `duplicate` message.
- Cross-club admin (grant `own`, other club) → guard 403; anon on admin routes →
  401 (existing).

## Testing

- **Unit (vitest):** `validateFormSchema` (bad kinds, empty options, options on a
  non-choice kind, duplicate ids, too many fields, duplicate identity);
  `validateAnswers` (required, option membership, identity regexes, checkbox arrays,
  `link` safe-URL accept/reject, unknown field rejected); `defaultFormFor` equals
  today's six fields; dedup-rule selection (roll → email → none). The
  `manage:registrations`/`manage:events` grants already covered.
- **RPC/integration:** with the service-role client — seats capacity/waitlist,
  shortlist `submitted`, dedup by roll and by email, nullable-identity insert,
  `confirmed_at` set on insert. Seed rows then delete (shared DB gotcha).
- **Route/manual:** JSON submit happy-path (incl. a link answer), and a rejected
  submit showing inline field errors. Server-action POSTs (shortlist/email) verified
  in a browser or via direct DB effect + read assertion (curl gotcha). Prod smoke:
  `/events/[id]` 200 with a custom form; `/api/registrations` rejection paths 400
  without a write.

## Out of scope (YAGNI)

- **Native file upload.** Deliberately dropped in favour of a Drive/URL link field
  (no bucket, no multipart, no size/type policy). Revisit only if link-paste proves
  insufficient.
- **Multiple sequential shortlist rounds.** v1 is a single shortlist stage; the mail
  says "selected for the next round." Multi-stage is a later add on `shortlisted_at`.
- **Conditional/branching questions, sections, response editing after submit,
  drag-and-drop reordering** (up/down is enough).
- **Feature B (manual attendance)** — its own spec; consumes `shortlisted_at`.
- Reworking results/rounds, certificates, or the member/roster systems.

## Open decisions — resolved (owner, 2026-08-29)

- Form model: **from scratch** with **smart identity blocks** (downstream lights up
  when identity is included; off when omitted).
- Field types: full palette; **file collection is a Drive/URL link field, not native
  upload**.
- Seats vs shortlist: **explicit mode toggle** on the event (not inferred from
  capacity).
- Confirmation: **removed** — submit = confirmed.
- Shortlisting: **club head selects → only selected are emailed** "next round."
- Attendance scope (Feature B): **only shortlisted** registrants appear.
