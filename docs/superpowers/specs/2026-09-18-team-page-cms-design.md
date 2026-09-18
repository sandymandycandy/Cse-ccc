# Team page CMS — design

**Status:** approved in chat 2026-09-18. Not implemented.
**Scope:** let the President, Vice President and Tech Head edit every detail and
every photo of all 46 people on `/team` from `/admin/team`, without a deploy.
The roster and the org structure stay in code.

## Goal

The owner made four decisions in the brainstorm, each after being shown the
alternative:

- **Who edits:** President, Vice President, Tech Head — "in the admin team
  page". No new surface, no new permission work (see *What exists today*).
- **What is editable:** every per-person detail, **and** the portrait. Adding or
  removing a person is **not** editable — that stays a `src/data/ccc.ts` edit and
  a push to `main`.
- **Rows are pre-created.** All 46 are seeded by the migration, so the admin
  opens showing real data rather than 46 blank forms.
- **Separate from `council_members`.** The team page does not read the
  operational council roster, and this feature must not make it start.

The owner explicitly considered and rejected full admin ownership of the roster
(add/remove/reorder, layer and club as DB fields). The reason is recorded in
*Rejected alternatives* — it is the most likely thing for a future session to
try to "fix".

## What exists today

### The page renders from a static file

`src/app/team/page.tsx` renders 46 people out of `src/data/ccc.ts`, committed in
`08bd9c5`. That file carries far more than the database does:

| | `council_members` (live, 2026-09-18) | `src/data/ccc.ts` |
|---|---|---|
| People | 33 | 46 |
| Photos | **0** | 45 |
| Bios | **0** | 46 |
| Emails | 27 | 46 |
| Roll / VTU | 27 | 46 |
| Also holds | phone, socials, `is_public` | layer, club, SMT group, year, department, portfolio, photo focal points |

**The file is the better dataset, not the stale one.** It came from the
council's own form responses. Any instinct to "migrate the page onto the real
table" is backwards — the table is the thin one.

### Known data gaps (measured 2026-09-18)

- **S.Anurudh, Vice Head (Game Dev)** — no portrait, no bio. The only person
  missing something only they can supply. Emailed by the owner 2026-09-18.
- **Ten people missing department, six missing year — all ten are Social Media
  Team, zero are outside it.** The SMT brief evidently collected different
  fields from the club-leader form. Also emailed 2026-09-18.
- **NetForge has no Head and no Vice Head.** These are `openRoles` entries, and
  the page renders them as marked-open slots rather than inventing a person.
  Filling them is an appointment plus a `ccc.ts` edit — deliberately out of
  scope here.
- 39 of 46 have no portfolio link. Not a gap; only 7 ever had one.

### Permissions already match the requirement exactly

`/admin/team/page.tsx:16` guards on `manage:council`, and
`capabilities.ts:189` grants it to:

```
faculty_advisor: "all", president: "all", vice_president: "all", tech_head: "all"
```

That is the President, Vice President and Tech Head the owner named — plus the
Faculty Advisor. **No capability work is needed.** See *Open question* for the
Faculty Advisor.

### `council_members` is load-bearing and must not be touched

Six modules read it: `attendance-council.ts` (the council attendance roster),
`broadcast-recipients.ts`, `api/council/register`, `admin/(app)/council`,
`admin/(app)/team`, and `council/public-roster.ts` (the old `/team`).

Reshaping it to fit the team page would change **who appears in council
attendance** — the file has 46 people including 11 SMT members; the table has 33.
That is why this design adds a table instead.

### ⚠️ `/admin/team` currently edits rows nothing renders

Shipping `08bd9c5` pointed `/team` at the static file, but `/admin/team` still
reads and writes `council_members`. **Its edits therefore appear nowhere.** This
is a live defect introduced by the team page, and repointing that page is part
of this work, not a nice-to-have.

`/admin/council/members` already manages the attendance roster, so nothing is
lost by the repoint.

### The storage bucket already exists

`council-photos` is provisioned: **public, 2 MB limit**, PNG/JPEG/WebP/GIF. No
new bucket is needed.

⚠️ `handleImageUpload` defaults to **5 MB** (`image-upload.ts:25`). It must be
called with `maxBytes: 2 * 1024 * 1024` or a 2–5 MB file passes our check and is
then rejected by Storage, surfacing "Could not upload the image" for what is
really a size problem. Source portraits are ≤ 352 KB, so 2 MB is ample.

## Design

### The table

```sql
create table public.team_profiles (
  member_id   text primary key,          -- matches src/data/ccc.ts `id`
  name        text not null,
  role        text not null,
  year        text,
  department  text,
  email       text not null,
  description text,
  portfolio   text,
  photo_path  text,                      -- council-photos object; null = bundled
  focal_x     smallint not null default 50,
  focal_y     smallint not null default 50,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.admin_users(id) on delete set null
);
```

⚠️ `on delete set null`, matching every other `admin_users` reference in the
migrations (`core.sql:94`, `events.sql:38,48`). **Not `on delete cascade`** —
that would delete a person's profile when the admin who last edited them is
removed.

`member_id` is the slug already in the file (`"s-anurudh"`), **not** a generated
UUID. That is what makes a row and a file entry line up without a mapping table.

No `layer`, `club` or `smt_group` columns. Those decide *where* a person renders
and are not editable, so putting them here would create a second, drifting copy
of the structure.

RLS on, no policies — service-role only, matching `council_members`
(`public-roster.ts:35`). The page reads through the server, never the browser.

### Seeding

The migration inserts all 46 rows with the values currently in `ccc.ts`. It is
written as `insert ... on conflict (member_id) do nothing` so re-running is
harmless.

### Reading, and the resilience property

`src/lib/team/profiles.ts` exposes `getTeamProfiles()` → `Map<string, Row>`, and
a **pure** `mergeProfiles(fileMembers, rows)` that returns the 46 members with DB
values applied.

Three rules, each of which gets a test:

1. **A member with a row uses the row.** The DB wins for every field it holds.
2. **A member with no row uses the file.** Someone added to `ccc.ts` after the
   last seed still renders, rather than half-breaking the page.
3. **A row whose `member_id` matches nobody is ignored.** Removing a person from
   `ccc.ts` must not resurrect them from a stale row.

And the property worth protecting: **if the read fails, the page renders the
file.** `getTeamProfiles` returns an empty map on error, and rule 2 does the
rest. The current DB-driven `/team` cannot do this — it shows an outage message.
Do not "simplify" this into a throw.

⚠️ After the first edit the file's values are stale by design. On an outage the
page shows the seeded values, not the edited ones. That is a deliberate trade —
stale beats blank for a public page — and it is why the file must never be
deleted or emptied "now that the DB has the data".

### Getting merged data into the components

**This is the largest piece of the work and the least obvious.**

Nine client components read member data as module-level imports from
`@/data/ccc` — `ContactSheet.tsx:10` builds its entire 46-frame roll that way
before React runs. A module import cannot see the database.

The server page fetches and merges, then passes the result into `TeamProvider`
(already a client component wrapping the whole page) as a prop. Components swap
the data imports for context-backed hooks of the same shape:

| Today (module import) | After |
|---|---|
| `members`, `president`, `councilLeaders`, `smtMembers` | `useMembers()`, `usePresident()`, … |
| `clubLeaders(id)`, `getMember(id)`, `portraitOf(m)` | `useClubLeaders(id)`, `useMember(id)`, … |
| `layers`, `clubs`, `counts`, `pad`, `layerTone` | **unchanged** — structure is not editable |

Keeping the names parallel keeps the diff mechanical. `ContactSheet`'s
module-level `everyone` constant moves inside the component behind a `useMemo`.

⚠️ `counts` is computed from `members` at module scope and is rendered in the
hero ("46 students… 13 clubs"). Counts do not change when details are edited —
the roster is fixed — so `counts` stays a static import. Do not wire it to
context for symmetry; it would add a re-render for a number that cannot change.

### Photos

The 45 bundled portraits in `src/assets/team/` **stay the default.** They are
statically imported, so they are pre-optimised and carry automatic blur
placeholders at no storage cost. `photo_path` null means "use the bundled one".

An upload writes to `council-photos` and sets `photo_path`. From then on that
person renders from the Storage URL. `next.config.ts` already allow-lists the
Supabase host in `remotePatterns`, so no config change.

⚠️ `MemberPortrait` passes `placeholder="blur"`. That works automatically for a
static import but **throws for a remote `src` unless `blurDataURL` is supplied.**
Two consequences:

- Generate a small `blurDataURL` at upload with `sharp` (bundled by Next in
  production) and store it, **or** branch to `placeholder="empty"` for uploaded
  photos.
- Decided: **generate it.** A photo that pops in while its 44 neighbours blur up
  is a visible inconsistency, and it is ~20 lines at the one upload site.

**Focal point.** Each bundled portrait has a hand-tuned `focal: {x, y}` that
keeps the face framed under `object-cover`. An uploaded photo has none, so
`focal_x`/`focal_y` default to 50/50 — correct for a centred head-and-shoulders
shot, wrong for anything else. The form ships **two number inputs beside a live
preview**. Click-to-set-focus on the preview is a better interaction and an
explicit follow-up, not part of this.

### The admin form

`/admin/team` is repointed to `team_profiles`: 46 rows, one editor each,
following the existing `TeamRow` pattern and the `FieldErrors` convention in
`form-state.ts` (one complaint per input, keyed by `name`).

Removed with the repoint, because they belong to `council_members` and are
already available at `/admin/council/members`:

- `setTeamVisibilityAction` / `setTeamVisibilityBulkAction` — publish/hide. Every
  one of the 46 is public by definition now; the page has no hidden state.
- `addTeamMemberAction` — adding a person is a `ccc.ts` edit under this design.
- `saveTeamLinksAction` — superseded by the single per-person save.

⚠️ Deleting those actions changes what `/admin/team` can do. `listTeamMembers`,
`getTeamMember` and `TeamColumnsMissingError` in `src/lib/admin/team.ts` are for
`council_members` and must be checked for other callers before removal — do not
assume the team page is their only consumer.

Every save writes an audit row, matching the rest of the admin.

## Testing

The merge is pure, so the valuable tests need no database:

- the three merge rules above, each explicitly;
- a partial row (some columns null) taking DB values only where non-null;
- a failed read producing file values, not an exception;
- `focal_x`/`focal_y` clamped to 0–100 before they reach `objectPosition`.

Plus: the seed migration lands exactly 46 rows; upload rejects > 2 MB with a
size message rather than a generic failure; the form returns per-field errors in
the `FieldErrors` shape.

## Out of scope

- Adding or removing people; filling the two NetForge seats.
- Editing clubs, layers or SMT groups.
- Click-to-set focal point.
- Any change to `council_members`, `/admin/council`, attendance or broadcasts.
- The srcset/`<img>` markup weight on `/team` (68% of the page HTML) — a
  separate, already-diagnosed performance item.

## Rejected alternatives

**Extend `council_members` and migrate the 46 in.** Tempting because it would
resolve the "two parallel people-tables" drift `STATUS.md` already complains
about. Rejected: that table *is* the council attendance roster, so adding 13
people including 11 SMT members changes who can be marked present, and six
modules read it.

**A `team_members` table that fully owns the roster** (add/remove/reorder, layer
and club as columns). Rejected by the owner after being shown the cost: it makes
a **third** people-table beside `admin_users` and `council_members`, and every
new club head would have to be entered twice — once to appear on the site, once
to be markable in attendance. That is the exact drift that turned the copied
officers stale. Revisit only if the owner asks for it directly.

## Open question

`manage:council` also grants the **Faculty Advisor** full access, so they can
edit the team page too. The owner named only President, VP and Tech Head.

**Default, unless the owner says otherwise: leave it.** The Faculty Advisor
holds `"all"` across the entire admin by design, and carving out one page would
be the odd exception rather than the rule. Narrowing it would mean minting a new
capability — not editing a grant — and that is a bigger change than the
inclusion it avoids.
