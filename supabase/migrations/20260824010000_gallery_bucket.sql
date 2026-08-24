-- Gallery image support (Phase 2). Applied to the live project via the Supabase
-- MCP; this file mirrors it so the repo stays the source of truth.

-- Public bucket for gallery photos. `public = true` makes objects readable by
-- URL (fine for public event photos). No write policy is added, so only the
-- service-role server action can upload (least privilege). Server-side caps:
-- images only, <= 5 MB. The `gallery` table + RLS public-read already exist.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery', 'gallery', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;
