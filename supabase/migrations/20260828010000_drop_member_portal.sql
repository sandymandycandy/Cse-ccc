-- Manual attendance (destructive half). Apply ONLY AFTER the new code is deployed
-- to prod — the old member portal + old openSessionAction reference these objects.
drop table if exists public.member_invites;
drop table if exists public.club_member_auth;
alter table public.club_attendance_sessions drop column if exists qr_ttl_seconds;
drop index if exists public.club_sessions_one_open;
