-- ============================================================================
-- 0008 · Registration + confirmation RPCs (BUILD_PLAN §9, §12.4).
-- SECURITY DEFINER so the atomic capacity check + insert bypass RLS; granted to
-- service_role ONLY — the Next API route (which owns Zod, rate limiting, honeypot
-- and Turnstile) calls these with the service-role client. Never anon-callable,
-- so there is no unthrottled insert path.
--
-- register_for_event: locks the event row, releases expired holds, dedups,
-- atomically checks capacity → 'registered' | 'waitlisted' | 'full', and stores
-- the one-tap confirmation token hash. A registration holds its seat until
-- confirmed (or 30 min elapses).
-- confirm_registration: flips confirmed_at for a valid, unconfirmed token.
-- ============================================================================

create or replace function public.register_for_event(
  p_event_id          uuid,
  p_student_name      text,
  p_roll_no           text,
  p_email             text,
  p_phone             text,
  p_department        text,
  p_year              int,
  p_confirm_token_hash text
)
returns table (status text, registration_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_occupied int;
  v_existing uuid;
  v_new_id   uuid;
  v_pos      int;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    status := 'no_event'; registration_id := null; return next; return;
  end if;

  if v_event.approval_status <> 'approved' or v_event.status <> 'published'
     or (v_event.registration_opens_at is not null and now() < v_event.registration_opens_at)
     or (v_event.registration_closes_at is not null and now() > v_event.registration_closes_at) then
    status := 'closed'; registration_id := null; return next; return;
  end if;

  -- release an expired unconfirmed hold for this roll (frees seat + unique slot)
  delete from public.registrations
   where event_id = p_event_id and roll_no = p_roll_no
     and confirmed_at is null and created_at < now() - interval '30 minutes';

  -- dedup: a confirmed reg or a still-valid hold blocks re-registration
  select id into v_existing from public.registrations
   where event_id = p_event_id and roll_no = p_roll_no;
  if v_existing is not null then
    status := 'duplicate'; registration_id := v_existing; return next; return;
  end if;

  -- occupied = confirmed + holds within the 30-minute window
  select count(*) into v_occupied from public.registrations
   where event_id = p_event_id
     and (confirmed_at is not null or created_at > now() - interval '30 minutes');

  if v_event.capacity is null or v_occupied < v_event.capacity then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, confirm_token_hash)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_confirm_token_hash)
    returning id into v_new_id;
    status := 'registered'; registration_id := v_new_id; return next; return;

  elsif v_event.waitlist_enabled then
    if exists (select 1 from public.waitlist where event_id = p_event_id and roll_no = p_roll_no) then
      status := 'duplicate'; registration_id := null; return next; return;
    end if;
    select coalesce(max(position), 0) + 1 into v_pos from public.waitlist where event_id = p_event_id;
    insert into public.waitlist (event_id, roll_no, email, position)
    values (p_event_id, p_roll_no, p_email, v_pos);
    status := 'waitlisted'; registration_id := null; return next; return;

  else
    status := 'full'; registration_id := null; return next; return;
  end if;
end;
$$;

create or replace function public.confirm_registration(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_confirmed timestamptz;
begin
  select id, confirmed_at into v_id, v_confirmed
    from public.registrations
   where confirm_token_hash = p_token_hash;
  if v_id is null then return 'invalid'; end if;
  if v_confirmed is not null then return 'already'; end if;
  update public.registrations set confirmed_at = now() where id = v_id;
  return 'confirmed';
end;
$$;

revoke execute on function public.register_for_event(uuid,text,text,text,text,text,int,text) from public, anon, authenticated;
revoke execute on function public.confirm_registration(text) from public, anon, authenticated;
grant  execute on function public.register_for_event(uuid,text,text,text,text,text,int,text) to service_role;
grant  execute on function public.confirm_registration(text) to service_role;
