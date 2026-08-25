-- Member portal: contact PII + login credentials + one-time login links.
-- See docs/superpowers/specs/2026-08-25-member-portal-design.md

-- 1. Contact PII on the roster row (email is also the login identifier).
alter table public.club_members add column if not exists email text;
alter table public.club_members add column if not exists phone text;

-- One email → one member (case-insensitive). One student = one club, so global.
create unique index if not exists club_members_email_unique
  on public.club_members (lower(email)) where email is not null;

-- 2. Credentials, isolated from the roster row. Service-role only.
create table if not exists public.club_member_auth (
  member_id        uuid primary key references public.club_members(id) on delete cascade,
  pin_hash         text,
  totp_secret_enc  text,
  totp_enrolled_at timestamptz,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  session_epoch    int not null default 0,
  activated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.club_member_auth enable row level security;
-- No policies + no grants to anon/authenticated ⇒ default deny (service role bypasses RLS).
revoke all on public.club_member_auth from anon, authenticated;

-- 3. One-time login links (mirrors admin_invites). Service-role only.
create table if not exists public.member_invites (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.club_members(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_by  uuid references public.admin_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists member_invites_token_hash_idx on public.member_invites (token_hash);
alter table public.member_invites enable row level security;
revoke all on public.member_invites from anon, authenticated;

-- 3b. Anti-proxy rotating QR (spec §6a): head-set validity window for the on-screen
--     member QR. Null ⇒ the portal falls back to a 60s default.
alter table public.club_attendance_sessions add column if not exists qr_ttl_seconds int;

-- 4. Keep the new PII off the anon column grant on club_members (extends
--    20260825000000_club_members_rollno_privacy.sql). Anon may read ONLY these
--    public columns; email/phone/roll_no stay server-side.
revoke select on public.club_members from anon;
grant select (id, club_id, name, role, photo_path, socials, sort, is_active, created_at)
  on public.club_members to anon;
