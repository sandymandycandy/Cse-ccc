-- The public /team page's editable per-person fields.
--
-- Keyed by the slug in src/data/ccc.ts ("s-anurudh"), NOT a generated uuid —
-- that is what lets a row and a file entry line up with no mapping table.
--
-- Deliberately has no layer/club/smt_group columns: those decide WHERE a person
-- renders, are not editable, and would become a second drifting copy of the
-- structure in src/data/ccc.ts.
--
-- Deliberately NOT council_members: that table is the council attendance
-- roster and is read by six other modules. Spec:
-- docs/superpowers/specs/2026-09-18-team-page-cms-design.md
create table public.team_profiles (
  member_id    text primary key,
  name         text not null,
  role         text not null,
  year         text,
  department   text,
  email        text not null,
  description  text,
  portfolio    text,
  -- null photo_path = use the bundled portrait in src/assets/team/.
  photo_path   text,
  -- coverPosition() in ccc.ts divides by the image aspect ratio. A static
  -- import supplies width/height; a Storage URL does not, so we store them.
  photo_width  integer,
  photo_height integer,
  -- data: URL for <Image placeholder="blur">, which throws for a remote src
  -- without one.
  photo_blur   text,
  focal_x      smallint not null default 50,
  focal_y      smallint not null default 50,
  updated_at   timestamptz not null default now(),
  -- set null, not cascade: removing an admin must not delete the profiles
  -- they last edited.
  updated_by   uuid references public.admin_users(id) on delete set null,
  constraint team_profiles_focal_x_range check (focal_x between 0 and 100),
  constraint team_profiles_focal_y_range check (focal_y between 0 and 100)
);

-- Service-role only, same posture as council_members: RLS on, no policies.
-- The page reads through the server; the browser never touches this table.
alter table public.team_profiles enable row level security;
