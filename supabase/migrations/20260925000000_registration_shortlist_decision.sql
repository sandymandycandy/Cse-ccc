-- Shortlist review (spec 2026-09-25). The draft category an organiser gives a
-- registration on a shortlist-mode event: null = not decided. `shortlisted_at`
-- keeps its meaning — finalised and emailed — so attendance eligibility is
-- unchanged. Seats-mode events never read this column.
alter table public.registrations
  add column if not exists shortlist_decision text
    check (shortlist_decision in ('shortlist', 'waitlist'));

-- Rows shortlisted under the old one-click flow were already emailed: they are
-- Shortlisted and finalised, so Finalise never emails them again.
update public.registrations
  set shortlist_decision = 'shortlist'
  where shortlisted_at is not null and shortlist_decision is null;
