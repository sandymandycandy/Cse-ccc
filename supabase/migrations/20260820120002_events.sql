-- ============================================================================
-- 0002 · Events, scheduling, registration, attendance, certificates
-- The time model is (starts_at, ends_at) timestamptz — BUILD_PLAN §6.
-- ============================================================================

do $$ begin create type event_status as enum ('draft','published','cancelled','completed');
exception when duplicate_object then null; end $$;

do $$ begin create type approval_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin create type checkin_method as enum ('door','self','manual');
exception when duplicate_object then null; end $$;

do $$ begin create type attendance_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

do $$ begin create type round_status as enum ('pending','active','completed');
exception when duplicate_object then null; end $$;

do $$ begin create type certificate_type as enum ('participation','winner');
exception when duplicate_object then null; end $$;

-- ── events ──
create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  rules                 text,
  poster_path           text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  is_all_day            boolean not null default false,
  venue_id              uuid references public.venues(id) on delete set null,
  capacity              int check (capacity is null or capacity >= 0),
  status                event_status not null default 'draft',
  approval_status       approval_status not null default 'pending',
  approved_by           uuid references public.admin_users(id) on delete set null,
  rejection_reason      text,
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  waitlist_enabled      boolean not null default true,
  certificate_template  text,
  reminder_sent         boolean not null default false,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  rescheduled_from      uuid references public.events(id) on delete set null,
  created_by            uuid references public.admin_users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint events_time_order check (ends_at > starts_at)
);
create index if not exists events_venue_id_idx on public.events (venue_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists events_approved_by_idx on public.events (approved_by);
create index if not exists events_rescheduled_from_idx on public.events (rescheduled_from);
-- public calendar/list queries: approved & not cancelled, ordered by time
create index if not exists events_public_time_idx on public.events (starts_at)
  where approval_status = 'approved' and status <> 'cancelled';

create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ── event_clubs (co-hosting, §13.1) ──
create table if not exists public.event_clubs (
  event_id   uuid not null references public.events(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (event_id, club_id)
);
create index if not exists event_clubs_club_id_idx on public.event_clubs (club_id);
-- exactly one primary club per event
create unique index if not exists event_clubs_one_primary_idx
  on public.event_clubs (event_id) where is_primary;

-- ── venue_bookings + exclusion constraint (§6) ──
-- The database itself refuses a double-booking, even if app code is bypassed.
create table if not exists public.venue_bookings (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  constraint venue_bookings_time_order check (ends_at > starts_at),
  constraint venue_bookings_no_overlap
    exclude using gist (
      venue_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
);
create index if not exists venue_bookings_event_id_idx on public.venue_bookings (event_id);

-- ── event_rounds + results (§13.9) ──
create table if not exists public.event_rounds (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null,
  sort       int not null default 0,
  status     round_status not null default 'pending',
  starts_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_rounds_event_id_idx on public.event_rounds (event_id);

-- ── registrations (PII; §12.4, §12.7) ──
create table if not exists public.registrations (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id) on delete cascade,
  student_name       text not null,
  roll_no            text not null,
  department         text,
  year               int check (year is null or (year between 1 and 5)),
  email              text not null,
  phone              text,
  team_members       jsonb,
  confirm_token_hash text,               -- one-tap email confirmation (§12.4)
  confirmed_at       timestamptz,        -- seat held until confirmed / hold expiry
  attended           boolean not null default false,
  checkin_token_hash text,               -- door-scan QR, hash only (§12.5)
  checked_in_at      timestamptz,
  checked_in_by      uuid references public.admin_users(id) on delete set null,
  checkin_method     checkin_method,
  created_at         timestamptz not null default now(),
  constraint registrations_event_roll_unique unique (event_id, roll_no)
);
create index if not exists registrations_event_id_idx on public.registrations (event_id);
create index if not exists registrations_checked_in_by_idx on public.registrations (checked_in_by);
-- lookups by roll for /my-events happen server-side; index supports them
create index if not exists registrations_roll_no_idx on public.registrations (roll_no);

-- ── results (published standings feed winner certs, §13.9) ──
create table if not exists public.results (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  round_id        uuid references public.event_rounds(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  roll_no         text not null,
  rank            int,
  score           numeric,
  advanced        boolean not null default false,
  remarks         text,
  published_at    timestamptz,          -- public read only once set (§13.9)
  created_at      timestamptz not null default now()
);
create index if not exists results_event_id_idx on public.results (event_id);
create index if not exists results_round_id_idx on public.results (round_id);
create index if not exists results_registration_id_idx on public.results (registration_id);

-- ── waitlist (§13.6) ──
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  roll_no     text not null,
  email       text not null,
  position    int not null,
  promoted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint waitlist_event_roll_unique unique (event_id, roll_no)
);
create index if not exists waitlist_event_id_idx on public.waitlist (event_id);

-- ── attendance_sessions + scans + student_devices (§13.8) ──
create table if not exists public.attendance_sessions (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  round_id       uuid references public.event_rounds(id) on delete set null,
  opened_by      uuid references public.admin_users(id) on delete set null,
  opened_at      timestamptz not null default now(),
  window_seconds int not null default 60,
  rotate_seconds int not null default 5,
  status         attendance_status not null default 'open',
  allowed_cidr   cidr,
  require_geo    boolean not null default false,
  venue_lat      double precision,
  venue_lng      double precision,
  geo_radius_m   int,
  closed_at      timestamptz
);
create index if not exists attendance_sessions_event_id_idx on public.attendance_sessions (event_id);

-- one active phone per roll: partial unique index on live devices
create table if not exists public.student_devices (
  id           uuid primary key default gen_random_uuid(),
  roll_no      text not null,
  email        text not null,
  device_hash  text not null,
  enrolled_at  timestamptz not null default now(),
  last_seen_at timestamptz,
  user_agent   text,
  revoked_at   timestamptz
);
create unique index if not exists student_devices_device_hash_idx
  on public.student_devices (device_hash);
create unique index if not exists student_devices_active_roll_idx
  on public.student_devices (roll_no) where revoked_at is null;

-- one scan per device per session (enforces §13.8 "one scan per device")
create table if not exists public.attendance_scans (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.attendance_sessions(id) on delete cascade,
  device_hash     text not null,
  registration_id uuid references public.registrations(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint attendance_scans_session_device_unique unique (session_id, device_hash)
);
create index if not exists attendance_scans_registration_id_idx
  on public.attendance_scans (registration_id);

-- ── certificates (§12.6) ──
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references public.registrations(id) on delete set null,
  event_id        uuid not null references public.events(id) on delete cascade,
  type            certificate_type not null,
  placement       int,                       -- winner placement (1,2,3…)
  serial          text not null unique,      -- CSE-2026-XXXX-XXXX (128-bit)
  hmac            text not null,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references public.admin_users(id) on delete set null,
  revoked_at      timestamptz,
  revoked_reason  text,
  download_path   text
);
create index if not exists certificates_event_id_idx on public.certificates (event_id);
create index if not exists certificates_registration_id_idx on public.certificates (registration_id);
create index if not exists certificates_issued_by_idx on public.certificates (issued_by);
