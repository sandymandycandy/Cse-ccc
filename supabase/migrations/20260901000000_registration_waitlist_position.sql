-- ============================================================================
-- Waitlist folded into registrations: an unconfirmed row (confirmed_at IS NULL)
-- carrying a per-event queue position. Additive; safe on live prod (nullable).
-- ============================================================================
alter table public.registrations
  add column if not exists waitlist_position int;

-- Order the waitlist for an event; only unconfirmed rows carry a position.
create index if not exists registrations_waitlist_idx
  on public.registrations (event_id, waitlist_position)
  where confirmed_at is null and waitlist_position is not null;
