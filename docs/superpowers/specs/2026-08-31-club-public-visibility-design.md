# Club Public Visibility Toggle (Feature 2) — Design

**Status:** approved design, pre-implementation
**Date:** 2026-08-31
**Spec ref:** BUILD_PLAN — clubs directory / profiles; extends the clubs editor +
CRUD shipped earlier (`manage:clubs`). Independent of the events rework (Features A/B/C).
**Owner asks (2026-08-31, brainstorm):** give the council a **publish / hide** toggle
per club. A hidden club vanishes from the **public site only** (still fully managed in
admin). Distinct from the existing `is_active` flag. **Council-only** control.

> This is **Feature 2** of the post-council backlog (not part of the lettered events
> rework). It builds directly on the clubs editor + `manage:clubs` capability already in
> production.

## Goal

Let the council pull a club off the public site without deleting it or disrupting admin
work on it. Today the only visibility lever is `clubs.is_active`, which (a) is buried in
the council-only structural block of the editor, (b) also gates **non-public** things
(admin event-club pickers filter `is_active = true`), so it means *"operational,"* not
*"publicly visible,"* and (c) **leaks** — an inactive club is dropped from the `/clubs`
directory and calendar chips but its own `/clubs/[slug]` page still renders.

This feature adds a dedicated **`clubs.is_public`** flag that means exactly *"listed on
the public site,"* wires it into every public club surface (closing the leak), and
surfaces a clean one-click **Publish / Hide** control for the council.

The guiding test: "a council admin clicks **Hide** on a club → it disappears from the
home page, the `/clubs` directory, its own `/clubs/[slug]` page (now 404), and the
calendar filter chips — while the club's admin panel, events, members and attendance are
untouched; clicking **Publish** brings it back. A club_head sees no such control."

## What already exists (reused, not rebuilt)

- **`manage:clubs` capability** (`src/lib/auth/capabilities.ts`) — grant `all` for
  president/vp/tech_head, `own` for club_head/vice_head, `read` for faculty. The
  council-only gate is expressed exactly as the existing structural-field gate:
  `grantFor(session.role, "manage:clubs") === "all"`.
- **Clubs admin surface** — list `src/app/admin/(app)/clubs/page.tsx`, editor
  `…/clubs/[id]/edit/page.tsx`, create `…/clubs/new/page.tsx`, the `ClubForm`
  (`src/components/admin/ClubForm.tsx`), and the actions
  (`…/clubs/actions.ts`: `createClubAction`, `updateClubAction`). Data helpers
  `listClubsForAdmin` / `getClubForEdit` in `src/lib/admin/clubs.ts`; validation in
  `src/lib/validation/club.ts` (`ClubProfileSchema` / `ClubStructuralSchema` /
  `ClubCreateSchema`). All writes are service-role + `writeAudit`.
- **Public club queries** (`src/lib/queries.ts`, anon client) — `getClubsWithCounts`
  (home + `/clubs`), `getCalendarClubs` (calendar chips), `getClubBySlug`
  (`/clubs/[slug]`). All three **already** filter `.eq("is_active", true)`; the new
  visibility filter sits right beside it.
- **`is_active`** stays as-is with its existing "operational" meaning — still edited in
  the structural block, still gates admin event-club pickers. **Not repurposed.**

## What is added

### 1. Data model — `clubs.is_public`

One additive migration `supabase/migrations/20260831020000_club_public_visibility.sql`:

```sql
alter table public.clubs
  add column is_public boolean not null default true;
```

`default true` → all 11 existing clubs stay visible (**no regression**). No RLS change:
enforcement is app-layer in the three queries, matching exactly how `is_active` already
works (there is no RLS policy on `is_active` either; anon reads go through these helpers).

`database.types.ts`: hand-add `is_public: boolean` to the `clubs` `Row` / `Insert`
(optional, has default) / `Update` types, then reconcile via the Supabase **MCP**
`generate_typescript_types` (the CLI truncates the file — STATUS gotcha).

### 2. Public query filters (`src/lib/queries.ts`)

Add `.eq("is_public", true)` to three functions — a one-line change each:

- **`getClubsWithCounts`** — hides the club's card on the **home page** and the
  **`/clubs`** directory.
- **`getCalendarClubs`** — drops the club's **calendar filter chip**.
- **`getClubBySlug`** — a hidden club's **`/clubs/[slug]`** now resolves to `null` →
  the page's existing `notFound()` fires. **This closes the leak.** `getEventsForClub`
  needs no change: it is only reached *after* `getClubBySlug` succeeds, so a hidden club
  never reaches it.

### 3. Admin — surface the toggle (council-only)

**Primary affordance — one-click toggle on the clubs list** (`…/clubs/page.tsx`):
- `listClubsForAdmin` (+ `AdminClubRow`) gains `isPublic` (add `is_public` to the select
  and the mapped row).
- Each row shows a **Hidden** badge when `isPublic === false`, and a **Publish / Hide**
  button (a tiny per-row `<form action={setClubVisibilityAction}>` with a hidden `id` and
  the target state). The badge + button render only for a grant-`all` (council) viewer;
  a club_head sees neither (they already only reach their own club's editor).

**New action** `setClubVisibilityAction(formData)` in `…/clubs/actions.ts`:
- Re-checks `getAdminSession()` and `grantFor(role, "manage:clubs") === "all"` (council
  only — never trusts the UI).
- Validates `id` is a uuid; reads the desired boolean; loads the club (`getClubForEdit`)
  for the audit `before`.
- `admin.from("clubs").update({ is_public, updated_at })` → `writeAudit`
  (`entity: "club"`, `is_public` before/after) → `revalidatePath("/admin/clubs")`.

**Editor + create form** (`ClubForm`, `ClubStructuralSchema`):
- Add `isPublic: z.boolean()` to `ClubStructuralSchema` (so it is part of
  `ClubCreateSchema` via the existing merge, and council-only like the other structural
  fields). `structuralFrom(formData)` gains `isPublic: formData.get("isPublic") != null`.
- `createClubAction` sets `is_public: d.isPublic` on insert; `updateClubAction` sets
  `update.is_public = structural.data.isPublic` inside the existing `canStructural` block
  (+ `after.isPublic`). `getClubForEdit` / `ClubForEdit` gain `isPublic` so the checkbox
  reflects current state.
- In the council-only structural section of `ClubForm`, add a **"Show on public site"**
  checkbox (checked = public), defaulting **checked** on the create form. **Relabel** the
  adjacent `is_active` checkbox to **"Active (club is operational)"** so the two flags are
  not confused.

## Data flow (after)

1. Council opens `/admin/clubs` → sees every club with a **Hidden** badge on any that are
   hidden and a **Publish / Hide** button per row.
2. Clicking **Hide** → `setClubVisibilityAction` sets `is_public = false`, audits,
   revalidates. The club instantly drops from the home page, `/clubs`, its own
   `/clubs/[slug]` (→ 404), and the calendar chips. Admin/events/members/attendance
   unaffected.
3. Clicking **Publish** (or ticking "Show on public site" in the editor) sets it back.
4. Creating a club via `/admin/clubs/new` → "Show on public site" defaults checked, so a
   new club is public immediately; the council can uncheck it to stage a draft club and
   publish later.

## Error handling

- A club_head / faculty / anon POST to `setClubVisibilityAction` → guarded no-op (council
  gate), even if the button were forged; the UI never renders it for them.
- Missing / non-uuid `id` → guarded no-op with a clear message; no write.
- Editing profile-only as a club_head → the structural block (incl. the new checkbox) is
  skipped exactly as today (`canStructural` false), so a head can never change visibility.
- Visiting a hidden club's `/clubs/[slug]` → `notFound()` (correct — it's hidden).

## Testing

- **Unit (vitest):** confirm/keep the capability assertion that `manage:clubs` grants
  `all` **only** to council roles (president/vp/tech_head) and never to club_head — this
  is the whole gate for the toggle. (There is otherwise no extractable pure logic here — a
  boolean flag + three query filters + a reused gate; no fake module is invented to pad
  tests.)
- **Removal/compat proof:** typecheck + lint + full build green; existing suite unchanged.
- **Route smoke (curl-able):** on a club flipped hidden via MCP, `/clubs/<slug>` → 404 and
  the club is absent from `/clubs` + `/calendar`; `/admin/clubs` (no cookie) → 307→login.
  (Flip it back / use a throwaway — shared live DB.)
- **Owed human walkthrough** (server-action POSTs can't be curled): as council, **Hide** a
  club on `/admin/clubs` → confirm it vanishes from home, `/clubs`, `/clubs/[slug]` (404),
  and the calendar chips, and that its admin/edit pages still work → **Publish** to
  restore. Confirm a **club_head** login sees no Hidden badge / Publish button and no
  "Show on public site" checkbox in their editor. Undo after.

## Back-compat

- `is_public` defaults `true`, so every existing club and every current public page render
  exactly as before this feature until someone hides a club.
- `is_active` semantics are unchanged; the two flags are independent (a club can be active
  but hidden, e.g. a real-but-not-yet-launched club).
- No public event surface changes: a hidden club's events keep their own status-based
  visibility on the global `/events` hub (see Out of scope).

## Out of scope (YAGNI)

- **Hiding a club's events from the global `/events` hub.** Visibility is scoped to the
  club's own public surfaces (directory card, profile page, calendar chip). Events are a
  separate entity with their own lifecycle/status.
- **RLS-level enforcement of `is_public`.** App-layer filtering matches the `is_active`
  precedent; an anon policy `is_public = true` is a possible future hardening, not needed
  now (club name/tagline/description are not sensitive).
- **Club-head self-serve visibility.** Owner chose council-only.
- **A `published_at` timestamp / scheduled publish.** A plain boolean is enough.
- **Bulk publish/hide all.**

## Open decisions — resolved (owner, 2026-08-31 brainstorm)

- Hide model: **public-only** — a new `clubs.is_public` flag, distinct from `is_active`;
  hidden clubs stay fully manageable in admin.
- Access: **council-only** (grant `all`); club heads cannot toggle visibility.
- Storage: **boolean `is_public`**, not a timestamp.
- New-club default: **visible** (checkbox checked on create; uncheck to stage a draft).
- Affordances: **both** a one-click Publish/Hide toggle + Hidden badge on the list **and**
  a "Show on public site" checkbox in the editor/create form.
