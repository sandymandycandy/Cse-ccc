-- Council / leadership attendance (a third attendance surface, distinct from
-- club-member and event attendance). Applied to the live project via the Supabase
-- MCP; this file mirrors it so the repo stays the source of truth. Additive +
-- RLS-on-no-policies → existing code is unaffected; all access is service-role.

-- 1. Council roster. Self-registrations land pending (approved_at IS NULL); an
--    admin onboards by stamping approved_at. No club_id — the council is org-wide.
--    Separate roll_no uniqueness, so no collision with club_members.
create table if not exists public.council_members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  roll_no     text,
  email       text,
  phone       text,
  designation text not null,                 -- self-reported title, e.g. "Robotics Club Head"
  is_active   boolean not null default true,
  approved_at timestamptz,                   -- NULL = pending onboarding
  created_at  timestamptz not null default now()
);
create unique index if not exists council_members_roll_unique
  on public.council_members (roll_no) where roll_no is not null;

-- 2. A council meeting. Manual marking only — no live check-in window, so (unlike
--    the club table) there is no one-open-session constraint.
do $$ begin
  create type public.council_session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.council_attendance_sessions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  session_date date,
  start_time   time,
  end_time     time,
  opened_by    uuid references public.admin_users(id),
  opened_at    timestamptz not null default now(),
  status       public.council_session_status not null default 'open',
  closed_at    timestamptz
);

-- 3. One row = one member marked present in one session (UNIQUE is the dedup guard).
create table if not exists public.council_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.council_attendance_sessions(id) on delete cascade,
  member_id  uuid not null references public.council_members(id) on delete cascade,
  marked_by  uuid references public.admin_users(id),
  marked_at  timestamptz not null default now(),
  unique (session_id, member_id)
);
create index if not exists council_attendance_member on public.council_attendance (member_id);

-- 4. Singleton settings row holding the rotatable join-link token.
create table if not exists public.council_settings (
  id         uuid primary key default gen_random_uuid(),
  singleton  boolean not null default true,
  join_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint council_settings_singleton check (singleton),   -- only `true` allowed →
  unique (singleton)                                          -- combined ⇒ exactly one row
);
insert into public.council_settings (singleton) values (true) on conflict do nothing;

-- 5. RLS ON, NO policies → anon/auth clients get nothing; all access via service role.
alter table public.council_members             enable row level security;
alter table public.council_attendance_sessions enable row level security;
alter table public.council_attendance          enable row level security;
alter table public.council_settings            enable row level security;
