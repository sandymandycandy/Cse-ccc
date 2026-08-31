# Council / Leadership Attendance — Design

**Status:** approved design, pre-implementation
**Date:** 2026-08-31
**Spec ref:** BUILD_PLAN §3 (org hierarchy / roles), §13.8 (attendance patterns),
SECURITY_SPEC §4 (capabilities), §5 (service-role writes). Parallels the shipped
club-member attendance (`2026-08-28-manual-attendance`).
**Owner ask (2026-08-31):** attendance for the **layer-2 council group** (the 6 core
council roles) plus the **club heads and vice-heads**, taken by the **president, vice-
president, and tech head**. Members get onto the roster by a **join link** (self-register
→ pending) and are **manually onboarded** — nobody is added automatically. Marking is
**manual present/absent**, like the club-member system the owner already uses.

## Goal

A **third, independent attendance surface** — distinct from club-member attendance and
event attendance — for the org-wide **council / leadership** body. Its roster is a
dedicated member list (**not** derived from `admin_users`, **not** one of the 11 clubs):
the 6 layer-2 council roles (president, vice-president, tech_head, events_head, docs_head,
social_media_head) plus every club_head and vice_head. People self-register through a
council **join link** and land **pending**; the president/VP/tech head **onboard** them
(or add a member by hand), then run **council meeting sessions** and mark **present/
absent** manually.

The guiding test: "a council member opens the council join link, fills their details, and
waits; the president onboards them; at the next council meeting the president opens a
session, ticks who showed up, and saves — and each member's attendance % is tracked."

This is **Approach B** from brainstorming: a dedicated council subsystem that **reuses the
tested pure engine** and **mirrors** the club-member UI, rather than overloading "club"
(which would leak the council into the public `/clubs` directory, event club-pickers, and
the global `club_members` roll-number uniqueness).

## What already exists (reused, not rebuilt)

- **Pure attendance math** — `src/lib/admin/attendance-math.ts` (`summarizeAttendance`:
  eligible/attended/pct from session dates + a member join date + a present-set) and
  `src/lib/admin/attendance-presence.ts` (`diffPresence`: current vs desired → add/remove).
  Both are group-agnostic and used **directly**.
- **Self-register validation** — `src/lib/roster/validation.ts` exports `ROLL_RE`,
  `PHONE_RE`, `VELTECH_EMAIL_RE`, `validateRegistration`. The council validator reuses the
  three regexes and the roll↔email rule, adding a `designation` field.
- **Self-register form** — `src/components/roster/SelfRegisterForm.tsx` (inline per-field
  400 errors, mobile-first). The council form mirrors it plus a designation input and a
  `/api/council/register` endpoint.
- **The club-member admin UI patterns** — the member list / pending-onboard / add-edit
  pages (`/admin/(app)/attendance/members/*`) and the session-marking page
  (`/admin/(app)/attendance/sessions/[id]`) are mirrored for the council.
- **Capability guards** — `canManage` / `canView` / `viewableCapabilities` /
  `grantFor` (`src/lib/auth/capabilities.ts`), extended with one new capability.
- **Service-role admin client**, `writeAudit`, the `/admin/*` proxy guard.

## Data model — one additive migration (`council_attendance`)

`migration: 20260831010000_council_attendance.sql` (applied to the live/shared DB via the
Supabase MCP; regenerate `database.types.ts` via the MCP afterward — the CLI truncates it).

```sql
-- Council roster. Self-registrations land pending (approved_at IS NULL); an admin
-- onboards by stamping approved_at. No club_id — the council is org-wide. Separate
-- roll_no uniqueness, so no collision with club_members.
create table if not exists public.council_members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  roll_no     text,
  email       text,
  phone       text,
  designation text not null,                 -- self-reported title, e.g. "Robotics Club Head"
  is_active   boolean not null default true,
  approved_at timestamptz,                   -- NULL = pending onboarding
  created_at  timestamptz not null default now()
);
create unique index if not exists council_members_roll_unique
  on public.council_members (roll_no) where roll_no is not null;

-- A council meeting. Manual marking only — no live check-in window, so (unlike the
-- club table) there is no one-open-session constraint.
do $$ begin
  create type public.council_session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.council_attendance_sessions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  session_date date,
  start_time   time,
  end_time     time,
  opened_by    uuid references public.admin_users(id),
  opened_at    timestamptz not null default now(),
  status       public.council_session_status not null default 'open',
  closed_at    timestamptz
);

-- One row = one member marked present in one session (UNIQUE is the dedup guard).
create table if not exists public.council_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.council_attendance_sessions(id) on delete cascade,
  member_id  uuid not null references public.council_members(id) on delete cascade,
  marked_by  uuid references public.admin_users(id),
  marked_at  timestamptz not null default now(),
  unique (session_id, member_id)
);
create index if not exists council_attendance_member on public.council_attendance (member_id);

-- Singleton settings row holding the rotatable join-link token.
create table if not exists public.council_settings (
  id         uuid primary key default gen_random_uuid(),
  singleton  boolean not null default true,
  join_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint council_settings_singleton check (singleton),   -- only `true` allowed →
  unique (singleton)                                          -- combined ⇒ exactly one row
);
insert into public.council_settings (singleton) values (true) on conflict do nothing;

-- RLS ON, NO policies → anon/auth clients get nothing; all access via the service role.
alter table public.council_members            enable row level security;
alter table public.council_attendance_sessions enable row level security;
alter table public.council_attendance         enable row level security;
alter table public.council_settings           enable row level security;
```

- **No Storage bucket** — v1 collects no photo (deferred).
- `roll_no`/`email`/`phone` are nullable at the DB (mirrors `club_members`) but **required
  by the validator** on both self-register and admin add. `designation` is `not null`.

## Permissions — new capability `manage:council`

Added to `src/lib/auth/capabilities.ts`:

```ts
"manage:council" // the council / leadership attendance roster + sessions (org-wide)
```

Matrix row (org-wide — no club scope, so only `all`/`read`/`none`):

```ts
"manage:council": {
  faculty_advisor: "read", president: "all", vice_president: "all", tech_head: "all",
},
```

- `canManage(session, "manage:council")` (no `resourceClubId`) → `true` for pres/VP/tech
  (`all`), `false` for faculty (`read`) and everyone else — exactly the intended takers.
- `canView` / `viewableCapabilities` surface a **Council** nav item for pres/VP/tech
  (manage) and faculty (read-only view).
- **Club heads and vice-heads appear on the roster (are marked present) but hold no
  `manage:council` grant — they cannot open sessions or edit the roster.**
- **View-guard note:** council pages gate viewing with `canView(session, "manage:council")`
  (any non-none grant), **not** `canViewClub` — the latter requires a `resourceClubId` and
  returns `false` for a null club, so it would wrongly lock faculty out of an org-wide
  surface. Mutations use `canManage(session, "manage:council")` (no club arg).
- No change to `proxy.ts` — `/admin/*` is already guarded; unauth council pages 307→login.

## Roster intake — join link + manual onboard

- **Public join** `src/app/council/join/[token]/page.tsx` — resolves the token against
  `council_settings.join_token` (`getCouncilByJoinToken`, non-uuid/mismatch → `notFound`,
  mirroring `getClubByJoinToken`). Renders the council self-register form.
- **Self-register form** (mirror of `SelfRegisterForm`) → **`POST /api/council/register`**
  (`src/app/api/council/register/route.ts`): 100 KB cap, validates via the council
  validator, inserts a **pending** `council_members` row (`approved_at = null`), dedups on
  `roll_no`. Rejections return `{ fields: {...} }` (400, no write); the form shows each
  inline. Route-handler API (curl-testable).
- **Admin roster** `src/app/admin/(app)/council/members/page.tsx` — a **Pending onboarding**
  section (Onboard / Reject) above the **Onboarded** roster (serial #s + each member's %),
  a **Copy join link** control (+ rotate token), and **Add member** → `members/new`;
  **Edit** → `members/[id]/edit`. All actions in `council/actions.ts`, gated by
  `canManage(session, "manage:council")`, audited.

## Sessions + manual marking

- **Dashboard** `src/app/admin/(app)/council/page.tsx` — **Create meeting** (title +
  `session_date` + `start_time`/`end_time`), a **session history** list with present-counts
  and an **Open** button per row, and the roster with per-member %.
- **Marking** `src/app/admin/(app)/council/sessions/[id]/page.tsx` — the present/absent
  roster (a checkbox per onboarded+active member, seeded from existing marks). **Save**
  diffs the present-set (`diffPresence` → insert newly-present, delete newly-absent), and
  **close / reopen** flips `status` (stamping/clearing `closed_at`). Draft = saved while
  still open.
- **Attendance %** via the reused `summarizeAttendance`: a member is eligible for every
  session dated on/after their `created_at`; % = attended ÷ eligible. `attended ≤ eligible`
  always.

## Data layer — `src/lib/admin/attendance-council.ts`

Mirrors `attendance-club.ts` **minus `club_id`** (single org-wide group): `listSessions`,
`createSession`, `setSessionStatus`, `getSessionMarking`, `savePresence`,
`rosterWithPercent`, plus roster reads (`listMembers`, pending/onboarded split) and
`getCouncilByJoinToken` / `rotateJoinToken`. Reuses `summarizeAttendance` + `diffPresence`.
Omitted in v1: `membershipCounts`/analytics and `getMemberAttendanceByRoll` (deferred).

## Files map

- Create migration `supabase/migrations/20260831010000_council_attendance.sql`.
- Modify `src/lib/auth/capabilities.ts` (+ `capabilities.test.ts`) — add `manage:council`.
- Create `src/lib/council/validation.ts` (+ test) — reuse roster regexes + `designation`.
- Create `src/lib/admin/attendance-council.ts` — data layer.
- Create `src/app/council/join/[token]/page.tsx` + a council self-register form component.
- Create `src/app/api/council/register/route.ts`.
- Create admin pages under `src/app/admin/(app)/council/`: `page.tsx`, `members/page.tsx`,
  `members/new/page.tsx`, `members/[id]/edit/page.tsx`, `sessions/[id]/page.tsx`,
  `actions.ts`.
- Add a **Council** entry to the admin nav (capability-driven, like the other sections).
- Regenerate `src/lib/database.types.ts` via the Supabase MCP after the migration.

## Error handling

- Bad/mismatched join token → `/council/join/[token]` `notFound` (404).
- Invalid self-register payload → 400 `{ fields:{...} }`, no write; inline per-field errors.
- Duplicate roll on register → friendly "already registered" (mirrors club dedup).
- Non-privileged admin (grant `read`/none) reaching a council mutation → guarded no-op /
  redirect (`canManage` false); anon → 307→login (proxy).
- Missing `council_settings` row → the admin layer creates/ensures the singleton on first
  read (defensive; the migration seeds it).

## Testing

- **Unit (vitest):** council validator — designation required (empty/too-long rejected),
  and the reused roll/email/phone/roll↔email rules (mirror `roster/validation.test.ts`);
  `manage:council` grants in `capabilities.test.ts` (pres/VP/tech = all, faculty = read,
  club_head/others = none). The pure `summarizeAttendance`/`diffPresence` are already tested.
- **Route smoke (curl-able):** `/council/join/not-a-uuid` → 404; `POST /api/council/register`
  with a bad body → 400 **without a write**; `/admin/council` (no cookie) → 307→login.
- **DB-layer/pages:** typecheck + lint + build (project convention — server-action POSTs
  can't be curled).
- **Owed human walkthrough:** open the council join link → self-register one member (→
  pending) → pres/VP/tech **Onboard** → **create a meeting** → **mark present/absent + Save**
  → confirm the member's % moves; confirm a club_head login sees **no** Council manage
  controls. (Shared/live DB — delete the test member after.)

## Back-compat

Purely additive — new tables, one new capability, new routes. No existing table, route, or
capability changes; club-member and event attendance are untouched. Existing roles gain a
Council nav item only where the new grant is non-none (pres/VP/tech/faculty).

## Out of scope (YAGNI / deferred)

- **Public council roll-lookup** (a `/council/attendance` self-check page) — deferred.
- **Analytics panel** (attendance rate, per-session most/least, low-attendance watchlist) —
  deferred; the club `computeClubAnalytics` engine can be reused later.
- **Member photos** and a private bucket.
- **Structured designation picker** — v1 is free-text.
- **Event-linked council sessions**, and a **one-open-session** constraint (unnecessary for
  manual marking).
- **Deriving the roster from `admin_users`** — explicitly rejected; the roster is its own
  self-registered list.

## Open decisions — resolved (owner, 2026-08-31)

- Roster: the **6 layer-2 core roles (incl. president & VP) + all club heads + all vice-
  heads**, self-registered.
- Takers: **president + vice-president + tech head** (`manage:council` = all); faculty read.
- Intake: **join link → pending → manual onboard**, plus manual add/edit — nobody added
  automatically.
- Model: **dedicated council subsystem** (Approach B), reusing the pure engine.
- v1 scope: **admin-side only** — no public lookup, no analytics; **free-text designation**.
