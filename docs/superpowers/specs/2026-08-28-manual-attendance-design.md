# Manual roster attendance + self-registration — design (v1)

**Date:** 2026-08-28 · **Status:** awaiting owner review · **Supersedes:** the
QR/scan half of `2026-08-24-qr-attendance-design.md` and all of
`2026-08-25-member-portal-design.md` (both removed by this work).

## 1. Goal

Replace the club-member **QR attendance** system and the **email+PIN+TOTP member
login portal** with a simpler, self-service flow:

1. A club head shares **one reusable link** for their club.
2. A member opens it, fills in their own details (+ a passport photo), and submits.
   The submission lands as **pending** and shows them a one-time confirmation.
3. The head **approves** the member from the admin roster (full CRUD, own club).
4. To take attendance, a head **creates a session** (name + date + time slot); the
   club's **roster opens for marking** — everyone starts *absent*, tap to mark
   *present*, **Save**.
5. Anyone can check their own attendance on a **public roll-number lookup** page
   (name + club + % only — no PII).

The separate **event-registration self-scan check-in** (§13.8) is **out of scope
and untouched.**

## 2. What is removed

### 2a. The member login portal (entire PIN/TOTP auth surface)
Delete: `src/app/member/**`, `src/lib/member/**` (auth, guards, invites, lockout,
session + their tests), `src/components/member/**`
(`RotatingMemberQr`, `MemberLoginForm`, `MemberSetupForm`),
`src/app/api/member/qr/route.ts`. Remove the `/member` block from `src/proxy.ts`
and drop `/member/:path*` from its matcher (+ the `MEMBER_COOKIE` import).

### 2b. Club-attendance QR machinery
Delete: `src/app/m/[token]/page.tsx`,
`src/app/api/admin/attendance/club/scan/route.ts`,
`src/app/api/admin/attendance/club/feed/route.ts`,
`src/app/admin/(app)/attendance/scan/page.tsx`,
`src/components/admin/QrScanner.tsx`, `MemberQrCard.tsx`, `LiveSession.tsx`,
`src/lib/qr.ts` + `src/lib/qr.test.ts`.
Remove the member-login block on the member-edit page and the
`generateMemberLinkAction` / `resetMemberAccessAction` server actions +
`ensureAuthRow` calls.

### 2c. `src/lib/attendance.ts` — STRIP, do not delete
This module is **shared**. The event flow imports `DEVICE_COOKIE, newDeviceId,
deviceHash, verifyCode, isSessionOpen, currentCode, secondsLeft` from it and must
keep working. Remove only the member-token exports (`memberToken`,
`memberExpiringToken`, `verifyMemberToken`, `verifyMemberExpiringToken`) and their
cases in `src/lib/attendance.test.ts`.

### 2d. Dependencies
Remove `html5-qrcode` (only `QrScanner` used it) and `qrcode` (only `qr.ts` used it)
from `package.json` once the above are gone. Verify no other importers first.

## 3. Data model (one migration, applied to the live DB via MCP)

Migration `supabase/migrations/20260828000000_manual_attendance.sql`:

**`club_attendance_sessions`** — a session is now a scheduled meeting, not an
open/close toggle:
- `+ session_date date`
- `+ start_time time`
- `+ end_time time`
- drop the `club_sessions_one_open` partial unique index (no "one open per club"
  concept anymore)
- `qr_ttl_seconds` is retired (drop the column)
- `status` / `closed_at` are **retained but unused** (dropping is destructive on
  existing rows; the new marking flow simply ignores them). Attendance math counts
  **all** of a club's sessions.

**`club_members`**:
- `+ approved_at timestamptz` — `null` ⇒ **pending**; a timestamp ⇒ approved/active.
  Backfill existing rows `approved_at = created_at` so current members stay active.
- `+` unique index on `roll_no` (where not null) — one roster row per roll.
- photo reuses the existing `photo_path` column.

**`clubs`**:
- `+ join_token uuid not null default gen_random_uuid()` — the reusable
  self-registration link token (rotatable to invalidate a leaked link).

**Storage**: create a **private** bucket `member-photos` (public = false, no anon
policies — passport photos are PII, read server-side via the service role only).

**Drop** the orphaned member-portal tables: `club_member_auth`, `member_invites`.
Keep `club_members.email` / `phone` (contact info) and the existing `roll_no`
anon-grant lockdown (unchanged — the public lookup reads via the service role).

## 4. Member self-registration (the reusable link)

### 4a. Fields & validation (client + server, identical rules)
| Field | Rule |
|-------|------|
| Name  | trim, 2–120 chars |
| Roll  | `^\d{5}$` — exactly 5 digits (shown as `VTU_____`); stored as the 5 digits |
| Email | `^vtu\d{5}@veltech\.edu\.in$` (case-insensitive), **and its 5 digits must equal the roll**; stored lower-cased |
| Phone | `^\d{10}$` — exactly 10 digits, no country code |
| Photo | image (png/jpeg/webp), **≤ 200 KB** |

### 4b. Flow
- Public page `src/app/join/[token]/page.tsx` — resolves `token` → `clubs.join_token`.
  Unknown token → `notFound()`. Renders the form (multipart, for the photo).
- **Public route** `POST /api/roster/register` (a route handler, so it is
  curl-verifiable): rate-limited per IP+roll (`checkMemberSignupLimits`, new, mirrors
  `checkRegistrationLimits`); re-validates every field; uploads the photo to
  `member-photos` (private) via a photo-capped `handleImageUpload`; inserts a
  `club_members` row (`club_id` from the token, `role='member'`, `is_active=true`,
  `approved_at=null`). Duplicate roll → `23505` → friendly "you're already
  registered." No email is sent.
- On success → redirect to `/attendance?roll=<digits>` which shows the member their
  status ("registered — awaiting approval by your club head") — this **is** the
  "automatic login" (they land on their own page with no login step). No cookie /
  no persistent session.

## 5. Approval + head CRUD (own-club scoped, `manage:members`)

`/admin/attendance/members`:
- A **Pending approvals** section listing self-registered members (`approved_at is
  null`), each with two buttons: **Onboard** (approve → `approved_at = now()`, member
  becomes active) and **Reject** (delete row + its photo). Own-club scoped; council
  roles see all.
- The club's **join link** shown with a **Copy** control and a **Reset link**
  action (rotates `join_token`).
- Full **CRUD** on members (already present, extended): the view/edit form now shows
  the **photo** (signed URL from the private bucket) and all fields, supports **photo
  replace**, **edit**, **delete**. Manually-added members are **auto-approved**
  (`approved_at = now()`). Update the email label (login copy removed) and add a
  photo field. New audit entries: `approve` / `reject` member, `reset` join token.

## 6. Sessions → create with name + date + time slot

- Replace `OpenSessionForm` with a **CreateSessionForm**: `title` (2–140),
  `session_date` (required), `start_time`, `end_time` (required, `end > start`).
  `openSessionAction` becomes `createSessionAction`: validates, inserts, **redirects
  to the marking page**. No "one open per club" guard; no qr_ttl.
- Sessions are editable later: a head can reopen a past session's marking list and
  fix marks. Read-only for faculty.
- Dashboard `/admin/attendance/page.tsx`: drop scan/QR references; list sessions
  (title + date + slot) linking to their marking page; keep the roster-% table.

## 7. Manual marking (present/absent)

- Session page `sessions/[id]/page.tsx` renders **all approved + active** members of
  the club as rows with a **Present** toggle. Seed each toggle from existing
  `club_attendance` rows for the session (present = row exists). Default **absent**.
- New client component `SessionRoster.tsx` (replaces `LiveSession`): toggles + a
  **Save** button. Optional convenience: **Mark all present** / **Clear**.
- New `saveAttendanceAction(sessionId, presentIds[])`: guard `canManage`; load the
  current present set; **diff** → insert newly-present (`marked_by = admin id`),
  delete newly-absent. Idempotent. Extract a pure
  `diffPresence(current, desired) → {toAdd, toRemove}` for unit testing.

## 8. Public roll-number lookup

- Public page `src/app/attendance/page.tsx`: a form (roll) → `?roll=<digits>`.
  Server component looks up the member by roll via the service role:
  - not found → "No record for that roll."
  - pending (`approved_at is null`) → "Registered — awaiting approval."
  - approved → **name + club + attendance %/history** only. **Never** phone / email /
    photo.
- Rate-limited per IP. Reuses `summarizeAttendance`.
- ⚠️ **Known, owner-accepted exposure:** roll numbers are guessable (`\d{5}`), so
  anyone can see any student's name/club/% by roll. Rate-limiting is the only guard;
  PII (phone/email/photo) is never on this surface.

## 9. Attendance math change

`summarizeAttendance` currently keys on session `opened_at` (a timestamp) vs the
member's join timestamp. Switch the eligible test to **`session_date` vs the
member's join date** (both `YYYY-MM-DD` strings — lexicographic = chronological).
Eligible = the club's sessions dated on/after the member joined; attended = the
subset they were marked present at; `attended ≤ eligible` still holds. Update
`rosterWithPercent` / the self-view to count **all** sessions (no status filter) and
to pass `session_date`.

## 10. Reused infrastructure

- `src/lib/rate-limit.ts` — add `checkMemberSignupLimits`; reuse `rateLimit` for the
  lookup.
- `src/lib/admin/image-upload.ts` — add an optional `maxBytes` param (200 KB here);
  works with the private bucket via the service role. Admin reads use signed URLs.
- `src/lib/auth/capabilities.ts` `manage:members` — head=own / council=all / faculty=read.
- `src/lib/admin/attendance-math.ts`, `club-scope.ts`, `audit.ts` — as today.

## 11. Testing

- **Pure/unit (added):** member field validators (roll, veltech email, email-matches-roll,
  phone), the 200 KB photo-size check, `diffPresence`, and the updated
  `summarizeAttendance` (session_date). Keep the event-flow cases in
  `attendance.test.ts`; remove only the member-token cases.
- **Deleted:** member-portal tests (`lockout.test`, `session.test`), `qr.test.ts`.
- **Route-handler `POST /api/roster/register`** is curl-verifiable (rejection paths +
  one insert, deleted after — per the repo's shared-DB rule).
- **DB-backed admin pieces** (approve/reject, session create, marking): typecheck +
  browser walkthrough, per repo norm (server-action POSTs can't be curled).

## 12. Files touched (summary)

**Add:** `join/[token]/page.tsx`, `api/roster/register/route.ts`,
`attendance/page.tsx` (public lookup), `SessionRoster.tsx`, `CreateSessionForm.tsx`,
a member self-registration form component, validators module, migration,
`member-photos` bucket.
**Change:** `attendance/actions.ts` (createSession/saveAttendance/approve/reject/
reset-token; drop the member-login actions), `attendance-club.ts` (byRoll lookup,
approved-only roster, all-sessions math), `attendance-math.ts`, `MemberForm.tsx`
(+photo, label), members admin pages, `attendance/page.tsx` (dashboard),
`sessions/[id]/page.tsx`, `proxy.ts`, `attendance.ts` (strip member tokens),
`rate-limit.ts`, `image-upload.ts`, `package.json`, `database.types.ts` (regen via MCP).
**Delete:** everything in §2a/§2b.

## 13. Out of scope
- The event-registration self-scan check-in (§13.8) — untouched.
- Any email sending in this feature (self-registration needs none).
- Persistent member login/session — explicitly one-time by owner's choice.

## 14. Open items for owner review
- Route name `/join/[token]` (the old recruitment `/join` was just removed, so the
  namespace is free) — rename if you'd prefer `/register/[token]`.
- Retaining vs dropping the now-unused `status`/`closed_at` session columns (spec
  keeps them, unused; dropping is destructive on existing rows).
