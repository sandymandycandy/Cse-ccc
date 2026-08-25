-- Lock student roll numbers (PII) out of the public anon API.
--
-- public.club_members carries a table-wide `grant select ... to anon,
-- authenticated` plus a `using (true)` public-read policy (see
-- 20260820120005_rls.sql) so the public roster can be read with the anon key.
-- Phase-1 attendance added the `roll_no` column (20260824030000_club_attendance.sql),
-- and because SELECT grants and RLS are row- not column-level, anon could then
-- read roll numbers directly through PostgREST
-- (`/rest/v1/club_members?select=roll_no`) regardless of what app code selects.
--
-- roll_no is admin-only (card printing / disambiguation, SPEC §4.1) and is only
-- ever read server-side through the service-role client, which bypasses grants.
-- So we replace the table-wide SELECT with a column-level grant covering every
-- column EXCEPT roll_no. Bonus: future columns added to this table are no longer
-- auto-exposed to anon.
--
-- Applied to the live project via the Supabase MCP; this file mirrors it so the
-- repo stays the source of truth.

revoke select on public.club_members from anon, authenticated;

grant select
  (id, club_id, name, role, photo_path, socials, sort, is_active, created_at)
  on public.club_members to anon, authenticated;
