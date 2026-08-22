-- §13.9: denormalized student name for public standings. Populated from the
-- student's registration at seed/save time; only ever public once the round is
-- published (existing results_public_read RLS gates on published_at). Additive
-- and nullable — safe on the live DB, no RLS change needed.
alter table public.results add column display_name text;
