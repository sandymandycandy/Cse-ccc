-- Gallery photo dimensions, so the public gallery can lay each photo out in its
-- OWN shape instead of forcing every one into a 3:2 crop (which was cutting the
-- tops and bottoms off portrait shots). Applied to the live project via the
-- Supabase MCP; this file mirrors it so the repo stays the source of truth.
--
-- Deliberately nullable with no backfill. The public grid is CSS multi-column
-- masonry, which derives each photo's shape from the image itself at paint
-- time — these columns only let the browser RESERVE the right space before the
-- image loads, so they are a layout-shift optimisation, not a requirement.
-- Existing rows keep working untouched and simply reflow slightly as they load.
alter table public.gallery
  add column if not exists image_w int,
  add column if not exists image_h int;
