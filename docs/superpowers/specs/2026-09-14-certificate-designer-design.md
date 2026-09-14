# Certificate designer — design

**Status:** approved in chat 2026-09-14. Not implemented.
**Scope:** replace the v1 per-event certificate page (upload a finished image,
click-place one name, bulk-email PDFs) with a real designer. You upload a base
template, then place logos and signatures and type rich text containing fields
filled from each recipient's data. It also adds per-person team certificates,
uploaded recipient lists (volunteers, judges), downloads, re-issue/revoke and
public verification. **Participation-style certificates only.** Winner
certificates are a separate later project that will reuse this engine.

## Goal

The owner asked for:

> a full editor session like i can upload a image and shrink it and place the
> logos etc and i want to type the content i want functions like here need to
> display the name or maybe team name … you should give me thats types of all
> the options from the events participation list and for winners i will do it
> separately

What exists today (shipped 2026-09-01, `c60730f`):

- `/admin/events/[id]/certificates` (`CertificateManager.tsx`): one template
  image + one name anchor (`events.certificate_config`: x%, y%, font%, align,
  colour). Times-Bold only (Latin-1).
- `issueCertificatesAction`: attendees (`registrations.attended = true`) with an
  email, batches of 40, reserve ledger row → render with `pdf-lib` → send; a
  failed send deletes the row (at-most-once).
- `certificates` table already carries `type`, `placement`, `serial`, `hmac`,
  `revoked_at`, `revoked_reason`, `download_path`. RLS on, no anon/authenticated
  grants.
- **Latent v1 bug found during design:** `next.config.ts` never raises
  `serverActions.bodySizeLimit` (default **1 MB**, confirmed in
  `node_modules/next/dist/docs/.../serverActions.md`), but the v1 action accepts
  templates "up to 8 MB" through a server action. Any template over ~1 MB fails.
  This design uploads straight to Storage (§6.4), which removes the problem.

The data the owner wants as fields already exists: the registration identity
columns, `team_name`, custom form answers (`custom_answers`), team members
(`listParticipants` in `src/lib/registration-form/participants.ts`), and the
event's title/date/venue/club.

## Recorded decisions

- **D1 — Team events: every member gets their own certificate.** Attendance is
  team-level (`registrations.attended`), so everyone on a present team counts
  as attended. Each person's certificate carries their own name plus the team
  name. Delivery goes to the member's own email if the form collected one,
  otherwise to the team leader.
- **D2 — Designs are per event.** No cross-event library. "Start from another
  event's design" copies one.
- **D3 — Fonts: a curated bundled set of 8 families.** No user-uploaded fonts
  and no PDF standard fonts. The editor and the PDF use the same font files.
- **D4 — Full rich text.** Any run of text can have its own font, size,
  bold, italic, underline and colour. Fields are inline chips inside that text
  and can be styled like any other run.
- **D5 — v1 extras, all four:** verification QR + public `/verify/[serial]`;
  downloads (single PDF, ZIP, combined print PDF); per-person re-issue and
  revoke; uploaded recipient lists (CSV/XLSX).
- **D6 — Recipient groups, each with its own design.** An event has an automatic
  **Participants** group plus any number of uploaded groups ("Volunteers",
  "Judges"). A new group's design starts as a copy of the Participants design.
- **D7 — Architecture A: one shared layout engine + `pdf-lib`.** The editor and
  the server renderer consume the same computed layout, so preview and PDF agree
  by construction. Text is vector, PDFs are small and rendering is pure JS on
  Vercel. Rejected alternatives: Fabric.js with browser-side rendering (raster
  PDFs of 2–5 MB, admin tab must stay open, PDFs must be stored), and HTML +
  headless Chromium (≈60 MB binary, cold starts, awkward on Windows dev and in
  tests, against the project's pure-JS choice).
- **D8 — Revoke stays restricted, re-issue does not.** `revoke:certificate`
  remains Faculty Advisor / VP / Tech Head, unchanged. Anyone holding
  `issue:participation_certificate` for the event may **re-issue**, which
  *supersedes* the old serial (shown on verify as "replaced by a newer
  certificate", not "revoked") and is audited.
- **D9 — Ship in three phases**, each independently shippable (§11).

## 1. Page structure

`/admin/events/[id]/certificates` becomes three tabs (query param `?tab=`, so
tabs are linkable and server-rendered):

| Tab | Purpose |
| --- | --- |
| **Design** | Group picker + the editor for that group's design |
| **Recipients** | Every recipient across all groups, status, per-row actions, sheet uploads |
| **Issue** | Bulk issue & email / issue only / downloads / re-issue all |

Gating is unchanged: `requireViewPage("issue:participation_certificate")` +
`canManage(session, CAP, ev.clubId)`, else redirect (as v1). The
`/admin/certificates` hub keeps listing events and gains a per-event issued /
total count across groups.

The editor needs ≥ 1024 px. Below that, the Design tab shows "Open on a laptop
to edit the design". Recipients and Issue stay fully responsive.

## 2. Editor (Design tab)

### 2.1 Layout

```
┌ Group: [Participants ▾] [+ group] │ Template ▲ │ + Text  + Image  + Field ▾  + QR │ ↶ ↷ │ Zoom │ Preview as [▾] │ Save ┐
├─ Layers ───────┬──────────────── canvas (template) ─────────────┬─ Properties ─────────────┤
│ reorder, lock, │ select / drag / resize / snap guides           │ X · Y · W (· H)          │
│ hide, rename   │ double-click text to edit in place             │ element-specific props   │
└────────────────┴────────────────────────────────────────────────┴──────────────────────────┘
```

### 2.2 Elements

| Element | Behaviour |
| --- | --- |
| **Template** (page background) | PNG/JPEG. Sets the page aspect ratio. Replacing it keeps all elements, because positions are percentages. |
| **Image** | PNG/JPEG/SVG/WebP. SVG and WebP are rasterised to PNG in the browser before upload (`pdf-lib` embeds PNG/JPEG only), keeping alpha. Aspect locked on resize; Shift frees it. Props: opacity. |
| **Text** | Rich text (D4). Box props: width, alignment (left/centre/right), line height, **fit** = `wrap` (height grows) or `shrink` (single line, font scales down to fit the width, vertically centred in the box). |
| **Field chip** | Inline inside text, inserted via **+ Field** while editing. Props: all run styles + transform `none` / `Title Case` / `UPPERCASE`. |
| **QR** (phase 3) | Square. Encodes `${NEXT_PUBLIC_SITE_URL}/verify/<serial>`. Props: colour. |

No rotation in v1.

### 2.3 Field catalogue

Built per event and group by `fields.ts`. The **+ Field** menu groups:

| Group | Fields (`key` → label) |
| --- | --- |
| Person | `person.name` Name · `person.roll` Roll / VTU no. · `person.department` Department · `person.year` Year · `person.email` Email · `person.phone` Phone · `person.role` Role (Team leader / Team member / Participant) |
| Team | `team.name` Team name · `team.members` Team members (comma list) · `team.size` Team size |
| Event | `event.title` Event title · `event.date` Event date (IST, `14 September 2026`; a range if multi-day) · `event.venue` Venue · `event.club` Club name |
| Form answers | `form.<fieldId>` one per non-identity, non-layout, non-team field on the event's registration form, labelled with the question |
| Sheet columns | `sheet.<column>` one per column of the group's uploaded sheet (sheet groups only) |
| Certificate | `cert.serial` Serial number · `cert.issueDate` Issue date · `cert.group` Group label |

Team fields are offered only when the event's form has a team block. Person
fields on a sheet group map to that group's Name/Email columns; the others are
empty there. A missing value renders as empty text and is flagged on the
Recipients tab (§3.2).

### 2.4 Interaction

- Click to select, Shift-click to multi-select, drag to move, 8 handles to resize.
- Arrow keys nudge 0.1 %, Shift + arrow 1 %.
- Snap guides to the page centre lines and other elements' edges and centres.
  Alt disables snapping.
- Delete · Ctrl+Z / Ctrl+Y (≥ 50 steps) · Ctrl+D duplicate · layer
  up/down/front/back · lock · hide.
- Double-click a text element to edit in place with TipTap (§6.3). Toolbar:
  font, size, B, I, U, colour, + Field. Esc or click-away ends editing.
- Zoom: fit / 50 / 100 / 200 %.
- **Preview as**:
  - `Field names` (chips show `{Name}`), or any real recipient from any group
    (fields filled).
  - **Download preview PDF** renders that recipient server-side with a
    `PREVIEW` watermark and a placeholder serial.
- Explicit **Save**, with an unsaved-changes indicator and a `beforeunload`
  warning. Save validates server-side (§4.1). Saving a design whose group
  already has issued certificates shows: "N certificates were issued with an
  earlier version. They keep that version. Use Re-issue to send the new one."
- **Start from another event's design**: pick an event the admin can manage and
  a group. This copies its design JSON and assets (assets are copied to new
  paths, so neither event's later edits affect the other).
- **Groups**: `+ group` creates a sheet group whose design is a copy of the
  Participants design. Rename / delete apply to sheet groups only. Deleting keeps
  already-issued certificates valid (snapshot, §5.1).

## 3. Recipients

### 3.1 Sources

**Participants group:** built by `recipients.ts` from `listRegistrations(eventId)`
filtered to `attended = true`, expanded with `listParticipants(entries, schema)`.

| Case | Recipients | `recipient_key` | Delivers to |
| --- | --- | --- | --- |
| Solo event | 1 per registration | `reg:<registrationId>` | registration email |
| Team leader | 1 | `reg:<registrationId>` (same as solo, so v1 rows match) | registration email |
| Team member | 1 each | `reg:<registrationId>:m:<norm(roll) or norm(name)>` (`#2`, `#3`… on a duplicate within the team) | member email if present, else the leader's email |

`norm` = trim, collapse whitespace, lowercase. The field values for a member:
`person.*` from the member row, `team.*` / `form.*` / `event.*` shared with the team.

**Sheet groups:** rows in `certificate_sheet_rows`.
`recipient_key = sheet:<groupId>:<norm(email) or norm(name)>` (+ `#n` on
duplicates), so a re-upload keeps issued people matched to their certificates.

### 3.2 Recipients tab

- One table across all groups with columns **#** · **Name** · **Group** ·
  **Team** · **Email** (own address / "via leader" / "none") · **Status** (Not
  issued / Issued · serial · date / Superseded / Revoked) · **Warnings** · **Actions**.
- Warnings, computed with the group's current design and layout:
  - `Department empty` for each design field whose value is empty for that person.
  - `Name too long for its box` when a `shrink` box hits the minimum scale
    (0.4) and still overflows, or a `wrap` box runs off the page.
  - `Characters this font can't print: …` when a value has glyphs the chosen face lacks.
- Search (name, roll, email, team) · filter by group and status.
- Row actions:
  - **Preview**: PDF, watermarked if not issued.
  - **Download**: issued certificate only.
  - **Re-issue & email** / **Re-issue**: when there is no delivery address.
  - **Revoke**: shown only with `revoke:certificate`.

### 3.3 Sheet upload

- The admin clicks **Upload sheet** on a sheet group and picks a file.
  - `.csv` is parsed by `sheet.ts`: RFC 4180 quotes, BOM stripped, delimiter
    auto-detected from `,` `;` `\t`.
  - `.xlsx` is read in the browser with `read-excel-file` (first sheet) into
    the same `string[][]`.
- Header detection: the Name column matches `/name/i` (not `/team|club|event/`).
  The Email column matches `/e-?mail/i`. Both can be changed in a confirm step
  that previews the first 5 rows.
- Limits (validated client **and** server):
  - ≤ 1,000 rows · ≤ 30 columns · header ≤ 80 chars · cell ≤ 500 chars ·
    payload ≤ 900 KB (under the 1 MB action limit).
  - Rows without a name are dropped (count shown).
  - Invalid emails become `null` (count shown).
- A re-upload replaces the group's rows atomically via the RPC
  `replace_certificate_sheet_rows(p_group_id, p_rows jsonb)` (§4). A failed
  insert can never leave the group empty. Already-issued certificates are
  unaffected.
- Sheet groups are a deliberate override of "participation issues only to
  `attended = true`" (SECURITY_SPEC §9 already allows a logged override). Each
  upload writes an audit row, and each issue run's audit row records
  `source: "sheet"` and the group name.

## 4. Data model

One additive migration, e.g. `20260914000000_certificate_designer.sql`,
**applied through the Supabase MCP `apply_migration` tool** (never
`supabase db push`, see STATUS.md). Then hand-patch `database.types.ts`.

```sql
create type certificate_group_kind as enum ('participants', 'sheet');

create table public.certificate_groups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  kind        certificate_group_kind not null,
  name        text not null check (char_length(name) between 1 and 60),
  design      jsonb not null,              -- working copy (validated in app, §4.1)
  sheet_columns text[] not null default '{}',
  sort        int not null default 0,
  created_by  uuid references public.admin_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index certificate_groups_one_participants
  on public.certificate_groups (event_id) where kind = 'participants';

create table public.certificate_design_versions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.certificate_groups(id) on delete set null,
  hash       text not null,                -- sha256 of canonical design JSON
  design     jsonb not null,               -- immutable
  created_at timestamptz not null default now(),
  unique (group_id, hash)
);

create table public.certificate_sheet_rows (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.certificate_groups(id) on delete cascade,
  row_no    int not null,
  name      text not null,
  email     text,
  data      jsonb not null default '{}'   -- column -> value
);
create index on public.certificate_sheet_rows (group_id);

alter table public.certificates
  add column group_id          uuid references public.certificate_groups(id) on delete set null,
  add column design_version_id uuid references public.certificate_design_versions(id),
  add column recipient_key     text,
  add column recipient_name    text,
  add column recipient_email   text,
  add column snapshot          jsonb,      -- { values: {fieldKey: string}, groupLabel }
  add column superseded_by     uuid references public.certificates(id);

-- Backfill v1 rows (all are participation certs tied to a registration).
update public.certificates c
   set recipient_key   = 'reg:' || c.registration_id,
       recipient_name  = r.student_name,
       recipient_email = r.email,
       snapshot        = jsonb_build_object(
                           'values', jsonb_build_object('person.name', coalesce(r.student_name, '')),
                           'groupLabel', 'Participation')
  from public.registrations r
 where r.id = c.registration_id and c.recipient_key is null;

-- At most one live certificate per recipient per event (race-safe issuing).
create unique index certificates_one_live_per_recipient
  on public.certificates (event_id, recipient_key)
  where revoked_at is null and recipient_key is not null;

-- Same lockdown as certificates (20260820120005_rls.sql).
alter table public.certificate_groups          enable row level security;
alter table public.certificate_design_versions enable row level security;
alter table public.certificate_sheet_rows      enable row level security;
revoke all on public.certificate_groups, public.certificate_design_versions,
              public.certificate_sheet_rows from anon, authenticated;

-- Atomic helpers (security definer; execute revoked from anon/authenticated,
-- granted to service_role only — same pattern as register_for_event).
--   replace_certificate_sheet_rows(p_group_id uuid, p_rows jsonb)
--       delete the group's rows + insert the new ones, one transaction.
--   supersede_certificate(p_old_id uuid, p_new jsonb) returns uuid
--       update old: revoked_at = now(), revoked_reason = 'superseded';
--       insert new (from p_new) returning id; update old: superseded_by = new id.
--   undo_supersede(p_new_id uuid)
--       delete new; restore old: revoked_at/revoked_reason/superseded_by = null.

-- Private bucket for design assets (logos, signatures, templates from v2 on).
insert into storage.buckets (id, name, public)
values ('certificate-assets', 'certificate-assets', false)
on conflict (id) do nothing;
```

Before applying, verify the backfill's precondition against the live DB: every
existing `certificates` row has a non-null `registration_id` and no two live
rows share one.

### 4.1 Design JSON (`design.ts`)

```ts
type Pct = number;                          // 0–100, % of page width (x, w) or height (y, h)
interface Design {
  v: 1;
  page: { template: AssetRef | null; widthPx: number; heightPx: number };
  elements: Element[];                      // array order = z-order (first = bottom)
}
interface AssetRef { bucket: "certificate-assets" | "certificate-templates"; path: string;
                     type: "png" | "jpg"; widthPx: number; heightPx: number }
interface Base { id: string; name: string; x: Pct; y: Pct; w: Pct; h: Pct;
                 locked: boolean; hidden: boolean }
type Element =
  | (Base & { type: "image"; asset: AssetRef; opacity: number })
  | (Base & { type: "text"; align: "left" | "center" | "right"; lineHeight: number;
              fit: "wrap" | "shrink"; paragraphs: Paragraph[] })
  | (Base & { type: "qr"; color: Hex });
interface Paragraph { runs: Run[] }
type Run =
  | { kind: "text"; text: string; style: Style }
  | { kind: "field"; field: FieldKey; transform: "none" | "title" | "upper"; style: Style };
interface Style { font: FontFamilyId; sizePct: number /* % of page height */;
                  bold: boolean; italic: boolean; underline: boolean; color: Hex }
```

Zod validation caps: ≤ 60 elements · ≤ 2,000 characters of text per element ·
≤ 200 runs per element · `sizePct` 0.5–30 · `lineHeight` 0.8–3 · asset paths
must match `^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg)$` in an allowed bucket ·
`bold`/`italic` rejected when the family lacks that face · unknown field keys
rejected, except `form.*` / `sheet.*` whose suffix is validated against the
event's form or the group's columns at save time.

**v1 conversion (`designFromLegacyConfig`):** template from
`events.certificate_template` (bucket `certificate-templates`) plus one `text`
element: `fit: "shrink"`, width 60 %, centred on (`nameXPct`, `nameYPct`) per
`align`, one field run `person.name`, font Playfair Display bold (closest
available to Times-Bold), `sizePct = fontPct`, colour as stored.

## 5. Issuing, delivery, re-issue, revoke

### 5.1 Snapshots and versions

At the start of any issue for a group:
1. Canonicalise the group's `design`, hash it (sha256), then
   `insert … on conflict (group_id, hash) do nothing` into
   `certificate_design_versions` and read the id.
2. Each certificate row stores `design_version_id` and a `snapshot` of every
   resolved field value plus `groupLabel`. `cert.serial` and `cert.issueDate`
   are fixed at insert. `groupLabel` is `"Participation"` for the Participants
   group, otherwise the sheet group's name ("Volunteers").

Any later download of an issued certificate renders from
`(design version, snapshot)`. It shows **the same design version and the same
values** as the original, whatever happened to the registration or the working
design since. The file is not byte-identical, since PDF metadata differs. Assets
referenced by any version are never deleted (v1 rule: design assets are never
garbage-collected).

**Exception: certificates issued by v1.** They were drawn by the old renderer
(Times-Bold, 1 px = 1 pt), and their re-download uses the converted design
(§4.1). That is a close likeness, not the exact file that was emailed.

### 5.2 Issue & email (bulk)

- The client loops a server action, one batch per call, behind a progress bar
  with a **Stop** button. Closing the tab just stops; the next click resumes.
- Batch selection: **pending** recipients across the chosen groups. Pending
  means all three: no live certificate for the `recipient_key`; the latest
  certificate, if any, is not a standalone revoke (`revoked_reason <> 'superseded'`);
  and the recipient has a delivery address. They are grouped by
  **destination address**. Whole destination groups are taken until ≥ 40
  recipients, so a leader's team is never split across batches.
- For each destination:
  1. **Reserve** one row per recipient: insert with a fresh serial + hmac.
     - `23505` on the serial → retry (≤ 3).
     - `23505` on `certificates_one_live_per_recipient` → someone else already
       issued it; skip that recipient.
  2. **Render** each PDF (§6.5).
  3. **Send one email** with all that destination's PDFs attached. If the
     attachments total > 20 MB, split into consecutive emails and treat each as
     its own unit for steps 1–4.
  4. On send failure, **delete every row reserved for that email** (at-most-once, as v1).
- Email copy:
  - The existing `participation_certificate` template for a single self-addressed PDF.
  - For a leader receiving others' PDFs: subject `Certificates — <event> (<n>)`
    and a body listing each attached name.
  - Attachment filename `Certificate - <recipient name> - <event>.pdf`, with
    unsafe characters stripped, ≤ 120 chars.
- One audit row per batch: `action: "issue"`, `entity: "certificate"`,
  `entityId: eventId`, `after: { sent, failed, skipped, groups, sources }`.

**Issue only (no email):** same selection over recipients **with or without** a
delivery address. Reserve rows only, no render or send. For download/print use.

### 5.3 Re-issue (per row, and "Re-issue all with latest design")

Requires `issue:participation_certificate` on the event (D8).

1. `supersede_certificate(old_id, new_row)` (§4), one transaction:
   - retire the old row (`revoked_at`, `revoked_reason = 'superseded'`)
   - insert the new row for the same `recipient_key` with current data and design
   - link `superseded_by`

   The order matters: the unique index covers live rows, so the old row must
   stop being live before the new one is inserted.
2. If there's a delivery address, render and email the new PDF. On send failure,
   call `undo_supersede(new_id)`: the new row is deleted and the old row is live
   again, unchanged.

**Re-issue all** runs the same thing for every live certificate in the chosen
groups, in batches, behind a confirm dialog stating the count.

### 5.4 Revoke

Requires `revoke:certificate`. A reason is required (≤ 200 chars, internal
only). Sets `revoked_at`, `revoked_reason`. Audited with the reason. Bulk issue
skips any recipient whose latest certificate is revoked-not-superseded, so a
revocation sticks. **Re-issue** is the explicit way back.

### 5.5 Downloads

All are admin route handlers with the same capability + club-scope guard as the
actions, following the ESLint admin-route-guard rule. `Cache-Control: no-store`.

| Route | Output |
| --- | --- |
| `GET /api/admin/certificates/[certId]/pdf` | One issued certificate, rendered from its snapshot |
| `GET /api/admin/events/[id]/certificates/preview?group=&recipient=` | Watermarked `PREVIEW`, placeholder serial `CSE-PREVIEW` |
| `GET /api/admin/events/[id]/certificates/print?group=` | One multi-page PDF of every live certificate in the group. Template and images embedded **once** and shared by all pages. Streamed. |

**ZIP:** built **in the browser** with `fflate`. It fetches each certificate PDF
sequentially with a progress bar, which keeps every server response to a single
certificate and away from Vercel response-size limits.

## 6. Engine

### 6.1 Fonts (`src/lib/certificates/fonts.ts`, `public/fonts/cert/`)

Static (non-variable) TTF instances, all SIL OFL, licence files committed
alongside:

| Family id | Faces | Character |
| --- | --- | --- |
| `playfair` Playfair Display | R B I BI | formal serif |
| `cormorant` Cormorant Garamond | R B I BI | classic serif |
| `lora` Lora | R B I BI | readable serif |
| `cinzel` Cinzel | R B | engraved capitals |
| `montserrat` Montserrat | R B I BI | geometric sans |
| `poppins` Poppins | R B I BI | friendly sans |
| `greatvibes` Great Vibes | R | script (names) |
| `pinyon` Pinyon Script | R | formal script |

- B/I toggles are disabled for faces a family lacks. No synthetic bold or italic.
- The browser loads faces via `@font-face` from `/fonts/cert/*.ttf`, only on the
  editor page.
- The server reads the same files via `fs` from `process.cwd()/public/fonts/cert`.
  Add `outputFileTracingIncludes` for the certificate routes/actions in
  `next.config.ts` (check the key against the Next 16 docs in `node_modules` at
  implementation time) and confirm in a Vercel preview that a render finds the files.

### 6.2 Metrics + layout (`metrics/*.json`, `layout.ts`) — pure, shared

- `scripts/build-font-metrics.mjs` (uses `@pdf-lib/fontkit`) writes one JSON per
  face with:
  - `unitsPerEm`, `ascender`, `descender`, `underlinePosition`, `underlineThickness`
  - `advance[codepoint]` for U+0020–U+024F, U+2000–U+206F and U+20B9 (₹)
  - the set of covered codepoints

  Committed. **A unit test asserts, for every face and a sample string, that
  `layout.ts` widths equal `pdf-lib`'s `widthOfTextAtSize` for the same font
  embedded with features off.** This stops the two sides drifting.
- Ligatures, contextual alternates and kerning are **off on both sides**:
  - PDF: `embedFont(bytes, { subset, features: { liga: false, clig: false, calt: false, kern: false } })`
  - browser: `font-kerning: none; font-feature-settings: "liga" 0, "clig" 0, "calt" 0, "kern" 0`
- `layoutText(el, values, pageW, pageH)`:
  1. Resolve field runs to text (apply transform). Drop glyphs the face doesn't
     cover and record them as `missingGlyphs`.
  2. Split runs into words at spaces (spaces belong to the preceding word).
     Paragraph = hard break.
  3. Greedy line fill against box width. A single word wider than the box
     breaks by character.
  4. Per line: `ascent = max(run size × ascender/unitsPerEm)`, similarly
     descent. Line box = `max run size × lineHeight`. All runs share one baseline.
  5. Alignment ignores trailing spaces.
  6. `fit: "shrink"`: lay out on one line. If wider than the box, scale every
     run size by `boxW / naturalW`, clamped at 0.4. If still too wide, set
     `overflow`. The line is vertically centred in the box height.
  7. `fit: "wrap"`: element height = laid-out height. Set `overflow` if the
     bottom passes the page.
  8. Output: `{ lines: { baselineY, runs: { x, text, face, size, color, underline }[] }[], height, overflow, missingGlyphs }`
     in **page pixels**.

### 6.3 Editor client

- Canvas = a page-sized container scaled with CSS `transform: scale()`. Elements
  are absolutely positioned. Text elements render `layoutText` output as one
  absolutely positioned `<span>` per run with `white-space: pre`. The browser
  never wraps.
- Drag, resize, snap, selection and undo are our own code, in a reducer over
  `Design` with an undo stack of design snapshots.
- In-place text editing uses **TipTap** (`@tiptap/react`, `@tiptap/pm`,
  extensions: document, paragraph, text, hard-break, bold, italic, underline,
  text-style, color, font-family, history) plus a custom inline atom node
  `certField`.
  - While editing, the box shows TipTap with the same fonts and feature
    settings. On exit, the engine layout replaces it.
  - A line can re-wrap slightly at that moment (accepted cost of D7).
  - TipTap document ⇄ `Paragraph[]` conversion is a pure, tested function.
  - Loaded with `next/dynamic` on this page only.
- Image upload preprocessing in the browser (canvas):
  - SVG/WebP → PNG.
  - Templates larger than 3508×2480 (A4 at 300 dpi) are scaled down.
  - PNGs without transparency over 3 MB are re-encoded as JPEG q 0.92.

### 6.4 Uploads (no action body limit)

1. Action `createCertificateUploadAction({ eventId, kind: "template" | "image", contentType, size })`
   validates the capability, type (png/jpeg after preprocessing) and size
   (≤ 8 MB). It returns `createSignedUploadUrl` for
   `certificate-assets/<eventId>/<uuid>.<ext>`.
2. The browser uploads directly to Storage.
3. The design references the path. Save re-validates that the object exists,
   and checks its size and magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`) via
   a service-role download of the first bytes.

The editor displays private assets through short-lived signed URLs (1 hour,
refreshed on page load). This fixes the v1 1 MB bug.

### 6.5 Render (`render.ts`, server-only)

- `renderCertificates({ design, pages: { values }[] , watermark? }) → Uint8Array`,
  producing one PDF with N pages.
- **Page size:** the long edge is 842 pt (A4), keeping the template aspect.
  This fixes v1's 1 px = 1 pt, which gave oversized pages. All coordinates
  scale from %.
- Template and each image are embedded once per document (cache by asset path).
  Faces are embedded once per document, `subset: true`.
  - **Risk:** `pdf-lib` subsetting mis-renders some fonts. The render test emits
    a specimen PDF per face for a one-time visual check. Any face that fails
    gets `subset: false` in `fonts.ts`.
- Text: `page.drawText(run.text, { x, y: pageH − baselineY, size, font, color })`
  after converting px → pt. Underline via `drawLine` from the metrics.
- QR: `qrcode`'s `QRCode.create(url, { errorCorrectionLevel: "M" })` module
  matrix, drawn as vector rectangles (horizontal runs merged) with a
  4-module quiet zone inside the element box.
- Watermark: a diagonal `PREVIEW` at 12 % opacity.

## 7. Verification (phase 3)

- New serials: **128 random bits** (SECURITY_SPEC §9) as Crockford base32,
  grouped: `CSE-2026-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX`. `newCertificateSerial`
  changes; v1's short serials stay valid.
- `hmac` keeps being written as today (`certificateHmac`). The verify page
  **does not depend on it** (lookup by unguessable serial; DB writes are
  service-role only), so rotating `NEXTAUTH_SECRET` can't invalidate
  certificates. Moving the HMAC to `CERT_HMAC_SECRET` is left as a follow-up
  that needs the owner to set that env var in Vercel.
- `/verify/[serial]`: public, `robots: noindex`, rate-limited per IP via
  `rateLimit()` (20 requests/min per IP), **timing-uniform** (same service-role query path
  and a fixed minimum response delay for hit/miss).

| State | Shows |
| --- | --- |
| Valid | ✓ Valid · name · event title · club · event date · group label ("Participation", "Volunteer") · issue date |
| Superseded | "Replaced by a newer certificate" · event · issue date (no name) |
| Revoked | "Revoked" · event · revoked date (no name, no reason) |
| Unknown | "Not a valid certificate" |

Never email, roll, phone, team members or the revoke reason.
- A manual lookup box on `/verify` (type a serial) uses the same route.

## 8. Security summary

- **Capability and scope:**
  - Every action and route requires `issue:participation_certificate` +
    `canManage(…, ev.clubId)`.
  - Revoke additionally requires `revoke:certificate`.
  - "Start from another event" requires manage rights on **both** events.
- **Tables:** new tables are RLS-on with no anon/authenticated grants. All access
  is through the service role in server code.
- **Uploads:**
  - Signed upload URLs are scoped to one path.
  - Type, size and magic bytes are verified server-side on save.
  - SVG is never stored (rasterised client-side), so no SVG script vector.
- **Sheets:** row, column, cell and payload caps. Values are only ever rendered
  as PDF text or React text, never HTML.
- **File names:** ZIP and attachment names are sanitised.
- **Audit:** design save (element count, template replaced), group
  create/rename/delete, sheet upload (row count), issue batch, re-issue
  (old → new serial), revoke (with reason).

## 9. Error handling

| Situation | Behaviour |
| --- | --- |
| Issue with no template | Issue buttons disabled; "Add a template in Design first" |
| Font file missing on server | Render throws. The batch counts it failed and rolls back reservations; the audit row records `renderError`. |
| Asset missing from Storage | Same as above, error names the element |
| Concurrent issue by two admins | Unique index → the second skips that recipient (`skipped` count) |
| Send failure | Rows for that email deleted; retried next run |
| Design save with invalid JSON | Rejected with the first validation message; the client keeps unsaved state |
| Sheet over limits | Rejected client-side before upload; server re-checks |
| Legacy event opened for the first time | `ensureCertificateGroups(eventId)` idempotently creates the Participants group from the v1 config (or an empty design), and attaches v1 rows (`group_id is null and recipient_key like 'reg:%'`) to it plus a design version built from the conversion |

## 10. Testing

Unit (vitest, pure):
- `layout.test.ts`:
  - greedy wrap, long-word break, mixed sizes sharing a baseline, alignment
    ignoring trailing spaces
  - shrink scale and clamp/overflow, wrap overflow off-page, missing glyphs
  - **metrics == pdf-lib widths for every face**
- `design.test.ts`: validation caps, face-availability rejection, legacy config
  conversion.
- `fields.test.ts`: catalogue per form (solo/team/custom answers/sheet), value
  resolution for leader/member/sheet, transforms (`asha r` → `Asha R`), IST date
  formatting incl. multi-day.
- `recipients.test.ts`:
  - keys incl. duplicate suffixes, and v1 key compatibility
  - member → leader email fallback
  - destination grouping, and batch cutting at destination boundaries
  - the 20 MB split
- `sheet.test.ts`: CSV quoting/BOM/delimiters, header detection, caps,
  dropped/invalid counts.
- `tiptap-doc.test.ts`: TipTap JSON ⇄ `Paragraph[]` round-trip.
- `serial.test.ts`: 128-bit format.

Render (vitest, node): multi-page PDF with template + image + rich text + QR;
page count; shared image object count = 1; per-face specimen PDF written to a
temp dir for the one-time visual subset check.

Gate: `npm run typecheck`, `lint`, `test`, `build` all green per phase.

**Owed human walkthrough** (uploads, the editor and real sends can't be curled),
listed in STATUS.md per phase:
1. Build a design with a logo, signature and rich paragraph.
2. Preview as a team member.
3. Download the preview.
4. Issue & email to yourself.
5. Re-issue after a name fix.
6. ZIP.
7. Scan the QR.

## 11. Phases

| Phase | Ships | Migration |
| --- | --- | --- |
| **1. Designer** | Tabs; groups table (Participants only in UI); editor (template, image, rich text, fields incl. form answers); fonts + metrics + layout; signed uploads; design versions + snapshots; Issue & email + Issue only for **registrations** (solo + leaders); preview PDF; v1 conversion | Full migration from §4 (applied once) |
| **2. Recipients & delivery** | Team-member recipients + leader routing; sheet groups + upload; Recipients tab with warnings; single / print / ZIP downloads; re-issue (row + all); revoke | none |
| **3. Verification** | QR element; 128-bit serials; `/verify/[serial]` + lookup box | none |

Each phase merges to `main` on its own with the gate green, and STATUS.md is
updated with the owed walkthrough.

## 12. Out of scope

- Winner certificates. Reuse this engine later: a new group kind fed by
  `results`, gated on `issue:winner_certificate`.
- Student self-service download (`/events/:id/certificate` in BUILD_PLAN).
- Cross-event design library.
- User-uploaded fonts.
- Element rotation.
- Storing PDFs (`download_path` stays unused; downloads render on demand).
- Moving the HMAC to `CERT_HMAC_SECRET`.

## 13. New dependencies

`@pdf-lib/fontkit` (server render + metrics script) · `@tiptap/react`,
`@tiptap/pm` + the listed extensions (editor page only, dynamic import) ·
`read-excel-file` (browser) · `fflate` (browser ZIP). After adding them, run
`npm install --package-lock-only` if the lock drifts (Vercel `npm ci` gotcha).
