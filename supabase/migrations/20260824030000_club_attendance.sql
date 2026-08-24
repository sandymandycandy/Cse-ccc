-- Club-member QR attendance (Phase 1). Applied to the live project via the
-- Supabase MCP; this file mirrors it so the repo stays the source of truth.

-- 1. Extend the member roster with an optional identifier + an active flag.
alter table public.club_members
  add column if not exists roll_no text,
  add column if not exists is_active boolean not null default true;

-- 2. A club attendance session (one club meeting). Dedicated status enum — NOT
--    coupled to the event attendance_sessions enum.
do $$ begin
  create type public.club_session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.club_attendance_sessions (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  title      text not null,
  opened_by  uuid references public.admin_users(id),
  opened_at  timestamptz not null default now(),
  status     public.club_session_status not null default 'open',
  closed_at  timestamptz,
  event_id   uuid references public.events(id) on delete set null   -- Phase-2 seam; unused now
);

-- At most one OPEN session per club at a time.
create unique index if not exists club_sessions_one_open
  on public.club_attendance_sessions (club_id) where status = 'open';

-- 3. One row = one member marked present in one session (the UNIQUE is the
--    duplicate-scan guard).
create table if not exists public.club_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.club_attendance_sessions(id) on delete cascade,
  member_id  uuid not null references public.club_members(id) on delete cascade,
  marked_by  uuid references public.admin_users(id),
  marked_at  timestamptz not null default now(),
  unique (session_id, member_id)
);
create index if not exists club_attendance_member on public.club_attendance (member_id);

-- 4. RLS ON, NO permissive policies → anon/auth clients get nothing; all access
--    is via the service role (server actions/routes). Matches SECURITY_SPEC.
alter table public.club_attendance_sessions enable row level security;
alter table public.club_attendance enable row level security;
