-- Manual attendance + self-registration (additive half — safe to apply while the
-- old code still runs; the destructive drops live in 20260828010000).

-- 1. Sessions become scheduled meetings: name + date + time slot. Nullable so
--    existing rows survive; new sessions always set them. The old open/close
--    columns (status, closed_at) are left in place but unused.
alter table public.club_attendance_sessions
  add column if not exists session_date date,
  add column if not exists start_time   time,
  add column if not exists end_time      time;

-- 2. Self-registrations land pending. NULL = pending; a timestamp = onboarded.
alter table public.club_members
  add column if not exists approved_at timestamptz;
-- Existing members stay active.
update public.club_members set approved_at = created_at where approved_at is null;
-- One roster row per roll number.
create unique index if not exists club_members_roll_unique
  on public.club_members (roll_no) where roll_no is not null;

-- 3. The reusable self-registration link token (rotatable to kill a leaked link).
alter table public.clubs
  add column if not exists join_token uuid not null default gen_random_uuid();

-- 4. Private bucket for passport photos (PII — service-role read only).
insert into storage.buckets (id, name, public)
  values ('member-photos', 'member-photos', false)
  on conflict (id) do nothing;
