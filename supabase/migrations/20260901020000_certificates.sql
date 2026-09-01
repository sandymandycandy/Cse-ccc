-- Participation certificates (BUILD_PLAN §12.6).
-- The `certificates` table + `certificate_type` enum + `events.certificate_template`
-- column already exist (20260820120002_events.sql). This migration only adds what
-- issuing needs on top: the per-event name-placement config and a storage bucket
-- for the uploaded template artwork. The uploaded template's object path is stored
-- in the existing `events.certificate_template` column. Additive & backwards-safe.

alter table public.events
  add column if not exists certificate_config jsonb;

-- Public bucket for uploaded template artwork (institutional, not sensitive) so
-- the admin positioner preview can render it. Writes are service-role only — no
-- storage policy is created, matching gallery / event-posters.
insert into storage.buckets (id, name, public)
values ('certificate-templates', 'certificate-templates', true)
on conflict (id) do nothing;
