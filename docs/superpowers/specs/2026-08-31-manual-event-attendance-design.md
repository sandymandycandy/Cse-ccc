# Manual Event Attendance (Feature B) — Design

**Status:** approved design, pre-implementation
**Date:** 2026-08-31
**Spec ref:** BUILD_PLAN §13.8 (event attendance), SECURITY_SPEC §8a (rotating QR);
supersedes the QR self-scan attendance built in Phase 1.
**Owner asks (2026-08-31):** (1) retire the event QR self-scan **entirely**; (2) keep
attendance marking **inline on the registrations table** (no separate roster page);
(3) leave the now-dead self-scan DB tables in place behind a **held** drop migration.

> This is **Feature B** of the events rework. **Feature A** (custom registration form
> builder) defined `selection_mode` (`seats | shortlist`) and `registrations.shortlisted_at`;
> this feature consumes them to scope which registrants are markable.

## Goal

Replace the event **QR self-scan** attendance flow with **manual marking only**. Today
an organiser opens a timed check-in window that displays a rotating QR; present
students self-scan it from their own enrolled phones. That whole surface — the student
scan page, the rotating-code endpoints, the device-cookie enrollment, and the live
organiser view — is removed. Attendance is instead marked by the organiser on the
event's **registrations table**, which already has a per-row present/absent toggle. The
only new behaviour is **scoping**: for a **shortlist** event only shortlisted
registrants are markable; for a **seats** event everyone confirmed is markable (as
today).

The guiding test: "the QR self-scan is gone from the whole app; an organiser opens an
event's registrations and marks who actually showed up, and for a shortlist event can
only mark the people who were shortlisted."

This mirrors the club-member attendance rework (`2026-08-28-manual-attendance`), which
likewise ripped out QR self-scan in favour of manual present/absent marking.

## What already exists (reused, not rebuilt)

- **Inline manual marking** — `toggleAttendanceAction`
  (`src/app/admin/(app)/events/[id]/registrations/actions.ts`) already marks/clears
  `registrations.attended` with `checked_in_at`, `checked_in_by`, and
  `checkin_method='manual'`, own-club scoped and audited. Team-aware (the button reads
  "Mark team present" when the form has a team block). **Unchanged by this feature.**
- **Registrations page** — `…/registrations/page.tsx` renders the full submissions
  table with the per-row **Check-in** toggle column and the shortlist controls.
- **`getEventForAttendance`** (`src/lib/admin/attendance.ts`) — resolves an event +
  its primary club id for authz; reused by registrations, results, and CSV export.
- **`selection_mode` + `shortlisted_at`** (Feature A) — already on `events` /
  `registrations`; the scoping rule keys on them.
- **`registrations.attended`** and check-in columns — already the single source of
  truth for attendance (results/participation certificates read `attended`).

## What is removed (the QR self-scan subsystem)

Delete outright — none of these have any consumer outside the self-scan flow (verified
by grep: `@/lib/attendance` is imported only by the four deleted routes/pages; the
kept club-member attendance surface does not import it):

- `src/app/a/[session]/page.tsx` — the student scan landing page.
- `src/components/ScanRunner.tsx` — the student-side scanner/poller.
- `src/components/EnrollDevice.tsx` — device enrollment client (already orphaned — imported nowhere).
- `src/components/admin/LiveAttendance.tsx` — organiser rotating-QR + live-count view.
- `src/app/admin/(app)/events/[id]/attendance/` — the check-in-window page + its
  `openSessionAction` / `closeSessionAction`.
- `src/app/api/attendance/scan/route.ts` — the scan-submit endpoint.
- `src/app/api/attendance/code/route.ts` — the rotating-code + QR image endpoint.
- `src/app/api/devices/enroll/route.ts` — device-cookie enrollment.
- `src/lib/attendance.ts` — rotating-code HMAC (`currentCode`/`verifyCode`),
  device-cookie helpers (`DEVICE_COOKIE`/`newDeviceId`/`deviceHash`), and the
  `isSessionOpen`/`secondsLeft` session-window math. Entirely self-scan; no other consumer.

## What is modified

### `src/lib/admin/attendance.ts` — trim, don't delete

Keep `getEventForAttendance` + the `AttendanceEvent` interface (six reuse sites:
registrations page/actions, results page/actions, CSV export). **Remove** the session
helpers that only the deleted attendance page used: `getLatestSession`,
`getSessionById`, `openSession`, `closeSession`, `sessionScanCount`, `attendedCount`.
(Keeping the file in place avoids churning six unrelated import sites; the surviving
export still legitimately fetches "the event for attendance".)

### `src/app/admin/(app)/events/[id]/registrations/page.tsx` — reshape

1. **Drop the "Check-in" header link** — it points at the now-deleted attendance page.
2. **Scope the per-row Mark-present control** with a new pure helper
   `isAttendanceEligible(reg, selectionMode)`:
   - `seats` → `true` for every row (unchanged from today).
   - `shortlist` → `true` only when `reg.shortlistedAt != null`.
   Non-eligible rows render "—" in the Check-in column (no button); the Attended column
   still shows their state read-only if somehow already set. This is the spec's
   "attendance lists only shortlisted rows," expressed inline on the existing table.
3. **Attendance badge** simplifies to a plain "Present" (there is only one method now —
   `manual` — so the `r.method ?? "yes"` badge no longer needs to distinguish self-scan).

`toggleAttendanceAction` gains **one guard**: it rejects a *mark-present* toggle on a
non-eligible row (shortlist event, non-shortlisted registration) via the same
`isAttendanceEligible` check, so the scope holds server-side and not only in the UI. An
*undo* (clearing `attended`) is always allowed, so a row shortlisted-then-unshortlisted
after being marked can still be corrected. Everything else in the action is unchanged.

## Data & migrations

- **No additive migration.** Every column the flow needs already exists:
  `registrations.attended`, `checked_in_at`, `checked_in_by`, `checkin_method`,
  `shortlisted_at`, and `events.selection_mode`.
- **One HELD drop migration** — `20260831000000_drop_event_self_scan.sql`
  (name `drop_event_self_scan`): `drop table if exists` for `attendance_scans`,
  `attendance_sessions`, and `student_devices` (order respects FKs). **Written but not
  applied.** Held until after the deploy so a `git revert` rollback still has working
  tables, matching the `drop_member_portal` / `drop_register_v1` pattern. The tables sit
  harmlessly unused until the owner applies it via Supabase MCP.
- `database.types.ts` is left as-is until the drop migration is applied (the dead table
  types are harmless); regenerate via the Supabase **MCP** at that point (the CLI
  truncates it — STATUS gotcha).

## Data flow (after)

1. Organiser opens `/admin/events/[id]/registrations`.
2. For a **seats** event: every confirmed registrant shows a **Mark present / Undo**
   button. For a **shortlist** event: only shortlisted registrants show the button;
   others show "—".
3. Clicking **Mark present** calls `toggleAttendanceAction` → sets `attended=true`,
   `checked_in_at=now()`, `checked_in_by=<actor>`, `checkin_method='manual'`, audited,
   own-club scoped. **Undo** clears them.
4. `attended` continues to feed results/participation certificates unchanged.

## Error handling

- Toggling attendance on a cross-club event (grant `own`, other club) → guarded no-op
  (existing `canManage` check).
- Toggling a non-eligible row (shortlist event, not shortlisted) → server-side no-op
  (new guard) even if the button were forged; the UI never shows the button anyway.
- Anon on the admin route → existing 307→login / 401 guards.
- Visiting a deleted route (`/a/<session>`, `/api/attendance/*`, `/api/devices/enroll`)
  → 404, which is correct — the surface is gone.

## Testing

- **Unit (vitest):** `isAttendanceEligible` — `seats` returns true regardless of
  shortlist state; `shortlist` returns true only when `shortlistedAt` is set. Add to the
  existing registrations/attendance test area.
- **Removal proof:** typecheck + lint + full build succeed with no dangling imports;
  the whole existing test suite stays green (nothing imports the deleted modules).
- **Route smoke (curl-able):** `/a/<anything>` → 404; `GET /api/attendance/code` → 404;
  `POST /api/attendance/scan` → 404; `POST /api/devices/enroll` → 404;
  `/admin/events/<id>/attendance` → 404; `/admin/events/<id>/registrations` (no cookie)
  → 307→login (unchanged).
- **Owed human walkthrough** (server-action POST can't be curled): on a **shortlist**
  event, confirm only shortlisted rows show **Mark present**, mark one → `attended` set,
  Undo clears it; confirm a non-shortlisted row has no button. On a **seats** event,
  confirm every confirmed row is markable. (Shared/live DB — no test rows created here;
  reuse an existing event, undo after.)

## Back-compat

- Existing events keep working: `selection_mode` defaults `seats`, so their whole
  registrant list stays markable exactly as before.
- Historical `attended` rows created by the old self-scan remain valid (`checkin_method`
  may be a non-`manual` value on old rows; the read path tolerates any value).
- No public event-page change — students never had a link to the scanner; they reached
  it only by camera-scanning the organiser's on-screen QR, which is gone.

## Out of scope (YAGNI)

- **A dedicated batch attendance roster page** — owner chose inline marking on the
  registrations table.
- **Bulk "mark all present."**
- **Event attendance analytics** (the club-member dashboard has analytics; events don't
  get them here).
- **Any public event-page change.**
- **Dropping the dead tables now** — deferred to the held migration, owner's call.

## Open decisions — resolved (owner, 2026-08-31)

- QR self-scan fate: **removed entirely** (UI, routes, lib; tables via held drop migration).
- Marking UX: **inline per-row toggle on the registrations table** — no separate roster page.
- Attendance scope: **seats → all confirmed; shortlist → shortlisted only.**
- Dead self-scan tables: **kept behind a held drop migration**, not dropped now.
