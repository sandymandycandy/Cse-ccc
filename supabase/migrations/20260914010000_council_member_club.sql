-- Which club a council member leads, for grouping on the public /team page.
--
-- Until now the ONLY link from a council member to a club was the free-text
-- `designation` they typed themselves ("Coding club/Head", "Cybersentinal club",
-- "Head yoga club"), which cannot be grouped or sorted reliably — the same club's
-- head and vice head sorted to opposite ends of the page.
--
-- Null is a permanent, valid state, not a migration artifact:
--   * council leadership (President, Vice President, …) is council-wide, no club;
--   * /council/join/[token] still lets a new member type any designation, so a
--     row can always arrive with no club until someone sets one in /admin/team.
-- `/team` renders those under a trailing "Council & other" group.
--
-- ON DELETE SET NULL, never CASCADE: deleting a club must not delete people.
-- No index — the table holds 27 rows and this column is never a search key.
alter table public.council_members
  add column if not exists club_id uuid references public.clubs(id) on delete set null;

comment on column public.council_members.club_id is
  'Club this member leads, for grouping on /team. Null = council-wide or unassigned.';
