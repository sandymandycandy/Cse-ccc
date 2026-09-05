-- A curated feedback leader who is a NAME rather than an account.
--
-- feedback_head_id / feedback_vice_head_id can only point at an admin_users
-- row, so a club whose real head or vice head holds no admin account resolves
-- to nobody — and the public form omits that block entirely (FeedbackForm.tsx
-- guards on `club.viceHead`), so the club silently collects no feedback for
-- that person. Three clubs are in exactly that state for vice head today.
--
-- These columns let the council name them by hand. Precedence lives in
-- src/lib/feedback/leaders.ts and is: the account pick wins, then the typed
-- name, then the sole candidate, then nobody. The typed name deliberately
-- outranks the sole-candidate fallback — typing is explicit, inferring is not.
--
-- A response still snapshots the name into feedback_responses.head_name at
-- submit time, with head_admin_id left null. Renaming here never rewrites a
-- rating already given, same rule as the snapshot comment on that table.

alter table public.clubs
  add column feedback_head_name text,
  add column feedback_vice_head_name text;

-- Trimmed and capped in the server action too; the check is the backstop that
-- keeps a direct SQL edit from putting an empty string on the public form,
-- which would render as a named block with a blank name.
alter table public.clubs
  add constraint clubs_feedback_head_name_len
    check (feedback_head_name is null or char_length(feedback_head_name) between 1 and 80),
  add constraint clubs_feedback_vice_head_name_len
    check (feedback_vice_head_name is null or char_length(feedback_vice_head_name) between 1 and 80);

comment on column public.clubs.feedback_head_name is
  'Hand-typed club head for the feedback form, for a head with no admin account. Ignored when feedback_head_id resolves.';
comment on column public.clubs.feedback_vice_head_name is
  'Hand-typed vice head for the feedback form, for a vice head with no admin account. Ignored when feedback_vice_head_id resolves.';
