# Shortlist review: categories, finalise, attendance — design

**Status:** approved in chat 2026-09-25 · **Pages:** new `/admin/events/[id]/shortlist`,
changed `/admin/events/[id]/registrations`, `/participants`, CSV export

## Problem

On a **shortlist**-mode event one page does three jobs: it lists every submission,
carries the shortlist checkboxes, and is the attendance surface. Ticking and
pressing **Shortlist selected & email** emails at once — there is no way to build
a list over time, change your mind, or keep a reserve. Non-shortlisted teams
still clutter attendance (shown with "—").

## Decisions (from the owner)

1. **Review everyone, then categorise.** Every registered team is reviewed on its
   own page and put in one of three categories: **Not decided** (default),
   **Shortlisted**, **Waiting list**. Any team can be moved between categories at
   any time.
2. **Categorising is silent.** No email goes out until the owner presses
   **Finalise**.
3. **Finalise** emails "You're selected" to every Shortlisted team not yet
   emailed; those teams then appear in attendance. Re-running it only emails the
   ones shortlisted since. Nobody is emailed twice.
4. **The waiting list is silent** — never emailed. It has **no order**; when a spot
   opens the owner moves whichever team they want to Shortlisted and finalises.
5. **Not-decided teams are never contacted.**
6. **Attendance shows only finalised shortlisted teams.**

Seats-mode events — including their automatic, numbered waitlist
(`waitlist_position`) — are **unchanged**. That is a different feature.

## Data model

One migration, additive:

```sql
alter table public.registrations
  add column shortlist_decision text
    check (shortlist_decision in ('shortlist', 'waitlist'));

-- Existing shortlisted rows are already emailed: they become Shortlisted + finalised.
update public.registrations
  set shortlist_decision = 'shortlist'
  where shortlisted_at is not null;
```

- `shortlist_decision` — the draft category. `null` = Not decided.
- `shortlisted_at` **keeps its meaning: finalised and emailed.** So
  `isAttendanceEligible` and the guard in `toggleAttendanceAction` do not change.
- Derived states (pure helper `shortlistState(reg)` in
  `src/lib/registration/shortlist.ts`):

  | decision   | shortlisted_at | state                          |
  |------------|----------------|--------------------------------|
  | null       | null           | Not decided                    |
  | waitlist   | null           | Waiting list                   |
  | shortlist  | null           | Shortlisted — not yet emailed  |
  | shortlist  | set            | Shortlisted — finalised        |

- Invariant (enforced in the action): when the decision changes **away from**
  `shortlist`, `shortlisted_at`, `attended` and `absent_members` are cleared in
  the same update. So `shortlisted_at` is only ever set with decision
  `shortlist`, and a removed team leaves no attendance behind (certificates
  follow `attended`).

## Pages

### Review — `/admin/events/[id]/shortlist` (new)

- Shortlist-mode events only; a seats event redirects to `/registrations`.
- View: `manage:registrations` via `canViewEvent`. Edit controls only when
  `canManageEvent` — same scoping as the registrations page.
- Lists **every** registration, one card per team: title (team name or leader),
  members (reusing `teamOf`), and the non-team form answers (links clickable
  only when `isSafeHttpUrl`).
- Filter chips with counts: **All · Not decided · Shortlisted · Waiting list**,
  plus a search box (reuses `matchesAny`, same reach as the registrations board).
- Each card: a three-way segmented control **Not decided | Shortlist | Waiting
  list**. Changing it saves immediately (optimistic, server action), sends no
  email. A finalised card shows an **Emailed** badge; switching it away from
  Shortlist shows an inline warning first: "This team was already told they're
  selected — you'll need to tell them yourself. Their attendance will be
  cleared." with Confirm / Cancel.
- Header: counts line, and **Finalise & email (N)** where N = shortlisted, not yet
  emailed. Disabled at 0. Pressing it opens an on-page confirmation (no browser
  `confirm()`): "Email N teams that they're selected?" → Confirm.
- After finalise: a success notice "N teams emailed and added to attendance".

### Attendance — `/admin/events/[id]/registrations` (changed)

- Shortlist mode: rows = registrations with `shortlisted_at` set, only.
  Checkboxes, the **Shortlist selected & email** form and the Shortlisted/Undo
  tail are removed. Header counts become "N shortlisted teams · M people present".
- Empty state when none finalised: "No shortlisted teams yet." + link to Review.
- Header gets a **Review & shortlist** link (shortlist mode only).
- Seats mode unchanged.

### Who's registered — `/participants` (changed)

- Shortlist mode: each entry gets a category badge (Not decided / Waiting list /
  Shortlisted / Shortlisted · emailed). Read-only.
- Header gets a **Review & shortlist** link (shortlist mode only).

### Navigation

`EventRowActions` and the event edit page gain a **Review** link to
`/shortlist` for shortlist-mode events only.

## Server actions — `src/app/admin/(app)/events/[id]/shortlist/actions.ts`

All: `getAdminSession` → uuid-validate ids → `getEventForAttendance` →
`canManageEvent(session, "manage:registrations", hosts)` → event must be
shortlist mode → every write filtered by **both** `id` and `event_id` (the IDOR
lesson from the original `shortlistAction`) → `writeAudit` →
`revalidatePath` of `/shortlist`, `/registrations`, `/participants`.

1. **`setShortlistDecisionAction({ eventId, registrationId, decision })`**
   `decision ∈ {null, 'shortlist', 'waitlist'}` (zod). Returns `{ ok } | { ok:false, error }`.
   Away from `shortlist` → also `shortlisted_at = null, attended = false,
   absent_members = '{}'`. Audit `shortlist_decision` with before/after.
2. **`finaliseShortlistAction({ eventId })`**
   Race-safe: a single conditional update
   `update … set shortlisted_at = now() where event_id = $1 and
   shortlist_decision = 'shortlist' and shortlisted_at is null returning id,
   email, student_name, custom_answers`. Only the **returned** rows are emailed
   (via existing `teamRecipients` + `enqueueEmail`, template
   `registration_shortlisted`, same subject/payload as today) — so a double
   click or two admins at once can never email a team twice. Audit
   `shortlist_finalise` with the count. Returns `{ ok, emailed }`.

The old `shortlistAction` and `unshortlistAction` are removed (their callers go
away with the checkboxes).

## CSV export

The `Shortlisted` column becomes **Category** (`Not decided` / `Waiting list` /
`Shortlisted` / `Shortlisted (emailed)`) on shortlist events.

## Error handling

- Decision change fails → optimistic value reverts, inline "Could not save —
  refresh and try again." (same copy as the registrations board).
- Finalise fails before the update → nothing changed, error shown. If the update
  succeeds, emails are queued rows in `email_log`; the queue's own retry covers
  delivery.
- Event switched from shortlist to seats later: Review redirects; existing
  decisions are ignored by seats mode.

## Testing

- Unit (vitest): `shortlistState` table; `filterByCategory` + counts; the
  "away from shortlist clears attendance" patch builder; `isAttendanceEligible`
  unchanged tests still pass.
- Manual end-to-end on the live stack before reporting done (shared DB — delete
  test rows after): shortlist event with a team form → submit 4 teams → on Review
  put A, B on Shortlist, C on Waiting list, leave D → Attendance empty →
  Finalise (N=2) → two queued `registration_shortlisted` rows per member in
  `email_log`, A and B in Attendance, C and D not → Finalise again → N=0,
  nothing new queued → move C to Shortlist, Finalise → only C emailed → mark A
  present, move A to Waiting list → warning shown, A gone from Attendance,
  `attended` false → CSV shows categories.

## Out of scope

Waitlist email, "not selected" email, ordered waitlist, one-click promote.
