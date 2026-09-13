-- Per-person profile content for `/team/<id>`: a hand-written description and a
-- photo, both optional, both edited in /admin/team.
--
-- ⚠️ DO NOT APPLY WITH `supabase db push` — see docs/STATUS.md. Apply via the
-- Supabase MCP `apply_migration` tool.
--
-- `bio` replaces the generic "Part of the CSE Club Council…" paragraph on a
-- member's profile when set; that sentence remains the fallback so a member with
-- no description does not render a bare page. Stored and rendered as PLAIN TEXT
-- (no Markdown, no HTML) — it is shown with `white-space: pre-line`, so line
-- breaks survive without opening a rich-text injection surface.
--
-- `photo_path` is an object name in the `council-photos` bucket, never a URL:
-- the project ref has already changed once (Seoul -> Mumbai, 2026-09-05), and
-- storing absolute URLs would have broken every photo that day.
alter table public.council_members
  add column if not exists bio        text,
  add column if not exists photo_path text;

-- Public bucket: these photos appear on a public page, so unlike the private
-- `member-photos` bucket they are world-readable. No write policy is created —
-- the bucket has none, so only the service-role server path can upload
-- (least privilege, SECURITY_SPEC), exactly like `gallery` and `announcements`.
-- 2 MB is generous for a headshot; the mime list matches handleImageUpload's EXT
-- map, so a file the app accepts is never rejected by the bucket instead.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'council-photos', 'council-photos', true, 2097152,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;
