# Certificate base templates + winner certificates — design

**Status:** approved in chat 2026-09-15. Not implemented.
**Branch:** `feat/certificate-bases` (from `main @ ef862c6`).
**Builds on:** `2026-09-14-certificate-designer-design.md` (the "designer spec"). Section
numbers like "designer §5.1" refer to it.

## Goal

The owner asked for:

> a base template for every event for participants, volunteers and winners and i
> can also do custom

and, refining the flow:

> when i open the certificates it should directly show the certificate — just give
> an option so that i will save it as the base, so we can directly use it … when i
> need i will go to customization … a button so that i can save the base template
> and volunteer and winners easily and reuse it every time

Today every event starts from a blank design. The only reuse is "Start from another
event's design", a one-off copy (designer D2 ruled out a cross-event library).
Winner certificates were out of scope (designer §12). This design adds both.

**Live data, 2026-09-15 (`jisahccdnthzgibszwnq`):** 1 `certificate_groups` row
(Participants, empty design), **0 certificates**, 1 event with published results.
Nothing to migrate or protect.

## Recorded decisions

- **D1 — Council-wide bases, exactly three:** Participants, Volunteers, Winners.
  No per-club sets, no extra named bases.
- **D2 — An event follows a base until it is customised.** A following group has no
  design of its own and uses the base live, so a base edit reaches it. Saving an
  event-level design makes it custom; **Reset to base** makes it follow again.
  Issued certificates never change (designer §5.1 version + snapshot).
- **D3 — Architecture A: a pointer, with a copy only when customised.** Rejected: B,
  a copy on every event rewritten on each base save (one save becomes an N-row
  fan-out that races event edits, with two sources of truth); C, bases stored as a
  hidden "template event" (leaks into every events query).
- **D4 — Opening a group shows the certificate directly.** Following groups open in
  a read-only preview with a **Customise** button, not in the editor.
- **D5 — Bases are made from inside an event.** The editor has **Save as base**,
  which saves to one or more of the three bases. There is no separate
  base-template page.
- **D6 — A base may only use fields every event has:** `person.*`, `team.*`,
  `event.*`, `cert.*`, plus `winner.*` in the Winners base only. Form answers
  (`form.*`) and sheet columns (`sheet.*`) are event-specific and block the save.
- **D7 — Only council-wide admins save bases:** `canManage(session, cap, null)`,
  which is true only for an `"all"` grant. Club heads can customise and reset on
  their own events.
- **D8 — After Save as base, the source group follows the base.** Its design is now
  the base.
- **D9 — Winners come from results, or from an uploaded list.** Each Winners group
  stores its source explicitly. A results source uses ranks 1–3 of the event's
  highest-`sort` round with published results, ties included, the same rule the
  achievements board uses.
- **D10 — "Custom" means per event only.** Any of the three groups can be customised.
  Extra groups (Judges, "Best UI award") stay as they are today: an uploaded list and
  always custom.
- **D11 — Two phases.** Phase 1: bases (Participants + Volunteers). Phase 2: Winners.
  The one migration ships in phase 1.
- **D12 — Volunteers are typed in by hand** (owner, 2026-09-15: "name email rollno
  and it will add its event as usually"). Any list group (Volunteers, Judges…) gets
  an inline table to add, edit and remove people: **name** (required), **email** and
  **roll no.** (optional). Event fields fill in as for everyone else. The CSV/Excel
  upload stays for long lists and fills the same rows. Roll no. becomes a real row
  column so `{Roll / VTU no.}` prints on list groups. A base can't use sheet columns
  (D6), so without this a Volunteers base could never print a roll number.

## 1. The event's Design tab

### 1.1 Groups

Every event has three fixed groups, created idempotently on first visit
(`ensureBaseGroups`, replacing `ensureParticipantsGroup`). Extra groups follow them:

| Group | People come from (`kind`) | Follows base (`base_kind`) | Rename / delete |
| --- | --- | --- | --- |
| Participants | `participants`: attendees + team members (unchanged) | `participants` | no |
| Volunteers | `sheet`: uploaded list (unchanged) | `volunteers` | no |
| Winners (phase 2) | `results` or `sheet` (§4) | `winners` | no |
| Extra, e.g. Judges | `sheet` | none, always custom | yes |

Group chips show the design state:

```
Group: [Participants · 42 ● Base] [Volunteers · 0 ● Base] [Winners · 4 ◆ Custom] [Judges · 3 ◆ Custom] [+ Group]
```

A new extra group starts from the Participants group's **effective** design (§3), as
`createSheetGroup` does today.

### 1.2 A group that follows a base: preview first

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ● Council base · saved from Hackathon 2026, 12 Sep          [ Customise ] │
├──────────────────────────────────────────────────────────────────────────┤
│              ( the certificate, filled with a real person )              │
│  Preview as [ Asha R ▾ ]                          [ Download preview PDF ] │
└──────────────────────────────────────────────────────────────────────────┘
```

- The preview is the editor canvas in a **read-only** mode: the same layout engine,
  with no selection, handles or toolbar. "Preview as" and the preview PDF work as
  they do today.
- "saved from <event>, <date>" comes from `certificate_bases.source_event_id` and
  `updated_at`. If that event was deleted, the line reads "Council base · saved 12 Sep".
- **Customise** mounts the full editor on the effective design, client-side only.
  Nothing is written until a save. Leaving without saving changes nothing.
- **No base saved yet** (true for all three today): the group opens **directly in
  the editor** on an empty design, with the banner "No council base yet". Council
  admins can press Save as base from there.
- Issue buttons are disabled when the effective design has no template, as today
  (designer §9).

### 1.3 The editor's save controls

```
… │ ↶ ↷ │ Zoom │ Preview as [▾] │ [ Save for this event ] [ Save as base ▾ ] │ [ Reset to base ]
                                                          ├ ☑ Participants base
                                                          ├ ☐ Volunteers base
                                                          └ ☐ Winners base      (phase 2)
```

- **Save for this event:** the existing `saveCertificateDesignAction`. On a group that
  was following, this makes it custom.
- **Save as base ▾** (§5): shown only to council-wide admins (D7). The current group's
  base is ticked by default. On an extra group (no base), nothing is ticked and the
  admin picks. A base is offered only if the admin may save it. It opens a confirm
  showing the impact, then saves. Save as base writes **only the bases**. If the
  current group's own base was ticked, the group now follows it (D8). If not, the
  group's edits are still unsaved and the indicator stays until Save for this event.
- While customising a following group that has not been saved yet, the button in
  **Reset to base**'s place reads **Cancel** and returns to the preview. Nothing was
  written, so it only asks first ("Discard your changes?") when there are unsaved
  edits. **Reset to base** appears only when that base exists.
- **Reset to base:** shown on a custom group that has a `base_kind`. The confirm says:
  "This group's custom design will be discarded. Certificates already issued keep the
  design they were issued with." It sets `design = null`.
- Existing behaviours stay: unsaved-changes indicator, `beforeunload`, and the "N
  certificates were issued with an earlier version" note on save.

### 1.4 Typing a list (Volunteers and any other list group) — D12

Shown under the group bar on every `sheet` group, on the Design tab as today's upload is:

```
Volunteers · 3                                              [ Upload list ]
┌───┬──────────────┬───────────────────────┬──────────┬────────────────┐
│ # │ Name         │ Email                 │ Roll no. │                │
├───┼──────────────┼───────────────────────┼──────────┼────────────────┤
│ 1 │ Asha R       │ asha@veltech.edu.in   │ VTU27001 │ Edit · Remove  │
│ 2 │ Karthik S    │ —                     │ VTU27044 │ Edit · Remove  │
└───┴──────────────┴───────────────────────┴──────────┴────────────────┘
[ Name*        ] [ Email        ] [ Roll no.   ]  [ + Add ]
```

- Uses the `.tablewrap.cards` pattern, so it reads as cards on a phone.
- **Add** appends a row (`row_no` = max + 1). **Edit** turns the row into inputs,
  with Save and Cancel. **Remove** asks for confirmation; certificates already
  issued to that person stay valid.
- Validation is shared by the browser and the action (`validateListRow` in
  `sheet.ts`): name 1–500 chars, required. Email is optional, but if given it must
  look like an email, so a typo is **rejected** with "That email doesn't look
  right", not silently dropped as an upload does. Roll is optional, ≤ 500 chars.
  The group is capped at 1,000 rows (`SHEET_LIMITS.rows`).
- **Once issued, identity is locked.** A person is keyed by email, or by name when
  there is no email (`sheetKey`). An edit that would change that identity is refused
  when a live certificate exists for the old one: *"Asha R already has a certificate,
  so their name and email can't change here. Ask a Faculty Advisor, VP or Tech Head
  to revoke it first."* Without this, fixing a typo would quietly give one person two
  live certificates. Other edits (roll no.) are allowed and show up as outdated.
- The upload's column confirm gains a **Roll no. column** (auto-detected by
  `/roll|vtu|usn|reg(istration)?\.?\s*no/i`). The upload still **replaces** the whole
  list, and the confirm now says so with the count: *"This replaces the 3 people
  already in Volunteers."*
- Every add, edit and remove is audited (`entity: "certificate_sheet_row"`).

## 2. Data model

One additive migration, `20260915000000_certificate_bases.sql`, **applied through the
Supabase MCP `apply_migration` tool** (never `supabase db push`, see STATUS.md). Then
hand-patch `database.types.ts`.

```sql
create type public.certificate_base_kind as enum ('participants', 'volunteers', 'winners');

-- Winners can come from results (phase 2). Not used in this migration, so the
-- ADD VALUE commit rule does not bite.
alter type public.certificate_group_kind add value if not exists 'results';

create table public.certificate_bases (
  kind            public.certificate_base_kind primary key,
  design          jsonb not null,                -- validated in app with the base context (D6)
  source_event_id uuid references public.events(id) on delete set null,
  updated_by      uuid references public.admin_users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.certificate_bases enable row level security;
revoke all on public.certificate_bases from anon, authenticated;

alter table public.certificate_groups
  add column base_kind public.certificate_base_kind,
  add column position_column text,               -- winners from an uploaded list (phase 2, §4.1)
  alter column design drop not null;             -- null = follows its base
alter table public.certificate_groups
  add constraint certificate_groups_design_or_base
  check (design is not null or base_kind is not null);

create unique index certificate_groups_one_per_base
  on public.certificate_groups (event_id, base_kind) where base_kind is not null;

-- Existing Participants groups get a base slot. One with no template and nothing
-- issued starts following; one with a real design stays custom.
update public.certificate_groups set base_kind = 'participants' where kind = 'participants';
update public.certificate_groups g
   set design = null
 where g.kind = 'participants'
   and coalesce(g.design->'page'->'template', 'null'::jsonb) = 'null'::jsonb
   and not exists (select 1 from public.certificates c where c.group_id = g.id);
```

-- Typed volunteers (D12): roll no. as a real column, and the upload RPC writes it.
alter table public.certificate_sheet_rows add column roll text;

create or replace function public.replace_certificate_sheet_rows(p_group_id uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  delete from public.certificate_sheet_rows where group_id = p_group_id;
  insert into public.certificate_sheet_rows (group_id, row_no, name, email, roll, data)
  select p_group_id, (r->>'row_no')::int, r->>'name', nullif(r->>'email', ''),
         nullif(r->>'roll', ''), coalesce(r->'data', '{}'::jsonb)
    from jsonb_array_elements(p_rows) as r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
-- create or replace keeps the existing grants; re-assert them anyway.
revoke execute on function public.replace_certificate_sheet_rows(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.replace_certificate_sheet_rows(uuid, jsonb) to service_role;

Before applying, re-run the live check above. The fresh-project security trap
(STATUS.md) applies: confirm afterwards that `anon` and `authenticated` hold **no**
privileges on `certificate_bases`.

`certificate_design_versions` is unchanged. Versions stay keyed by
`(group_id, hash)` of the design the group **used** at issue time, so a base edit
produces a new version on that event's next issue.

## 3. Effective design

A single pure resolver in `src/lib/certificates/bases.ts`:

```ts
type BaseKind = "participants" | "volunteers" | "winners";
interface BaseDesign { kind: BaseKind; design: Design; sourceEventTitle: string | null; updatedAt: string }

effectiveDesign(group: { customDesign: Design | null; baseKind: BaseKind | null },
                bases: Map<BaseKind, BaseDesign>): Design
// customDesign ?? bases.get(baseKind)?.design ?? emptyDesign()
```

`CertificateGroup` gains `baseKind`, `customDesign` and `followsBase`. **`design`
keeps its name and now holds the effective design**, so `issueBatch`,
`reissueOutdatedBatch`, `reissueForRecipient`, `listOutdatedRecipients`, the preview
and print routes, and `designProblem` all keep reading `group.design` and are correct
without edits. `toGroup` takes the bases map. `getGroup` and `listGroups` load the
bases (≤ 3 rows) once per call.

Places that must use the **custom** design instead:
- `listDesignSources` (copy from another event) lists only groups with a custom
  design, since a following group is just the base.
- `saveCertificateDesignAction` passes the **effective** design as `previous` to
  `verifyNewAssets`, so base assets count as known when a following group is saved
  for this event. Without that, they would be rejected as "doesn't belong to this
  event", because they live outside `<eventId>/`.
- `renameGroup` / `deleteSheetGroup` filter on `base_kind is null` instead of
  `kind = 'sheet'`, so Volunteers and Winners can't be renamed or deleted.

## 4. Winners (phase 2)

### 4.1 Source

A Winners group's `kind` is its source: `results` (default) or `sheet`.

- **Results.** Round = the highest-`sort` round with at least one published result
  (factor the achievements-board rule into a shared pure `podiumRound`). People =
  `podiumOf(round.results)`, so ranks 1–3 with ties (`1, 2, 3, 3`).
  - No published results: the empty state reads "No published results yet —
    publish results, or [Use an uploaded list instead]".
- **Uploaded list.** The same sheet upload as Volunteers, plus an optional
  **Position** column detected by `/position|rank|place|prize/i` in the header
  confirm step. The confirmed header is stored in `certificate_groups.position_column`
  (the value stays in each row's `data`), so a re-upload with the same header keeps
  working without asking again.
- **Switching source** is refused while the group has any live certificate: "N
  winner certificates were issued from results. Revoke them before switching." The
  two sources key people differently (§4.2), so switching with live certificates
  would give one person two live winner certificates.

### 4.2 Recipients

Read with the service role (admin only). For each podium result row:

| Case | `recipient_key` | Name / email |
| --- | --- | --- |
| Result with a registration | `win:<registrationId>` | registration name + email |
| Each other member of that team | `win:<registrationId>:m:<norm(roll) or norm(name)>` (`#n` on duplicates) | member email, else via leader (as participants) |
| Result with no registration | `win:roll:<norm(roll_no)>` | `display_name ?? roll_no`, no email (Issue only / download) |
| Uploaded list | `sheet:<groupId>:…` (unchanged) | row name + email |

- The `win:` prefix differs from `reg:`, so the existing unique index
  `(event_id, recipient_key)` lets one person hold a participation **and** a winner
  certificate.
- Winners from results do not also need `attended = true`, since a published rank
  already shows they took part.

### 4.3 Fields

A new **Winner** group in the field catalogue, offered only on Winners groups and in
the Winners base:

| Key | Label | Rank 1 / 2 / 3 | Anything else (uploaded "Best UI") |
| --- | --- | --- | --- |
| `winner.place` | Position | `1st` / `2nd` / `3rd` | printed as typed |
| `winner.placeWords` | Position in words | `First` / `Second` / `Third` | printed as typed |

Uploaded Position cells parse as 1–3 from `1`, `1st`, `first` (etc.), case-insensitive.
Anything else, including "runner-up", is printed verbatim: predictable beats clever.
An empty cell raises the usual `Position empty` warning. Transforms still apply
(`UPPERCASE` gives `FIRST`).

### 4.4 Issuing, email, verify

- Certificates are inserted with **`type: 'winner'`**. The actions check
  **`issue:winner_certificate`** for the Winners group, and
  `issue:participation_certificate` for every other group. The grants are identical
  today, but the check must name the right capability.
- The three `.eq("type", "participation")` filters (`liveCertificateDetails`,
  `ledgerStatus`, the hub counts) widen to both types. The hub's `people` count
  adds winners from results-source groups, expanded into team members the same way
  attendees are, plus uploaded winner rows through the existing sheet-row count.
- The group label is **"Winner"**. `/verify` shows **"Winner · 1st place"** when the
  snapshot has `winner.place`: `verify-lookup` also selects `snapshot->values->>winner.place`.
  Still no email, roll, team or reason (designer §7).
- Email: a single self-addressed winner certificate gets the subject
  `Congratulations — your certificate for <event>` and a winner variant of the
  `participation_certificate` template. Leader bundles keep the existing wording.
- **A rank corrected after issuing.** Someone still on the podium becomes
  **outdated** automatically, because `winner.place` is a printed field
  (`isOutdated`), and re-issue picks them up. Someone who **dropped off** the podium
  still holds a live certificate but is no longer a recipient. The Recipients tab
  lists such certificates (any group) as **"Issued · no longer on the list"**, built
  from the certificate row, with Download and (for `revoke:certificate`) Revoke.
  Nothing revokes automatically.

## 5. Save as base

`saveCertificateBaseAction({ eventId, groupId, design, targets: BaseKind[] })`:

1. `authorize(eventId)` as today, then for each target
   `canManage(session, capFor(target), null)`. `capFor` is
   `issue:winner_certificate` for winners, `issue:participation_certificate` otherwise.
2. **Base validation** (pure, `bases.ts`): walk the design's field runs. Any `form.*`
   or `sheet.*` run, or a `winner.*` run when `winners` isn't the only target, fails
   with the field's label: *"Remove {T-shirt size} — a base can only use fields every
   event has."* This runs after `validateDesign` with the event's own context, so the
   refusal names the field instead of calling it unknown. A design with **no template**
   is refused ("Add a template before saving it as a base"), because every following
   event would otherwise be unable to issue.
3. `verifyNewAssets(eventId, design, effectiveDesignOfGroup)`, as in §3.
4. **Copy assets into the council folder.** Every asset ref not already under
   `certificate-assets/00000000-0000-0000-0000-000000000000/` (`BASE_ASSET_FOLDER`; the
   nil UUID matches the existing path regex, so validation is unchanged) is downloaded
   and uploaded to `<BASE_ASSET_FOLDER>/<uuid>.<ext>`. Refs are rewritten via a pure,
   tested `rewriteAssetRefs`. A base therefore never depends on an event's objects.
   Old base assets are never deleted, since issued versions may reference them
   (designer §5.1).
5. Upsert one `certificate_bases` row per target (`design`, `source_event_id`,
   `updated_by`, `updated_at`).
6. If the current group's `base_kind` is a target, set its `design = null` (D8).
7. One audit row per target: `action: "update"`, `entity: "certificate_base"`,
   `entityId: kind`, **`before: { design }`** (the previous base, so an overwrite
   can be restored by hand), `after: { sourceEventId, elements, following, withLive }`.
8. `revalidatePath` for this event's certificates page. Other events read the bases
   on render.

**Impact shown in the confirm**, loaded with the workspace only for admins who can
save bases: per kind, `following` = groups with that `base_kind` and `design is null`
(other events), and `withLive` = how many of those have ≥ 1 live certificate. The
confirm reads: *"Used by 9 events. 2 of them have issued certificates that will show
as outdated."* With no base yet: *"Every event without a custom design will use this."*

Two admins saving the same base at once: last write wins, and both are audited (step 7).

`resetCertificateGroupToBaseAction({ eventId, groupId })`: authorize, require
`base_kind is not null`, set `design = null`, audit
(`entity: "certificate_design"`, `after: { reset: true }`).

## 6. Security

- `certificate_bases` has RLS on and no anon/authenticated grants. All access goes
  through the service role in server code. Verify the grants after applying
  (STATUS.md trap).
- Save as base needs a council-wide grant for **each** target (D7). The button is
  hidden, **and** the action re-checks.
- The base asset folder is written only by the service role inside the action.
  Signed upload URLs stay scoped to `<eventId>/`.
- Winner recipients read `results` + `registrations` with the service role, behind
  the same event capability + club-scope guard. Nothing new reaches anon.
- `/verify` gains only the place ("1st"), which is already public on the event's
  results page.

## 7. Error handling

| Situation | Behaviour |
| --- | --- |
| No base saved yet | Group opens in the editor; "No council base yet"; issue disabled until a template exists |
| Base uses an event-only field | Save as base refused, naming the field (§5.2); the editor keeps its state |
| Asset copy fails mid-save | Nothing upserted; "Could not save the base. Try again." Copied objects are harmless orphans |
| Base's source event deleted | `source_event_id` → null; banner drops "from <event>" |
| Base asset missing at render | As designer §9: the batch counts it failed, rolls back, audit records `renderError` |
| Winners, results source, nothing published | Empty state with "Use an uploaded list instead" |
| Switch winners source with live certificates | Refused with the count (§4.1) |
| Customise, then leave without saving | Nothing written; group still follows the base |

## 8. Testing

Unit (vitest, pure):
- `bases.test.ts`: `effectiveDesign` (custom wins, base used, no base → empty);
  base-field validation (rejects `form.*` and `sheet.*` with the label, `winner.*`
  outside a winners-only save); `rewriteAssetRefs` (only non-base refs, template and
  images, path shape); impact wording.
- `winners.test.ts`: `podiumRound` (highest sort with published, skips an unplayed
  final); ties; keys for registration / member / roll-only incl. duplicates; place
  parsing and wording (`1`, `1st`, `First`, `runner-up` verbatim); Position header
  detection.
- `recipients.test.ts`: "no longer on the list" rows from live certificates with no
  recipient; `win:` and `reg:` coexisting for one registration.
- `verification.test.ts`: `Winner · 1st place`; no place → `Winner`.
- `fields.test.ts`: Winner fields offered only on Winners groups; `sheetValues` prints
  `person.roll` from the row.
- `sheet.test.ts`: `validateListRow` (name required, bad email rejected, caps);
  roll column detection; `buildSheetRows` carries roll.
- `recipients.test.ts`: `sheetIdentity` matches `sheetKey`'s identity; an
  identity change is detected, a roll-only change is not.

Browser: extend the dev harness (`/dev/certificate-designer`) with `?panel=base`
(read-only preview + Customise) and the Save-as-base menu + confirm. Check both at
phone width (the preview must stay responsive; the editor keeps its ≥ 1024 px rule).

Gate per phase: `npm run typecheck`, `lint`, `test`, `build` green.

**Owed human walkthrough** (TOTP blocks agents; STATUS.md):
1. On an event, design a certificate, then Save as base → Participants + Volunteers.
2. Open a second event: both groups show the certificate immediately, marked Base.
3. Customise Volunteers on the second event, Save for this event; edit the base from
   the first event: Participants changes on the second event, Volunteers does not.
4. Reset Volunteers to base.
5. Type three volunteers (one without email), issue, then try to change the
   issued one's email → refused; change their roll no. → shows outdated.
6. (Phase 2) Publish results, open Winners, preview a tied 3rd place, issue to yourself,
   scan the QR → "Winner · 3rd place".

## 9. Phases

| Phase | Ships | Migration |
| --- | --- | --- |
| **1. Bases** | Migration; `certificate_bases`; `base_kind` + effective design; Participants + Volunteers slots; preview-first view; Customise; Save for this event; Save as base (Participants, Volunteers); Reset to base; impact confirm; typed list rows + roll no. (§1.4); audit | §2, applied once |
| **2. Winners** | Winners slot; results / uploaded source + switch rule; Winner fields; `type: 'winner'` + capability; winner email; verify place; "no longer on the list" rows; Winners base in Save as base | none |

Each phase merges to `main` on its own with the gate green, and STATUS.md is updated
with the owed walkthrough.

## 10. Out of scope

- A standalone base-template page, per-club bases, or extra named bases (D1, D5, D10).
- Base history or undo beyond the audit row's `before` design.
- Automatic revocation when someone drops off the podium.
- Winner certificates for "advanced to next round" or non-podium ranks.
- Everything already out of scope in designer §12 except winner certificates.
