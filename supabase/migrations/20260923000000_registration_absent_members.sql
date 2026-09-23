-- Per-person event attendance. `attended` still means the team (or solo
-- registrant) showed up; this lists the team positions — index into the
-- registration's team as teamOf() reads it, leader = 0 — that did not.
-- Empty = everyone present, so every existing attended row keeps its meaning.
alter table public.registrations
  add column if not exists absent_members smallint[] not null default '{}';
