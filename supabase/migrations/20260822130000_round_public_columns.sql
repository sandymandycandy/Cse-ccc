-- §13.9: per-round control over which standings columns are shown publicly.
-- Rank + name always show; these gate score / advanced / remarks. Default true
-- so existing published rounds keep showing everything. Additive, safe.
alter table public.event_rounds
  add column show_score boolean not null default true,
  add column show_advanced boolean not null default true,
  add column show_remarks boolean not null default true;
