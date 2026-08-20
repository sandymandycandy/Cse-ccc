-- ============================================================================
-- 0003 · Content, admin operations, email, audit (BUILD_PLAN §8, §11, §14)
-- ============================================================================

do $$ begin create type recruitment_status as enum ('open','closed','waitlist');
exception when duplicate_object then null; end $$;

do $$ begin create type resource_kind as enum ('drive','doc','template');
exception when duplicate_object then null; end $$;

do $$ begin create type email_status as enum ('pending','sent','failed');
exception when duplicate_object then null; end $$;

-- ── achievements (wall of fame) ──
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs(id) on delete set null,
  title       text not null,
  description text,
  happened_on date,
  image_path  text,
  created_by  uuid references public.admin_users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists achievements_club_id_idx on public.achievements (club_id);

-- ── announcements (Markdown, sanitised on write+read — SPEC §5) ──
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  body_markdown text not null,
  published_at  timestamptz,
  author_id     uuid references public.admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists announcements_published_at_idx on public.announcements (published_at);
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- ── gallery ──
create table if not exists public.gallery (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references public.clubs(id) on delete set null,
  event_id   uuid references public.events(id) on delete set null,
  image_path text not null,
  caption    text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists gallery_club_id_idx on public.gallery (club_id);
create index if not exists gallery_event_id_idx on public.gallery (event_id);

-- ── join_requests (PII — no public read) ──
create table if not exists public.join_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  roll_no     text not null,
  email       text not null,
  phone       text,
  club_choices uuid[] not null default '{}',   -- up to 3 clubs
  message     text,
  status      text not null default 'new',
  created_at  timestamptz not null default now()
);

-- ── contact_messages (PII — no public read) ──
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  subject    text,
  message    text not null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── resources (Drive links etc.; §2.1) ──
create table if not exists public.resources (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references public.clubs(id) on delete cascade,
  title      text not null,
  url        text not null,
  kind       resource_kind not null default 'drive',
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists resources_club_id_idx on public.resources (club_id);

-- ── recruitment_drives (§13.11) ──
create table if not exists public.recruitment_drives (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  status      recruitment_status not null default 'closed',
  start_date  date,
  end_date    date,
  slots       int check (slots is null or slots >= 0),
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists recruitment_drives_club_id_idx on public.recruitment_drives (club_id);

-- ── media (upload library — SPEC §10) ──
create table if not exists public.media (
  id            uuid primary key default gen_random_uuid(),
  path          text not null,
  original_name text,
  mime          text not null,
  width         int,
  height        int,
  size_bytes    bigint,
  uploaded_by   uuid references public.admin_users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── email_log (queue-based sending — §11, SPEC §13) ──
create table if not exists public.email_log (
  id         uuid primary key default gen_random_uuid(),
  template   text not null,
  to_email   text not null,
  to_name    text,
  subject    text not null,
  payload    jsonb not null default '{}'::jsonb,
  priority   int not null default 5,
  status     email_status not null default 'pending',
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_status_priority_idx
  on public.email_log (status, priority, created_at) where status = 'pending';

-- ── email_preferences (unsubscribe — §13.7) ──
create table if not exists public.email_preferences (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  roll_no          text,
  reminders_opt_in boolean not null default true,
  digest_opt_in    boolean not null default true,
  unsubscribed_at  timestamptz,
  token_hash       text not null unique,
  created_at       timestamptz not null default now()
);

-- ── event_feedback (§13.11) ──
create table if not exists public.event_feedback (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events(id) on delete cascade,
  rating             int not null check (rating between 1 and 5),
  comment            text,
  submitted_via_token boolean not null default true,
  created_at         timestamptz not null default now()
);
create index if not exists event_feedback_event_id_idx on public.event_feedback (event_id);

-- ── audit_log (append-only — SPEC §14) ──
create table if not exists public.audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor_id  uuid references public.admin_users(id) on delete set null,
  action    text not null,
  entity    text not null,
  entity_id text,
  before    jsonb,
  after     jsonb,
  ip        inet,
  ua        text,
  at        timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
