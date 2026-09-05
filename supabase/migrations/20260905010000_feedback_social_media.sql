-- Council-wide social-media feedback, collected on the same student form.
--
-- Two independent ratings: the TEAM's output (posts, reels, event coverage) and
-- the Social Media Head as a person. Either may be left blank — the form's rule
-- throughout is that forcing a number out of someone with no opinion produces a
-- noisy average.
--
-- Lives on feedback_responses rather than in its own table because it is part of
-- one student's one submission, and every read already loads that row. The cost
-- is that a student who submits for several clubs carries their social rating on
-- each: `src/lib/admin/social-feedback.ts` therefore counts each STUDENT once,
-- keeping their most recent submission. Do not average these columns directly.
--
-- social_lead_name is a SNAPSHOT, exactly like head_name/vice_name: leaders turn
-- over every year and a rating must stay attached to whoever held the post when
-- it was given. Never backfill it from social_lead_admin_id.

alter table public.feedback_responses
  add column social_team_rating smallint check (social_team_rating between 1 and 5),
  add column social_team_comment text,
  add column social_lead_admin_id uuid references public.admin_users (id) on delete set null,
  add column social_lead_name text,
  add column social_lead_rating smallint check (social_lead_rating between 1 and 5),
  add column social_lead_comment text;

comment on column public.feedback_responses.social_team_rating is
  'Council social media TEAM output, 1-5. Council-wide: average per student, not per response.';
comment on column public.feedback_responses.social_lead_name is
  'Snapshot of the Social Media Head named on the form at submit time. Never re-derive from social_lead_admin_id.';
