-- Certificate base templates (spec 2026-09-15-certificate-base-templates-design.md §2).
--
-- Council-wide base designs (Participants / Volunteers / Winners). An event's
-- group FOLLOWS its base while its own `design` is null, and becomes custom the
-- moment an event-level design is saved. Issued certificates are unaffected:
-- each is tied to the immutable design version it was issued with.
--
-- ⚠️ Applied through the Supabase MCP apply_migration tool. NEVER `supabase db push`.

create type public.certificate_base_kind as enum ('participants', 'volunteers', 'winners');

-- Winners can come from results (phase 2). Not used below, so the rule that a new
-- enum value can't be used in the transaction that adds it does not bite.
alter type public.certificate_group_kind add value if not exists 'results';

create table public.certificate_bases (
  kind            public.certificate_base_kind primary key,
  design          jsonb not null,
  source_event_id uuid references public.events(id) on delete set null,
  updated_by      uuid references public.admin_users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.certificate_bases enable row level security;
revoke all on public.certificate_bases from anon, authenticated;

alter table public.certificate_groups
  add column base_kind public.certificate_base_kind,
  add column position_column text,
  alter column design drop not null;
alter table public.certificate_groups
  add constraint certificate_groups_design_or_base
  check (design is not null or base_kind is not null);

create unique index certificate_groups_one_per_base
  on public.certificate_groups (event_id, base_kind) where base_kind is not null;

-- Existing Participants groups get their base slot. One with no template and
-- nothing issued starts following; one with a real design stays custom.
update public.certificate_groups set base_kind = 'participants' where kind = 'participants';
update public.certificate_groups g
   set design = null
 where g.kind = 'participants'
   and coalesce(g.design->'page'->'template', 'null'::jsonb) = 'null'::jsonb
   and not exists (select 1 from public.certificates c where c.group_id = g.id);

-- Typed volunteers (D12): roll no. as a real column, and the upload RPC writes it.
alter table public.certificate_sheet_rows add column roll text;

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
  insert into public.certificate_sheet_rows (group_id, row_no, name, email, roll, data)
  select p_group_id,
         (r->>'row_no')::int,
         r->>'name',
         nullif(r->>'email', ''),
         nullif(r->>'roll', ''),
         coalesce(r->'data', '{}'::jsonb)
    from jsonb_array_elements(p_rows) as r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.replace_certificate_sheet_rows(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.replace_certificate_sheet_rows(uuid, jsonb) to service_role;
