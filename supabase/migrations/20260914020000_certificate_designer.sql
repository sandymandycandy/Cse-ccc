-- Certificate designer (docs/superpowers/specs/2026-09-14-certificate-designer-design.md §4).
-- Additive and backwards-safe. Apply through the Supabase MCP `apply_migration`
-- tool — NEVER `supabase db push` on this project (see docs/STATUS.md).
--
-- Adds recipient groups with a working design each, immutable design versions,
-- uploaded sheet rows (used from phase 2), recipient snapshot columns on the
-- existing `certificates` ledger, three atomic helpers, and a private bucket for
-- design assets. v1's `events.certificate_template/config` stay untouched; the
-- app converts them into a design the first time an event's page is opened.

do $$ begin
  create type public.certificate_group_kind as enum ('participants', 'sheet');
exception when duplicate_object then null; end $$;

create table if not exists public.certificate_groups (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  kind          public.certificate_group_kind not null,
  name          text not null check (char_length(name) between 1 and 60),
  design        jsonb not null,
  sheet_columns text[] not null default '{}',
  sort          int not null default 0,
  created_by    uuid references public.admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists certificate_groups_event_idx on public.certificate_groups (event_id);
create unique index if not exists certificate_groups_one_participants
  on public.certificate_groups (event_id) where kind = 'participants';

create table if not exists public.certificate_design_versions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.certificate_groups(id) on delete set null,
  hash       text not null,
  design     jsonb not null,
  created_at timestamptz not null default now(),
  unique (group_id, hash)
);

create table if not exists public.certificate_sheet_rows (
  id       uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.certificate_groups(id) on delete cascade,
  row_no   int not null,
  name     text not null,
  email    text,
  data     jsonb not null default '{}'::jsonb
);
create index if not exists certificate_sheet_rows_group_idx on public.certificate_sheet_rows (group_id);

alter table public.certificates
  add column if not exists group_id          uuid references public.certificate_groups(id) on delete set null,
  add column if not exists design_version_id uuid references public.certificate_design_versions(id),
  add column if not exists recipient_key     text,
  add column if not exists recipient_name    text,
  add column if not exists recipient_email   text,
  add column if not exists snapshot          jsonb,
  add column if not exists superseded_by     uuid references public.certificates(id);

-- Backfill v1 rows: every one is a participation certificate for a registration.
update public.certificates c
   set recipient_key   = 'reg:' || c.registration_id,
       recipient_name  = r.student_name,
       recipient_email = r.email,
       snapshot        = jsonb_build_object(
                           'values', jsonb_build_object('person.name', coalesce(r.student_name, '')),
                           'groupLabel', 'Participation')
  from public.registrations r
 where r.id = c.registration_id
   and c.recipient_key is null;

-- At most one live certificate per recipient per event — makes issuing race-safe.
create unique index if not exists certificates_one_live_per_recipient
  on public.certificates (event_id, recipient_key)
  where revoked_at is null and recipient_key is not null;

-- Same lockdown as `certificates` (20260820120005_rls.sql): service role only.
alter table public.certificate_groups          enable row level security;
alter table public.certificate_design_versions enable row level security;
alter table public.certificate_sheet_rows      enable row level security;
revoke all on public.certificate_groups          from anon, authenticated;
revoke all on public.certificate_design_versions from anon, authenticated;
revoke all on public.certificate_sheet_rows      from anon, authenticated;

-- Replace a sheet group's rows in one transaction (phase 2).
create or replace function public.replace_certificate_sheet_rows(p_group_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.certificate_sheet_rows where group_id = p_group_id;
  insert into public.certificate_sheet_rows (group_id, row_no, name, email, data)
  select p_group_id,
         (r->>'row_no')::int,
         r->>'name',
         nullif(r->>'email', ''),
         coalesce(r->'data', '{}'::jsonb)
    from jsonb_array_elements(p_rows) as r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Retire a live certificate and issue its replacement atomically (phase 2).
-- The old row stops being live before the new one is inserted, so the
-- one-live-per-recipient index never sees two.
create or replace function public.supersede_certificate(p_old_id uuid, p_new jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    public.certificates;
  v_new_id uuid;
begin
  select * into v_old from public.certificates where id = p_old_id and revoked_at is null for update;
  if not found then
    raise exception 'certificate % is not live', p_old_id using errcode = 'P0002';
  end if;

  update public.certificates
     set revoked_at = now(), revoked_reason = 'superseded'
   where id = p_old_id;

  insert into public.certificates (
    event_id, registration_id, type, placement, serial, hmac, issued_by,
    group_id, design_version_id, recipient_key, recipient_name, recipient_email, snapshot
  ) values (
    v_old.event_id, v_old.registration_id, v_old.type, v_old.placement,
    p_new->>'serial', p_new->>'hmac', nullif(p_new->>'issued_by', '')::uuid,
    nullif(p_new->>'group_id', '')::uuid, nullif(p_new->>'design_version_id', '')::uuid,
    v_old.recipient_key, p_new->>'recipient_name', nullif(p_new->>'recipient_email', ''), p_new->'snapshot'
  )
  returning id into v_new_id;

  update public.certificates set superseded_by = v_new_id where id = p_old_id;
  return v_new_id;
end;
$$;

-- Undo a supersede whose email failed: drop the replacement, make the old row live again.
create or replace function public.undo_supersede(p_new_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_id uuid;
begin
  select id into v_old_id from public.certificates where superseded_by = p_new_id;
  update public.certificates set superseded_by = null where id = v_old_id;
  delete from public.certificates where id = p_new_id;
  update public.certificates set revoked_at = null, revoked_reason = null where id = v_old_id;
end;
$$;

revoke execute on function public.replace_certificate_sheet_rows(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.replace_certificate_sheet_rows(uuid, jsonb) to service_role;
revoke execute on function public.supersede_certificate(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.supersede_certificate(uuid, jsonb) to service_role;
revoke execute on function public.undo_supersede(uuid) from public, anon, authenticated;
grant  execute on function public.undo_supersede(uuid) to service_role;

-- Private bucket for design assets (templates, logos, signatures). Storage
-- enforces the size and type caps on signed uploads too. No storage policy:
-- writes go through service-role-minted signed upload URLs, reads through
-- short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificate-assets', 'certificate-assets', false, 8388608, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
