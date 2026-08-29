-- ============================================================================
-- Event registration form builder — additive schema (spec 2026-08-29).
-- Adds per-event form schema + selection mode, custom answers + shortlist
-- state on registrations, and relaxes identity NOT NULLs so a from-scratch
-- form can omit roll/email. Dedup becomes partial-unique (only when present).
-- ============================================================================

do $$ begin create type selection_mode as enum ('seats','shortlist');
exception when duplicate_object then null; end $$;

alter table public.events
  add column if not exists selection_mode selection_mode not null default 'seats',
  add column if not exists registration_form jsonb;

alter table public.registrations
  add column if not exists custom_answers jsonb,
  add column if not exists shortlisted_at timestamptz;

alter table public.registrations alter column student_name drop not null;
alter table public.registrations alter column roll_no      drop not null;
alter table public.registrations alter column email        drop not null;

-- roll dedup only when a roll was actually collected
alter table public.registrations drop constraint if exists registrations_event_roll_unique;
create unique index if not exists registrations_event_roll_unique
  on public.registrations (event_id, roll_no) where roll_no is not null;

-- email dedup fallback — only for rows with no roll (roll-based forms use the index above)
create unique index if not exists registrations_event_email_unique
  on public.registrations (event_id, email) where email is not null and roll_no is null;

create index if not exists registrations_shortlisted_idx
  on public.registrations (event_id) where shortlisted_at is not null;
