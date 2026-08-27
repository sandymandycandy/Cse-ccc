-- Events: manual (typed) venue + cover poster. Applied to the live project via
-- the Supabase MCP / SQL editor; this file mirrors it so the repo stays the
-- source of truth (the Supabase CLI is not installed here).

-- Free-typed venue on events (the admin UI switches from a venue_id dropdown to
-- a text field). venue_id is kept on the table but no longer set from the form.
alter table public.events add column if not exists venue_text text;

-- Backfill existing events' free-text venue from their linked venue's name so
-- nothing shows "TBA" after the UI switches to venue_text.
update public.events e
  set venue_text = v.name
  from public.venues v
  where e.venue_id = v.id and e.venue_text is null;

-- Public bucket for event cover posters (mirrors the gallery/announcements
-- buckets: public read by URL, no write policy → only the service-role server
-- action can upload; images only, <= 5 MB). The events.poster_path column
-- already exists in the schema.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-posters', 'event-posters', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;
