-- ============================================================================
-- 0004 · RPCs (BUILD_PLAN §8). All SECURITY DEFINER with search_path pinned to
-- '' and every identifier schema-qualified (Supabase security best practice).
-- Execute is revoked from PUBLIC and granted narrowly at the bottom.
-- ============================================================================

-- Clash detection = real overlap query on the half-open interval (§6).
create or replace function public.check_event_clash(
  p_venue_id   uuid,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz,
  p_editing_id uuid default null
)
returns table (event_id uuid, title text, starts_at timestamptz, ends_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select e.id, e.title, e.starts_at, e.ends_at
  from public.events e
  where e.venue_id = p_venue_id
    and e.status <> 'cancelled'
    and (p_editing_id is null or e.id <> p_editing_id)
    and tstzrange(e.starts_at, e.ends_at, '[)')
        && tstzrange(p_starts_at, p_ends_at, '[)');
$$;

-- Bare integer seat count for public surfaces (§11 — never returns a row).
create or replace function public.get_registration_count(p_event_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::int
  from public.registrations r
  where r.event_id = p_event_id
    and r.confirmed_at is not null;
$$;

-- Per-day event load for the scheduling heatmap (§13.5), in IST.
create or replace function public.day_load_heatmap(p_from date, p_to date)
returns table (day date, event_count int)
language sql
security definer
set search_path = ''
stable
as $$
  select (e.starts_at at time zone 'Asia/Kolkata')::date as day, count(*)::int
  from public.events e
  where e.approval_status = 'approved'
    and e.status <> 'cancelled'
    and (e.starts_at at time zone 'Asia/Kolkata')::date between p_from and p_to
  group by 1
  order by 1;
$$;

-- Promote the next waitlisted student when a seat frees (§13.6). Row-locked with
-- SKIP LOCKED so concurrent sweeps never promote the same person twice.
create or replace function public.promote_from_waitlist(p_event_id uuid)
returns table (roll_no text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity int;
  v_count    int;
  v_row      public.waitlist%rowtype;
begin
  select capacity into v_capacity from public.events where id = p_event_id;
  if v_capacity is null then
    return;                       -- unlimited capacity: nothing to promote against
  end if;

  select count(*)::int into v_count
  from public.registrations
  where event_id = p_event_id and confirmed_at is not null;

  if v_count >= v_capacity then
    return;                       -- still full
  end if;

  select * into v_row
  from public.waitlist
  where event_id = p_event_id and promoted_at is null
  order by position asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.waitlist set promoted_at = now() where id = v_row.id;

  roll_no := v_row.roll_no;
  email   := v_row.email;
  return next;
end;
$$;

-- Atomic attendance redemption for rotating self-scan (§13.8). The rotating code
-- itself is verified in application code (it needs ATTENDANCE_HMAC_SECRET); this
-- guarantees one-scan-per-device-per-session and an idempotent attendance flip.
create or replace function public.redeem_attendance_scan(
  p_session_id      uuid,
  p_device_hash     text,
  p_registration_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.attendance_sessions%rowtype;
begin
  select * into v_session from public.attendance_sessions where id = p_session_id;
  if not found then
    return 'no_session';
  end if;

  if v_session.status <> 'open'
     or now() > v_session.opened_at + make_interval(secs => v_session.window_seconds) then
    return 'closed';
  end if;

  begin
    insert into public.attendance_scans (session_id, device_hash, registration_id)
    values (p_session_id, p_device_hash, p_registration_id);
  exception when unique_violation then
    return 'duplicate_device';    -- one scan per device per session
  end;

  update public.registrations
     set attended       = true,
         checked_in_at  = coalesce(checked_in_at, now()),
         checkin_method = 'self'
   where id = p_registration_id and attended = false;

  return 'ok';
end;
$$;

-- ── execute grants: deny by default, allow only where intended ──
revoke execute on function public.check_event_clash(uuid,timestamptz,timestamptz,uuid) from public;
revoke execute on function public.day_load_heatmap(date,date) from public;
revoke execute on function public.promote_from_waitlist(uuid) from public;
revoke execute on function public.redeem_attendance_scan(uuid,text,uuid) from public;

grant execute on function public.check_event_clash(uuid,timestamptz,timestamptz,uuid) to service_role;
grant execute on function public.day_load_heatmap(date,date) to service_role;
grant execute on function public.promote_from_waitlist(uuid) to service_role;
grant execute on function public.redeem_attendance_scan(uuid,text,uuid) to service_role;

-- Seat count is a bare integer and safe to call from the browser (anon).
grant execute on function public.get_registration_count(uuid) to anon, authenticated, service_role;
