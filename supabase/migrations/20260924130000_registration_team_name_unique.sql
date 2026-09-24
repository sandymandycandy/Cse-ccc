-- One team name per event, enforced by the database.
--
-- The API already refuses a taken name (src/lib/registration/team-name.ts), but
-- that check and the insert are two steps: two teams submitting the same new
-- name in the same instant could both pass the check. This index makes the
-- second insert fail, and the API turns that failure into the same "already
-- taken" field error.
--
-- The key matches teamNameKey() + ilike: trimmed, runs of whitespace collapsed,
-- case-insensitive — so "Hello", " hello " and "HELLO" are one name. A null
-- team name (a solo event, or a form without the block) is never constrained.
--
-- Verified before applying (2026-09-24): no event had two registrations with the
-- same key, so the index builds without touching data.
create unique index if not exists registrations_event_team_name_unique
  on public.registrations (event_id, lower(regexp_replace(btrim(team_name), '\s+', ' ', 'g')))
  where team_name is not null;
