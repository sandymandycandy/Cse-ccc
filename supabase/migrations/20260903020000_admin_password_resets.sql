-- Single-use, 1-hour password-reset tokens for admin accounts.
-- Deliberately NOT a `kind` column on admin_invites: an invite carries role +
-- club_id and may create an account, a reset may do neither. Separate tables
-- make "a reset cannot change a role" true by construction.
create table public.admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_password_resets_email_idx on public.admin_password_resets (email);

-- RLS on with NO policies: service-role only, exactly like admin_invites.
-- A readable token_hash plus a known email is a full account takeover.
alter table public.admin_password_resets enable row level security;

-- Default deny AND revoke outright, matching admin_invites / admin_totp
-- (20260820120005_rls.sql:43-53). RLS with no policies already blocks reads, but
-- the grant is a second lock: without this, one accidentally-permissive policy
-- later would expose token_hash, and PostgREST still surfaces the relation.
revoke all on public.admin_password_resets from anon, authenticated;
