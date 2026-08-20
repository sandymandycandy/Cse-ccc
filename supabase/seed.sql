-- ============================================================================
-- Seed · the 11 canonical clubs (BUILD_PLAN §3.3, §4).
-- Idempotent: safe to re-run. Kept in sync with seed/clubs.csv and
-- src/lib/clubs.ts. `supabase db reset` runs this automatically; it can also be
-- applied directly (e.g. via the Supabase MCP).
--
-- Club taglines are PLACEHOLDERS pending real council copy (BUILD_PLAN §18 #6).
-- ============================================================================

insert into public.clubs (slug, name, short_name, category, color, tagline, sort) values
  ('coding',         'Coding Club',                          'Coding',          'tech',     '#3F5E4C', 'Contribution nights, ladder contests, ICPC training.', 1),
  ('innovation',     'Innovation Club',                      'Innovation',      'tech',     '#6B8E4E', 'Build weekends, prototyping jams and demo days.',      2),
  ('cybersentinel',  'CyberSentinel Club',                   'CyberSentinel',   'tech',     '#3B5675', 'CTFs, wargames and responsible-disclosure practice.',  3),
  ('animatrix',      'Animatrix Club',                       'Animatrix',       'media',    '#6B4A6B', 'Motion, 3D and the annual showreel night.',            4),
  ('magazine',       'Magazine Club',                        'Magazine',        'media',    '#8C5A2B', 'The department magazine, from pitch to print.',        5),
  ('fusion-fashion', 'Fusion & Fashion Club',                'Fusion & Fashion','cultural', '#A85751', 'Styling, choreography and the annual runway.',         6),
  ('nature',         'Nature Club',                          'Nature',          'wellness', '#4F7A5B', 'Trails, clean-ups and campus biodiversity walks.',     7),
  ('yoga',           'Yoga Club',                            'Yoga',            'wellness', '#7A8C5A', 'Morning sessions on the lawn, all levels welcome.',    8),
  ('aspirex',        'AspireX Club',                         'AspireX',         'career',   '#2F6B6B', 'Placement prep, mock interviews and alumni talks.',    9),
  ('appnova',        'AppNova Club',                         'AppNova',         'tech',     '#4A5E8C', 'Mobile and web app building, shipped in public.',      10),
  ('short-film',     'Short Film & Movie Appreciation Club', 'Short Film',      'media',    '#6E5A3F', 'Screenings, reviews and the 48-hour film race.',       11)
on conflict (slug) do update set
  name       = excluded.name,
  short_name = excluded.short_name,
  category   = excluded.category,
  color      = excluded.color,
  tagline    = excluded.tagline,
  sort       = excluded.sort,
  updated_at = now();
