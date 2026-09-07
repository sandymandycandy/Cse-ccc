# Achievements Podium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/achievements` into a board announcing top 1/2/3 prize winners — read live from published event results, plus hand-entered outside wins — with ties (`1, 2, 3, 3`) rendered as first-class.

**Architecture:** A pure module (`achievements-board.ts`) composes the *existing* `podiumOf` / `entrantsOf` rather than re-deriving ranking. Automatic entries are read live from `results` at render time (never snapshotted), gated by a per-event `show_on_achievements` toggle. Manual entries live in a `winners` jsonb column on `achievements`. A `<Podium>` component renders both halves of the board; the event results page keeps its own existing rendering and is **not touched** (spec D6, amended during execution).

**Tech Stack:** Next 16.3.1 App Router (RSC, Turbopack) · React 19 · TypeScript strict · Supabase (Postgres, Mumbai `jisahccdnthzgibszwnq`) · vitest (`environment: "node"` — no DOM, so only pure modules are unit-testable; components are verified by build + live fetch).

**Spec:** `docs/superpowers/specs/2026-09-07-achievements-podium-design.md`

## Global Constraints

- **NEVER run `supabase db push`.** The migration ledger and migration filenames share no version numbers; a push would replay all 35 local migrations against a schema that already has every one. Apply migrations **only** through the Supabase MCP `apply_migration` tool.
- **`src/lib/database.types.ts` is hand-maintained.** It is not regenerated. Any new column must be hand-added to `Row`, `Insert` and `Update`, exactly as `venue_text` was on 2026-08-27. A mismatch with the live schema will not fail the build.
- **LF line endings.** Write files with a Bash heredoc, or Python opened with `newline="\n"`. A Python text-mode write turns a 6-line change into a 4500-line diff in this repo (`core.autocrlf=false`, no `.gitattributes`).
- **Do not reimplement ranking.** `rankByScore` (`src/lib/results.ts`) and `podiumOf` / `entrantsOf` (`src/lib/podium.ts`) are correct, tested and live. Compose them.
- **`podiumOf` is deliberately uncapped.** It returns *everyone* ranked 1-3, so a tied third yields two rows. Never `.slice(0, 3)` it.
- Verification gate for every commit: `npx tsc --noEmit` · `npx eslint` · `npm test` · `npm run build`.
- Work on branch `feat/achievements-podium` (already created; the spec is committed there at `07095ce`).

---

### Task 1: Schema — `winners` column and board toggle

**Files:**
- Create: `supabase/migrations/20260907000000_achievement_winners_and_board_toggle.sql`
- Modify: `src/lib/database.types.ts` (achievements + events table types)

**Interfaces:**
- Consumes: nothing.
- Produces: `achievements.winners jsonb` (nullable); `events.show_on_achievements boolean not null default true`. Task 4 queries both; Task 6 writes `winners`; Task 7 writes the toggle.

**Note on scope:** the spec calls for "2 migrations". Both are `ALTER TABLE` statements landing together with no ordering dependency, so this plan uses **one migration file containing both**. One MCP call, one ledger entry.

- [ ] **Step 1: Write the migration file**

```sql
-- Achievements podium (spec 2026-09-07).
-- winners: hand-entered prize winners for wins that happen off-platform.
--   Shape: [{"rank":1,"name":"Rahul K","roll":"VTU28001"}]  (roll nullable)
--   Deliberately jsonb, not a child table: winners are always read with their
--   achievement and never queried alone, and this adds no new RLS surface.
alter table public.achievements
  add column if not exists winners jsonb;

-- show_on_achievements: lets a council admin keep one event's podium off the
-- public board. Defaults true, so every already-published result appears.
alter table public.events
  add column if not exists show_on_achievements boolean not null default true;

comment on column public.achievements.winners is
  'Manual prize winners: [{rank:1|2|3, name, roll|null}]. Validated on read by parseWinners.';
comment on column public.events.show_on_achievements is
  'When false, this event''s podium is hidden from /achievements.';
```

- [ ] **Step 2: Apply it through MCP — NOT the CLI**

Use the Supabase MCP tool `apply_migration` with:
- `project_id`: `jisahccdnthzgibszwnq`
- `name`: `achievement_winners_and_board_toggle`
- `query`: the SQL above

Do **not** run `supabase db push`. See Global Constraints.

- [ ] **Step 3: Verify the columns landed**

Run this through the MCP `execute_sql` tool:

```sql
select table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns
where (table_name='achievements' and column_name='winners')
   or (table_name='events' and column_name='show_on_achievements');
```

Expected: two rows — `achievements.winners / jsonb / null / YES`, and `events.show_on_achievements / boolean / true / NO`.

- [ ] **Step 4: Hand-add both fields to `database.types.ts`**

In the `achievements` table block, add to **all three** of `Row`, `Insert`, `Update` (keys are alphabetical in this file; `winners` sorts last):

```ts
          winners: Json | null
```

For `Insert` and `Update` make it optional:

```ts
          winners?: Json | null
```

In the `events` table block, add to `Row`:

```ts
          show_on_achievements: boolean
```

and to `Insert` and `Update`:

```ts
          show_on_achievements?: boolean
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260907000000_achievement_winners_and_board_toggle.sql src/lib/database.types.ts
git commit -m "feat(achievements): winners column + per-event board toggle"
```

---

### Task 2: The pure core — `achievements-board.ts`

**Files:**
- Create: `src/lib/achievements-board.ts`
- Test: `src/lib/achievements-board.test.ts`

**Interfaces:**
- Consumes: `podiumOf`, `entrantsOf` from `@/lib/podium`; `PublishedResult` from `@/lib/queries`.
- Produces:
  - `type Rank = 1 | 2 | 3`
  - `interface Winner { rank: Rank; name: string; roll: string | null }`
  - `interface BoardEntry { id: string; kind: "event" | "manual"; title: string; clubName: string | null; date: string | null; fallbackDate: string; winners: Winner[]; description: string | null; imageUrl: string | null; href: string | null }`
  - `parseWinners(json: unknown): Winner[]`
  - `winnersFromResults(results: readonly PublishedResult[]): Winner[]`
  - `groupByRank(winners: readonly Winner[]): { rank: Rank; winners: Winner[] }[]`
  - `mergeBoard(auto: readonly BoardEntry[], manual: readonly BoardEntry[]): BoardEntry[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/achievements-board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PublishedResult } from "@/lib/queries";
import {
  type BoardEntry,
  type Winner,
  groupByRank,
  mergeBoard,
  parseWinners,
  winnersFromResults,
} from "@/lib/achievements-board";

function res(over: Partial<PublishedResult> = {}): PublishedResult {
  return {
    roll_no: "VTU00001",
    display_name: "A Person",
    team_name: null,
    team_members: null,
    rank: 1,
    score: 10,
    advanced: false,
    remarks: null,
    ...over,
  };
}

function entry(over: Partial<BoardEntry> = {}): BoardEntry {
  return {
    id: "x",
    kind: "manual",
    title: "A win",
    clubName: null,
    date: "2026-01-01",
    fallbackDate: "2026-01-01T00:00:00.000Z",
    winners: [],
    description: null,
    imageUrl: null,
    href: null,
    ...over,
  };
}

describe("parseWinners", () => {
  it("keeps well-formed rows", () => {
    expect(
      parseWinners([{ rank: 1, name: "Rahul K", roll: "VTU28001" }]),
    ).toEqual([{ rank: 1, name: "Rahul K", roll: "VTU28001" }]);
  });

  it("returns [] for null, a non-array, and an empty array", () => {
    expect(parseWinners(null)).toEqual([]);
    expect(parseWinners({ rank: 1 })).toEqual([]);
    expect(parseWinners([])).toEqual([]);
  });

  it("drops a malformed row and keeps the good ones", () => {
    const out = parseWinners([
      { rank: 1, name: "Good" },
      { rank: 9, name: "Bad rank" },
      { rank: 2, name: "" },
      null,
      "nonsense",
      { rank: 3, name: "Also good", roll: "VTU2" },
    ]);
    expect(out).toEqual([
      { rank: 1, name: "Good", roll: null },
      { rank: 3, name: "Also good", roll: "VTU2" },
    ]);
  });

  it("blanks an empty roll to null and trims", () => {
    expect(parseWinners([{ rank: 2, name: "  Priya  ", roll: "   " }])).toEqual([
      { rank: 2, name: "Priya", roll: null },
    ]);
  });
});

describe("winnersFromResults", () => {
  it("preserves a tied third as two rank-3 winners", () => {
    const out = winnersFromResults([
      res({ rank: 1, display_name: "First", roll_no: "R1" }),
      res({ rank: 3, display_name: "Third A", roll_no: "R3a" }),
      res({ rank: 3, display_name: "Third B", roll_no: "R3b" }),
    ]);
    expect(out.filter((w) => w.rank === 3)).toHaveLength(2);
  });

  it("drops entrants ranked below third", () => {
    const out = winnersFromResults([
      res({ rank: 1, roll_no: "R1" }),
      res({ rank: 4, roll_no: "R4" }),
      res({ rank: null, roll_no: "R0" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("expands a team standing into one row per member, sharing the rank", () => {
    const out = winnersFromResults([
      res({
        rank: 2,
        display_name: "Captain",
        roll_no: "RC",
        team_name: "ByteForce",
        team_members: [{ name: "Mate One", roll: "RM1" }],
      }),
    ]);
    expect(out).toEqual([
      { rank: 2, name: "Captain", roll: "RC" },
      { rank: 2, name: "Mate One", roll: "RM1" },
    ]);
  });
});

describe("groupByRank", () => {
  it("buckets 1/2/3 in order and lets a tie share a bucket", () => {
    const winners: Winner[] = [
      { rank: 3, name: "C", roll: null },
      { rank: 1, name: "A", roll: null },
      { rank: 3, name: "D", roll: null },
    ];
    const groups = groupByRank(winners);
    expect(groups.map((g) => g.rank)).toEqual([1, 3]);
    expect(groups[1].winners.map((w) => w.name)).toEqual(["C", "D"]);
  });

  it("omits a rank nobody holds", () => {
    expect(groupByRank([{ rank: 2, name: "B", roll: null }])).toHaveLength(1);
  });
});

describe("mergeBoard", () => {
  it("orders newest first across both sources", () => {
    const out = mergeBoard(
      [entry({ id: "auto", kind: "event", date: "2026-09-02T04:00:00.000Z" })],
      [entry({ id: "old", date: "2026-03-14" })],
    );
    expect(out.map((e) => e.id)).toEqual(["auto", "old"]);
  });

  it("falls back to created_at when a manual entry has no happened_on", () => {
    const out = mergeBoard(
      [],
      [
        entry({ id: "dated", date: "2026-01-05" }),
        entry({ id: "undated", date: null, fallbackDate: "2026-06-01T00:00:00.000Z" }),
      ],
    );
    expect(out.map((e) => e.id)).toEqual(["undated", "dated"]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/achievements-board.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/achievements-board"`, because the module does not exist yet.

- [ ] **Step 3: Write the module**

Create `src/lib/achievements-board.ts`:

```ts
// The achievements board (spec 2026-09-07): top 1/2/3 winners from two sources.
// Pure — no DB imports, no `server-only` — so it is unit-testable and safe on
// the client.
//
// Ranking is NOT implemented here. `rankByScore` (results.ts) and `podiumOf` /
// `entrantsOf` (podium.ts) already do it correctly, ties included, and are what
// the event results page renders from. This module composes them so the board
// and that page can never disagree.

import type { PublishedResult } from "@/lib/queries";
import { entrantsOf, podiumOf } from "@/lib/podium";

export type Rank = 1 | 2 | 3;

/** One person on a podium. A team becomes several of these sharing a rank. */
export interface Winner {
  rank: Rank;
  name: string;
  roll: string | null;
}

export interface BoardEntry {
  id: string;
  /** "event" = derived live from published results; "manual" = hand-entered. */
  kind: "event" | "manual";
  title: string;
  clubName: string | null;
  /** Event start, or an achievement's happened_on. Null when never set. */
  date: string | null;
  /** Sort fallback when `date` is null — the row's created_at. */
  fallbackDate: string;
  winners: Winner[];
  description: string | null;
  imageUrl: string | null;
  /** Auto entries link to the full results; manual ones have nowhere to go. */
  href: string | null;
}

const RANKS: readonly Rank[] = [1, 2, 3];

function isRank(n: unknown): n is Rank {
  return n === 1 || n === 2 || n === 3;
}

/**
 * Normalise the untyped `achievements.winners` jsonb.
 *
 * Malformed rows are DROPPED, never thrown: this column can be hand-edited in
 * the Supabase dashboard, and one bad row must not 500 a public page.
 */
export function parseWinners(json: unknown): Winner[] {
  if (!Array.isArray(json)) return [];
  const out: Winner[] = [];
  for (const row of json) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const rank = typeof r.rank === "string" ? Number(r.rank) : r.rank;
    if (!isRank(rank)) continue;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (name === "") continue;
    const rawRoll = typeof r.roll === "string" ? r.roll.trim() : "";
    out.push({ rank, name, roll: rawRoll === "" ? null : rawRoll });
  }
  return out;
}

/** The podium of a round, flattened to people. Teams keep every member. */
export function winnersFromResults(results: readonly PublishedResult[]): Winner[] {
  const out: Winner[] = [];
  for (const standing of podiumOf(results)) {
    const rank = standing.rank;
    if (!isRank(rank)) continue;
    for (const e of entrantsOf(standing)) {
      out.push({ rank, name: e.name, roll: e.roll });
    }
  }
  return out;
}

/** 1st/2nd/3rd buckets in order; a tie shares one. Empty ranks are omitted. */
export function groupByRank(
  winners: readonly Winner[],
): { rank: Rank; winners: Winner[] }[] {
  return RANKS.map((rank) => ({
    rank,
    winners: winners.filter((w) => w.rank === rank),
  })).filter((g) => g.winners.length > 0);
}

/**
 * Compare on the calendar day only. `date` is an ISO instant for events but a
 * plain YYYY-MM-DD for achievements; slicing to 10 chars makes the two formats
 * comparable instead of sorting every timestamp after every bare date.
 */
function sortKey(e: BoardEntry): string {
  return (e.date ?? e.fallbackDate).slice(0, 10);
}

/** Both sources as one list, newest first. Sort is stable, so ties hold order. */
export function mergeBoard(
  auto: readonly BoardEntry[],
  manual: readonly BoardEntry[],
): BoardEntry[] {
  return [...auto, ...manual].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/achievements-board.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Full gate**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: all clean; total test count rises by 12.

- [ ] **Step 6: Commit**

```bash
git add src/lib/achievements-board.ts src/lib/achievements-board.test.ts
git commit -m "feat(achievements): pure board core — winners, podium mapping, merge"
```

---

### Task 3: The `<Podium>` component

**AMENDED during execution (spec D6).** This task no longer extracts anything.
The owner chose to leave `/events/[id]/results` completely untouched, so
`<Podium>` is a new component used only by the achievements board. Do **not**
edit the results page in this task or any later one.

**Files:**
- Create: `src/components/Podium.tsx`
- Modify: `src/app/globals.css` (podium styles)
- **Do NOT modify:** `src/app/events/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `Winner`, `groupByRank` from `@/lib/achievements-board` (Task 2).
- Produces: `<Podium winners={Winner[]} />` — used by Task 5's board page and by the results page.

- [ ] **Step 1: Create the component**

Create `src/components/Podium.tsx`:

```tsx
import type { Winner } from "@/lib/achievements-board";
import { groupByRank } from "@/lib/achievements-board";

const PLACE: Record<1 | 2 | 3, string> = {
  1: "Champion",
  2: "Second",
  3: "Third",
};

const JOINT: Record<1 | 2 | 3, string> = {
  1: "Joint champion",
  2: "Joint second",
  3: "Joint third",
};

/**
 * The 1/2/3 podium, shared by the event results page and the achievements
 * board so the two can never disagree about a standing.
 *
 * A tie renders as several names under one place label, which is what a printed
 * result sheet does — never as a truncated top three.
 */
export function Podium({ winners }: { winners: Winner[] }) {
  const groups = groupByRank(winners);
  if (groups.length === 0) return null;

  return (
    <ol className="podium">
      {groups.map(({ rank, winners: people }) => (
        <li className="podium-place" data-place={rank} key={rank}>
          <div className="podium-label">
            {people.length > 1 ? JOINT[rank] : PLACE[rank]}
          </div>
          <div className="podium-people">
            {people.map((p, i) => (
              <div className="podium-person" key={`${p.roll ?? p.name}-${i}`}>
                <span>{p.name}</span>
                {p.roll ? <span className="roll">{p.roll}</span> : null}
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Add its styles**

In `src/app/globals.css`, inside the same top-level block that holds the existing `.champion` / `.runners` rules (search for `── Results: champion + runners-up ──`), append:

```css
  /* ── podium (shared: event results + achievements board) ── */
  .podium {
    display: grid;
    gap: 10px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }
  .podium-place {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 14px;
    align-items: baseline;
    padding: 12px 14px;
    border: 1px solid var(--line-2);
    border-left: 3px solid var(--line-3);
    border-radius: var(--r-sm);
    background: var(--card);
  }
  .podium-place[data-place="1"] { border-left-color: var(--clay); }
  .podium-place[data-place="2"] { border-left-color: var(--ink-3); }
  .podium-place[data-place="3"] { border-left-color: var(--forest); }
  .podium-label {
    font: 500 10px var(--mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .podium-people { display: grid; gap: 4px; min-width: 0; }
  .podium-person {
    display: flex;
    gap: 10px;
    align-items: baseline;
    justify-content: space-between;
    font: 400 15px var(--sans);
  }
  .podium-person .roll {
    font: 500 11px var(--mono);
    color: var(--ink-3);
    flex: none;
  }
  @media (max-width: 559px) {
    .podium-place { grid-template-columns: 1fr; gap: 6px; }
  }
```

- [ ] **Step 3: Verify it compiles and nothing else moved**

Run: `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all clean.

The component is not rendered anywhere yet — Task 5 is its first consumer. That
is expected; `eslint` will not flag an exported component as unused.

Confirm the results page is genuinely untouched:

```bash
git status --short "src/app/events/[id]/results/page.tsx"
```

Expected: **no output.** If that file shows as modified, the D6 amendment was
violated — revert it before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/Podium.tsx src/app/globals.css
git commit -m "feat(achievements): Podium component for the board"
```

---

### Task 4: `getAchievementsBoard()`

**Files:**
- Modify: `src/lib/queries.ts` (add below `getPublicAchievements`, around line 649)

**Interfaces:**
- Consumes: `BoardEntry`, `parseWinners`, `winnersFromResults`, `mergeBoard` from `@/lib/achievements-board`.
- Produces: `getAchievementsBoard(): Promise<BoardEntry[]>` — consumed by Task 5.

- [ ] **Step 1: Add the imports**

At the top of `src/lib/queries.ts`, alongside the existing imports:

```ts
import {
  type BoardEntry,
  mergeBoard,
  parseWinners,
  winnersFromResults,
} from "@/lib/achievements-board";
```

- [ ] **Step 2: Write the query**

Append after `getPublicAchievements`:

```ts
/**
 * The achievements board: hand-entered wins plus the podium of every event
 * whose results are published and which has not been hidden from the board.
 *
 * Automatic entries are derived at read time, never snapshotted, so the board
 * cannot disagree with an event's own results page. An event has rounds, so
 * "the podium" means one of them: the highest-`sort` round that actually has
 * published results — not simply the last round, which may be an unplayed final.
 */
export async function getAchievementsBoard(): Promise<BoardEntry[]> {
  const supabase = createPublicClient();

  const manualQ = supabase
    .from("achievements")
    .select("id, title, description, happened_on, image_path, created_at, winners, clubs(name)")
    .order("happened_on", { ascending: false, nullsFirst: false })
    .limit(500);

  const autoQ = supabase
    .from("events")
    .select(
      "id, title, starts_at, created_at, show_on_achievements, " +
        "event_clubs ( is_primary, clubs ( name ) ), " +
        "event_rounds ( sort, results ( roll_no, display_name, team_name, team_members, rank, score, advanced, remarks, published_at ) )",
    )
    .eq("show_on_achievements", true)
    .limit(500);

  const [manualRes, autoRes] = await Promise.all([manualQ, autoQ]);

  if (manualRes.error) throw manualRes.error;
  // A failed auto query must not masquerade as "no winners yet" — log it and
  // fall back to the manual half, the way getPublishedResults does.
  if (autoRes.error) console.error("getAchievementsBoard: auto half failed", autoRes.error);

  const manual: BoardEntry[] = (manualRes.data ?? []).map((a) => ({
    id: a.id,
    kind: "manual" as const,
    title: a.title,
    clubName: a.clubs?.name ?? null,
    date: a.happened_on,
    fallbackDate: a.created_at,
    winners: parseWinners(a.winners),
    description: a.description,
    imageUrl: a.image_path
      ? supabase.storage.from("achievements").getPublicUrl(a.image_path).data.publicUrl
      : null,
    href: null,
  }));

  type AutoRow = {
    id: string;
    title: string;
    starts_at: string;
    created_at: string;
    event_clubs: { is_primary: boolean; clubs: { name: string } | null }[];
    event_rounds: {
      sort: number;
      results: (PublishedResult & { published_at: string | null })[];
    }[];
  };

  const auto: BoardEntry[] = [];
  for (const e of ((autoRes.data ?? []) as unknown as AutoRow[])) {
    // Highest-sort round that has at least one published result.
    const round = [...(e.event_rounds ?? [])]
      .sort((a, b) => b.sort - a.sort)
      .find((r) => (r.results ?? []).some((x) => x.published_at != null));
    if (!round) continue;

    const published = round.results.filter((r) => r.published_at != null);
    const winners = winnersFromResults(published);
    if (winners.length === 0) continue;

    const primary = e.event_clubs?.find((ec) => ec.is_primary) ?? e.event_clubs?.[0];
    auto.push({
      id: e.id,
      kind: "event" as const,
      title: e.title,
      clubName: primary?.clubs?.name ?? null,
      date: e.starts_at,
      fallbackDate: e.created_at,
      winners,
      description: null,
      imageUrl: null,
      href: `/events/${e.id}/results`,
    });
  }

  return mergeBoard(auto, manual);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: clean. If `a.winners` errors as unknown, Task 1 Step 4 was not completed — go back and add the field to `database.types.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(achievements): getAchievementsBoard — live podiums + manual wins"
```

---

### Task 5: Render the board — the automatic half goes live

At the end of this task the acceptance criterion is met: PITCH DESK appears on `/achievements` as 1/2/3/3.

**Files:**
- Modify: `src/app/achievements/page.tsx`

**Interfaces:**
- Consumes: `getAchievementsBoard` (Task 4), `<Podium>` (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Rewrite the page body**

Replace the contents of `src/app/achievements/page.tsx` with:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Podium } from "@/components/Podium";
import { getAchievementsBoard } from "@/lib/queries";
import { renderMarkdown } from "@/lib/markdown";
import { istDateMedium } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Achievements",
  description: "Prize winners, contest wins and standout work from the department's clubs.",
};

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const entries = await getAchievementsBoard();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Highlights</div>
      <h1 style={{ margin: "12px 0 0" }}>Achievements</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Contest wins, hackathon podiums and the projects worth showing off — a
        running record of what the clubs have pulled off.
      </p>

      {entries.length === 0 ? (
        <>
          <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
            We&rsquo;re gathering the highlights now. In the meantime, event results
            and standings are published per event.
          </p>
          <div className="stack" style={{ marginTop: 24, gap: 12 }}>
            <ButtonLink href="/events">Browse events</ButtonLink>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 32, display: "grid", gap: 32, maxWidth: 720 }}>
          {entries.map((e) => (
            <article key={`${e.kind}-${e.id}`} className="rule" style={{ paddingBottom: 28 }}>
              <div className="label" style={{ color: "var(--ink-3)" }}>
                {[e.date ? istDateMedium(e.date) : null, e.clubName]
                  .filter(Boolean)
                  .join(" · ")}
              </div>

              <h2 style={{ margin: "6px 0 0", font: "400 24px/1.2 var(--serif)" }}>
                {e.title}
              </h2>

              {e.imageUrl ? (
                <Image
                  src={e.imageUrl}
                  alt=""
                  loading="lazy"
                  width={160}
                  height={110}
                  sizes="160px"
                  style={{ width: 160, height: 110, objectFit: "cover", borderRadius: 8, marginTop: 12 }}
                />
              ) : null}

              <Podium winners={e.winners} />

              {e.description ? (
                <div className="prose" style={{ marginTop: 14 }}>
                  {renderMarkdown(e.description)}
                </div>
              ) : null}

              {e.href ? (
                <Link
                  href={e.href}
                  className="label"
                  style={{ color: "var(--forest)", display: "inline-block", marginTop: 12 }}
                >
                  Full standings →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

**Note on markdown:** `renderMarkdown` lives at `src/lib/markdown.tsx` and has the signature `renderMarkdown(md: string): ReactNode` — it returns a React node, **not** an HTML string. Render it as a child inside `<div className="prose">`, exactly as the current page does at `achievements/page.tsx:73-75`. Never pass it to `dangerouslySetInnerHTML`: that would stringify a React element object into raw HTML, which is both broken and a needless injection surface.

**Note on dates:** `istDateMedium` is `(d: Date | string) => string`, so it accepts the ISO `starts_at` an automatic entry carries as readily as a manual entry's `YYYY-MM-DD`. No branch needed.

- [ ] **Step 2: Full gate**

Run: `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all clean.

- [ ] **Step 3: Verify the acceptance criterion against live data**

With a dev server running:

```bash
curl -s "http://localhost:3000/achievements" > /tmp/ach.html
grep -o 'PITCH DESK\|Champion\|Joint third\|Mohanrao Adduri\|HITESH BALAJI S U\|GNANESHWARAN P\|P.KISHORE\|Full standings' /tmp/ach.html | sort | uniq -c
grep -o 'podium-place' /tmp/ach.html | wc -l
```

Expected: `PITCH DESK` present; `Champion` ×1; `Joint third` ×1; all four winner names present; `Full standings` link present; `podium-place` count = 3 (first, second, joint third).

**If `podium-place` is 0**, the auto half returned nothing. Check in order: (a) `events.show_on_achievements` is true for PITCH DESK, (b) its results have `published_at` set, (c) `database.types.ts` carries `show_on_achievements` so the `.eq()` filter is not silently dropped.

- [ ] **Step 4: Commit**

```bash
git add src/app/achievements/page.tsx
git commit -m "feat(achievements): board renders live event podiums"
```

---

### Task 6: Admin — enter winners by hand

**Files:**
- Create: `src/components/admin/WinnersEditor.tsx`
- Modify: `src/components/admin/AchievementForm.tsx`
- Modify: `src/app/admin/(app)/achievements/actions.ts`
- Modify: `src/components/admin/EventForm.tsx`

**Interfaces:**
- Consumes: `Winner` from `@/lib/achievements-board`.
- Produces: a hidden form field `winners` carrying `JSON.stringify(Winner[])`, parsed server-side. This mirrors `RegistrationFormBuilder`, which serialises to a hidden `registrationForm` field and is `JSON.parse`d in `events/actions.ts:72`.

- [ ] **Step 1: Create the editor**

Create `src/components/admin/WinnersEditor.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { Winner } from "@/lib/achievements-board";

interface Row {
  rank: 1 | 2 | 3;
  name: string;
  roll: string;
}

const RANK_LABEL: Record<1 | 2 | 3, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

/**
 * Repeatable prize-winner rows, serialised into one hidden field — the same
 * shape RegistrationFormBuilder uses, so the server parses it the same way.
 *
 * Ranks are NOT unique: two third places is the whole point (a tie renders as
 * "Joint third"), so nothing here deduplicates them.
 */
export function WinnersEditor({ initial }: { initial?: Winner[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial ?? []).map((w) => ({ rank: w.rank, name: w.name, roll: w.roll ?? "" })),
  );

  const json = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => r.name.trim() !== "")
          .map((r) => ({
            rank: r.rank,
            name: r.name.trim(),
            roll: r.roll.trim() === "" ? null : r.roll.trim(),
          })),
      ),
    [rows],
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div style={{ marginTop: 18 }}>
      <span className="label">Prize winners</span>
      <p className="body-text" style={{ margin: "4px 0 10px", color: "var(--ink-3)", fontSize: 13 }}>
        Optional. Leave empty for an achievement that isn&rsquo;t a placed win.
        Two people can share a place — add both with the same rank.
      </p>

      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <select
            aria-label={`Winner ${i + 1} place`}
            value={r.rank}
            onChange={(e) => update(i, { rank: Number(e.target.value) as 1 | 2 | 3 })}
            style={{ width: 84 }}
          >
            {([1, 2, 3] as const).map((n) => (
              <option key={n} value={n}>{RANK_LABEL[n]}</option>
            ))}
          </select>
          <input
            aria-label={`Winner ${i + 1} name`}
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Full name"
            maxLength={120}
            style={{ flex: "2 1 180px" }}
          />
          <input
            aria-label={`Winner ${i + 1} roll number`}
            value={r.roll}
            onChange={(e) => update(i, { roll: e.target.value })}
            placeholder="vtuxxxxx (optional)"
            maxLength={40}
            style={{ flex: "1 1 130px" }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setRows((cur) => [...cur, { rank: 1, name: "", roll: "" }])}
      >
        Add winner
      </button>

      <input type="hidden" name="winners" value={json} readOnly />
    </div>
  );
}
```

- [ ] **Step 2: Embed it in the achievement form**

In `src/components/admin/AchievementForm.tsx`:

1. Import it and the `Winner` type:

```tsx
import type { Winner } from "@/lib/achievements-board";
import { WinnersEditor } from "./WinnersEditor";
```

2. Add `winners` to `AchievementInitial`:

```ts
export interface AchievementInitial {
  title: string;
  description: string;
  happenedOn: string | null;
  clubId: string | null;
  imageUrl: string | null;
  winners: Winner[];
}
```

3. Render `<WinnersEditor initial={initial?.winners} />` immediately after the description field and before the date field.

4. Change the title placeholder — placement is a real field now, so the title should name the event:

```tsx
placeholder="e.g. Smart India Hackathon 2026"
```

- [ ] **Step 3: Supply `winners` to the edit page**

`src/app/admin/(app)/achievements/[id]/edit/page.tsx` builds an `AchievementInitial`. Add `winners: parseWinners(row.winners)` to it, importing `parseWinners` from `@/lib/achievements-board`. Read the file first to match its existing variable names — do not guess them.

The `new` page passes no `initial`, so it needs no change.

- [ ] **Step 4: Validate server-side**

In `src/app/admin/(app)/achievements/actions.ts`:

1. Extend the schema (add after the `clubId` line, inside `z.object`):

```ts
  winners: z
    .array(
      z.object({
        rank: z.coerce.number().int().min(1).max(3),
        name: z.string().trim().min(1).max(120),
        roll: z.string().trim().max(40).nullable().optional(),
      }),
    )
    .max(20),
```

2. In `parse`, decode the hidden field. A malformed body must fail validation, not throw:

```ts
function parse(formData: FormData) {
  const rawWinners = formData.get("winners");
  let winners: unknown = [];
  if (typeof rawWinners === "string" && rawWinners.trim() !== "") {
    try {
      winners = JSON.parse(rawWinners);
    } catch {
      winners = null; // fails the schema below with a readable message
    }
  }
  return Schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    happenedOn: formData.get("happenedOn") ?? "",
    clubId: formData.get("clubId") ?? "",
    winners,
  });
}
```

3. In **both** the create and the update action, include the column in the payload. Normalise an empty list to `null` so an achievement with no winners stores nothing:

```ts
  const winners =
    parsed.data.winners.length > 0
      ? parsed.data.winners.map((w) => ({ rank: w.rank, name: w.name, roll: w.roll ?? null }))
      : null;
```

...then add `winners,` to the `.insert({ … })` and `.update({ … })` object literals. Read both call sites first and match their existing formatting.

- [ ] **Step 5: Add the event board toggle**

In `src/components/admin/EventForm.tsx`, add a checkbox near the other event switches:

```tsx
      <label className="check" style={{ marginTop: 14 }}>
        <input
          type="checkbox"
          name="showOnAchievements"
          defaultChecked={initial?.showOnAchievements ?? true}
        />
        <span>
          Show this event&rsquo;s podium on the achievements board
        </span>
      </label>
```

Then in `src/app/admin/(app)/events/actions.ts`, add `showOnAchievements: formData.get("showOnAchievements") === "on"` to the parsed payload and `show_on_achievements: showOnAchievements` to the insert/update objects. Read the file first and follow how the other boolean switches on that form are parsed — match them rather than introducing a second style.

- [ ] **Step 6: Full gate**

Run: `npx tsc --noEmit && npx eslint . && npm test && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/WinnersEditor.tsx src/components/admin/AchievementForm.tsx \
  "src/app/admin/(app)/achievements/actions.ts" "src/app/admin/(app)/achievements/[id]/edit/page.tsx" \
  src/components/admin/EventForm.tsx "src/app/admin/(app)/events/actions.ts"
git commit -m "feat(achievements): hand-entered prize winners + board toggle"
```

---

### Task 7: Verify end-to-end and record it

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Confirm the automatic half against production shape**

With a dev server running, re-run the Task 5 Step 3 checks. All must still pass after Task 6's changes — particularly `podium-place` = 3 on `/achievements`.

- [ ] **Step 2: Round-trip a manual entry**

This needs a browser (server-action POSTs cannot be curled) and a signed-in admin. Both seeded `@cse.test` logins were deleted 2026-09-05; use `sandy` (`vtu27884@veltech.edu.in`, tech_head) with an authenticator to hand.

1. `/admin/achievements/new` → title "Test win", add three winners with ranks 1, 3, 3 → Save.
2. `/achievements` → the entry shows **Champion** and **Joint third** with two names.
3. Edit it, remove one winner, save → the board follows.
4. Delete the test entry.

- [ ] **Step 3: Confirm the hide toggle**

Untick "Show this event's podium on the achievements board" on PITCH DESK, save, reload `/achievements` — its podium is gone. Re-tick it and confirm it returns.

- [ ] **Step 4: Update STATUS**

In `docs/STATUS.md`, add to the "What's DONE" section a dated entry recording: the board ships with both halves; automatic podiums are live-derived and cannot drift; `show_on_achievements` **defaults to true**, so publishing results puts an event on the public board unless someone unticks it (opt-out, not opt-in); and the migration went through MCP `apply_migration`, not `db push`.

- [ ] **Step 5: Commit and merge**

```bash
git add docs/STATUS.md
git commit -m "docs(status): achievements podium shipped"
git checkout main && git merge --ff-only feat/achievements-podium
npm test && npm run build
git push origin main
```

---

## Notes for the executor

- **The acceptance test is live data, not a fixture.** PITCH DESK must render 1/2/3/3 with both third places. If it renders only three names, `podiumOf` has been truncated somewhere — that is the bug this design exists to avoid.
- **Task 3 is a pure refactor.** If the results page changes appearance beyond losing the podium's score/team line (flagged in Task 3 Step 3), stop and report rather than adjusting the board to match.
- **Deploying:** `main` auto-deploys to Vercel. There is no `vercel` CLI installed and the Vercel MCP token currently returns 403 for this scope, so confirm a deploy by fetching `https://cse-ccc.vercel.app/achievements` and checking the markup, not by reading a build log.
