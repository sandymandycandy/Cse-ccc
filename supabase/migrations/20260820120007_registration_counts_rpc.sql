-- ============================================================================
-- 0007 · Batch seat-count RPC for public event lists.
-- Anon cannot read `registrations` (PII), so seat counts come from this
-- SECURITY DEFINER function, which returns bare integers only. One call covers
-- many events (avoids N round-trips). Intentionally anon-callable, like §11's
-- get_registration_count.
-- ============================================================================
create or replace function public.get_registration_counts(p_event_ids uuid[])
returns table (event_id uuid, registered int)
language sql
security definer
set search_path = ''
stable
as $$
  select r.event_id, count(*)::int
  from public.registrations r
  where r.event_id = any(p_event_ids)
    and r.confirmed_at is not null
  group by r.event_id;
$$;

revoke execute on function public.get_registration_counts(uuid[]) from public;
grant execute on function public.get_registration_counts(uuid[]) to anon, authenticated, service_role;
