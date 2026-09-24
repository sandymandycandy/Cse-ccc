-- An event's one-line pitch for the cards on the home and events pages.
--
-- Until now an event had only `description`, and the cards showed the start of
-- it — so a long pasted description (title repeated, then a prize list) became
-- a two-line clamp of whatever came first. `summary` is what the cards show;
-- the event page shows it as the intro, with the full description below.
--
-- Additive and nullable on purpose, so it can be applied while the OLD code is
-- still serving: an event without one falls back to the start of its
-- description, exactly as every event behaves today.
--
-- The length cap matches the admin form (src/app/admin/(app)/events/actions.ts).
-- No index: only ever read alongside the event row it belongs to.
alter table public.events
  add column if not exists summary text
    constraint events_summary_length check (summary is null or length(summary) <= 200);

comment on column public.events.summary is
  'Short description shown on event cards and as the event page intro. Falls back to the start of `description` when null.';
