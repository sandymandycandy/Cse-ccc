# QR Attendance (head-scans-QR) — Design Spec

**Date:** 2026-08-24 · **Status:** approved-pending-review · **Author:** brainstormed with owner

## 1. Summary

A **head-scans-a-signed-QR** attendance system with role-based access for Club
Head, Vice Head, and Club Members. It runs in **two contexts that share one
scanner, one token-signing lib, and one dashboard**:

| Context | Subject | QR source | When it's built |
|---|---|---|---|
| **Club meeting** | a club **member** | static personal QR (their profile) | **Phase 1 — now** |
| **Event** | an event **registrant** | per-registration QR **emailed before the event** | **Phase 2 — later** |

This is a **new, parallel track**. The existing event attendance (students
**self-scan** a rotating QR — `attendance_sessions`/`attendance_scans`/
`student_devices`) is **left untouched**; for events the emailed-QR head-scan is
an **additional method the organiser picks per event** (coexist, not replace).

Guiding decisions (all owner-approved during brainstorming):
1. Parallel track; build club-member flavor first, spec event flavor for later.
2. Reuse & **extend `club_members`** as the member/profile entity.
3. **No member login** — a member's signed QR *is* their identity; self-view is a
   read-only tokenized page. (Admin 2FA already exists and is unrelated.)
4. Scanner uses **`html5-qrcode`** (works on iOS Safari + Android).
5. Event flavor **coexists** with the current self-scan flow.

## 2. Scope

**Phase 1 (build now) — Club-member attendance**
- Club Head / Vice Head manage their club's member roster (add / edit / remove /
  activate-deactivate).
- Each member has a unique static QR linked to their profile.
- A head opens an **attendance session** (a club meeting), then scans members'
  QRs with an in-app camera scanner to mark them present.
- Dashboard: live present count, present/absent lists, per-member attendance %,
  and session/attendance history.
- Member read-only **self-view** (profile + own attendance) at their QR link.

**Phase 2 (spec only, build later) — Event attendance via emailed QR**
- Each event **registration** gets a signed QR; it is **emailed to the
  registrant before the event** (new out-of-repo email template).
- At the event the head opens the event's attendance session (organiser having
  chosen the "emailed-QR / head-scan" method) and scans registrants' QRs.
- Reuses the existing event `attendance_sessions` (event-linked) + a new
  head-scan marking path; **does not** remove the rotating-QR self-scan.

**Non-goals**
- Member accounts / member login (deferred; may revisit).
- Replacing the existing self-scan event attendance.
- QR rotation/revocation beyond an `is_active` flag (a lost card → deactivate &
  reissue is deferred; see §11).
- Member photo-upload management UI (the `photo_path` column exists; reusing the
  `image-upload` helper for it is deferred).

## 3. Actors & authorization

- **Club Head / Vice Head** — existing admin roles (`club_head`, `vice_head`),
  already scoped to their **own club**. They perform all management + scanning
  for their club only.
- **Org-wide admins** — `president`, `vice_president`, `tech_head` (`all`) may act
  across clubs; `faculty_advisor` = `read` (view dashboards, no mutation).
- **Club Member** — no login. Identity = their signed QR token; read-only view of
  their own record.

**New capability `manage:members`** added to the capability matrix
(`src/lib/auth/capabilities.ts`) — the single gate for member CRUD, sessions,
scanning, and dashboards:

```
manage:members: faculty_advisor=read, president=all, vice_president=all,
                tech_head=all, club_head=own, vice_head=own
```

All admin routes/actions re-check it with `requireCapability("manage:members",
clubId)` / `canManage(session, "manage:members", clubId)`, where `clubId` is read
fresh from the DB (never from the request body) — matching the existing guard
pattern. Admin API route handlers must carry a guard (the ESLint
`admin-route-requires-guard` rule enforces this).

## 4. Data model

### 4.1 Extend `club_members` (Phase 1)
`club_members` already models a profile: `{id, club_id, name, role
(head|vice_head|member), photo_path, socials, sort, created_at}`. Add:
- `roll_no text NULL` — optional identifier (disambiguation, printing on cards).
- `is_active boolean NOT NULL DEFAULT true` — deactivate without deleting history.

No stored QR secret is needed — the token is derived by HMAC (see §5).

### 4.2 `club_attendance_sessions` (new, Phase 1)
A club meeting during which attendance is taken.
```
id            uuid pk default gen_random_uuid()
club_id       uuid not null references clubs(id)
title         text not null                     -- e.g. "Weekly sync — 24 Aug"
opened_by     uuid references admin_users(id)
opened_at     timestamptz not null default now()
status        club_session_status not null default 'open'   -- dedicated enum (open|closed); NOT coupled to the event attendance_sessions enum
closed_at     timestamptz
event_id      uuid references events(id)         -- NULLABLE seam for Phase 2; unused by Phase-1 UI
```
Rule: **at most one `open` session per club at a time** (opening is blocked, with
a clear message, while one is open). Enforced in the open action + a partial
unique index on `(club_id) where status='open'`.

### 4.3 `club_attendance` (new, Phase 1)
One row = one member marked present in one session.
```
id          uuid pk default gen_random_uuid()
session_id  uuid not null references club_attendance_sessions(id) on delete cascade
member_id   uuid not null references club_members(id) on delete cascade
marked_by   uuid references admin_users(id)
marked_at   timestamptz not null default now()
UNIQUE (session_id, member_id)          -- THE duplicate-scan guard
```
- **Present** = a row exists for (session, member).
- **Absent** = an `is_active` member of the session's club with **no** row.

### 4.4 Event flavor (Phase 2, not built now)
- Reuse existing `attendance_sessions` (already `event_id`-linked).
- Registration QR token = `HMAC(registration_id)` (§5).
- New head-scan **marking** path records a registrant present. Open sub-decision
  (resolve at Phase 2): mark into the existing `attendance_scans` (which is
  `registration_id`+`session_id`, but `device_hash` is currently NOT NULL and
  self-scan-specific) vs. a dedicated `event_scan_marks` table. Recommendation:
  a small dedicated table to keep self-scan semantics clean.

## 5. QR tokens & signing

Add static, domain-separated token helpers to `src/lib/attendance.ts` (reusing
`ATTENDANCE_HMAC_SECRET` and `createHmac`, alongside the existing rotating-code
helpers):

```
sig(subject)      = base64url(HMAC_SHA256(secret, subject))         // full digest
memberToken(id)   = `${id}.${sig("member:v1|" + id)}`
verifyMemberToken(token) -> memberId | null                         // constant-time
```
- A version tag (`v1`) allows a future rotation scheme.
- The QR **encodes a URL**: `https://<site>/m/<memberToken>`. Same token, two uses:
  - a **member** opens it with any camera → their read-only self-view (§7);
  - a **head's** in-app scanner reads the URL, extracts the token, and POSTs it to
    the scan endpoint (§6).
- Phase 2 mirrors this with `registrationToken(id)` / `verifyRegistrationToken`.

QR **images** are generated with the existing `qrcode` dependency (server-side,
SVG/PNG) — for on-screen display and a printable member card.

## 6. Scan flow (head, Phase 1)

1. Head opens the scanner page (`/admin/attendance/scan`, `manage:members`-gated)
   with an **open** session for their club.
2. `html5-qrcode` runs a continuous camera scan (client component). On each decode
   it extracts the token and POSTs to **`POST /api/admin/attendance/club/scan`**
   `{ sessionId, token }`.
3. The route handler (guarded by `requireCapability("manage:members",
   session.club_id)`):
   - `verifyMemberToken(token)` → `memberId` (else 400);
   - load member; require `member.club_id === session.club_id` and
     `member.is_active` (else 403);
   - require session `open` (else 409);
   - `insert into club_attendance (…) on conflict (session_id, member_id) do
     nothing`;
   - return `{ status: "marked" | "already", member: { name, photo_url } }` for
     scanner feedback (name + ✓ / "already scanned").
4. Client shows a toast/beep, debounces the same token for a few seconds to avoid
   re-fire, and keeps scanning.

Idempotent by construction (the UNIQUE constraint); re-scanning a member in the
same session is a no-op reported as "already present".

## 7. Member self-view (Phase 1)

- Route **`/m/[token]`** — public (no login), server component.
- Verify the token → `memberId`; if invalid → 404.
- Read (service role, scoped to that member only): profile (name, photo, club,
  role) + their attendance rows + computed % and history.
- Read-only; exposes only that member's own data. Low sensitivity (a member's own
  attendance); the token is unguessable without the secret.

## 8. Dashboard (Phase 1)

`/admin/attendance` (+ per-session view), `manage:members`-gated, club-scoped
(org-wide admins can pick a club):
- **Live session** (while open): running present count, live-updating present
  list, and the absentee list — via light **polling** (every few seconds; reuse
  the existing `LiveAttendance` approach rather than adding Realtime).
- **Roster**: every active member with attendance **%** = attended ÷ eligible
  sessions, sortable. *Eligible sessions* = the club's sessions **on/after the
  member's `created_at`** (fairer than counting sessions before they joined).
- **History**: past sessions with present/total counts; drill into a session or a
  member.
- **Member management** lives here too: add/edit/remove/deactivate, and
  view/print a member's QR card.

## 9. Security & RLS

- New tables (`club_attendance_sessions`, `club_attendance`) get **RLS enabled
  with no permissive policies** → no anon/auth client access; all reads/writes go
  through **service-role** server actions/routes (the pattern used across the
  content verticals). The member self-view reads via service role *after* the
  token check, scoped to the one member.
- Every mutating admin route re-checks `manage:members` against the club read
  fresh from the DB. `requireSameOrigin` applies to the scan route.
- Tokens verified in constant time; unguessable without `ATTENDANCE_HMAC_SECRET`.
- `roll_no`/`name` are the only added PII; no emails collected for members in
  Phase 1.

## 10. Migrations

1. `alter table club_members add column roll_no text, add column is_active boolean
   not null default true;`
2. `create type club_session_status as enum ('open','closed');` then
   `create table club_attendance_sessions (…)` + partial unique index
   `(club_id) where status='open'`.
3. `create table club_attendance (…)` + `unique(session_id, member_id)`.
4. Enable RLS on both new tables (no permissive policies).

Applied to the live DB via Supabase MCP and mirrored as
`supabase/migrations/*.sql` (repo = source of truth), per project convention.
DB types regenerated via the MCP `generate_typescript_types` (the CLI would
truncate the file — see STATUS gotcha).

## 11. Testing & verification

- **Unit (vitest):** `memberToken`/`verifyMemberToken` round-trip + tamper/expiry
  rejection (constant-time); attendance-% computation (eligible-sessions logic);
  `manage:members` capability grants.
- **Read paths (headless):** seed sessions/members/marks via MCP → assert the
  dashboard, roster %, history, and `/m/[token]` render (seed-then-delete, per
  project convention).
- **Route guards:** unauth → redirect/401; wrong-club head → 403.
- ⚠️ **Camera scanner cannot be verified headless** (same reason `/admin/scan` is
  parked). The `html5-qrcode` scan loop + marking round-trip must be verified on a
  **real phone** by the owner/testers. The scan *endpoint* itself is a route
  handler and is testable via direct POST with a forged-but-validly-signed token.

## 12. New dependency

- `html5-qrcode` (client-only camera QR scanner). Adds bundle weight to the
  scanner route only (dynamic import, `ssr:false`).

## 13. Open items / deferred

- **Phase 2 event flavor:** emailed-QR template (out-of-repo email processor),
  registration token, head-scan marking table decision (§4.4), organiser method
  picker on the event.
- Member login/accounts; QR rotation/revoke beyond `is_active`; member photo
  upload UI; attendance export (CSV) — all deferred.
- Whether a deactivated member's past attendance still counts in history (yes —
  rows persist; they drop out of the *active* roster/absentee list only).
