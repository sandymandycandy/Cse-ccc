# Team page CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the President, Vice President and Tech Head edit every detail and portrait of all 46 people on `/team` from `/admin/team`, without a deploy.

**Architecture:** A new `team_profiles` table keyed by the `src/data/ccc.ts` member slug holds only the editable fields. The server page merges file + rows and passes the result through `TeamProvider` to the client components, which today read member data as module-level imports. Structure (layer, club, SMT group) and the roster itself stay in code. `council_members` is not touched.

**Tech Stack:** Next.js 16.3.1 (App Router, Turbopack), React 19.2.8, Supabase (project `jisahccdnthzgibszwnq`, Mumbai), vitest 4, TypeScript strict, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-18-team-page-cms-design.md`

## Global Constraints

- **Never `supabase db push`.** Migrations are applied with the Supabase MCP `apply_migration` tool or the dashboard SQL editor — see `docs/STATUS.md`.
- **Migration filenames:** `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, matching the existing `20260915000000_certificate_bases.sql` style.
- **`council_members` must not be altered, read, or written by anything this plan adds.** Six modules depend on it, including council attendance.
- **`src/data/ccc.ts` stays the roster and the outage fallback.** Never empty it, never delete `src/assets/team/`.
- **`admin_users` FKs are `uuid references public.admin_users(id) on delete set null`** — never `cascade`.
- **Repo is LF-only.** Do not write files with CRLF; a Python text-mode write turns a 6-line change into a 4500-line diff.
- **Gate before every commit that touches `src/`:** `npm run typecheck && npx eslint && npm test`. Baseline is 1257 passing tests.
- **Per-field form errors** use `FieldErrors` from `src/lib/admin/form-state.ts` — `Record<string, string>` keyed by the input's `name`.
- **Capability for every admin surface here:** `manage:council`.

---

### Task 1: The `team_profiles` table

**Files:**
- Create: `supabase/migrations/20260918000000_team_profiles.sql`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.team_profiles`; the `Database["public"]["Tables"]["team_profiles"]` types used by every later task.

- [ ] **Step 1: Write the migration**

```sql
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
-- roster and is read by six other modules.
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
  photo_blur   text,
  focal_x      smallint not null default 50,
  focal_y      smallint not null default 50,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.admin_users(id) on delete set null,
  constraint team_profiles_focal_x_range check (focal_x between 0 and 100),
  constraint team_profiles_focal_y_range check (focal_y between 0 and 100)
);

-- Service-role only, same posture as council_members: RLS on, no policies.
-- The page reads through the server; the browser never touches this table.
alter table public.team_profiles enable row level security;
```

- [ ] **Step 2: Apply it**

Apply with the Supabase MCP `apply_migration` tool against project `jisahccdnthzgibszwnq`. **Do not run `supabase db push`.**

- [ ] **Step 3: Verify the table exists and is empty**

Run this via the Supabase MCP `execute_sql`:

```sql
select count(*) as rows from public.team_profiles;
select relrowsecurity from pg_class where relname = 'team_profiles';
```

Expected: `rows = 0`, `relrowsecurity = true`.

- [ ] **Step 4: Regenerate the database types**

Run: `npm run types:gen`

Expected: `src/lib/database.types.ts` gains a `team_profiles` entry. Confirm with `grep -c 'team_profiles' src/lib/database.types.ts` — expect a non-zero count.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add supabase/migrations/20260918000000_team_profiles.sql src/lib/database.types.ts
git commit -m "feat(team): team_profiles table for the editable team-page fields"
```

---

### Task 2: `mergeProfiles` — the pure merge

**Files:**
- Create: `src/lib/team/profiles.ts`
- Test: `src/lib/team/profiles.test.ts`

**Interfaces:**
- Consumes: `Member` from `@/data/ccc`.
- Produces:
  - `export type TeamProfileRow = { memberId: string; name: string; role: string; year: string | null; department: string | null; email: string; description: string | null; portfolio: string | null; photoPath: string | null; photoWidth: number | null; photoHeight: number | null; photoBlur: string | null; focalX: number; focalY: number }`
  - `export function mergeProfiles(fileMembers: Member[], rows: TeamProfileRow[]): Member[]`
  - `export type TeamPhoto = { path: string; width: number; height: number; blur: string | null; focal: { x: number; y: number } }`
  - `export function photoOverrides(rows: TeamProfileRow[]): Record<string, TeamPhoto>`

`mergeProfiles` returns `Member[]` in the **same order as `fileMembers`** — the page's ordering comes from the file.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/team/profiles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeProfiles, photoOverrides, type TeamProfileRow } from "./profiles";
import type { Member } from "@/data/ccc";

const member = (over: Partial<Member> = {}): Member => ({
  id: "a-person",
  name: "A Person",
  role: "Head",
  layer: "clubs",
  club: "coding",
  vtu: "10001",
  email: "vtu10001@veltech.edu.in",
  ...over,
});

const row = (over: Partial<TeamProfileRow> = {}): TeamProfileRow => ({
  memberId: "a-person",
  name: "Edited Name",
  role: "Vice Head",
  year: "III",
  department: "CSE",
  email: "edited@veltech.edu.in",
  description: "Edited bio",
  portfolio: null,
  photoPath: null,
  photoWidth: null,
  photoHeight: null,
  photoBlur: null,
  focalX: 50,
  focalY: 50,
  ...over,
});

describe("mergeProfiles", () => {
  it("uses the row's values when a member has one", () => {
    const [m] = mergeProfiles([member()], [row()]);
    expect(m.name).toBe("Edited Name");
    expect(m.role).toBe("Vice Head");
    expect(m.description).toBe("Edited bio");
  });

  it("keeps the file's values when a member has no row", () => {
    const [m] = mergeProfiles([member()], []);
    expect(m.name).toBe("A Person");
    expect(m.email).toBe("vtu10001@veltech.edu.in");
  });

  it("ignores a row whose member_id matches nobody in the file", () => {
    const merged = mergeProfiles([member()], [row({ memberId: "ghost" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("A Person");
  });

  it("falls back per-field: a null column keeps the file's value", () => {
    const [m] = mergeProfiles(
      [member({ year: "IV", department: "CSE (AIML)" })],
      [row({ year: null, department: null })],
    );
    expect(m.year).toBe("IV");
    expect(m.department).toBe("CSE (AIML)");
  });

  it("never takes structure from a row", () => {
    const [m] = mergeProfiles([member()], [row()]);
    expect(m.layer).toBe("clubs");
    expect(m.club).toBe("coding");
    expect(m.vtu).toBe("10001");
  });

  it("preserves the file's order", () => {
    const people = [member({ id: "one", name: "One" }), member({ id: "two", name: "Two" })];
    const merged = mergeProfiles(people, [row({ memberId: "two", name: "Two edited" })]);
    expect(merged.map((m) => m.id)).toEqual(["one", "two"]);
    expect(merged[1].name).toBe("Two edited");
  });
});

describe("photoOverrides", () => {
  it("returns nothing for a row with no uploaded photo", () => {
    expect(photoOverrides([row()])).toEqual({});
  });

  it("returns the photo, its dimensions and its focal point", () => {
    const out = photoOverrides([
      row({ photoPath: "abc.jpg", photoWidth: 800, photoHeight: 1000, photoBlur: "data:x", focalX: 40, focalY: 30 }),
    ]);
    expect(out["a-person"]).toEqual({
      path: "abc.jpg",
      width: 800,
      height: 1000,
      blur: "data:x",
      focal: { x: 40, y: 30 },
    });
  });

  it("skips a photo_path with no dimensions — coverPosition would divide by null", () => {
    expect(photoOverrides([row({ photoPath: "abc.jpg", photoWidth: null, photoHeight: null })])).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/team/profiles.test.ts`
Expected: FAIL — `Failed to resolve import "./profiles"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/team/profiles.ts`:

```ts
import type { Member } from "@/data/ccc";

/** One `team_profiles` row, camel-cased at the query boundary. */
export type TeamProfileRow = {
  memberId: string;
  name: string;
  role: string;
  year: string | null;
  department: string | null;
  email: string;
  description: string | null;
  portfolio: string | null;
  photoPath: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  photoBlur: string | null;
  focalX: number;
  focalY: number;
};

export type TeamPhoto = {
  path: string;
  width: number;
  height: number;
  blur: string | null;
  focal: { x: number; y: number };
};

/** `??` not `||`, so an intentionally blank bio does not fall back to the file's. */
const pick = <T,>(rowValue: T | null | undefined, fileValue: T | undefined) =>
  rowValue ?? fileValue;

/**
 * The 46 members with their edited values applied.
 *
 * Three rules, each pinned by a test:
 *  1. a member WITH a row uses the row;
 *  2. a member WITHOUT one uses the file — so somebody added to ccc.ts after
 *     the last sync still renders instead of half-breaking the page;
 *  3. a row matching nobody is ignored — removing a person from ccc.ts must
 *     not resurrect them from a stale row.
 *
 * Structure (layer, club, smtGroup, vtu, id) is never taken from a row: it is
 * not editable and a second copy of it would drift.
 */
export function mergeProfiles(fileMembers: Member[], rows: TeamProfileRow[]): Member[] {
  const byId = new Map(rows.map((r) => [r.memberId, r]));
  return fileMembers.map((m) => {
    const r = byId.get(m.id);
    if (!r) return m;
    return {
      ...m,
      name: r.name,
      role: r.role,
      email: r.email,
      year: pick(r.year, m.year),
      department: pick(r.department, m.department),
      description: pick(r.description, m.description),
      portfolio: pick(r.portfolio, m.portfolio),
    };
  });
}

/**
 * Uploaded portraits, by member id. A row with no `photo_path` is absent, so
 * the bundled import in src/assets/team/ stays the default.
 *
 * A photo missing its dimensions is skipped: coverPosition() divides by
 * width/height and would produce NaN rather than a crop.
 */
export function photoOverrides(rows: TeamProfileRow[]): Record<string, TeamPhoto> {
  const out: Record<string, TeamPhoto> = {};
  for (const r of rows) {
    if (!r.photoPath || r.photoWidth == null || r.photoHeight == null) continue;
    out[r.memberId] = {
      path: r.photoPath,
      width: r.photoWidth,
      height: r.photoHeight,
      blur: r.photoBlur,
      focal: { x: r.focalX, y: r.focalY },
    };
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/team/profiles.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add src/lib/team/profiles.ts src/lib/team/profiles.test.ts
git commit -m "feat(team): mergeProfiles — file values overlaid with edited rows"
```

---

### Task 3: Reading the rows, and the outage fallback

**Files:**
- Create: `src/lib/team/read.ts`
- Test: `src/lib/team/read.test.ts`

**Interfaces:**
- Consumes: `TeamProfileRow` from Task 2; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `export async function getTeamProfileRows(): Promise<TeamProfileRow[]>` — **returns `[]` on any failure, never throws.**

- [ ] **Step 1: Write the failing test**

Create `src/lib/team/read.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

import { getTeamProfileRows } from "./read";

const select = (result: unknown) => ({ select: vi.fn().mockResolvedValue(result) });

beforeEach(() => from.mockReset());

describe("getTeamProfileRows", () => {
  it("maps snake_case columns to the camelCase row shape", async () => {
    from.mockReturnValue(
      select({
        data: [
          {
            member_id: "a-person", name: "A", role: "Head", year: "III",
            department: "CSE", email: "a@b.c", description: null, portfolio: null,
            photo_path: null, photo_width: null, photo_height: null,
            photo_blur: null, focal_x: 50, focal_y: 50,
          },
        ],
        error: null,
      }),
    );
    const rows = await getTeamProfileRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].memberId).toBe("a-person");
    expect(rows[0].focalX).toBe(50);
  });

  // The resilience property. /team must render from src/data/ccc.ts when the
  // database is unreachable rather than going blank or throwing.
  it("returns [] when the query errors, and does not throw", async () => {
    from.mockReturnValue(select({ data: null, error: { message: "boom" } }));
    await expect(getTeamProfileRows()).resolves.toEqual([]);
  });

  it("returns [] when the client itself throws", async () => {
    from.mockImplementation(() => {
      throw new Error("no connection");
    });
    await expect(getTeamProfileRows()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/team/read.test.ts`
Expected: FAIL — `Failed to resolve import "./read"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/team/read.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TeamProfileRow } from "./profiles";

const COLS =
  "member_id, name, role, year, department, email, description, portfolio, " +
  "photo_path, photo_width, photo_height, photo_blur, focal_x, focal_y";

/**
 * Every team_profiles row.
 *
 * ⚠️ Returns [] on ANY failure and never throws. That is deliberate: with no
 * rows, mergeProfiles falls back to src/data/ccc.ts, so a database outage
 * costs the page its EDITS, not the page. Turning this into a throw would make
 * /team go blank the first time Supabase hiccups.
 *
 * The trade: on an outage the page shows the file's values, which are stale
 * once anything has been edited. Stale beats blank for a public page.
 */
export async function getTeamProfileRows(): Promise<TeamProfileRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("team_profiles").select(COLS);
    if (error || !data) return [];
    return data.map((r) => ({
      memberId: r.member_id,
      name: r.name,
      role: r.role,
      year: r.year,
      department: r.department,
      email: r.email,
      description: r.description,
      portfolio: r.portfolio,
      photoPath: r.photo_path,
      photoWidth: r.photo_width,
      photoHeight: r.photo_height,
      photoBlur: r.photo_blur,
      focalX: r.focal_x,
      focalY: r.focal_y,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/team/read.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add src/lib/team/read.ts src/lib/team/read.test.ts
git commit -m "feat(team): read team_profiles, falling back to the file on failure"
```

---

### Task 4: Get merged data into the client components

**This is the largest task in the plan.** Nine client components read member data as module-level imports; a module import cannot see a database.

**Files:**
- Modify: `src/components/team/TeamProvider.tsx`
- Modify: `src/app/team/page.tsx`
- Modify: `src/components/team/ContactSheet.tsx`, `CouncilOrbit.tsx`, `ClubsExplorer.tsx`, `LeadershipSections.tsx`, `SmtCredits.tsx`, `ProfileDrawer.tsx`
- Test: `src/lib/team/selectors.test.ts`
- Create: `src/lib/team/selectors.ts`

**Interfaces:**
- Consumes: `mergeProfiles`, `photoOverrides`, `TeamPhoto` (Task 2); `getTeamProfileRows` (Task 3).
- Produces, from `TeamProvider`:
  - `useMembers(): Member[]`
  - `useMember(id: string): Member | undefined`
  - `useMembersInLayer(layer: LayerId): Member[]`
  - `useClubLeaders(club: ClubId): Member[]`
  - `usePresident(): Member`
  - `useSmtByGroup(): { group: SmtGroup; members: Member[] }[]`
  - `usePhoto(member: Member): TeamPhoto | undefined`
- Produces, from `src/lib/team/selectors.ts` (pure, so they are testable without React): `selectPresident`, `selectInLayer`, `selectClubLeaders`, `selectSmtByGroup` — each `(members: Member[], …) => …`.
- Also adds to `src/lib/team/profiles.ts` (Step 9): `export function publicPhotoUrl(path: string): string`, used by Task 6's action indirectly and by `MemberPortrait`.

⚠️ **`layers`, `clubs`, `openRoles`, `counts`, `pad`, `layerTone`, `initials`, `roleLine`, `isHeadRole` stay module imports.** They are structure or pure helpers, not editable data. In particular **do not wire `counts` to context** — the roster is fixed, so those numbers cannot change, and routing them through React would add a re-render for a constant.

- [ ] **Step 1: Write the failing selector tests**

Create `src/lib/team/selectors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectPresident, selectInLayer, selectClubLeaders, selectSmtByGroup } from "./selectors";
import type { Member } from "@/data/ccc";

const m = (over: Partial<Member>): Member => ({
  id: "x", name: "X", role: "Head", layer: "clubs", vtu: "1", email: "x@y.z", ...over,
});

const people = [
  m({ id: "p", layer: "president", role: "President" }),
  m({ id: "c1", layer: "council", role: "Vice President" }),
  m({ id: "k1", layer: "clubs", club: "coding", role: "Head" }),
  m({ id: "k2", layer: "clubs", club: "yoga", role: "Head" }),
  m({ id: "s1", layer: "smt", smtGroup: "Camera" }),
  m({ id: "s2", layer: "smt", smtGroup: "Writing" }),
];

describe("team selectors", () => {
  it("finds the president", () => {
    expect(selectPresident(people)?.id).toBe("p");
  });

  it("filters by layer", () => {
    expect(selectInLayer(people, "smt").map((x) => x.id)).toEqual(["s1", "s2"]);
  });

  it("filters by club", () => {
    expect(selectClubLeaders(people, "coding").map((x) => x.id)).toEqual(["k1"]);
  });

  it("groups SMT and drops empty groups", () => {
    const groups = selectSmtByGroup(people);
    expect(groups.map((g) => g.group)).toEqual(["Camera", "Writing"]);
    expect(groups.every((g) => g.members.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/team/selectors.test.ts`
Expected: FAIL — `Failed to resolve import "./selectors"`.

- [ ] **Step 3: Write the selectors**

Create `src/lib/team/selectors.ts`:

```ts
import { smtGroups, type ClubId, type LayerId, type Member } from "@/data/ccc";

/**
 * The same shapes ccc.ts exports, but over a members array passed in rather
 * than the module's own constant — so they work on the merged list.
 * Kept pure and outside React so they can be tested without rendering.
 */
export const selectPresident = (members: Member[]) =>
  members.find((m) => m.layer === "president");

export const selectInLayer = (members: Member[], layer: LayerId) =>
  members.filter((m) => m.layer === layer);

export const selectClubLeaders = (members: Member[], club: ClubId) =>
  members.filter((m) => m.club === club);

export const selectSmtByGroup = (members: Member[]) =>
  smtGroups
    .map((group) => ({ group, members: members.filter((m) => m.smtGroup === group) }))
    .filter((g) => g.members.length > 0);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/team/selectors.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit the selectors**

```bash
npm run typecheck && npx eslint && npm test
git add src/lib/team/selectors.ts src/lib/team/selectors.test.ts
git commit -m "feat(team): pure selectors over a members array"
```

- [ ] **Step 6: Extend `TeamProvider` to carry the merged members**

In `src/components/team/TeamProvider.tsx`, add `members` and `photos` to the props and the context value, and export the hooks. Keep the existing `openProfile` / `club` / `showClub` behaviour untouched.

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";

import type { ClubId, LayerId, Member } from "@/data/ccc";
import type { TeamPhoto } from "@/lib/team/profiles";
import { selectClubLeaders, selectInLayer, selectPresident, selectSmtByGroup } from "@/lib/team/selectors";
import { ProfileDrawer } from "./ProfileDrawer";
import { useViewStack } from "./shared/useViewStack";

type TeamContext = {
  openProfile: (id: string) => void;
  club: ClubId;
  showClub: (id: ClubId, scroll?: boolean) => void;
  /** The 46 from src/data/ccc.ts with their edited values already applied. */
  members: Member[];
  /** Uploaded portraits by member id; absent means use the bundled import. */
  photos: Record<string, TeamPhoto>;
};

const Ctx = createContext<TeamContext | null>(null);

export function useTeam() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTeam must be used inside <TeamProvider>");
  return ctx;
}

export const useMembers = () => useTeam().members;
export const useMember = (id: string) => useMembers().find((m) => m.id === id);
export const useMembersInLayer = (layer: LayerId) => selectInLayer(useMembers(), layer);
export const useClubLeaders = (club: ClubId) => selectClubLeaders(useMembers(), club);
export const usePresident = () => selectPresident(useMembers())!;
export const useSmtByGroup = () => selectSmtByGroup(useMembers());
export const usePhoto = (member: Member) => useTeam().photos[member.id];

export function TeamProvider({
  members,
  photos,
  children,
}: {
  members: Member[];
  photos: Record<string, TeamPhoto>;
  children: React.ReactNode;
}) {
  const views = useViewStack();
  const [club, setClub] = useState<ClubId>("coding");
  const { open } = views;

  const showClub = useCallback((id: ClubId, scroll = false) => {
    setClub(id);
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("clubs")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, []);

  const value = useMemo<TeamContext>(
    () => ({ openProfile: (id) => open({ type: "member", id }), club, showClub, members, photos }),
    [open, club, showClub, members, photos],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>{views.current && <ProfileDrawer key="profile" views={views} onShowClub={showClub} />}</AnimatePresence>
    </Ctx.Provider>
  );
}
```

- [ ] **Step 7: Feed it from the server page**

In `src/app/team/page.tsx`, make the component `async`, fetch, merge, and pass down. Everything below `<TeamProvider>` is unchanged.

```tsx
import { members as fileMembers } from "@/data/ccc";
import { mergeProfiles, photoOverrides } from "@/lib/team/profiles";
import { getTeamProfileRows } from "@/lib/team/read";

export default async function TeamPage() {
  // [] when the DB is unreachable, so this renders the file's values.
  const rows = await getTeamProfileRows();
  const members = mergeProfiles(fileMembers, rows);
  const photos = photoOverrides(rows);

  return (
    <TeamProvider members={members} photos={photos}>
      {/* …unchanged… */}
    </TeamProvider>
  );
}
```

⚠️ `counts` in the hero stays imported from `@/data/ccc`. Do not change it.

- [ ] **Step 8: Switch the six consumer components to the hooks**

Replace member-data imports with hooks. Structure imports stay. Exact edits:

- `ContactSheet.tsx:10` — delete the module-level `const everyone = [...]` and build it inside the component:
  ```tsx
  const members = useMembers();
  const president = usePresident();
  const councilLeaders = useMembersInLayer("council");
  const smt = useMembersInLayer("smt");
  const everyone = useMemo(
    () => [president, ...councilLeaders, ...clubs.flatMap((c) => selectClubLeaders(members, c.id)), ...smt],
    [members, president, councilLeaders, smt],
  );
  ```
  `clubs` stays a module import.
- `CouncilOrbit.tsx` — `smtMembers` → `useMembersInLayer("smt")`; `president` → `usePresident()`; `councilLeaders` → `useMembersInLayer("council")`.
- `ClubsExplorer.tsx` — `clubLeaders(id)` → `useClubLeaders(id)`; `clubOpenRoles` stays a module import.
- `LeadershipSections.tsx` — `president` → `usePresident()`; `councilLeaders` → `useMembersInLayer("council")`.
- `SmtCredits.tsx` — `smtByGroup()` → `useSmtByGroup()`.
- `ProfileDrawer.tsx` — `getMember(id)` → `useMember(id)`; `contextOf(m)` → `m.club ? useClubLeaders(m.club) : useMembersInLayer(m.layer)`.

⚠️ **Hooks cannot be called conditionally.** In `ProfileDrawer`, call both `useClubLeaders` and `useMembersInLayer` unconditionally and pick between the results, or React will throw "rendered fewer hooks than expected" when a drawer opens on a member with no club.

- [ ] **Step 9: Route uploaded portraits through `MemberPortrait`**

In `src/components/team/shared/MemberPortrait.tsx`, prefer an uploaded photo over the bundled import:

```tsx
const uploaded = usePhoto(member);
const portrait = portraitOf(member);
if (uploaded) {
  return (
    <Image
      src={publicPhotoUrl(uploaded.path)}
      alt={portraitAlt(member)}
      fill
      sizes={sizes}
      quality={quality}
      // A remote src has no automatic blur: pass the stored one, or none.
      {...(uploaded.blur ? { placeholder: "blur" as const, blurDataURL: uploaded.blur } : {})}
      className={`object-cover ${className}`}
      style={{ objectPosition: position ?? `${uploaded.focal.x}% ${uploaded.focal.y}%`, ...style }}
    />
  );
}
if (!portrait) return <>{fallback}</>;
// …existing bundled-import branch unchanged…
```

Add `publicPhotoUrl` to `src/lib/team/profiles.ts`:

```ts
/** Public URL for a council-photos object. */
export function publicPhotoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/council-photos/${path}`;
}
```

⚠️ `placeholder="blur"` **throws** for a remote `src` without `blurDataURL`. The spread above is why it is conditional — do not simplify it to always pass `placeholder="blur"`.

- [ ] **Step 10: Verify the page still renders**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/team
```
Expected: `200`. With `team_profiles` empty the page must look **exactly as it does today** — that is the proof the merge falls back correctly.

- [ ] **Step 11: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add src/components/team src/app/team/page.tsx src/lib/team
git commit -m "feat(team): serve member data through TeamProvider so edits reach the page"
```

---

### Task 5: Admin read + the sync action

**Files:**
- Create: `src/lib/admin/team-profiles.ts`
- Test: `src/lib/admin/team-profiles.test.ts`

**Interfaces:**
- Consumes: `mergeProfiles`, `TeamProfileRow` (Task 2); `getTeamProfileRows` (Task 3).
- Produces:
  - `export type TeamProfileAdminRow = { member: Member; hasRow: boolean; photoPath: string | null; focalX: number; focalY: number }`
  - `export async function listTeamProfiles(): Promise<TeamProfileAdminRow[]>`
  - `export function rowsToSeed(fileMembers: Member[], rows: TeamProfileRow[]): TeamProfileInsert[]` (pure — the sync's payload)
  - `export async function syncTeamProfiles(): Promise<number>`
  - `export async function getTeamProfilePhoto(memberId: string): Promise<string | null>` — added in Task 6, used to clean up a replaced portrait.

- [ ] **Step 1: Write the failing test for `rowsToSeed`**

Create `src/lib/admin/team-profiles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowsToSeed } from "./team-profiles";
import type { TeamProfileRow } from "@/lib/team/profiles";
import type { Member } from "@/data/ccc";

const m = (over: Partial<Member>): Member => ({
  id: "x", name: "X", role: "Head", layer: "clubs", vtu: "1", email: "x@y.z", ...over,
});

describe("rowsToSeed", () => {
  it("returns an insert for every member with no row", () => {
    const seed = rowsToSeed([m({ id: "a" }), m({ id: "b" })], []);
    expect(seed.map((s) => s.member_id)).toEqual(["a", "b"]);
  });

  // The sync must never clobber an edit.
  it("skips members that already have a row", () => {
    const existing = [{ memberId: "a" } as TeamProfileRow];
    expect(rowsToSeed([m({ id: "a" }), m({ id: "b" })], existing).map((s) => s.member_id)).toEqual(["b"]);
  });

  it("copies the file's values, with undefined optionals as null", () => {
    const [seed] = rowsToSeed([m({ id: "a", name: "A", role: "Head", email: "a@b.c" })], []);
    expect(seed.name).toBe("A");
    expect(seed.role).toBe("Head");
    expect(seed.email).toBe("a@b.c");
    expect(seed.year).toBeNull();
    expect(seed.department).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/admin/team-profiles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/admin/team-profiles.ts`:

```ts
import "server-only";
import { members as fileMembers, type Member } from "@/data/ccc";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeProfiles, type TeamProfileRow } from "@/lib/team/profiles";
import { getTeamProfileRows } from "@/lib/team/read";

export type TeamProfileInsert = {
  member_id: string;
  name: string;
  role: string;
  year: string | null;
  department: string | null;
  email: string;
  description: string | null;
  portfolio: string | null;
};

export type TeamProfileAdminRow = {
  member: Member;
  /** False = still showing src/data/ccc.ts values; saving creates the row. */
  hasRow: boolean;
  photoPath: string | null;
  focalX: number;
  focalY: number;
};

/**
 * Every member in src/data/ccc.ts that has no team_profiles row yet, as an
 * insert payload carrying the file's values.
 *
 * ⚠️ Members that already have a row are SKIPPED, never updated — the sync
 * must not be able to overwrite somebody's edit with the file's stale value.
 */
export function rowsToSeed(file: Member[], rows: TeamProfileRow[]): TeamProfileInsert[] {
  const have = new Set(rows.map((r) => r.memberId));
  return file
    .filter((m) => !have.has(m.id))
    .map((m) => ({
      member_id: m.id,
      name: m.name,
      role: m.role,
      year: m.year ?? null,
      department: m.department ?? null,
      email: m.email,
      description: m.description ?? null,
      portfolio: m.portfolio ?? null,
    }));
}

/** All 46 for the admin list — merged, so it is never empty. */
export async function listTeamProfiles(): Promise<TeamProfileAdminRow[]> {
  const rows = await getTeamProfileRows();
  const byId = new Map(rows.map((r) => [r.memberId, r]));
  return mergeProfiles(fileMembers, rows).map((member) => {
    const r = byId.get(member.id);
    return {
      member,
      hasRow: r != null,
      photoPath: r?.photoPath ?? null,
      focalX: r?.focalX ?? 50,
      focalY: r?.focalY ?? 50,
    };
  });
}

/** Inserts the missing rows. Returns how many were created. */
export async function syncTeamProfiles(): Promise<number> {
  const rows = await getTeamProfileRows();
  const seed = rowsToSeed(fileMembers, rows);
  if (seed.length === 0) return 0;
  const admin = createAdminClient();
  const { error } = await admin.from("team_profiles").insert(seed);
  if (error) throw new Error(error.message);
  return seed.length;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/admin/team-profiles.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add src/lib/admin/team-profiles.ts src/lib/admin/team-profiles.test.ts
git commit -m "feat(team): admin read + idempotent sync for team_profiles"
```

---

### Task 6: The save action, with per-field validation

**Files:**
- Create: `src/app/admin/(app)/team/profile-actions.ts`
- Create: `src/lib/admin/team-profile-validate.ts`
- Test: `src/lib/admin/team-profile-validate.test.ts`
- Modify: `src/lib/admin/form-state.ts` (add `TeamProfileState`)

**Interfaces:**
- Consumes: `FieldErrors` from `form-state.ts`; `syncTeamProfiles` (Task 5).
- Produces:
  - `export type TeamProfileInput = { name: string; role: string; year: string | null; department: string | null; email: string; description: string | null; portfolio: string | null; focalX: number; focalY: number }`
  - `export function validateTeamProfile(fd: FormData): { values?: TeamProfileInput; fieldErrors?: FieldErrors }`
  - `saveTeamProfileAction(prev, formData)`, `syncTeamProfilesAction()`

- [ ] **Step 1: Write the failing validation tests**

Create `src/lib/admin/team-profile-validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateTeamProfile } from "./team-profile-validate";

const fd = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const base = { name: "A Person", role: "Head", email: "a@veltech.edu.in", focalX: "50", focalY: "50" };
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
};

describe("validateTeamProfile", () => {
  it("accepts a valid form", () => {
    const { values, fieldErrors } = validateTeamProfile(fd());
    expect(fieldErrors).toBeUndefined();
    expect(values?.name).toBe("A Person");
  });

  it("requires a name", () => {
    expect(validateTeamProfile(fd({ name: "  " })).fieldErrors).toEqual({ name: "Enter a name." });
  });

  it("requires a role", () => {
    expect(validateTeamProfile(fd({ role: "" })).fieldErrors).toEqual({ role: "Enter a role." });
  });

  it("rejects an email with no @", () => {
    expect(validateTeamProfile(fd({ email: "nope" })).fieldErrors).toEqual({ email: "Enter a valid email address." });
  });

  it("rejects a portfolio URL that is not http(s)", () => {
    expect(validateTeamProfile(fd({ portfolio: "javascript:alert(1)" })).fieldErrors)
      .toEqual({ portfolio: "Enter a full https:// link, or leave it blank." });
  });

  it("rejects a focal point outside 0-100", () => {
    expect(validateTeamProfile(fd({ focalX: "140" })).fieldErrors)
      .toEqual({ focalX: "Must be between 0 and 100." });
  });

  it("turns blank optionals into null, not empty strings", () => {
    const { values } = validateTeamProfile(fd({ year: "", department: "  ", portfolio: "" }));
    expect(values?.year).toBeNull();
    expect(values?.department).toBeNull();
    expect(values?.portfolio).toBeNull();
  });

  it("reports every bad field at once, not just the first", () => {
    const errs = validateTeamProfile(fd({ name: "", role: "", email: "x" })).fieldErrors!;
    expect(Object.keys(errs).sort()).toEqual(["email", "name", "role"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/admin/team-profile-validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

Create `src/lib/admin/team-profile-validate.ts`:

⚠️ **Use zod and `isSafeHttpUrl`, not hand-rolled checks.** Every admin action in
this repo validates with zod (`team/actions.ts:60`) and checks URLs with
`isSafeHttpUrl` from `@/lib/url`, which is applied on write *and* again on read
because rows can also be inserted by hand in the SQL editor.

```ts
import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/url";
import type { FieldErrors } from "./form-state";

/** Blank optionals become null so the merge falls back to the file's value. */
const optional = z.string().trim().max(300).transform((v) => (v === "" ? null : v));

const Url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || isSafeHttpUrl(v), {
    message: "Enter a full https:// link, or leave it blank.",
  })
  .transform((v) => (v === "" ? null : v));

const Focal = z.coerce
  .number()
  .int()
  .min(0, { message: "Must be between 0 and 100." })
  .max(100, { message: "Must be between 0 and 100." });

const Schema = z.object({
  name: z.string().trim().min(1, { message: "Enter a name." }).max(120),
  role: z.string().trim().min(1, { message: "Enter a role." }).max(120),
  email: z.string().trim().email({ message: "Enter a valid email address." }),
  year: optional,
  department: optional,
  description: z.string().trim().max(2000).transform((v) => (v === "" ? null : v)),
  portfolio: Url,
  focalX: Focal,
  focalY: Focal,
});

export type TeamProfileInput = z.infer<typeof Schema>;

/** zod issues → one message per field, keyed by the input's `name`. */
export function validateTeamProfile(fd: FormData): {
  values?: TeamProfileInput;
  fieldErrors?: FieldErrors;
} {
  const parsed = Schema.safeParse({
    name: fd.get("name") ?? "",
    role: fd.get("role") ?? "",
    email: fd.get("email") ?? "",
    year: fd.get("year") ?? "",
    department: fd.get("department") ?? "",
    description: fd.get("description") ?? "",
    portfolio: fd.get("portfolio") ?? "",
    focalX: fd.get("focalX") ?? "50",
    focalY: fd.get("focalY") ?? "50",
  });
  if (parsed.success) return { values: parsed.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    // First issue per field wins — the input has room for one message.
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { fieldErrors };
}
```

The messages above are the ones the Step 1 tests assert, and the portfolio
wording is copied verbatim from `team/actions.ts:23` so the admin reads
consistently.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/admin/team-profile-validate.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the form state**

In `src/lib/admin/form-state.ts`, alongside the existing interfaces:

```ts
export interface TeamProfileState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown once after a successful save. */
  message?: string;
}
```

- [ ] **Step 6: Write the server action**

Create `src/app/admin/(app)/team/profile-actions.ts`:

This follows `team/actions.ts:54-131` exactly — the guard shape, `session.id`
as the actor, and `writeAudit` taking a **single object**.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { validateTeamProfile } from "@/lib/admin/team-profile-validate";
import { syncTeamProfiles } from "@/lib/admin/team-profiles";
import { uploadPortrait, COUNCIL_PHOTO_BUCKET } from "@/lib/admin/portrait-upload";
import { getTeamProfilePhoto } from "@/lib/admin/team-profiles";
import type { TeamProfileState } from "@/lib/admin/form-state";

const CAP = "manage:council" as const;

export async function saveTeamProfileAction(
  _prev: TeamProfileState,
  formData: FormData,
): Promise<TeamProfileState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (!canManage(session, CAP)) return { error: "You can't manage the team page." };

  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!memberId) return { error: "Missing member reference." };

  const { values, fieldErrors } = validateTeamProfile(formData);
  if (fieldErrors) return { fieldErrors };

  // Uploaded BEFORE the row write so a failed upload changes nothing at all.
  const photo = await uploadPortrait(formData);
  if (photo.error) return { fieldErrors: { photo: photo.error } };

  // Captured before the write so the replaced object can be removed after.
  const previousPhoto = photo.path ? await getTeamProfilePhoto(memberId) : null;

  const admin = createAdminClient();
  // Upsert, not update: a member edited for the first time has no row yet.
  const { error } = await admin.from("team_profiles").upsert(
    {
      member_id: memberId,
      name: values!.name,
      role: values!.role,
      email: values!.email,
      year: values!.year,
      department: values!.department,
      description: values!.description,
      portfolio: values!.portfolio,
      focal_x: values!.focalX,
      focal_y: values!.focalY,
      // Omitted when no new file was chosen, so saving text never clears a photo.
      ...(photo.path
        ? {
            photo_path: photo.path,
            photo_width: photo.width ?? null,
            photo_height: photo.height ?? null,
            photo_blur: photo.blur ?? null,
          }
        : {}),
      updated_at: new Date().toISOString(),
      updated_by: session.id,
    },
    { onConflict: "member_id" },
  );
  if (error) return { error: "Could not save. Try again." };

  // Only once the row points at the new object — deleting first would leave a
  // member whose photo_path names a file that no longer exists.
  if (photo.path && previousPhoto && previousPhoto !== photo.path) {
    await admin.storage.from(COUNCIL_PHOTO_BUCKET).remove([previousPhoto]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "team_profile",
    entityId: memberId,
    after: {
      name: values!.name,
      role: values!.role,
      year: values!.year,
      department: values!.department,
      bioChars: values!.description?.length ?? 0,
      portfolio: values!.portfolio,
      focal: [values!.focalX, values!.focalY],
      photoReplaced: Boolean(photo.path),
    },
  });
  revalidatePath("/team");
  revalidatePath("/admin/team");
  return { message: "Saved." };
}

export async function syncTeamProfilesAction(): Promise<void> {
  const session = await getAdminSession();
  if (!session || !canManage(session, CAP)) return;
  const created = await syncTeamProfiles();
  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "team_profile",
    entityId: null,
    after: { created },
  });
  revalidatePath("/admin/team");
}
```

Add the small helper this needs to `src/lib/admin/team-profiles.ts`:

```ts
/** Current photo object for one member, or null. Used to clean up a replacement. */
export async function getTeamProfilePhoto(memberId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_profiles")
    .select("photo_path")
    .eq("member_id", memberId)
    .maybeSingle();
  return data?.photo_path ?? null;
}
```

⚠️ **The old-object cleanup is not optional.** Without it every portrait
replacement orphans a file in `council-photos` forever. The ordering — upload,
write the row, *then* delete the old object — is what the existing action does
and is deliberate in both directions.

- [ ] **Step 7: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add src/lib/admin/team-profile-validate.ts src/lib/admin/team-profile-validate.test.ts src/lib/admin/form-state.ts "src/app/admin/(app)/team/profile-actions.ts"
git commit -m "feat(team): save action and per-field validation for team profiles"
```

---

### Task 7: Photo upload, blur and dimensions

**Files:**
- Modify: `package.json`, `package-lock.json` (declare `sharp`)
- Create: `src/lib/admin/portrait-upload.ts`
- Test: `src/lib/admin/portrait-upload.test.ts`
- Modify: `src/app/admin/(app)/team/profile-actions.ts`

**Interfaces:**
- Consumes: `handleImageUpload` from `@/lib/admin/image-upload`.
- Produces: `export async function uploadPortrait(formData: FormData): Promise<{ path?: string; width?: number; height?: number; blur?: string; error?: string }>`

- [ ] **Step 1: Declare `sharp`**

`sharp` currently loads only because Next pulls it in transitively. Using it without declaring it means a Next upgrade can break uploads.

```bash
npm install sharp
```

Expected: `package.json` gains `sharp` under `dependencies` and `package-lock.json` updates. **Do not hand-edit the lockfile** — see the `npm ci` drift note in `docs/STATUS.md`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/admin/portrait-upload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const handleImageUpload = vi.fn();
vi.mock("./image-upload", () => ({ handleImageUpload }));

import { uploadPortrait, PORTRAIT_MAX_BYTES } from "./portrait-upload";

beforeEach(() => handleImageUpload.mockReset());

describe("uploadPortrait", () => {
  // The council-photos bucket caps at 2 MB. handleImageUpload defaults to 5 MB,
  // so without an explicit cap a 3 MB file passes our check and is then
  // rejected by Storage with an unhelpful message.
  it("caps at the bucket's 2 MB, not the 5 MB default", async () => {
    handleImageUpload.mockResolvedValue({});
    await uploadPortrait(new FormData());
    expect(PORTRAIT_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(handleImageUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bucket: "council-photos", maxBytes: 2 * 1024 * 1024 }),
    );
  });

  it("returns {} when no file was chosen", async () => {
    handleImageUpload.mockResolvedValue({});
    await expect(uploadPortrait(new FormData())).resolves.toEqual({});
  });

  it("passes an upload error straight through", async () => {
    handleImageUpload.mockResolvedValue({ error: "Image must be 2048 KB or smaller." });
    await expect(uploadPortrait(new FormData())).resolves.toEqual({
      error: "Image must be 2048 KB or smaller.",
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/admin/portrait-upload.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/lib/admin/portrait-upload.ts`:

```ts
import "server-only";
import sharp from "sharp";
import { handleImageUpload } from "./image-upload";

/**
 * The same bucket `src/lib/admin/team.ts` already names. Re-homed here because
 * Task 8 may delete that module; do NOT introduce a second constant for the
 * same bucket — update the other importers instead.
 */
export const COUNCIL_PHOTO_BUCKET = "council-photos";
/** The bucket's own limit. handleImageUpload would otherwise allow 5 MB and
 *  let Storage reject the file with a message about nothing in particular. */
export const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Uploads a portrait and measures it.
 *
 * Width and height are stored because coverPosition() in src/data/ccc.ts
 * divides by the image aspect ratio; a Storage URL carries no dimensions the
 * way a static import does.
 *
 * The blur is stored because <Image placeholder="blur"> THROWS for a remote
 * src unless blurDataURL is supplied.
 */
export async function uploadPortrait(formData: FormData): Promise<{
  path?: string;
  width?: number;
  height?: number;
  blur?: string;
  error?: string;
}> {
  const file = formData.get("photo");
  const uploaded = await handleImageUpload(formData, {
    bucket: COUNCIL_PHOTO_BUCKET,
    field: "photo",
    maxBytes: PORTRAIT_MAX_BYTES,
  });
  if (uploaded.error) return { error: uploaded.error };
  if (!uploaded.path) return {};

  if (!(file instanceof File)) return { path: uploaded.path };
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const img = sharp(buf);
    const { width, height } = await img.metadata();
    const thumb = await img.resize(16).webp({ quality: 40 }).toBuffer();
    return {
      path: uploaded.path,
      width,
      height,
      blur: `data:image/webp;base64,${thumb.toString("base64")}`,
    };
  } catch {
    // A measurable upload is better than none: without width/height the photo
    // is ignored by photoOverrides, so fall back to no blur but keep the path.
    return { path: uploaded.path };
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/admin/portrait-upload.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Wire it into the save action**

In `saveTeamProfileAction`, before the upsert:

```ts
const photo = await uploadPortrait(formData);
if (photo.error) return { fieldErrors: { photo: photo.error } };
```

and add to the upsert payload, only when a new photo arrived, so saving the form without choosing a file keeps the current portrait:

```ts
...(photo.path
  ? {
      photo_path: photo.path,
      photo_width: photo.width ?? null,
      photo_height: photo.height ?? null,
      photo_blur: photo.blur ?? null,
    }
  : {}),
```

- [ ] **Step 7: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add package.json package-lock.json src/lib/admin/portrait-upload.ts src/lib/admin/portrait-upload.test.ts "src/app/admin/(app)/team/profile-actions.ts"
git commit -m "feat(team): portrait upload with stored dimensions and blur"
```

---

### Task 8: Repoint `/admin/team` to `team_profiles`

⚠️ **This repairs a live defect.** Since `08bd9c5`, `/admin/team` reads and writes `council_members` while `/team` renders `src/data/ccc.ts` — so its edits currently appear nowhere.

**Files:**
- Modify: `src/app/admin/(app)/team/page.tsx`
- Create: `src/components/admin/TeamProfileRow.tsx`
- Delete: `src/app/admin/(app)/team/actions.ts`, `src/components/admin/AddTeamMember.tsx`, `src/components/admin/TeamRow.tsx`

- [ ] **Step 1: Check what else uses the old modules before deleting anything**

```bash
grep -rn "listTeamMembers\|getTeamMember\|TeamColumnsMissingError\|COUNCIL_PHOTO_BUCKET" src/ --include=*.ts --include=*.tsx
grep -rn "TeamRow\|AddTeamMember" src/ --include=*.tsx
grep -rn "saveTeamLinksAction\|setTeamVisibilityAction\|setTeamVisibilityBulkAction\|addTeamMemberAction" src/
```

**If anything outside `src/app/admin/(app)/team/` uses them, STOP and keep that module.** `src/lib/admin/team.ts` may be shared with `/admin/council`. Delete only what is provably unused.

- [ ] **Step 2: Rewrite the admin page**

`src/app/admin/(app)/team/page.tsx` renders `listTeamProfiles()` — 46 rows, each a `TeamProfileRow` bound to `saveTeamProfileAction` via `useActionState`, plus a "Sync from code" button bound to `syncTeamProfilesAction` showing how many members have no row yet.

Keep the existing guard exactly as it is:

```tsx
const session = await requireViewPage("manage:council");
if (!canView(session, "manage:council")) redirect("/admin");
const canEdit = canManage(session, "manage:council");
```

Drop the `TeamColumnsMissingError` branch — it describes a `council_members` migration that no longer gates this page.

- [ ] **Step 3: Build `TeamProfileRow`**

A client component per person: name, role, year, department, email, portfolio, description, a file input for the portrait, and `focalX`/`focalY` number inputs beside a live preview. Field errors render under their input from `state.fieldErrors[name]`, matching the rest of the admin.

⚠️ The form contains a file input, so it must be `encType="multipart/form-data"`. React supplies that automatically when `action` is a server function — do not set it by hand and do not add a nested `<form>`; HTML forbids those.

- [ ] **Step 4: Verify both surfaces**

```bash
npm run dev
```

Sign in as President, Vice President or Tech Head and confirm:
- `/admin/team` lists all 46 with their current values;
- editing a name and saving changes `/team`;
- uploading a portrait replaces that person's photo everywhere it appears (orbit, contact sheet, club list, drawer);
- clearing an optional field falls back to the file's value rather than going blank;
- `/admin/council/members` is unaffected.

⚠️ Server-action POSTs cannot be curled — this step needs a real signed-in browser pass.

- [ ] **Step 5: Gate and commit**

```bash
npm run typecheck && npx eslint && npm test
git add -A src/app/admin src/components/admin src/lib/admin
git commit -m "fix(team): point /admin/team at team_profiles, which /team actually renders"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Add a shipped entry**

At the top of the status list, in the house style: what shipped, the gate result, the migration applied, and the gotchas — the outage fallback, `counts` staying static, `placeholder="blur"` throwing on a remote src without `blurDataURL`, `sharp` now being a declared dependency, and the `council-photos` 2 MB cap.

- [ ] **Step 2: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): team page CMS shipped"
```

---

## Self-review notes

**Spec coverage.** Table → Task 1. Merge rules and fallback → Tasks 2, 3. Component plumbing → Task 4. Seeding via sync → Task 5. Admin form and per-field errors → Task 6. Photos, blur, focal, 2 MB cap → Task 7. Repoint and the `/admin/team` defect → Task 8. Docs → Task 9.

**Deliberately not covered**, per the spec's *Out of scope*: adding/removing people, the two NetForge seats, editing clubs or layers, click-to-set focal point, the `/team` srcset weight.

**Signatures verified while writing this plan** (2026-09-18), against
`team/actions.ts:54-131`, `guards.ts` and `audit.ts` — the code blocks match the
real API, not a guess:

- the guard is `getAdminSession()` + `canManage(session, CAP)`, **not**
  `requireCapability`, for a server action returning a state object;
- the actor is **`session.id`**, not `session.userId`;
- `writeAudit` takes **one object** — `{ actorId, action, entity, entityId?, before?, after? }`;
- validation is **zod**, and URLs go through `isSafeHttpUrl` from `@/lib/url`.

**Still to verify at execution time:** whether `src/lib/admin/team.ts` has
consumers outside the team admin page before deleting anything (Task 8, Step 1).
