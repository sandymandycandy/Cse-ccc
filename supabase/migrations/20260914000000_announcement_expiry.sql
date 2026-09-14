-- Optional expiry for announcements.
--
-- When set, the announcement stops appearing in the HOME HERO after this time.
-- It stays published everywhere else: /announcements, the home page's
-- Announcements section and its own detail page are all unaffected, so links
-- already shared with students keep working. Null = never leaves the hero.
--
-- No index: the filter runs in JS over the <=100 rows the home page already
-- fetches, so this column is never a search key.
alter table public.announcements
  add column if not exists expires_at timestamptz;

comment on column public.announcements.expires_at is
  'When set, the announcement stops showing in the home hero after this time. Null = never. Does not unpublish it.';
