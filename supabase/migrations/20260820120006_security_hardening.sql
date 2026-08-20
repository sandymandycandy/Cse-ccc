-- ============================================================================
-- 0006 · Security hardening — clears Supabase advisor WARNs raised after
-- 0001–0005 (append-only; earlier migrations are left as applied).
-- ============================================================================

-- 1) Pin search_path on the updated_at trigger function (function_search_path_mutable).
alter function public.set_updated_at() set search_path = '';

-- 2) Supabase default privileges re-grant EXECUTE on new functions to
--    anon/authenticated, so `revoke ... from public` in 0004 was insufficient.
--    Explicitly revoke the server-only RPCs — they are invoked only by server
--    code through the service_role.
revoke execute on function public.check_event_clash(uuid,timestamptz,timestamptz,uuid) from anon, authenticated;
revoke execute on function public.day_load_heatmap(date,date) from anon, authenticated;
revoke execute on function public.promote_from_waitlist(uuid) from anon, authenticated;
revoke execute on function public.redeem_attendance_scan(uuid,text,uuid) from anon, authenticated;
-- get_registration_count stays anon-callable by design (returns a bare integer, §11).

-- 3) rls_auto_enable() is a pre-existing event-trigger safety net (auto-enables
--    RLS on new public tables). It must never be REST-callable; the event
--    trigger keeps firing regardless of these EXECUTE grants.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- NOTE (accepted): the `btree_gist` "extension in public schema" advisory is left
-- as-is. Relocating a live extension that backs the venue-booking exclusion
-- constraint carries more risk than the informational warning is worth.
