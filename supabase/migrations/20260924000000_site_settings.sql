-- The public site's maintenance switch — one row, flipped from /admin.
--
-- Read by src/proxy.ts on public requests (anon key, 10 s cache) and written
-- only by the service-role client in the admin server action. Spec:
-- docs/superpowers/specs/2026-09-24-maintenance-switch-design.md
--
-- Seeded ON: production was in maintenance when this shipped, and deploying the
-- feature must not quietly bring the site back.
create table public.site_settings (
  -- `check (id)` makes `true` the only legal key, so a second row is impossible.
  id          boolean primary key default true check (id),
  maintenance boolean not null,
  updated_at  timestamptz not null default now(),
  -- set null, not cascade: removing an admin must not delete the switch.
  updated_by  uuid references public.admin_users(id) on delete set null
);

insert into public.site_settings (id, maintenance) values (true, true);

alter table public.site_settings enable row level security;

-- A fresh project hands anon/authenticated full privileges on every table
-- (see docs/STATUS.md, Mumbai migration), so start from nothing and grant
-- back exactly SELECT. One public boolean — nothing secret in it.
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;

create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);
