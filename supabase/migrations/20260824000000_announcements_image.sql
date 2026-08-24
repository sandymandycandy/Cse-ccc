-- Announcements image support (Phase 2). Applied to the live project via the
-- Supabase MCP; this file mirrors it so the repo stays the source of truth.

-- Cover image column (nullable text add is metadata-only — no table rewrite).
alter table public.announcements add column if not exists image_path text;

-- Public bucket for announcement images. `public = true` makes objects readable
-- by URL (fine for public notices). No write policy is added, so only the
-- service-role server action can upload (least privilege). Server-side caps:
-- images only, <= 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcements', 'announcements', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;
