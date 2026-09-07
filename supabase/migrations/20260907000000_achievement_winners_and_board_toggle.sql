-- Achievements podium (spec 2026-09-07).
-- winners: hand-entered prize winners for wins that happen off-platform.
--   Shape: [{"rank":1,"name":"Rahul K","roll":"VTU28001"}]  (roll nullable)
--   Deliberately jsonb, not a child table: winners are always read with their
--   achievement and never queried alone, and this adds no new RLS surface.
alter table public.achievements
  add column if not exists winners jsonb;

-- show_on_achievements: lets a council admin keep one event's podium off the
-- public board. Defaults true, so every already-published result appears.
alter table public.events
  add column if not exists show_on_achievements boolean not null default true;

comment on column public.achievements.winners is
  'Manual prize winners: [{rank:1|2|3, name, roll|null}]. Validated on read by parseWinners.';
comment on column public.events.show_on_achievements is
  'When false, this event''s podium is hidden from /achievements.';
