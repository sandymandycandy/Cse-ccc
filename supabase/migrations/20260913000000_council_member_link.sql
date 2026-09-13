-- Public presentation fields for the council roster shown on `/team`:
-- two social links per person, plus an explicit publish flag.
--
-- ⚠️ DO NOT APPLY WITH `supabase db push` — see docs/STATUS.md. The migration
-- ledger and these filenames share no version numbers, so a push replays the
-- entire history. Apply via the Supabase MCP `apply_migration` tool, or paste
-- these statements into the dashboard SQL editor.
--
-- `is_public` DEFAULTS TO FALSE by owner decision (2026-09-13): nobody is
-- published to a crawlable page without an explicit click in /admin/team. That
-- means applying this migration EMPTIES /team until members are toggled public —
-- intended, not a bug.
--
-- This is distinct from `is_active`, which means "counts toward attendance".
-- A member can be active on the roster and deliberately unlisted in public.
--
-- Scheme safety is enforced in the app, not here: both URLs are checked with
-- isSafeHttpUrl() on write AND again on read, so a hand-inserted `javascript:`
-- value can never reach an href.
alter table public.council_members
  add column if not exists linkedin_url  text,
  add column if not exists instagram_url text,
  add column if not exists is_public     boolean not null default false;

-- Public reads hit exactly this predicate (is_public + approved + active).
create index if not exists council_members_public
  on public.council_members (is_public)
  where is_public and approved_at is not null;
