-- ============================================================================
-- 0001 · Core: extensions, helpers, enums, org tables
-- CSE Club Council — data model (BUILD_PLAN.md §8, §3)
-- All identifiers lowercase; every FK gets an index; timestamps are timestamptz.
-- ============================================================================

create extension if not exists btree_gist;   -- for the venue-booking exclusion constraint (§6)

-- ── helper: keep updated_at fresh ──
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── enums (idempotent) ──
do $$ begin create type club_category as enum
  ('tech','media','cultural','wellness','career');
exception when duplicate_object then null; end $$;

do $$ begin create type admin_role as enum
  ('faculty_advisor','president','vice_president','tech_head','events_head',
   'docs_head','social_media_head','club_head','vice_head');
exception when duplicate_object then null; end $$;

do $$ begin create type member_role as enum ('head','vice_head','member');
exception when duplicate_object then null; end $$;

-- ── clubs ──
create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  short_name  text not null,
  category    club_category not null,
  color       text not null,            -- calendar-only colour (§4)
  tagline     text,
  description text,
  is_active   boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists clubs_category_idx on public.clubs (category);

create trigger clubs_set_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();

-- ── admin_users (login accounts) ──
-- No password is ever set by another admin: password_hash is null until the
-- invite is consumed (§11 / SPEC §3). session_epoch bumps to revoke all sessions.
create table if not exists public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  full_name      text not null,
  role           admin_role not null,
  club_id        uuid references public.clubs(id) on delete set null,
  password_hash  text,                       -- null until invite consumed
  is_active      boolean not null default true,
  session_epoch  int not null default 0,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- case-insensitive unique email
create unique index if not exists admin_users_email_lower_idx
  on public.admin_users (lower(email));
create index if not exists admin_users_club_id_idx on public.admin_users (club_id);

create trigger admin_users_set_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

-- ── admin_totp ──
create table if not exists public.admin_totp (
  admin_id              uuid primary key references public.admin_users(id) on delete cascade,
  secret_encrypted      text not null,
  confirmed_at          timestamptz,
  recovery_codes_hashed text[] not null default '{}'
);

-- ── admin_invites (single-use onboarding, §11) ──
create table if not exists public.admin_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        admin_role not null,
  club_id     uuid references public.clubs(id) on delete set null,
  token_hash  text not null unique,          -- 32-byte token, stored hashed
  expires_at  timestamptz not null,          -- 48h
  consumed_at timestamptz,
  created_by  uuid references public.admin_users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists admin_invites_club_id_idx on public.admin_invites (club_id);
create index if not exists admin_invites_created_by_idx on public.admin_invites (created_by);

-- ── club_members (public /team roster; distinct from admin_users) ──
create table if not exists public.club_members (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  name       text not null,
  role       member_role not null default 'member',
  photo_path text,
  socials    jsonb not null default '{}'::jsonb,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists club_members_club_id_idx on public.club_members (club_id);

-- ── venues ──
create table if not exists public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  building    text,
  capacity    int check (capacity is null or capacity >= 0),
  is_bookable boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── blackout_dates (§13.2) ──
create table if not exists public.blackout_dates (
  id         uuid primary key default gen_random_uuid(),
  starts_on  date not null,
  ends_on    date not null,
  reason     text not null,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists blackout_dates_range_idx on public.blackout_dates (starts_on, ends_on);
