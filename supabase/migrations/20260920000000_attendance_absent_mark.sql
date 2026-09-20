-- Explicit "absent" marks for club attendance (admin layout upgrade).
--
-- ✅ APPLIED to the live project (jisahccdnthzgibszwnq, Mumbai) on 2026-09-20,
-- recorded there as version 20260920054746. All 1,947 existing rows backfilled
-- to 'present' — semantically a no-op, since a row already meant present.
-- Additive on purpose: it was safe to apply while the OLD code was still
-- serving, which is the window you want for a schema change on a live site.
--
-- Why a column and not a second table: the roster needs three states per member
-- per session — present, absent, and not-yet-looked-at — and today only two are
-- representable, because `club_attendance` is a presence-row table (a row means
-- present; no row means absent OR unmarked, indistinguishably). Marking someone
-- absent has to be a deliberate act that survives a reload, or a half-finished
-- roll call reads as a finished one with poor turnout.
--
-- After this:
--     row with status='present'  → marked present
--     row with status='absent'   → marked absent
--     no row                     → not yet marked
--
-- Turnout stays `count(*) where status='present'`, so an absent mark can never
-- inflate it.

-- 1. Dedicated enum — NOT coupled to club_session_status or the event-side
--    attendance_status, which mean different things and change independently.
do $$ begin
  create type public.club_attendance_mark as enum ('present','absent');
exception when duplicate_object then null; end $$;

-- 2. The mark. Defaulted to 'present' so any insert written by the CURRENT
--    code — which knows nothing about this column and only ever inserts rows
--    for people who are present — stays correct without being changed first.
alter table public.club_attendance
  add column if not exists status public.club_attendance_mark not null default 'present';

-- 3. Every row that already exists was written to mean "present". The default
--    above covers new rows; this covers the ones already there in case the
--    column was added in an earlier partial run without the default.
update public.club_attendance set status = 'present' where status is null;

-- 4. Turnout queries filter on status now, and they run per session.
create index if not exists club_attendance_session_status
  on public.club_attendance (session_id, status);

-- RLS is unchanged: the table already has RLS on with no permissive policies,
-- so all access stays service-role only (server actions/routes), per
-- SECURITY_SPEC. Adding a column does not widen that.
