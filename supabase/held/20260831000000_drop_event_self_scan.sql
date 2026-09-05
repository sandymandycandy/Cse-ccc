-- Held drop migration — retire the event QR self-scan subsystem (Feature B).
--
-- DO NOT APPLY until AFTER the Feature B deploy succeeds. Held so a `git revert`
-- rollback of the deploy still has working tables. The new code no longer
-- references these tables; they sit harmlessly unused until this is applied via
-- the Supabase MCP `apply_migration` (name: drop_event_self_scan).
--
-- Order respects FKs: attendance_scans references attendance_sessions and
-- student_devices, so it drops first.

drop table if exists public.attendance_scans;
drop table if exists public.attendance_sessions;
drop table if exists public.student_devices;
