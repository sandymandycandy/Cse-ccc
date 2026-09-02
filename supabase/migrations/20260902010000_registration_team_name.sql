-- Team name on a registration (owner ask, 2026-09-02).
--
-- A team had no name anywhere in the system: it was identified only by its
-- leader's name plus a 1-based index. This adds a first-class column, filled by
-- a "Team name" box that appears on the public form for any event whose
-- registration form has a team block (required there, absent otherwise).
--
-- Nullable on purpose: every registration that already exists stays blank, and
-- the admin/public views fall back to "Team N · <leader>" for those.
alter table public.registrations
  add column if not exists team_name text;

-- ── register_for_event: same function, one extra parameter ──────────────────
--
-- ⚠️ Signature change, so read this before editing.
--
-- Postgres identifies a function by its argument types, so adding p_team_name
-- CREATES A SECOND FUNCTION rather than replacing the old one. If both existed
-- at once, the app's 8-named-argument call would match both and Postgres would
-- raise "function is not unique" — public registration would break outright.
--
-- So the 8-arg version is dropped here, in the SAME TRANSACTION as the create.
-- Run this file as one transaction (supabase CLI and apply_migration both do).
--
-- Deploy order does not matter: p_team_name has a DEFAULT, so the currently
-- deployed 8-argument call still resolves against the new function and simply
-- stores null. There is no window in which registration is broken.
create or replace function public.register_for_event(
  p_event_id       uuid,
  p_student_name   text  default null,
  p_roll_no        text  default null,
  p_email          text  default null,
  p_phone          text  default null,
  p_department     text  default null,
  p_year           int   default null,
  p_custom_answers jsonb default null,
  p_team_name      text  default null
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

  if v_event.approval_status <> 'approved' or v_event.status <> 'published' then
    status := 'closed'; registration_id := null; return next; return;
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    status := 'not_open'; registration_id := null; return next; return;
  end if;
  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    status := 'closed'; registration_id := null; return next; return;
  end if;

  -- dedup: roll if present, else email if present (covers confirmed + waitlisted)
  if p_roll_no is not null then
    select id into v_existing from public.registrations
     where event_id = p_event_id and roll_no = p_roll_no;
  elsif p_email is not null then
    select id into v_existing from public.registrations
     where event_id = p_event_id and email = p_email;
  end if;
  if v_existing is not null then
    status := 'duplicate'; registration_id := v_existing; return next; return;
  end if;

  -- shortlist mode: accept everyone, no capacity check
  if v_event.selection_mode = 'shortlist' then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, team_name, confirmed_at)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, p_team_name, now())
    returning id into v_new_id;
    status := 'submitted'; registration_id := v_new_id; return next; return;
  end if;

  -- seats mode: capacity check on confirmed rows
  select count(*) into v_occupied from public.registrations
   where event_id = p_event_id and confirmed_at is not null;

  if v_event.capacity is null or v_occupied < v_event.capacity then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, team_name, confirmed_at)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, p_team_name, now())
    returning id into v_new_id;
    status := 'registered'; registration_id := v_new_id; return next; return;

  elsif v_event.waitlist_enabled then
    -- waitlist = unconfirmed registration with the next per-event position
    select coalesce(max(waitlist_position), 0) + 1 into v_pos
      from public.registrations
      where event_id = p_event_id and confirmed_at is null;
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, team_name, confirmed_at, waitlist_position)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, p_team_name, null, v_pos)
    returning id into v_new_id;
    status := 'waitlisted'; registration_id := v_new_id; return next; return;

  else
    status := 'full'; registration_id := null; return next; return;
  end if;
end;
$$;

-- The old 8-argument overload must not survive: see the note above.
drop function if exists public.register_for_event(uuid,text,text,text,text,text,int,jsonb);

revoke execute on function public.register_for_event(uuid,text,text,text,text,text,int,jsonb,text) from public, anon, authenticated;
grant  execute on function public.register_for_event(uuid,text,text,text,text,text,int,jsonb,text) to service_role;
