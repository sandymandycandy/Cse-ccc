-- ============================================================================
-- 0005 · Row-Level Security — SECURITY_SPEC §4 (three-layer authz, Layer 3).
--
-- Model: default-deny on every table. The app's SERVER code uses the Supabase
-- service_role key, which has BYPASSRLS — so all admin reads/writes and every
-- write to PII happen through validated server code, never the anon key.
-- Public, read-only content gets narrow anon SELECT policies. PII tables get
-- NO anon policy and have privileges revoked outright.
-- ============================================================================

-- ── enable RLS on every table ──
alter table public.clubs                enable row level security;
alter table public.admin_users          enable row level security;
alter table public.admin_totp           enable row level security;
alter table public.admin_invites        enable row level security;
alter table public.club_members         enable row level security;
alter table public.venues               enable row level security;
alter table public.blackout_dates       enable row level security;
alter table public.events               enable row level security;
alter table public.event_clubs          enable row level security;
alter table public.venue_bookings       enable row level security;
alter table public.event_rounds         enable row level security;
alter table public.registrations        enable row level security;
alter table public.results              enable row level security;
alter table public.waitlist             enable row level security;
alter table public.attendance_sessions  enable row level security;
alter table public.student_devices      enable row level security;
alter table public.attendance_scans     enable row level security;
alter table public.certificates         enable row level security;
alter table public.achievements         enable row level security;
alter table public.announcements        enable row level security;
alter table public.gallery              enable row level security;
alter table public.join_requests        enable row level security;
alter table public.contact_messages     enable row level security;
alter table public.resources            enable row level security;
alter table public.recruitment_drives   enable row level security;
alter table public.media                enable row level security;
alter table public.email_log            enable row level security;
alter table public.email_preferences    enable row level security;
alter table public.event_feedback       enable row level security;
alter table public.audit_log            enable row level security;

-- ── PII / sensitive: default deny, and revoke privileges outright (SPEC §4, §11) ──
-- No policy is created for these, so anon/authenticated see nothing; revoking
-- privileges is belt-and-braces so even a future stray policy can't leak them.
revoke all on public.admin_users         from anon, authenticated;
revoke all on public.admin_totp          from anon, authenticated;
revoke all on public.admin_invites       from anon, authenticated;
revoke all on public.registrations       from anon, authenticated;
revoke all on public.venue_bookings      from anon, authenticated;
revoke all on public.waitlist            from anon, authenticated;
revoke all on public.attendance_sessions from anon, authenticated;
revoke all on public.student_devices     from anon, authenticated;
revoke all on public.attendance_scans    from anon, authenticated;
revoke all on public.certificates        from anon, authenticated;
revoke all on public.join_requests       from anon, authenticated;
revoke all on public.contact_messages    from anon, authenticated;
revoke all on public.media               from anon, authenticated;
revoke all on public.email_log           from anon, authenticated;
revoke all on public.email_preferences   from anon, authenticated;
revoke all on public.event_feedback      from anon, authenticated;
revoke all on public.audit_log           from anon, authenticated;

-- audit_log is append-only: nobody may UPDATE/DELETE, not even the app's
-- service_role (BYPASSRLS only bypasses policies, not table privileges) (SPEC §14).
revoke update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- ── public, read-only content: grant SELECT + narrow policies ──
grant select on public.clubs, public.club_members, public.venues,
                public.blackout_dates, public.events, public.event_clubs,
                public.event_rounds, public.results, public.achievements,
                public.announcements, public.gallery, public.resources,
                public.recruitment_drives
  to anon, authenticated;

create policy clubs_public_read on public.clubs
  for select to anon, authenticated using (is_active = true);

create policy club_members_public_read on public.club_members
  for select to anon, authenticated using (true);

create policy venues_public_read on public.venues
  for select to anon, authenticated using (true);

create policy blackout_dates_public_read on public.blackout_dates
  for select to anon, authenticated using (true);

-- Only approved, non-cancelled events are public; cancelled ones stay visible
-- for 7 days struck-through (§5.6). Drafts/pending/rejected are never exposed.
create policy events_public_read on public.events
  for select to anon, authenticated using (
    approval_status = 'approved'
    and (status <> 'cancelled' or cancelled_at > now() - interval '7 days')
  );

create policy event_clubs_public_read on public.event_clubs
  for select to anon, authenticated using (
    exists (
      select 1 from public.events e
      where e.id = event_clubs.event_id
        and e.approval_status = 'approved' and e.status <> 'cancelled'
    )
  );

create policy event_rounds_public_read on public.event_rounds
  for select to anon, authenticated using (
    exists (
      select 1 from public.events e
      where e.id = event_rounds.event_id
        and e.approval_status = 'approved' and e.status <> 'cancelled'
    )
  );

-- Standings are public only once published (§13.9).
create policy results_public_read on public.results
  for select to anon, authenticated using (
    published_at is not null
    and exists (
      select 1 from public.events e
      where e.id = results.event_id and e.approval_status = 'approved'
    )
  );

create policy achievements_public_read on public.achievements
  for select to anon, authenticated using (true);

create policy announcements_public_read on public.announcements
  for select to anon, authenticated using (
    published_at is not null and published_at <= now()
  );

create policy gallery_public_read on public.gallery
  for select to anon, authenticated using (true);

create policy resources_public_read on public.resources
  for select to anon, authenticated using (true);

create policy recruitment_drives_public_read on public.recruitment_drives
  for select to anon, authenticated using (status <> 'closed');
