-- Club feedback portal. Two tables: a window (feedback_periods) that the
-- President opens and closes BY HAND (no cron, no auto-close — design D4), and
-- the responses collected while it is open.
--
-- Deliberately NOT a `kind` column on contact_messages: feedback carries three
-- numeric ratings against two identified people, and the whole point is to
-- average them per club per period. Same call the repo made for
-- admin_password_resets vs admin_invites.

create table public.feedback_periods (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.admin_users (id) on delete set null,
  closed_by uuid references public.admin_users (id) on delete set null
);

-- At most one window open at a time, enforced by the database rather than by
-- app convention. The expression references a column (so it is a legal index
-- expression — Postgres rejects a constant like `((true))`) and is always true
-- inside the partial index's WHERE, so two open rows collide.
create unique index feedback_periods_one_open
  on public.feedback_periods ((closed_at is null))
  where closed_at is null;

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.feedback_periods (id) on delete cascade,
  vtu text not null,
  student_name text not null,
  club_id uuid not null references public.clubs (id) on delete cascade,

  -- head_name is a SNAPSHOT, not a join. Leaders turn over every academic year
  -- and a rating must stay attached to whoever held the post when it was given,
  -- or next year's head inherits this year's two-star reviews. Never backfill
  -- these names from the id. Same denormalisation as results.display_name.
  head_admin_id uuid references public.admin_users (id) on delete set null,
  head_name text,
  head_rating smallint check (head_rating between 1 and 5),
  head_comment text,

  vice_admin_id uuid references public.admin_users (id) on delete set null,
  vice_name text,
  vice_rating smallint check (vice_rating between 1 and 5),
  vice_comment text,

  club_rating smallint not null check (club_rating between 1 and 5),
  activities_feedback text not null,
  suggestions text,
  created_at timestamptz not null default now()
);

create index feedback_responses_period_club_idx
  on public.feedback_responses (period_id, club_id);

-- The curated per-club pick (design D1). Several clubs have more than one
-- club_head account on file, so the form cannot just query for "the" head.
alter table public.clubs
  add column feedback_head_id uuid references public.admin_users (id) on delete set null,
  add column feedback_vice_head_id uuid references public.admin_users (id) on delete set null;

-- RLS on with NO policies: service-role only. Responses are PII (VTU + name +
-- free text about named people) and the promise on the form is that they stay
-- confidential.
alter table public.feedback_periods enable row level security;
alter table public.feedback_responses enable row level security;

-- The second lock. RLS with no policies already blocks reads, but the table-wide
-- grant survives `create table` (see 20260820120005_rls.sql:43-53 and the
-- 2026-09-03 admin_password_resets follow-up). Without this, one accidentally
-- permissive policy later would expose every response.
revoke all on public.feedback_periods from anon, authenticated;
revoke all on public.feedback_responses from anon, authenticated;
