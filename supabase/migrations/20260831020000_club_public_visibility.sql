-- Club public visibility flag. Hides a club from the PUBLIC site only
-- (home, /clubs directory, /clubs/[slug] page, calendar chips) while it stays
-- fully manageable in admin. Distinct from is_active ("operational").
-- Default true so every existing club stays visible — no regression.
alter table public.clubs
  add column is_public boolean not null default true;

comment on column public.clubs.is_public is
  'Listed on the public site (home, /clubs, /clubs/[slug], calendar chips). Council-only toggle. Distinct from is_active (operational).';
