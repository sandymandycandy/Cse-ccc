# Registrations: team list, detail card, per-person attendance — design

**Status:** approved in chat 2026-09-23 · **Page:** `/admin/events/[id]/registrations`

## Problem

The registrations page is one wide table: a column per form answer, and a team
block expands to *max members × subfields* columns. On a team event it is
unreadable, and attendance can only be marked for a whole registration — there
is no way to record that one member of a team did not come, so that member
still gets a participation certificate.

## Decisions (from the owner)

1. Per-person attendance is **real data**: certificates and the CSV export
   follow each person, not just the team.
2. **Present by default.** "Mark full team present" on the list row marks
   everyone. The card is only for exceptions — untick whoever did not come.
   Not opening the card means the whole team was present.

## Data model

One migration, additive, no backfill:

```sql
alter table public.registrations
  add column absent_members smallint[] not null default '{}';
```

- `attended` keeps its meaning: **the team (or solo registrant) showed up.**
- `absent_members` lists the **positions** of people on that team who did not.
  Position = index into `teamOf(registration, schema)` — leader is `0`, members
  follow in form order (blank member slots are already filtered out there).
  Answers are never edited after submission, so a position is stable.
- Empty array ⇒ everyone present. Every existing attended row therefore reads
  as "whole team present" — **no past certificate or count changes.**
- Invariants, enforced in the actions (not the DB):
  - `attended = false` ⇒ `absent_members = '{}'`.
  - If every position is absent, store `attended = false, absent_members = '{}'`
    (a team where nobody came did not attend).
  - Positions outside `0..team.length-1` are dropped on write.
- Solo events (no team block) never write `absent_members`.

Apply to the live DB **before** the code deploy (the code selects the column).
Regenerate `src/lib/database.types.ts`.

## Pure helper — `src/lib/admin/team-attendance.ts`

```ts
type TeamMark = "unmarked" | "present" | "partial";
teamMark(attended: boolean, absent: readonly number[]): TeamMark
presentPositions(size: number, attended: boolean, absent: readonly number[]): number[]
nextAbsent(size, attended, absent, position, present: boolean):
  { attended: boolean; absent: number[] }   // applies one person toggle + invariants
```

All invariants above live here so the actions, the page, certificates and export
agree. Fully unit-tested.

## Server actions — `registrations/actions.ts`

- `toggleAttendanceAction` (existing, row button) — "Mark full team present"
  now also clears `absent_members`; "Undo" clears both. Otherwise unchanged
  (eligibility check, `checkin_method='manual'`, audit `attend_manual` /
  `attend_undo`).
- **New** `setMemberAttendanceAction(registrationId, eventId, position, present)`
  — same auth (`canManageEvent(... "manage:registrations" ...)`) and
  `isAttendanceEligible` guard; loads the registration + schema, validates the
  position against `teamOf`, applies `nextAbsent`, writes `attended`,
  `absent_members`, and the check-in stamps when `attended` flips. Audit
  `attend_member` with `{ position, name, present }`. Returns
  `{ ok, attended, absent }` so the card updates without a full reload;
  `revalidatePath` the page.

## UI

### List (replaces the wide table)

One compact row per registration:

| Team name (or person on solo) | Leader | `4 people · 3 present` | badge | action |

- Badge: **Not marked** / **Present** / **Partly present** (`teamMark`).
- Action: **Mark full team present** (solo: **Mark present**); when marked,
  **Undo**. Hidden for read-only viewers and ineligible (unshortlisted) rows.
- Toolbar, following the existing listbar pattern: search (team, leader, any
  member's name/roll/email, any answer — `matchesAny` over `customAnswers` as
  today) and filter chips All / Not marked / Present / Partly present with
  counts.
- Header summary: `N teams · X people present` (seats) — shortlist wording kept.
- Shortlist mode keeps its row checkbox + "Shortlist selected & email" form and
  per-row Shortlisted badge / Undo.
- Waitlist section, header links and Export CSV unchanged.

### Detail card (opens on row click)

A dialog (`<dialog>`, focus-trapped, Esc / backdrop closes, focus returns to the
row):

- Head: team name, leader, badge, the same full-team action as the row.
- **People:** one row per `teamOf` person — name, role (Leader / Member), roll,
  dept · year, email, phone — with a Present/Absent switch
  (`setMemberAttendanceAction`). Switches are disabled when not eligible or
  read-only. On an unmarked team the switches show neither state; marking one
  person **Absent** marks the team attended with just that person absent, and
  marking one person **Present** marks the team attended (everyone present, per
  the default) — the admin then unticks any others who did not come.
- **Answers:** the remaining non-team form answers (`answerColumns`, excluding
  the team block), links rendered safely via `isSafeHttpUrl` as today.

Components: `RegistrationsBoard.tsx` (client: toolbar, rows, dialog state) and
`RegistrationCard.tsx`, styled in `admin-workspace.css` with existing tokens.
The page stays a server component that builds plain row data (people come from
`teamOf`, answers from `answerColumns`) and passes the actions in.

## Downstream: who counts as present

- **Certificates** (`src/lib/admin/certificates.ts`)
  - Recipients: for an attended registration, skip the leader's `registration`
    recipient if position 0 is absent, and skip each absent member. Members may
    still be delivered via the leader's email when they have none — that is only
    an address, not a certificate for the leader.
  - Recipient counts (the ~line 924 counter) subtract absentees: select
    `absent_members` alongside, count `presentPositions` instead of
    `1 + members`.
  - Certificates already issued before someone is marked absent are **not**
    revoked; they simply stop appearing as pending. (Out of scope.)
- **CSV export**: `Attended` becomes `yes` / `partial` / `no`; add an
  `Absent members` column naming the absent people (`name (roll)`, `; `-joined).
- **Participants page** is unchanged.

## Errors

- Stale position (outside the team) → action returns `{ ok: false }`, card
  shows "Could not save — refresh and try again."
- Supabase error → throw (matches the attendance lib change in `454f244`).
- Card switches are optimistic with rollback on `{ ok: false }` / throw.

## Tests

- `team-attendance.test.ts`: every invariant — default present, toggle one
  absent, toggle back, all-absent collapses to unmarked, toggle on unmarked
  marks attended, out-of-range positions dropped, solo size 1.
- Actions: full-team clears absentees; undo clears both; member toggle
  respects eligibility, auth and position bounds; audit written.
- Certificates: absent leader and absent member are excluded; empty
  `absent_members` yields the same recipients as today (regression).
- Export: `partial` + Absent members column.
- `RegistrationsBoard`: filter chip counts, search reaches a member's roll,
  dialog opens with people and answers.

## Out of scope

Revoking issued certificates; per-person QR check-in; changing the Participants
page; editing registration answers.
