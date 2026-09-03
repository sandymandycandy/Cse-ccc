# Club feedback portal — design

**Date:** 2026-09-04 · **Status:** approved, not yet implemented
**Spec touched:** `docs/BUILD_PLAN.md` §3.2 (capability matrix — new `view:feedback`
row), `docs/SECURITY_SPEC.md` §4 (authorisation), §5 (public form hardening),
§6 (rate limits)

## Goal

Students give the council structured feedback on their club and its two leaders
during a window the President opens and closes by hand, roughly every 15–20 days.
Responses are readable only by the President, the Vice President and the
Technical Head, in the admin panel. Nothing is ever shown publicly, and nothing
is ever shown to the leader being rated.

This is TODO item #6 ("Phase 3: feedback + ratings"), pulled forward by owner
request on 2026-09-04.

## Recorded decisions

Decided by the owner on 2026-09-04 after the trade-offs were put to them. Written
down so nobody re-derives them later and quietly "fixes" them.

> **D1 — the head and the vice head are rated separately, each in a named block.**
> A single combined "leadership" rating was offered and declined: a complaint that
> cannot be attributed to a person is not actionable.

> **D2 — `view:feedback` is granted to `president`, `vice_president` and
> `tech_head`.** The owner's ask was "only me and the VP"; the Technical Head was
> added so the surface can be debugged in production without an admin editing
> their own role.
>
> **⚠️ Consequence, accepted:** the Faculty Advisor is excluded. This is the
> **first capability in the matrix that `faculty_advisor` does not hold**, and it
> breaks the "Faculty / VP / Tech are unrestricted" invariant recorded in
> `capabilities.ts` on 2026-09-02. It is deliberate. Do not "restore" the faculty
> grant for consistency.
>
> **⚠️ Consequence, accepted:** the grant is by role, so it also admits the
> generic seed account `Tech Head` (role `tech_head`, no club) that exists on the
> live DB beside the owner's `sandy` account. **Deactivate that seed account
> before the first window opens**, or a shared dev login can read every response.

> **D3 — no submission limit.** One-per-VTU-per-club and roster verification were
> both offered and declined; only IP rate-limiting and the honeypot stand between
> the form and repeat submissions.
>
> **⚠️ Consequence, accepted:** a motivated student can move a leader's average on
> their own. **Averages are therefore advisory, not evidence.** The compensating
> control is detection, not prevention: the admin list flags any VTU that appears
> more than once in a period so a human can judge it. The system never rejects a
> student for it.

> **D4 — the window is opened and closed by hand, always.** No auto-close date, no
> cron, no schedule. A period stays open until someone presses Close.

> **D5 — no "Round 1 / Round 2" naming anywhere.** The public page is titled
> simply "Feedback". Periods exist in the schema (a toggle needs to record *since
> when*, and grouping is what makes trends comparable) but are labelled in the
> admin UI by date range only — "4 Sep – present", "12 Aug – 30 Aug".

## What the probe of the live DB found

Recorded because it drove the design and will surprise the next reader:

- **Club heads and vice heads live in `admin_users`, not `club_members`.** Every
  one of the 14 active clubs has **0 rows with `role = 'head'` or `'vice_head'`**
  on the member roster, despite 785 member rows. `admin_users` carries the real
  names, club-scoped.
- **There are 14 active clubs, not the 11 the docs repeat.**
- **`admin_users` is not one-head-per-club.** Coding Club has three `club_head`
  accounts (`Coding Head`, `NavaneethKumar`, `club head testing`) plus a
  club-scoped `tech_head`; AppNova has two; AspireX has two `vice_head` rows that
  look like a duplicate of one person (`LOGITH`, `LOGITH A`). Three clubs (Nature,
  Animatrix E-Sports, Animatrix Game Development) have **no vice head at all**.

The last two facts are why the form needs a curated per-club pick rather than a
query, and why the vice-head block must be optional rather than assumed.

## Architecture

### Why a new vertical, not a `kind` column on `contact_messages`

Feedback carries three numeric ratings against two identified people plus a club,
and the whole point is to average them per club per period. Folding that into a
free-text message body makes every average a parse. This is the same call the
repo already made when `admin_password_resets` was kept separate from
`admin_invites` rather than sharing a `kind` column.

A normalized child table (one row per rated target) was also considered and
rejected as YAGNI: there are exactly three targets, fixed by the form, and a
child table turns every average into a join.

### Data model

**`feedback_periods`** — one row per window; this table *is* the toggle.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `opened_at` | timestamptz not null default now() | |
| `closed_at` | timestamptz null | **`null` means open right now** |
| `opened_by` | uuid → `admin_users(id)` | who flipped it |
| `closed_by` | uuid → `admin_users(id)` null | |

A partial unique index makes "at most one open period" a database guarantee
rather than an app convention:

```sql
create unique index feedback_periods_one_open
  on public.feedback_periods ((true)) where closed_at is null;
```

There is deliberately **no `auto_close_at`** (D4).

**`feedback_responses`** — one row per submission.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `period_id` | uuid not null → `feedback_periods(id)` | |
| `vtu` | text not null | as typed; no format enforced beyond length |
| `student_name` | text not null | |
| `club_id` | uuid not null → `clubs(id)` | |
| `head_admin_id` | uuid null → `admin_users(id)` | who was rated |
| `head_name` | text null | **snapshot of the name at submission time** |
| `head_rating` | smallint null | `check between 1 and 5` |
| `head_comment` | text null | |
| `vice_admin_id` / `vice_name` / `vice_rating` / `vice_comment` | | same four, for the vice head |
| `club_rating` | smallint not null | `check between 1 and 5` |
| `activities_feedback` | text not null | ask #7 |
| `suggestions` | text null | ask #8 |
| `created_at` | timestamptz not null default now() | |

**Why `head_name` is stored as well as `head_admin_id`:** leaders turn over every
academic year. A rating has to stay attached to whoever actually held the post
when it was given, or next year's head inherits this year's two-star reviews.
Same denormalisation the repo already relies on for `results.display_name` and
`results.team_name`. The id is kept alongside for joins while the account exists;
the name is the durable record and must never be backfilled from the id.

**`clubs.feedback_head_id` / `clubs.feedback_vice_head_id`** — two nullable uuid
columns referencing `admin_users(id)`, the curated pick per club (D1).

Resolution order when the form needs a club's leaders:

1. the curated column, if set and the account is still active;
2. else, if the club has **exactly one** active account of that role, that one;
3. else nothing — the block is omitted.

Rule 2 means 11 of the 14 clubs work with zero setup; only Coding, AppNova and
AspireX need a human pick. Rule 3 means an ambiguous club silently shows no block
rather than guessing a name — a wrong name attached to a rating is worse than a
missing one.

### Grants and RLS

Both new tables get `enable row level security` **and**
`revoke all on ... from anon, authenticated`. Per the gotcha recorded on
2026-09-03, `create table` + `enable row level security` is **not** enough — the
default grant survives it, and RLS-with-no-policies is only the second lock. The
two new `clubs` columns are additive to a table anon already reads; they hold
admin uuids, not PII, and are needed by no public query, so the existing
column-level grant pattern is left alone and neither new column is added to it.

Every read and write goes through the service-role client, **including the public
page's "is a period open?" check** — `/feedback` is a Server Component, so it can
ask the service-role client directly. There is no anon exposure to either table
at all.

## Public surface

### `/feedback` (open)

Two columns on desktop; stacked on mobile with **the quote first** — it is the
reassurance that makes someone willing to type their VTU number, so it must not
sit below the fold.

Form fields, in the owner's order:

1. **VTU number** — required, placeholder `vtuxxxxx` (matches the placeholder
   convention shipped in `927b51c`).
2. **Name** — required.
3. **Club** — required, `<select>` over active clubs.
4. On selection, the leader names appear (no network round-trip: all 14 clubs'
   resolved leaders ship with the page as props — a few hundred bytes).
5. **Club Head — `<name>`**: 1–5 rating + comment, both optional. Then
   **Vice Head — `<name>`**: 1–5 rating + comment, both optional. The vice block
   is absent entirely for a club with no resolvable vice head.
6. **The club itself** — 1–5 rating, required.
7. **Activities so far** — textarea, required.
8. **Suggestions to improve** — textarea, optional.

**Required vs optional:** VTU, name, club, club rating and activities feedback are
required; both leader ratings/comments and suggestions are optional. Forcing a
number out of someone with no opinion of a person produces a noisy average.

A comment **may** be left without a rating, and a rating without a comment — the
two fields are independent. A comment with no rating still counts as a response
and still appears in the list; it simply contributes nothing to that leader's
average.

The quote panel carries the owner's text **verbatim**, attributed to
"Charan Cheedella, President, CSE Clubs Council".

**What the confidentiality guarantee means in practice** (stated here so the
promise is not overread): responses are never rendered on any public page and are
never shown to the leader being rated. They are readable by the President, the
Vice President and the Technical Head accounts in the admin panel, and by anyone
with direct database access. Nothing in this design makes a response invisible to
the council.

### `/feedback` (closed)

A quiet page — "Feedback isn't open right now. We collect it every few weeks;
check back soon." Deliberately **not** a 404, so a link shared in a class group
after a window closes does not look broken.

### Site chrome

While a period is open, a **Feedback** link joins the header nav in
`SiteHeader.tsx` and a dismissible banner appears on the home page. Both vanish
when the period closes. `SiteHeader` is a client component and the open/closed
state is server-known, so the flag is passed down as a prop from the root layout
rather than fetched in the client.

**The root layout renders on every public page**, so this read must be cheap: it
is a single-row `select id from feedback_periods where closed_at is null limit 1`
through the service-role client, wrapped in React's `cache()` (as
`getAdminSession` already is) so it runs at most once per request. If the query
errors it **fails closed** — no link, no banner — because a broken nav on every
page of the site is a worse outcome than a missed window.

The banner is dismissed per-browser via `localStorage`, keyed by the open
period's id, so dismissing one window's banner does not suppress the next one.

## Submission flow

`POST /api/feedback` — a route handler, not a server action, so it can be
verified with curl (the repo's gotcha: server-action POSTs cannot be driven
headless). Check order mirrors `/api/contact`:

1. `content-length` cap (100 KB) → 413.
2. `FeedbackSchema.safeParse` — zod `.strict()`, rejects unknown keys. Per-field
   messages returned for visible fields only, never the honeypot.
3. IP rate-limit via a new `checkFeedbackLimits` in `src/lib/rate-limit.ts` →
   429 with `Retry-After`. **Per IP only, never per VTU** — a per-VTU limit is
   exactly the submission cap D3 declined. The bound is deliberately loose
   (10 submissions per IP per hour) because a whole class can share one campus
   NAT address; it exists to stop a script, not a person.
4. Honeypot (`website` must be empty) and Turnstile, both exactly as `/contact`.
5. **Re-check that a period is open**, server-side. A form left sitting in a tab
   after the owner presses Close must not still submit → 409.
6. **Re-resolve the head and vice head from `club_id` server-side.** Names and
   admin ids sent by the browser are *ignored entirely*. Without this, anyone
   could post a one-star rating attached to a name of their choosing.
7. Insert via the service role; return `{ ok: true }`.

No email notification is sent (see Out of scope).

## Admin surface

`/admin/feedback`, gated by `requireViewPage("view:feedback")`. The eslint rule
`admin-route-requires-guard` enforces the guard call; the nav link in
`admin/(app)/layout.tsx` is conditional on `canView` like every other.

- **Toggle** at the top: current state plus an "Open feedback" / "Close feedback"
  server action. Both write `opened_by` / `closed_by` from the session and are
  audit-logged via the existing `src/lib/admin/audit.ts`.
- **Per-club summary** for the selected period: response count, average club
  rating, average head rating, average vice rating.
- **Response list** per club → a detail view with all free text. A VTU appearing
  more than once in the period carries a quiet duplicate marker (D3).
- **Period switcher**, labelled by date range only (D5).
- **Leader picker** for clubs where resolution is ambiguous, writing
  `clubs.feedback_head_id` / `feedback_vice_head_id`.
- **CSV export** at `/api/admin/feedback/export`, following the three existing
  export routes and reusing `src/lib/csv.ts`. Scoped to one period, one row per
  response, carrying every stored column including VTU, name and all free text —
  it is the raw record, so the file is as sensitive as the table and the route
  is guarded by the same `view:feedback` capability.

**Why the picker lives here and not in the club editor:** club heads hold
`manage:clubs` with grant `own`. A picker on `/admin/clubs/[id]/edit` would let a
head point the form away from their own vice head, or at nobody. Behind
`view:feedback` it is out of their reach.

## Capability change

One new row in the `MATRIX` of `src/lib/auth/capabilities.ts`:

```ts
"view:feedback": {
  president: "all", vice_president: "all", tech_head: "all",
},
```

That makes 22 capabilities, not 21. The row needs a comment recording D2 —
specifically that the missing `faculty_advisor` grant is intentional — because
the file's existing comments assert that Faculty, VP and Tech hold everything,
and this is the exception. `viewableCapabilities` picks the new row up
automatically; `adminHomePath` is unaffected (all three roles already home to
`/admin`).

## Testing

Pure logic in `src/lib/feedback/`, unit-tested, following the repo's shape:

- `schema.ts` — the zod input schema (required/optional split, 1–5 bounds,
  lengths, honeypot).
- `leaders.ts` — the three-step head/vice-head resolution, including the
  exactly-one fallback and the no-vice-head case.
- `summary.ts` — per-club averages over a period, and duplicate-VTU detection.
- `period.ts` — open/closed resolution from a period row.

Route-handler behaviour (413 / 400 / 429 / 409 / 200) is curl-verifiable and
should be checked that way.

**Browser walkthrough is owed and cannot be skipped**: the admin toggle, the
leader picker and the public submit are all mutations, and the repo's own gotcha
is blunt that typecheck + lint + tests + build all passed while a shipped page was
visibly broken. Look at the page.

## Out of scope

Deliberately not built: per-response email alerts (one window could produce
hundreds), public display of averages, student login, response editing or
deletion, and any scheduled/automatic open or close (D4).

## Rollout

1. Migration `20260904000000_club_feedback.sql` — two tables, the partial unique
   index, the two `clubs` columns, RLS enable + the `revoke all` on both tables.
   Applied to the live DB via the Supabase MCP **before** the code deploy, as
   every previous migration in this repo has been.
2. Regenerate `src/lib/database.types.ts` via the MCP `generate_typescript_types`
   — **not** `npm run types:gen`, which truncates the file (the CLI is absent).
3. Deactivate the generic `Tech Head` seed account (D2) before the first window.
4. Curate the leader pick for Coding Club, AppNova and AspireX.
5. Open the first window by hand.
