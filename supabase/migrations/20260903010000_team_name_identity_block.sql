-- Team name becomes a real identity block (owner ask, 2026-09-03).
--
-- It used to ride on a reserved payload key and was injected into the public
-- form automatically whenever the form had a team block. That worked, but the
-- admin form builder gave no sign it was being collected — the owner went
-- looking for it among the identity blocks and found nothing. It is now an
-- ordinary identity block a club adds and removes like Full name or Roll
-- number, mapping to registrations.team_name.
--
-- Trade-off the owner accepted: a club can now omit it, so a team event may
-- collect no team name at all.
--
-- This backfill keeps existing events behaving as they did: any event whose
-- form has a team block but no team_name block gets one inserted directly
-- BEFORE the team block (so "Team name" reads above "Team members"). Without
-- it, those events would silently stop collecting a team name the moment the
-- automatic field was removed.
--
-- Idempotent: the NOT EXISTS guard makes re-running a no-op.
with target as (
  select e.id,
         (select min(ord) from jsonb_array_elements(e.registration_form) with ordinality t(f, ord)
           where f->>'kind' = 'team') as team_pos
  from public.events e
  where jsonb_typeof(e.registration_form) = 'array'
    and exists (select 1 from jsonb_array_elements(e.registration_form) f where f->>'kind' = 'team')
    and not exists (select 1 from jsonb_array_elements(e.registration_form) f where f->>'identity' = 'team_name')
)
update public.events e
   set registration_form = (
     -- rebuild the array, slotting the new block in at team_pos - 0.5
     select jsonb_agg(elem order by ord)
     from (
       select f as elem, ord::numeric as ord
         from jsonb_array_elements(e.registration_form) with ordinality t(f, ord)
       union all
       select '{"id":"team_name","kind":"short_text","identity":"team_name","label":"Team name","required":true}'::jsonb,
              target.team_pos - 0.5
     ) x
   )
  from target
 where e.id = target.id;
