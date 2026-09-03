# Club Feedback Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/feedback` form — VTU, name, club, separately-rated club head and vice head, club rating, activities feedback, suggestions — open only while the President has a feedback window open, with an admin inbox readable by President / VP / Tech Head.

**Architecture:** A standalone vertical mirroring the existing `/contact` build. Two new tables (`feedback_periods`, `feedback_responses`) plus two curated columns on `clubs`. Pure logic lives in `src/lib/feedback/*` with unit tests; all DB access goes through the service-role client (neither new table has any anon grant). The public POST is a route handler so it can be verified with curl. The admin surface sits behind a new `view:feedback` capability.

**Tech Stack:** Next 16.3.1 App Router (Turbopack), React 19, TypeScript strict, Tailwind v4 + the repo's `.field` / `.admin` design-system classes, zod, Supabase (Postgres + RLS), vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-club-feedback-design.md` — read it first; it records five owner decisions (D1–D5) and their accepted consequences.

## Global Constraints

- **Never hand-edit `AGENTS.md`** — `next dev` rewrites it.
- **`dangerouslySetInnerHTML` is ESLint-banned.** For rich text reuse `src/lib/markdown.tsx`.
- **Regenerate `src/lib/database.types.ts` via the Supabase MCP `generate_typescript_types`, never `npm run types:gen`** — the Supabase CLI is absent and that script truncates the file.
- **The live DB is shared by dev and prod.** `npm run dev` writes real production data. Delete any test rows you seed.
- **Every new table needs `revoke all ... from anon, authenticated` in addition to `enable row level security`.** RLS with no policies blocks reads, but the default grant survives `create table` and PostgREST still surfaces the relation.
- **Every admin page must call a `require*` guard** — the `admin-route-requires-guard` ESLint rule enforces it.
- **The public page must never expose a response.** No feedback content on any public route, ever.
- **Ratings are `1..5` integers**, stored `smallint`, nullable for the two leaders and NOT NULL for the club.
- **No "round" naming in any user-visible string** (D5). Periods are labelled by date range.
- **Gate before any push:** `npm run typecheck && npm run lint && npm test && npm run build` must all pass.

## Deviations from the spec

One, deliberate. The spec's Testing section lists a pure `src/lib/feedback/period.ts`
for "open/closed resolution from a period row". That module would contain
`closed_at == null` and nothing else, so it is folded into `getOpenPeriod`
(Task 5) and `listPeriods` (Task 10) instead. Nothing else in the spec is
dropped or reinterpreted.

---

### Task 1: Migration + regenerated types

**Files:**
- Create: `supabase/migrations/20260904000000_club_feedback.sql`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-written)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.feedback_periods` and `public.feedback_responses`; columns `clubs.feedback_head_id`, `clubs.feedback_vice_head_id`. Generated row types `Database["public"]["Tables"]["feedback_periods"]["Row"]` and `..."feedback_responses"["Row"]`.

- [ ] **Step 1: Write the migration**

```sql
-- Club feedback portal. Two tables: a window (feedback_periods) that the
-- President opens and closes BY HAND (no cron, no auto-close — design D4), and
-- the responses collected while it is open.
--
-- Deliberately NOT a `kind` column on contact_messages: feedback carries three
-- numeric ratings against two identified people, and the whole point is to
-- average them per club per period. Same call the repo made for
-- admin_password_resets vs admin_invites.

create table public.feedback_periods (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.admin_users (id) on delete set null,
  closed_by uuid references public.admin_users (id) on delete set null
);

-- At most one window open at a time, enforced by the database rather than by
-- app convention. The expression references a column (so it is a legal index
-- expression) and is always true inside the partial index's WHERE, so two open
-- rows collide.
create unique index feedback_periods_one_open
  on public.feedback_periods ((closed_at is null))
  where closed_at is null;

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.feedback_periods (id) on delete cascade,
  vtu text not null,
  student_name text not null,
  club_id uuid not null references public.clubs (id) on delete cascade,

  -- head_name is a SNAPSHOT, not a join. Leaders turn over every academic year
  -- and a rating must stay attached to whoever held the post when it was given,
  -- or next year's head inherits this year's two-star reviews. Never backfill
  -- these names from the id. Same denormalisation as results.display_name.
  head_admin_id uuid references public.admin_users (id) on delete set null,
  head_name text,
  head_rating smallint check (head_rating between 1 and 5),
  head_comment text,

  vice_admin_id uuid references public.admin_users (id) on delete set null,
  vice_name text,
  vice_rating smallint check (vice_rating between 1 and 5),
  vice_comment text,

  club_rating smallint not null check (club_rating between 1 and 5),
  activities_feedback text not null,
  suggestions text,
  created_at timestamptz not null default now()
);

create index feedback_responses_period_club_idx
  on public.feedback_responses (period_id, club_id);

-- The curated per-club pick (design D1). Several clubs have more than one
-- club_head account on file, so the form cannot just query for "the" head.
alter table public.clubs
  add column feedback_head_id uuid references public.admin_users (id) on delete set null,
  add column feedback_vice_head_id uuid references public.admin_users (id) on delete set null;

-- RLS on with NO policies: service-role only. Responses are PII (VTU + name +
-- free text about named people) and the promise on the form is that they stay
-- confidential.
alter table public.feedback_periods enable row level security;
alter table public.feedback_responses enable row level security;

-- The second lock. RLS with no policies already blocks reads, but the table-wide
-- grant survives `create table` (see 20260820120005_rls.sql:43-53 and the
-- 2026-09-03 admin_password_resets follow-up). Without this, one accidentally
-- permissive policy later would expose every response.
revoke all on public.feedback_periods from anon, authenticated;
revoke all on public.feedback_responses from anon, authenticated;
```

- [ ] **Step 2: Apply it to the live DB via the Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with `project_id: svkbleeibbrjryeovvjw`, name `club_feedback`, and the SQL above. Migrations in this repo are always applied **before** the code deploy.

- [ ] **Step 3: Verify the schema landed, including the grants**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
select c.relname,
       c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('feedback_periods','feedback_responses');
```

Expected: two rows, `relrowsecurity = true`, **both privilege columns `false`**. If either is `true` the revoke did not apply — fix before continuing. Checking `relrowsecurity` alone misses this exact bug.

- [ ] **Step 4: Verify the one-open-period constraint actually bites**

```sql
begin;
insert into feedback_periods default values;
insert into feedback_periods default values;  -- must fail
rollback;
```

Expected: the second insert raises `duplicate key value violates unique constraint "feedback_periods_one_open"`. The `rollback` leaves the table empty.

- [ ] **Step 5: Regenerate the types**

Call `mcp__plugin_supabase_supabase__generate_typescript_types` and write the output over `src/lib/database.types.ts`. Do **not** run `npm run types:gen`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (nothing consumes the new types yet).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260904000000_club_feedback.sql src/lib/database.types.ts
git commit -m "feat(feedback): add feedback_periods + feedback_responses"
```

---

### Task 2: Input schema

**Files:**
- Create: `src/lib/feedback/schema.ts`
- Test: `src/lib/feedback/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FeedbackSchema` (zod), `type FeedbackInput`, `FEEDBACK_FIELD_KEYS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { FeedbackSchema } from "./schema";

const valid = {
  vtu: "vtu12345",
  studentName: "Asha R",
  clubId: "11111111-1111-4111-8111-111111111111",
  clubRating: 4,
  activities: "Good sessions this month.",
};

describe("FeedbackSchema", () => {
  it("accepts the minimal required payload", () => {
    const r = FeedbackSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("defaults the optional text fields to empty strings", () => {
    const r = FeedbackSchema.parse(valid);
    expect(r.headComment).toBe("");
    expect(r.suggestions).toBe("");
  });

  it("leaves absent leader ratings null", () => {
    const r = FeedbackSchema.parse(valid);
    expect(r.headRating).toBeNull();
    expect(r.viceRating).toBeNull();
  });

  it("allows a comment with no rating", () => {
    const r = FeedbackSchema.safeParse({ ...valid, headComment: "Very approachable." });
    expect(r.success).toBe(true);
  });

  it("allows a rating with no comment", () => {
    const r = FeedbackSchema.safeParse({ ...valid, headRating: 5 });
    expect(r.success).toBe(true);
  });

  it("rejects a rating outside 1..5", () => {
    expect(FeedbackSchema.safeParse({ ...valid, clubRating: 6 }).success).toBe(false);
    expect(FeedbackSchema.safeParse({ ...valid, clubRating: 0 }).success).toBe(false);
  });

  it("rejects a fractional rating", () => {
    expect(FeedbackSchema.safeParse({ ...valid, clubRating: 3.5 }).success).toBe(false);
  });

  it("requires activities feedback", () => {
    expect(FeedbackSchema.safeParse({ ...valid, activities: "" }).success).toBe(false);
  });

  it("rejects a non-uuid club", () => {
    expect(FeedbackSchema.safeParse({ ...valid, clubId: "coding" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(FeedbackSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });

  it("rejects a filled honeypot", () => {
    expect(FeedbackSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/feedback/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the schema**

```ts
import { z } from "zod";

/**
 * Public feedback-form input. `.strict()` rejects unknown keys; `website` is a
 * honeypot that must stay empty; `turnstile` is verified server-side when
 * configured. Mirrors ContactSchema.
 *
 * The two leader ratings and every comment are OPTIONAL and independent: a
 * comment may be left with no rating and a rating with no comment. Forcing a
 * number out of someone with no opinion of a person produces a noisy average.
 * `clubRating` and `activities` are the only substantive required fields.
 */
export const FeedbackSchema = z
  .object({
    vtu: z
      .string()
      .trim()
      .min(3, "Enter your VTU number.")
      .max(20, "That VTU number is too long."),
    studentName: z
      .string()
      .trim()
      .min(2, "Please enter your name (at least 2 characters).")
      .max(80, "Name is too long (max 80 characters)."),
    clubId: z.string().uuid("Choose your club."),

    headRating: z.number().int().min(1).max(5).nullable().optional().default(null),
    headComment: z.string().trim().max(2000, "Too long (max 2000 characters).").optional().default(""),
    viceRating: z.number().int().min(1).max(5).nullable().optional().default(null),
    viceComment: z.string().trim().max(2000, "Too long (max 2000 characters).").optional().default(""),

    clubRating: z.number().int().min(1, "Rate the club.").max(5),
    activities: z
      .string()
      .trim()
      .min(5, "Please write at least 5 characters.")
      .max(4000, "Too long (max 4000 characters)."),
    suggestions: z.string().trim().max(4000, "Too long (max 4000 characters).").optional().default(""),

    website: z.string().max(0, "bot").optional().default(""), // honeypot
    turnstile: z.string().optional(),
  })
  .strict();

export type FeedbackInput = z.infer<typeof FeedbackSchema>;

/** Fields whose validation messages may be shown to the student. Never includes
 *  the honeypot or the bot token — a filled honeypot must fail generically. */
export const FEEDBACK_FIELD_KEYS = [
  "vtu",
  "studentName",
  "clubId",
  "headRating",
  "headComment",
  "viceRating",
  "viceComment",
  "clubRating",
  "activities",
  "suggestions",
] as const;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/feedback/schema.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/schema.ts src/lib/feedback/schema.test.ts
git commit -m "feat(feedback): input schema"
```

---

### Task 3: Leader resolution

**Files:**
- Create: `src/lib/feedback/leaders.ts`
- Test: `src/lib/feedback/leaders.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type LeaderCandidate`, `type ResolvedLeader`, `type ClubLeaders`, `resolveLeaders(candidates, curated): ClubLeaders`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveLeaders, type LeaderCandidate } from "./leaders";

const head = (id: string, name: string): LeaderCandidate => ({
  id, name, role: "club_head", isActive: true,
});
const vice = (id: string, name: string): LeaderCandidate => ({
  id, name, role: "vice_head", isActive: true,
});
const none = { headId: null, viceHeadId: null };

describe("resolveLeaders", () => {
  it("uses the sole active head when nothing is curated", () => {
    const r = resolveLeaders([head("h1", "R.jayasurya"), vice("v1", "Manidhar")], none);
    expect(r.head).toEqual({ id: "h1", name: "R.jayasurya" });
    expect(r.viceHead).toEqual({ id: "v1", name: "Manidhar" });
  });

  it("returns null for a role with no candidate at all", () => {
    const r = resolveLeaders([head("h1", "Rakshana A")], none);
    expect(r.viceHead).toBeNull();
  });

  it("returns null when a role is ambiguous and uncurated", () => {
    const r = resolveLeaders([head("h1", "Coding Head"), head("h2", "Navaneeth")], none);
    expect(r.head).toBeNull();
  });

  it("prefers the curated pick over the ambiguity", () => {
    const r = resolveLeaders(
      [head("h1", "Coding Head"), head("h2", "Navaneeth")],
      { headId: "h2", viceHeadId: null },
    );
    expect(r.head).toEqual({ id: "h2", name: "Navaneeth" });
  });

  it("prefers the curated pick even when there is only one candidate", () => {
    const r = resolveLeaders(
      [head("h1", "A"), head("h2", "B")],
      { headId: "h1", viceHeadId: null },
    );
    expect(r.head).toEqual({ id: "h1", name: "A" });
  });

  it("ignores a curated pick pointing at a deactivated account", () => {
    const r = resolveLeaders(
      [{ id: "h1", name: "Gone", role: "club_head", isActive: false }, head("h2", "Here")],
      { headId: "h1", viceHeadId: null },
    );
    expect(r.head).toEqual({ id: "h2", name: "Here" });
  });

  it("ignores a curated pick pointing at an unknown id", () => {
    const r = resolveLeaders([head("h1", "Only")], { headId: "ghost", viceHeadId: null });
    expect(r.head).toEqual({ id: "h1", name: "Only" });
  });

  it("never lets a curated head resolve to a vice-head account", () => {
    const r = resolveLeaders([vice("v1", "Vice")], { headId: "v1", viceHeadId: null });
    expect(r.head).toBeNull();
  });

  it("excludes inactive candidates from the sole-candidate fallback", () => {
    const r = resolveLeaders(
      [head("h1", "Active"), { id: "h2", name: "Inactive", role: "club_head", isActive: false }],
      none,
    );
    expect(r.head).toEqual({ id: "h1", name: "Active" });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/feedback/leaders.test.ts`
Expected: FAIL — cannot resolve `./leaders`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Which head and vice head the feedback form shows for a club.
 *
 * `admin_users` is NOT one-head-per-club on the live data: Coding Club has three
 * `club_head` accounts, AppNova two, AspireX two `vice_head` rows that look like
 * one duplicated person, and three clubs have no vice head at all. So the form
 * cannot simply query for "the" head — hence the curated pick, and hence the
 * refusal to guess.
 *
 * Pure: no I/O, so the rules are unit-testable.
 */

export interface LeaderCandidate {
  id: string;
  name: string;
  role: "club_head" | "vice_head";
  isActive: boolean;
}

export interface ResolvedLeader {
  id: string;
  name: string;
}

export interface ClubLeaders {
  head: ResolvedLeader | null;
  viceHead: ResolvedLeader | null;
}

function pick(
  candidates: LeaderCandidate[],
  role: LeaderCandidate["role"],
  curatedId: string | null,
): ResolvedLeader | null {
  const eligible = candidates.filter((c) => c.isActive && c.role === role);

  // 1) the curated pick, if it is still an eligible account of THIS role.
  if (curatedId) {
    const chosen = eligible.find((c) => c.id === curatedId);
    if (chosen) return { id: chosen.id, name: chosen.name };
    // falls through: a stale or wrong-role pick is ignored, not honoured.
  }

  // 2) the sole candidate, if there is exactly one.
  if (eligible.length === 1) return { id: eligible[0].id, name: eligible[0].name };

  // 3) nothing. An ambiguous club shows no block rather than guessing — a wrong
  //    name attached to a rating is worse than a missing one.
  return null;
}

export function resolveLeaders(
  candidates: LeaderCandidate[],
  curated: { headId: string | null; viceHeadId: string | null },
): ClubLeaders {
  return {
    head: pick(candidates, "club_head", curated.headId),
    viceHead: pick(candidates, "vice_head", curated.viceHeadId),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/feedback/leaders.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/leaders.ts src/lib/feedback/leaders.test.ts
git commit -m "feat(feedback): head/vice-head resolution"
```

---

### Task 4: Per-club summary + duplicate detection

**Files:**
- Create: `src/lib/feedback/summary.ts`
- Test: `src/lib/feedback/summary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ResponseForSummary`, `type ClubSummary`, `summariseByClub(rows): ClubSummary[]`, `duplicateVtus(rows): Set<string>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { summariseByClub, duplicateVtus, type ResponseForSummary } from "./summary";

const row = (o: Partial<ResponseForSummary> = {}): ResponseForSummary => ({
  clubId: "c1", vtu: "vtu1", clubRating: 4, headRating: 4, viceRating: 4, ...o,
});

describe("summariseByClub", () => {
  it("returns nothing for no rows", () => {
    expect(summariseByClub([])).toEqual([]);
  });

  it("counts responses and averages each rating", () => {
    const [s] = summariseByClub([
      row({ clubRating: 5, headRating: 4, viceRating: 3 }),
      row({ clubRating: 4, headRating: 3, viceRating: 2 }),
    ]);
    expect(s.responses).toBe(2);
    expect(s.clubAvg).toBe(4.5);
    expect(s.headAvg).toBe(3.5);
    expect(s.viceAvg).toBe(2.5);
  });

  it("rounds to one decimal", () => {
    const [s] = summariseByClub([
      row({ clubRating: 4 }), row({ clubRating: 4 }), row({ clubRating: 5 }),
    ]);
    expect(s.clubAvg).toBe(4.3);
  });

  it("ignores null ratings in the average rather than counting them as zero", () => {
    const [s] = summariseByClub([
      row({ headRating: 5 }), row({ headRating: null }),
    ]);
    expect(s.headAvg).toBe(5);
    expect(s.responses).toBe(2);
  });

  it("gives a null average when every rating for a target is null", () => {
    const [s] = summariseByClub([row({ viceRating: null }), row({ viceRating: null })]);
    expect(s.viceAvg).toBeNull();
  });

  it("groups by club", () => {
    const out = summariseByClub([
      row({ clubId: "a", clubRating: 5 }),
      row({ clubId: "b", clubRating: 1 }),
      row({ clubId: "a", clubRating: 3 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.clubId === "a")?.responses).toBe(2);
    expect(out.find((s) => s.clubId === "b")?.clubAvg).toBe(1);
  });
});

describe("duplicateVtus", () => {
  it("is empty when every VTU is distinct", () => {
    expect(duplicateVtus([{ vtu: "a" }, { vtu: "b" }]).size).toBe(0);
  });

  it("flags a VTU appearing more than once", () => {
    const d = duplicateVtus([{ vtu: "a" }, { vtu: "b" }, { vtu: "a" }]);
    expect(d.has("a")).toBe(true);
    expect(d.has("b")).toBe(false);
  });

  it("compares case- and whitespace-insensitively", () => {
    const d = duplicateVtus([{ vtu: "VTU1" }, { vtu: " vtu1 " }]);
    expect(d.has("vtu1")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/feedback/summary.test.ts`
Expected: FAIL — cannot resolve `./summary`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Per-club aggregates for one feedback period, plus duplicate-VTU detection.
 *
 * ⚠️ These averages are ADVISORY, NOT EVIDENCE. The owner declined any
 * submission cap (design D3), so one person can submit repeatedly and move a
 * leader's average. `duplicateVtus` is the compensating control: it surfaces
 * repeats to a human. It must never be used to reject a student.
 *
 * Pure: no I/O.
 */

export interface ResponseForSummary {
  clubId: string;
  vtu: string;
  clubRating: number;
  headRating: number | null;
  viceRating: number | null;
}

export interface ClubSummary {
  clubId: string;
  responses: number;
  clubAvg: number | null;
  headAvg: number | null;
  viceAvg: number | null;
}

/** Mean of the non-null values, to one decimal; null when there are none. */
function avg(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  return Math.round(mean * 10) / 10;
}

export function summariseByClub(rows: ResponseForSummary[]): ClubSummary[] {
  const byClub = new Map<string, ResponseForSummary[]>();
  for (const r of rows) {
    const list = byClub.get(r.clubId);
    if (list) list.push(r);
    else byClub.set(r.clubId, [r]);
  }

  return [...byClub.entries()].map(([clubId, list]) => ({
    clubId,
    responses: list.length,
    clubAvg: avg(list.map((r) => r.clubRating)),
    headAvg: avg(list.map((r) => r.headRating)),
    viceAvg: avg(list.map((r) => r.viceRating)),
  }));
}

/** VTUs appearing more than once, normalised for case and stray whitespace. */
export function duplicateVtus(rows: { vtu: string }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = r.vtu.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/feedback/summary.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/summary.ts src/lib/feedback/summary.test.ts
git commit -m "feat(feedback): per-club averages + duplicate-VTU detection"
```

---

### Task 5: Public-side data access

**Files:**
- Create: `src/lib/feedback/data.ts`

**Interfaces:**
- Consumes: `resolveLeaders`, `LeaderCandidate`, `ClubLeaders` from Task 3.
- Produces: `getOpenPeriod(): Promise<OpenPeriod | null>` (React-cached), `listClubsWithLeaders(): Promise<ClubOption[]>`, `getClubLeaders(clubId): Promise<ClubLeaders | null>`, `insertFeedbackResponse(input): Promise<boolean>`, `type OpenPeriod`, `type ClubOption`.

There is no unit test for this file — it is pure I/O against the service-role client, which the repo does not mock anywhere. Its behaviour is covered by the curl checks in Task 6.

- [ ] **Step 1: Write the module**

```ts
import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLeaders, type ClubLeaders, type LeaderCandidate } from "./leaders";

/**
 * Service-role reads/writes for the public feedback surface. Neither feedback
 * table has an anon grant, so every access goes through here — including the
 * "is the window open?" check, which is safe because /feedback and the root
 * layout are Server Components.
 */

export interface OpenPeriod {
  id: string;
  openedAt: string;
}

export interface ClubOption {
  id: string;
  name: string;
  head: ClubLeaders["head"];
  viceHead: ClubLeaders["viceHead"];
}

/**
 * The open window, or null. Wrapped in React `cache()` because the ROOT LAYOUT
 * calls it on every public page render — the cache collapses that to one query
 * per request, the same way getAdminSession does.
 *
 * Fails CLOSED: on any error we report "no window open". A broken nav on every
 * page of the site is a worse outcome than a missed feedback window.
 */
export const getOpenPeriod = cache(async function getOpenPeriod(): Promise<OpenPeriod | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null; // service key absent (e.g. a misconfigured preview env)
  }
  const { data, error } = await admin
    .from("feedback_periods")
    .select("id, opened_at")
    .is("closed_at", null)
    .maybeSingle();
  if (error) {
    console.error("feedback: open-period lookup failed", error.message);
    return null;
  }
  return data ? { id: data.id, openedAt: data.opened_at } : null;
});

/** Every active club with its resolved head + vice head, for the form's dropdown. */
export async function listClubsWithLeaders(): Promise<ClubOption[]> {
  const admin = createAdminClient();

  const [{ data: clubs, error: clubsError }, { data: admins, error: adminsError }] =
    await Promise.all([
      admin
        .from("clubs")
        .select("id, name, feedback_head_id, feedback_vice_head_id")
        .eq("is_active", true)
        .order("name"),
      admin
        .from("admin_users")
        .select("id, full_name, role, club_id, is_active")
        .in("role", ["club_head", "vice_head"]),
    ]);
  if (clubsError) throw clubsError;
  if (adminsError) throw adminsError;

  const byClub = new Map<string, LeaderCandidate[]>();
  for (const a of admins ?? []) {
    if (!a.club_id) continue;
    if (a.role !== "club_head" && a.role !== "vice_head") continue;
    const entry: LeaderCandidate = {
      id: a.id,
      name: a.full_name,
      role: a.role,
      isActive: a.is_active,
    };
    const list = byClub.get(a.club_id);
    if (list) list.push(entry);
    else byClub.set(a.club_id, [entry]);
  }

  return (clubs ?? []).map((c) => {
    const { head, viceHead } = resolveLeaders(byClub.get(c.id) ?? [], {
      headId: c.feedback_head_id,
      viceHeadId: c.feedback_vice_head_id,
    });
    return { id: c.id, name: c.name, head, viceHead };
  });
}

/** One club's leaders, re-resolved server-side at submit time. */
export async function getClubLeaders(clubId: string): Promise<ClubLeaders | null> {
  const clubs = await listClubsWithLeaders();
  const club = clubs.find((c) => c.id === clubId);
  return club ? { head: club.head, viceHead: club.viceHead } : null;
}

export interface InsertFeedbackInput {
  periodId: string;
  vtu: string;
  studentName: string;
  clubId: string;
  leaders: ClubLeaders;
  headRating: number | null;
  headComment: string;
  viceRating: number | null;
  viceComment: string;
  clubRating: number;
  activities: string;
  suggestions: string;
}

/** Store one response. Returns false on a DB error (the caller answers 500). */
export async function insertFeedbackResponse(input: InsertFeedbackInput): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("feedback_responses").insert({
    period_id: input.periodId,
    vtu: input.vtu,
    student_name: input.studentName,
    club_id: input.clubId,
    // Names are SNAPSHOTS taken now — never re-derived from the id later.
    head_admin_id: input.leaders.head?.id ?? null,
    head_name: input.leaders.head?.name ?? null,
    head_rating: input.leaders.head ? input.headRating : null,
    head_comment: input.leaders.head && input.headComment ? input.headComment : null,
    vice_admin_id: input.leaders.viceHead?.id ?? null,
    vice_name: input.leaders.viceHead?.name ?? null,
    vice_rating: input.leaders.viceHead ? input.viceRating : null,
    vice_comment: input.leaders.viceHead && input.viceComment ? input.viceComment : null,
    club_rating: input.clubRating,
    activities_feedback: input.activities,
    suggestions: input.suggestions || null,
  });
  if (error) {
    console.error("feedback insert failed", error);
    return false;
  }
  return true;
}
```

Note the guard `input.leaders.head ? input.headRating : null`: if a club has no resolvable head, a rating for one is discarded rather than stored against nobody.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `feedback_head_id` is unknown on `clubs`, Task 1 Step 5 was skipped — regenerate the types.

- [ ] **Step 3: Commit**

```bash
git add src/lib/feedback/data.ts
git commit -m "feat(feedback): service-role data access"
```

---

### Task 6: `POST /api/feedback`

**Files:**
- Create: `src/app/api/feedback/route.ts`
- Modify: `src/lib/rate-limit.ts` (append `checkFeedbackLimits`)
- Test: `src/lib/rate-limit.test.ts` (append one case)

**Interfaces:**
- Consumes: `FeedbackSchema`, `FEEDBACK_FIELD_KEYS` (Task 2); `getOpenPeriod`, `getClubLeaders`, `insertFeedbackResponse` (Task 5).
- Produces: `checkFeedbackLimits({ ip }): RateResult`; the endpoint `POST /api/feedback` answering `{ ok: true }` / `{ error, fields? }`.

- [ ] **Step 1: Write the failing rate-limit test**

Append to `src/lib/rate-limit.test.ts`:

```ts
describe("checkFeedbackLimits", () => {
  it("allows 10 submissions from one IP then trips", () => {
    const ip = `fb-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkFeedbackLimits({ ip }).ok).toBe(true);
    }
    const blocked = checkFeedbackLimits({ ip });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
```

Add `checkFeedbackLimits` to the existing import at the top of that file.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: FAIL — `checkFeedbackLimits` is not exported.

- [ ] **Step 3: Add the limiter**

Append to `src/lib/rate-limit.ts`:

```ts
/**
 * Public feedback form: 10 per IP / hour. Per IP ONLY — never per VTU. A
 * per-VTU limit would quietly reintroduce the submission cap the owner declined
 * (design D3). The bound is deliberately loose because a whole class can share
 * one campus NAT address: this exists to stop a script, not a person.
 */
export function checkFeedbackLimits(input: { ip: string }): RateResult {
  return rateLimit(`feedback:ip:${input.ip}`, 10, HOUR);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route handler**

```ts
import { FeedbackSchema, FEEDBACK_FIELD_KEYS } from "@/lib/feedback/schema";
import {
  getOpenPeriod,
  getClubLeaders,
  insertFeedbackResponse,
} from "@/lib/feedback/data";
import { checkFeedbackLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  // 1) body size cap (SECURITY_SPEC §5)
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 100_000) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  // 2) parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    // Visible fields only — never the honeypot or the bot token, so a filled
    // honeypot fails generically instead of telling a bot which field it was.
    const fields: Record<string, string> = {};
    for (const key of FEEDBACK_FIELD_KEYS) {
      const msg = fieldErrors[key]?.[0];
      if (msg) fields[key] = msg;
    }
    return Object.keys(fields).length > 0
      ? Response.json({ error: "Please fix the highlighted fields.", fields }, { status: 400 })
      : Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const input = parsed.data;
  const ip = clientIp(request);

  // 3) rate limit (per IP only — see checkFeedbackLimits)
  const limit = checkFeedbackLimits({ ip });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 4) bot check (skipped when Turnstile isn't configured)
  if (!(await verifyTurnstile(input.turnstile, ip))) {
    return Response.json({ error: "Verification failed. Please retry." }, { status: 400 });
  }

  // 5) the window must STILL be open. A form left sitting in a tab after the
  //    President pressed Close must not submit.
  const period = await getOpenPeriod();
  if (!period) {
    return Response.json(
      { error: "Feedback has closed. Thank you for your interest." },
      { status: 409 },
    );
  }

  // 6) Re-resolve the leaders SERVER-SIDE from club_id. Names and ids sent by
  //    the browser are ignored entirely — otherwise anyone could post a
  //    one-star rating attached to a name of their choosing.
  const leaders = await getClubLeaders(input.clubId);
  if (!leaders) {
    return Response.json({ error: "Choose your club." }, { status: 400 });
  }

  // 7) store
  const ok = await insertFeedbackResponse({
    periodId: period.id,
    vtu: input.vtu,
    studentName: input.studentName,
    clubId: input.clubId,
    leaders,
    headRating: input.headRating ?? null,
    headComment: input.headComment,
    viceRating: input.viceRating ?? null,
    viceComment: input.viceComment,
    clubRating: input.clubRating,
    activities: input.activities,
    suggestions: input.suggestions,
  });
  if (!ok) {
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 6: Verify the endpoint with curl**

Start `npm run dev`, then — with **no** period open (the table is empty after Task 1):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/feedback \
  -H 'content-type: application/json' \
  -d '{"vtu":"vtu99999","studentName":"Curl Test","clubId":"<a real club uuid>","clubRating":4,"activities":"testing the endpoint"}'
```

Expected: `409` (no window open). Then check the rejections:

```bash
# unknown key -> 400
curl -s -X POST localhost:3000/api/feedback -H 'content-type: application/json' \
  -d '{"vtu":"vtu1","studentName":"A B","clubId":"<uuid>","clubRating":4,"activities":"aaaaa","isAdmin":true}'
# rating out of range -> 400 with a field message
curl -s -X POST localhost:3000/api/feedback -H 'content-type: application/json' \
  -d '{"vtu":"vtu1","studentName":"A B","clubId":"<uuid>","clubRating":9,"activities":"aaaaa"}'
```

Expected: both `400`; the second names `clubRating` in `fields`.

**Do not open a period from the admin UI yet — it does not exist until Task 10.** To test the happy path now, insert one row via the Supabase MCP, re-run the first curl (expect `200` and a row in `feedback_responses`), then **delete both the response and the period**. The live DB is shared with production.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/feedback/route.ts src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat(feedback): public submission endpoint"
```

---

### Task 7: Public `/feedback` page

**Files:**
- Create: `src/app/feedback/page.tsx`
- Create: `src/components/FeedbackForm.tsx`
- Create: `src/components/FeedbackPromise.tsx`
- Modify: `src/app/globals.css` (append the `.fb-*` block)

**Interfaces:**
- Consumes: `getOpenPeriod`, `listClubsWithLeaders`, `type ClubOption` (Task 5); `POST /api/feedback` (Task 6).
- Produces: the route `/feedback`.

- [ ] **Step 1: Write the promise panel**

`src/components/FeedbackPromise.tsx` — the owner's text, **verbatim**. Do not paraphrase, shorten, or "improve" it.

```tsx
/** The President's confidentiality note, shown beside the form. The wording is
 *  the owner's own and must not be edited. */
export function FeedbackPromise() {
  return (
    <aside className="fb-promise">
      <div className="eyebrow">A note from the President</div>
      <p className="body-text">
        All your feedback has been collected and analyzed with utmost care.
      </p>
      <p className="body-text">
        Your grievances and suggestions will be taken seriously and, wherever
        possible, will be implemented or worked upon for improvement.
      </p>
      <p className="body-text">
        I guarantee that your identity and responses will remain strictly
        confidential.
      </p>
      <p className="fb-sign">
        — Charan Cheedella
        <span>President, CSE Clubs Council</span>
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: Write the form**

`src/components/FeedbackForm.tsx`. Follows `ContactForm.tsx`: `fetch` to the route handler, `fields` map for per-field errors, honeypot, `.field` / `.field.err` classes.

```tsx
"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import type { ClubOption } from "@/lib/feedback/data";

type FieldErrors = Record<string, string>;
type Result = { ok?: boolean; error?: string; fields?: FieldErrors };

/** 1–5 radio group. Radios (not a select) so the whole scale is visible and
 *  tappable on a phone, and so "no answer" stays representable. */
function Stars({
  name, value, onChange,
}: {
  name: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fb-stars" role="radiogroup" aria-label="Rating out of 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="fb-star" data-on={value != null && n <= value ? "true" : "false"}>
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
          />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{n} out of 5</span>
        </label>
      ))}
    </div>
  );
}

export function FeedbackForm({ clubs }: { clubs: ClubOption[] }) {
  const [clubId, setClubId] = useState("");
  const [headRating, setHeadRating] = useState<number | null>(null);
  const [viceRating, setViceRating] = useState<number | null>(null);
  const [clubRating, setClubRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const club = clubs.find((c) => c.id === clubId) ?? null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      vtu: String(fd.get("vtu") ?? ""),
      studentName: String(fd.get("studentName") ?? ""),
      clubId,
      headRating,
      headComment: String(fd.get("headComment") ?? ""),
      viceRating,
      viceComment: String(fd.get("viceComment") ?? ""),
      clubRating,
      activities: String(fd.get("activities") ?? ""),
      suggestions: String(fd.get("suggestions") ?? ""),
      website: String(fd.get("website") ?? ""), // honeypot
    };

    setSubmitting(true);
    setResult(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Result;
      if (res.ok) setResult({ ok: true });
      else if (data.fields && Object.keys(data.fields).length > 0) setFieldErrors(data.fields);
      else setResult({ error: data.error ?? "Something went wrong." });
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>Feedback received ✓</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          Thank you — this goes straight to the President and Vice President, and
          nowhere else.
        </p>
      </div>
    );
  }

  const rowClass = (k: string) => "field" + (fieldErrors[k] ? " err" : "");

  return (
    <form onSubmit={onSubmit} noValidate>
      {result?.error ? (
        <div className="note" role="alert" style={{ borderLeftColor: "var(--rust)", marginBottom: 14 }}>
          {result.error}
        </div>
      ) : null}

      <div className="cf-row">
        <div className={rowClass("vtu")}>
          <label htmlFor="fb-vtu">VTU number</label>
          <input id="fb-vtu" name="vtu" required maxLength={20} placeholder="vtuxxxxx" />
          {fieldErrors.vtu ? <span className="hint" role="alert">{fieldErrors.vtu}</span> : null}
        </div>
        <div className={rowClass("studentName")}>
          <label htmlFor="fb-name">Your name</label>
          <input id="fb-name" name="studentName" required maxLength={80} autoComplete="name" placeholder="Your full name" />
          {fieldErrors.studentName ? <span className="hint" role="alert">{fieldErrors.studentName}</span> : null}
        </div>
      </div>

      <div className={rowClass("clubId")}>
        <label htmlFor="fb-club">Your club</label>
        <select id="fb-club" name="clubId" required value={clubId} onChange={(e) => setClubId(e.target.value)}>
          <option value="">Select your club…</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {fieldErrors.clubId ? <span className="hint" role="alert">{fieldErrors.clubId}</span> : null}
      </div>

      {club?.head ? (
        <fieldset className="fb-block">
          <legend>Club Head — {club.head.name}</legend>
          <Stars name="headRating" value={headRating} onChange={setHeadRating} />
          <div className="field">
            <label htmlFor="fb-head-c">Anything you&rsquo;d like to say?</label>
            <textarea id="fb-head-c" name="headComment" rows={3} maxLength={2000} placeholder="Optional." />
          </div>
        </fieldset>
      ) : null}

      {club?.viceHead ? (
        <fieldset className="fb-block">
          <legend>Vice Head — {club.viceHead.name}</legend>
          <Stars name="viceRating" value={viceRating} onChange={setViceRating} />
          <div className="field">
            <label htmlFor="fb-vice-c">Anything you&rsquo;d like to say?</label>
            <textarea id="fb-vice-c" name="viceComment" rows={3} maxLength={2000} placeholder="Optional." />
          </div>
        </fieldset>
      ) : null}

      {club ? (
        <fieldset className="fb-block">
          <legend>The club itself</legend>
          <Stars name="clubRating" value={clubRating} onChange={setClubRating} />
          {fieldErrors.clubRating ? (
            <span className="hint" role="alert">{fieldErrors.clubRating}</span>
          ) : null}
        </fieldset>
      ) : null}

      <div className={rowClass("activities")}>
        <label htmlFor="fb-act">The club&rsquo;s activities so far</label>
        <textarea id="fb-act" name="activities" required rows={5} maxLength={4000}
          placeholder="What has worked, what hasn't, what you'd like more of." />
        {fieldErrors.activities ? (
          <span className="hint" role="alert">{fieldErrors.activities}</span>
        ) : (
          <span className="hint">At least 5 characters.</span>
        )}
      </div>

      <div className={rowClass("suggestions")}>
        <label htmlFor="fb-sug">Any suggestions to improve?</label>
        <textarea id="fb-sug" name="suggestions" rows={4} maxLength={4000} placeholder="Optional." />
        {fieldErrors.suggestions ? <span className="hint" role="alert">{fieldErrors.suggestions}</span> : null}
      </div>

      {/* honeypot: real users never see or fill this */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

      <Button type="submit" variant="accent" className="cf-submit"
        style={{ marginTop: 4, borderRadius: "var(--r-sm)" }} disabled={submitting}>
        {submitting ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
import type { Metadata } from "next";
import { getOpenPeriod, listClubsWithLeaders } from "@/lib/feedback/data";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackPromise } from "@/components/FeedbackPromise";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Tell the CSE Clubs Council how your club is doing.",
};

// The window can be opened or closed at any moment, so this page must never be
// served from a cache.
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const period = await getOpenPeriod();

  if (!period) {
    return (
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="eyebrow">Feedback</div>
        <h1 style={{ margin: "12px 0 0" }}>Feedback isn&rsquo;t open right now</h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
          We collect feedback every few weeks. Check back soon — it will appear
          here and in the site menu the moment it opens.
        </p>
      </section>
    );
  }

  const clubs = await listClubsWithLeaders();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Feedback</div>
      <h1 style={{ margin: "12px 0 0" }}>Tell us how your club is doing</h1>
      <div className="fb-grid">
        <div className="fb-formcol">
          <FeedbackForm clubs={clubs} />
        </div>
        <FeedbackPromise />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `src/app/globals.css`. **Note the source order:** the promise comes *first* in the DOM-independent grid on mobile via `order`, because it is the reassurance that makes someone willing to type their VTU number.

```css
/* ── Feedback ─────────────────────────────────────────────── */
.fb-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 32px;
  margin-top: 28px;
  align-items: start;
}
.fb-formcol { min-width: 0; }
.fb-promise {
  border-left: 3px solid var(--rust);
  padding: 4px 0 4px 20px;
  position: sticky;
  top: 96px;
}
.fb-promise .body-text { margin-top: 10px; }
.fb-sign {
  margin-top: 18px;
  font-family: var(--font-dm-serif), Georgia, serif;
  font-size: 18px;
}
.fb-sign span {
  display: block;
  font-family: var(--font-ibm-plex-mono), monospace;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  margin-top: 4px;
}
.fb-block {
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  padding: 16px;
  margin: 18px 0;
}
.fb-block legend {
  font-family: var(--font-ibm-plex-mono), monospace;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-2);
  padding: 0 8px;
}
.fb-stars { display: flex; gap: 4px; margin-bottom: 12px; }
.fb-star { cursor: pointer; line-height: 1; }
.fb-star input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.fb-star span[aria-hidden] { font-size: 30px; color: var(--rule); transition: color .12s; }
.fb-star[data-on="true"] span[aria-hidden] { color: var(--rust); }
.fb-star input:focus-visible + span[aria-hidden] { outline: 2px solid var(--ink); outline-offset: 2px; }

@media (max-width: 899px) {
  .fb-grid { grid-template-columns: 1fr; }
  .fb-promise { order: -1; position: static; }
}
```

`.sr-only` is **not** currently defined in `globals.css` (verified 2026-09-04), so add it too:

```css
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 5: Verify both states in a browser**

Run `npm run dev`. With no open period, `/feedback` shows the closed page. Insert a period via the Supabase MCP (`insert into feedback_periods default values;`), reload, and check:
- all 14 clubs in the dropdown;
- picking **Ai Forge Club** reveals both a head and a vice-head block with real names;
- picking **Nature Club** reveals a head block and **no** vice-head block;
- picking **Coding Club** reveals **no** head block (ambiguous, uncurated — expected until Task 12);
- the stars respond to keyboard (arrow keys within the radio group) and show a focus ring;
- at a 375px viewport the promise sits **above** the form.

Submit once and confirm the row lands. **Then delete the test response and the period** — this is the production database.

- [ ] **Step 6: Gate**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/feedback src/components/FeedbackForm.tsx src/components/FeedbackPromise.tsx src/app/globals.css
git commit -m "feat(feedback): public /feedback page"
```

---

### Task 8: Site chrome — nav link + home banner

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/SiteHeader.tsx`
- Create: `src/components/FeedbackBanner.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getOpenPeriod` (Task 5).
- Produces: `SiteHeader` gains a `feedbackOpen?: boolean` prop; `<FeedbackBanner periodId={...} />`.

- [ ] **Step 1: Thread the flag through the root layout**

In `src/app/layout.tsx`, add the import and the lookup, then pass the prop:

```tsx
import { getOpenPeriod } from "@/lib/feedback/data";
```

Inside `RootLayout`, after the `bespokeChrome` line:

```tsx
  // The feedback link appears in the nav only while a window is open. Cached
  // per-request (see getOpenPeriod) and fails closed, so a DB blip costs the
  // link rather than the whole header.
  const feedbackOpen = bespokeChrome ? false : (await getOpenPeriod()) != null;
```

Then: `<SiteHeader initialTheme={theme} feedbackOpen={feedbackOpen} />`.

Skipping the lookup on admin routes matters — the admin area doesn't render `SiteHeader`, so the query would be pure waste on every admin request.

- [ ] **Step 2: Add the conditional link**

In `src/components/SiteHeader.tsx`, change the signature and build the list:

```tsx
export function SiteHeader({
  initialTheme = "day",
  feedbackOpen = false,
}: {
  initialTheme?: "day" | "night";
  feedbackOpen?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = feedbackOpen
    ? [...LINKS, { href: "/feedback", label: "Feedback" } as const]
    : LINKS;
```

Then replace **both** `LINKS.map(...)` calls (the desktop nav and the mobile panel) with `links.map(...)`. There are two; missing the second leaves the link off phones, which is where most students will open it.

- [ ] **Step 3: Write the banner**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Home-page prompt shown while a feedback window is open. Dismissal is stored
 * per-browser and keyed by the PERIOD ID, so dismissing one window's banner
 * does not suppress the next one.
 */
export function FeedbackBanner({ periodId }: { periodId: string }) {
  const [hidden, setHidden] = useState(true);

  // Read on mount, not during render: localStorage is unavailable server-side,
  // and starting hidden avoids a flash of a banner the reader already dismissed.
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(`fb-dismissed:${periodId}`) === "1");
    } catch {
      setHidden(false); // storage blocked — show it
    }
  }, [periodId]);

  if (hidden) return null;

  return (
    <div className="fb-banner">
      <p>
        <strong>Feedback is open.</strong> Tell us how your club and its leads
        are doing — it goes only to the President and Vice President.
      </p>
      <div className="stack">
        <Link href="/feedback" className="btn btn-sm">Give feedback</Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            try { localStorage.setItem(`fb-dismissed:${periodId}`, "1"); } catch {}
            setHidden(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount it on the home page**

In `src/app/page.tsx`, import `getOpenPeriod` and `FeedbackBanner`, resolve the period at the top of the component, and render `{period ? <FeedbackBanner periodId={period.id} /> : null}` as the first child of the page's top-level section — above the fold, since the window is short.

- [ ] **Step 5: Style it**

Append to `src/app/globals.css`:

```css
.fb-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--rule);
  border-left: 3px solid var(--rust);
  border-radius: var(--r-sm);
  padding: 14px 18px;
  margin-bottom: 28px;
}
.fb-banner p { margin: 0; max-width: 60ch; }
```

- [ ] **Step 6: Verify in a browser**

With a period open: the header shows **Feedback** on desktop *and* in the mobile menu, and the home page shows the banner. Dismiss it, reload — still gone. Close the period (`update feedback_periods set closed_at = now()`), reload: link and banner both vanish and `/feedback` shows the closed page. Clean up the test period afterwards.

- [ ] **Step 7: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/app/layout.tsx src/components/SiteHeader.tsx src/components/FeedbackBanner.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat(feedback): nav link + home banner while a window is open"
```

---

### Task 9: The `view:feedback` capability

**Files:**
- Modify: `src/lib/auth/capabilities.ts`
- Modify: `src/lib/auth/capabilities.test.ts`
- Modify: `src/app/admin/(app)/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `Capability` gains `"view:feedback"`; the admin nav gains a conditional Feedback link.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/auth/capabilities.test.ts`:

```ts
describe("view:feedback", () => {
  const id = (role: AdminRole) => ({ role, clubId: null });

  it("is held by president, vice president and tech head", () => {
    expect(canView(id("president"), "view:feedback")).toBe(true);
    expect(canView(id("vice_president"), "view:feedback")).toBe(true);
    expect(canView(id("tech_head"), "view:feedback")).toBe(true);
  });

  // Deliberate exception to the "Faculty / VP / Tech are unrestricted" rule
  // (design D2). If this test fails because someone added the faculty grant
  // "for consistency", the grant is the bug, not the test.
  it("is NOT held by the faculty advisor", () => {
    expect(canView(id("faculty_advisor"), "view:feedback")).toBe(false);
  });

  it("is held by no club-scoped or narrow role", () => {
    for (const role of ["club_head", "vice_head", "events_head", "docs_head",
                        "social_media_head", "gallery_manager"] as const) {
      expect(canView(id(role), "view:feedback")).toBe(false);
    }
  });
});
```

Make sure `AdminRole` and `canView` are in that file's imports.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/auth/capabilities.test.ts`
Expected: FAIL — `"view:feedback"` is not assignable to `Capability`.

- [ ] **Step 3: Add the capability**

In `src/lib/auth/capabilities.ts`, add to the `Capability` union:

```ts
  | "view:feedback" // the student feedback inbox (council-wide)
```

and add this row to `MATRIX`, after `"view:analytics"`:

```ts
  // Owner decision (2026-09-04): the student feedback inbox is President + Vice
  // President + Technical Head — the Tech Head so the surface can be debugged in
  // production without an admin editing their own role.
  //
  // ⚠️ THE FACULTY ADVISOR IS DELIBERATELY ABSENT. This is the ONLY capability
  // they do not hold, and it is a knowing exception to the 2026-09-02 note above
  // that Faculty / VP / Tech are unrestricted. Students are promised the
  // responses stay with the council leadership. Do NOT add faculty_advisor here
  // "for consistency" — a test pins this.
  "view:feedback": {
    president: "all", vice_president: "all", tech_head: "all",
  },
```

Also update the header comment's count: there are now **22** capabilities, not 21.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/auth/capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the nav link**

In `src/app/admin/(app)/layout.tsx`, after the Contact entry:

```tsx
    ...(canView(session, "view:feedback")
      ? [{ href: "/admin/feedback", label: "Feedback" }]
      : []),
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/capabilities.ts src/lib/auth/capabilities.test.ts "src/app/admin/(app)/layout.tsx"
git commit -m "feat(feedback): view:feedback capability (president/VP/tech only)"
```

---

### Task 10: Admin page — the open/close toggle

**Files:**
- Create: `src/app/admin/(app)/feedback/page.tsx`
- Create: `src/app/admin/(app)/feedback/actions.ts`
- Create: `src/lib/admin/feedback.ts`
- Modify: `src/lib/admin/form-state.ts`

**Interfaces:**
- Consumes: `requireViewPage`, `canView` (guards/capabilities); `getOpenPeriod` (Task 5).
- Produces: `listPeriods(): Promise<PeriodRow[]>`, `type PeriodRow`; `openFeedbackAction()`, `closeFeedbackAction()`; `interface FeedbackToggleState`.

- [ ] **Step 1: Add the admin reads**

`src/lib/admin/feedback.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-side reads of the feedback inbox (service role — neither table has an
 *  anon grant). Council-wide: no club scope. */

export interface PeriodRow {
  id: string;
  openedAt: string;
  closedAt: string | null;
  responses: number;
}

/** Every period, newest first, with its response count. */
export async function listPeriods(): Promise<PeriodRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feedback_periods")
    .select("id, opened_at, closed_at, feedback_responses(count)")
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    openedAt: p.opened_at,
    closedAt: p.closed_at,
    responses: p.feedback_responses?.[0]?.count ?? 0,
  }));
}
```

`feedback_responses(count)` is PostgREST's nested aggregate; the generated types
sometimes shape it as an array of `{ count: number }` and sometimes not. If
`npm run typecheck` objects, do **not** cast it away — replace the nested select
with a second `select("period_id")` query over `feedback_responses` and count in
JS. The row count here is small (one row per period).

- [ ] **Step 2: Add the action state type**

Append to `src/lib/admin/form-state.ts`:

```ts
export interface FeedbackToggleState {
  error?: string;
}
```

- [ ] **Step 3: Write the actions**

`src/app/admin/(app)/feedback/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canView } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Open / close the feedback window BY HAND (design D4 — there is no cron and no
 * auto-close). `canView` is the right check here, not `canManage`: the grant is
 * council-wide "all" for the three roles that hold it and club scope is
 * meaningless for a single global window.
 */

async function requireFeedbackAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canView(session, "view:feedback")) redirect("/admin");
  return session;
}

export async function openFeedbackAction(): Promise<void> {
  const session = await requireFeedbackAdmin();
  const admin = createAdminClient();

  // The partial unique index makes a second open row impossible, so a double
  // submit fails here rather than silently creating two windows.
  const { data, error } = await admin
    .from("feedback_periods")
    .insert({ opened_by: session.id })
    .select("id")
    .single();

  if (!error && data) {
    await writeAudit({
      actorId: session.id,
      action: "open",
      entity: "feedback_period",
      entityId: data.id,
    });
  } else if (error) {
    console.error("feedback open failed", error.message);
  }

  revalidatePath("/", "layout"); // the nav link + home banner appear site-wide
  redirect("/admin/feedback");
}

export async function closeFeedbackAction(): Promise<void> {
  const session = await requireFeedbackAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("feedback_periods")
    .update({ closed_at: new Date().toISOString(), closed_by: session.id })
    .is("closed_at", null)
    .select("id")
    .maybeSingle();

  if (!error && data) {
    await writeAudit({
      actorId: session.id,
      action: "close",
      entity: "feedback_period",
      entityId: data.id,
    });
  } else if (error) {
    console.error("feedback close failed", error.message);
  }

  revalidatePath("/", "layout");
  redirect("/admin/feedback");
}
```

- [ ] **Step 4: Write the page**

`src/app/admin/(app)/feedback/page.tsx`:

```tsx
import { requireViewPage } from "@/lib/auth/guards";
import { listPeriods } from "@/lib/admin/feedback";
import { istNumericDate } from "@/lib/datetime";
import { openFeedbackAction, closeFeedbackAction } from "./actions";

export default async function AdminFeedbackPage() {
  await requireViewPage("view:feedback");
  const periods = await listPeriods();
  const open = periods.find((p) => p.closedAt == null) ?? null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Students</div>
          <h1 style={{ margin: "6px 0 0" }}>Feedback</h1>
        </div>
        <form action={open ? closeFeedbackAction : openFeedbackAction}>
          <button type="submit" className={open ? "btn btn-ghost" : "btn"}>
            {open ? "Close feedback" : "Open feedback"}
          </button>
        </form>
      </div>

      <p className="label" style={{ marginTop: 10, color: "var(--ink-2)" }}>
        {open
          ? `Open since ${istNumericDate(open.openedAt)} · ${open.responses} responses`
          : "Closed. Students see a “check back soon” page and the site menu hides the link."}
      </p>

      {periods.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>
          Feedback has never been opened.
        </div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr><th>Period</th><th>Responses</th><th>Status</th></tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>
                    {istNumericDate(p.openedAt)} –{" "}
                    {p.closedAt ? istNumericDate(p.closedAt) : "present"}
                  </td>
                  <td>{p.responses}</td>
                  <td>
                    <span className="label" style={{ color: p.closedAt ? "var(--ink-3)" : "var(--rust)" }}>
                      {p.closedAt ? "Closed" : "● Open"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Periods are labelled **by date range only** — no "Round N" anywhere (design D5).

- [ ] **Step 5: Verify in a browser**

Sign in as an admin holding the capability. `/admin/feedback` shows "Open feedback"; press it and confirm the row appears, the button flips to "Close feedback", and the public header gains the link. Press Close and confirm both reverse. Then sign in as a `club_head` and confirm `/admin/feedback` redirects to `/admin` and the nav shows no Feedback link.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add "src/app/admin/(app)/feedback" src/lib/admin/feedback.ts src/lib/admin/form-state.ts
git commit -m "feat(feedback): admin open/close toggle"
```

---

### Task 11: Admin — per-club summary, response list and detail

**Files:**
- Modify: `src/lib/admin/feedback.ts`
- Modify: `src/app/admin/(app)/feedback/page.tsx`
- Create: `src/app/admin/(app)/feedback/[periodId]/page.tsx`
- Create: `src/app/admin/(app)/feedback/[periodId]/[clubId]/page.tsx`

**Interfaces:**
- Consumes: `summariseByClub`, `duplicateVtus` (Task 4); `listPeriods` (Task 10).
- Produces: `listResponses(periodId): Promise<FeedbackResponseRow[]>`, `type FeedbackResponseRow`, `clubNames(): Promise<Map<string, string>>`.

- [ ] **Step 1: Add the reads**

Append to `src/lib/admin/feedback.ts`:

```ts
export interface FeedbackResponseRow {
  id: string;
  clubId: string;
  vtu: string;
  studentName: string;
  headName: string | null;
  headRating: number | null;
  headComment: string | null;
  viceName: string | null;
  viceRating: number | null;
  viceComment: string | null;
  clubRating: number;
  activities: string;
  suggestions: string | null;
  createdAt: string;
}

/** Every response in one period, newest first. */
export async function listResponses(periodId: string): Promise<FeedbackResponseRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feedback_responses")
    .select(
      "id, club_id, vtu, student_name, head_name, head_rating, head_comment," +
        " vice_name, vice_rating, vice_comment, club_rating," +
        " activities_feedback, suggestions, created_at",
    )
    .eq("period_id", periodId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    clubId: r.club_id,
    vtu: r.vtu,
    studentName: r.student_name,
    headName: r.head_name,
    headRating: r.head_rating,
    headComment: r.head_comment,
    viceName: r.vice_name,
    viceRating: r.vice_rating,
    viceComment: r.vice_comment,
    clubRating: r.club_rating,
    activities: r.activities_feedback,
    suggestions: r.suggestions,
    createdAt: r.created_at,
  }));
}

/** club id → name, for labelling summaries. */
export async function clubNames(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("clubs").select("id, name");
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}
```

- [ ] **Step 2: Link each period row to its detail page**

In `src/app/admin/(app)/feedback/page.tsx`, wrap the period cell in a link:

```tsx
<td>
  <Link href={`/admin/feedback/${p.id}`}>
    {istNumericDate(p.openedAt)} – {p.closedAt ? istNumericDate(p.closedAt) : "present"}
  </Link>
</td>
```

Add `import Link from "next/link";` at the top.

- [ ] **Step 3: Write the period page (per-club summary)**

`src/app/admin/(app)/feedback/[periodId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { listPeriods, listResponses, clubNames } from "@/lib/admin/feedback";
import { summariseByClub } from "@/lib/feedback/summary";
import { istNumericDate } from "@/lib/datetime";

const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(1));

export default async function FeedbackPeriodPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  await requireViewPage("view:feedback");
  const { periodId } = await params;

  const [periods, responses, names] = await Promise.all([
    listPeriods(),
    listResponses(periodId),
    clubNames(),
  ]);
  const period = periods.find((p) => p.id === periodId);
  if (!period) notFound();

  const summary = summariseByClub(
    responses.map((r) => ({
      clubId: r.clubId,
      vtu: r.vtu,
      clubRating: r.clubRating,
      headRating: r.headRating,
      viceRating: r.viceRating,
    })),
  ).sort((a, b) => b.responses - a.responses);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            <Link href="/admin/feedback">Feedback</Link>
          </div>
          <h1 style={{ margin: "6px 0 0" }}>
            {istNumericDate(period.openedAt)} –{" "}
            {period.closedAt ? istNumericDate(period.closedAt) : "present"}
          </h1>
        </div>
        <a className="btn btn-ghost btn-sm" href={`/api/admin/feedback/export?period=${period.id}`}>
          Export CSV
        </a>
      </div>

      <p className="label" style={{ marginTop: 10, color: "var(--ink-2)" }}>
        {responses.length} responses · averages are advisory, not evidence —
        there is no submission limit.
      </p>

      {summary.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No responses yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Club</th><th>Responses</th><th>Club</th><th>Head</th><th>Vice</th><th>Read</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.clubId}>
                  <td style={{ fontWeight: 600 }}>{names.get(s.clubId) ?? "—"}</td>
                  <td>{s.responses}</td>
                  <td>{fmt(s.clubAvg)}</td>
                  <td>{fmt(s.headAvg)}</td>
                  <td>{fmt(s.viceAvg)}</td>
                  <td>
                    <Link href={`/admin/feedback/${period.id}/${s.clubId}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the per-club response list**

`src/app/admin/(app)/feedback/[periodId]/[clubId]/page.tsx`:

```tsx
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { Panel } from "@/components/ui/Surface";
import { listResponses, clubNames } from "@/lib/admin/feedback";
import { duplicateVtus } from "@/lib/feedback/summary";
import { istNumericDate } from "@/lib/datetime";

const stars = (n: number | null) => (n == null ? "—" : "★".repeat(n) + "☆".repeat(5 - n));

export default async function FeedbackClubPage({
  params,
}: {
  params: Promise<{ periodId: string; clubId: string }>;
}) {
  await requireViewPage("view:feedback");
  const { periodId, clubId } = await params;

  const [all, names] = await Promise.all([listResponses(periodId), clubNames()]);
  const rows = all.filter((r) => r.clubId === clubId);
  // Duplicates are computed across the WHOLE period, not just this club: the
  // same student giving feedback on three clubs is normal; the same VTU twice
  // is what deserves a second look.
  const dupes = duplicateVtus(all);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/admin/feedback/${periodId}`}>← All clubs</Link>
          </div>
          <h1 style={{ margin: "6px 0 0" }}>{names.get(clubId) ?? "Club"}</h1>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No responses for this club.</div>
      ) : (
        <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
          {rows.map((r) => (
            <Panel key={r.id} style={{ padding: 18 }}>
              <div className="label" style={{ color: "var(--ink-3)" }}>
                {r.studentName} · {r.vtu}
                {dupes.has(r.vtu.trim().toLowerCase()) ? (
                  <span style={{ color: "var(--rust)" }}> · repeat VTU this period</span>
                ) : null}
                {" · "}
                {istNumericDate(r.createdAt)}
              </div>

              {r.headName ? (
                <p className="body-text" style={{ marginTop: 10 }}>
                  <strong>Head — {r.headName}</strong> {stars(r.headRating)}
                  {r.headComment ? <><br />{r.headComment}</> : null}
                </p>
              ) : null}

              {r.viceName ? (
                <p className="body-text" style={{ marginTop: 10 }}>
                  <strong>Vice Head — {r.viceName}</strong> {stars(r.viceRating)}
                  {r.viceComment ? <><br />{r.viceComment}</> : null}
                </p>
              ) : null}

              <p className="body-text" style={{ marginTop: 10 }}>
                <strong>The club</strong> {stars(r.clubRating)}
              </p>
              <p className="body-text" style={{ marginTop: 10 }}>
                <strong>Activities</strong><br />{r.activities}
              </p>
              {r.suggestions ? (
                <p className="body-text" style={{ marginTop: 10 }}>
                  <strong>Suggestions</strong><br />{r.suggestions}
                </p>
              ) : null}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
```

`Panel` renders the design system's `.panel`; there is no `.surface` class despite the filename.

- [ ] **Step 5: Verify in a browser**

Open a period, submit 3 responses from `/feedback` for two different clubs, reusing one VTU twice. Confirm: the summary averages match a hand calculation, the club page lists all responses with full free text, and the repeated VTU carries the "repeat VTU this period" marker. Delete the test rows afterwards.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add "src/app/admin/(app)/feedback" src/lib/admin/feedback.ts
git commit -m "feat(feedback): per-club summary + response detail"
```

---

### Task 12: Admin — the leader picker

**Files:**
- Modify: `src/lib/admin/feedback.ts`
- Modify: `src/app/admin/(app)/feedback/actions.ts`
- Create: `src/components/admin/FeedbackLeaderPicker.tsx`
- Modify: `src/app/admin/(app)/feedback/page.tsx`

**Interfaces:**
- Consumes: `listClubsWithLeaders` (Task 5); `requireFeedbackAdmin` pattern (Task 10).
- Produces: `listLeaderChoices(): Promise<ClubLeaderChoice[]>`, `type ClubLeaderChoice`; `setClubLeadersAction(formData)`.

- [ ] **Step 1: Add the read**

Append to `src/lib/admin/feedback.ts`:

```ts
export interface ClubLeaderChoice {
  clubId: string;
  clubName: string;
  curatedHeadId: string | null;
  curatedViceHeadId: string | null;
  heads: { id: string; name: string }[];
  viceHeads: { id: string; name: string }[];
}

/**
 * Every active club with its curated pick and the candidate accounts. Used by
 * the picker — clubs with 0 or 1 candidate for a role need no decision, but
 * they're listed anyway so the President can see who the form is naming.
 */
export async function listLeaderChoices(): Promise<ClubLeaderChoice[]> {
  const admin = createAdminClient();
  const [{ data: clubs, error: cErr }, { data: admins, error: aErr }] = await Promise.all([
    admin
      .from("clubs")
      .select("id, name, feedback_head_id, feedback_vice_head_id")
      .eq("is_active", true)
      .order("name"),
    admin
      .from("admin_users")
      .select("id, full_name, role, club_id, is_active")
      .in("role", ["club_head", "vice_head"])
      .eq("is_active", true),
  ]);
  if (cErr) throw cErr;
  if (aErr) throw aErr;

  return (clubs ?? []).map((c) => {
    const mine = (admins ?? []).filter((a) => a.club_id === c.id);
    return {
      clubId: c.id,
      clubName: c.name,
      curatedHeadId: c.feedback_head_id,
      curatedViceHeadId: c.feedback_vice_head_id,
      heads: mine.filter((a) => a.role === "club_head").map((a) => ({ id: a.id, name: a.full_name })),
      viceHeads: mine.filter((a) => a.role === "vice_head").map((a) => ({ id: a.id, name: a.full_name })),
    };
  });
}
```

- [ ] **Step 2: Add the action**

Append to `src/app/admin/(app)/feedback/actions.ts`:

```ts
/**
 * Set which head / vice head the public form names for a club.
 *
 * Lives HERE and not on the club editor on purpose: club heads hold
 * manage:clubs with grant "own", so a picker on /admin/clubs/[id]/edit would
 * let a head point the form away from their own vice head, or at nobody.
 */
export async function setClubLeadersAction(formData: FormData): Promise<void> {
  const session = await requireFeedbackAdmin();

  const clubId = String(formData.get("clubId") ?? "");
  if (!z.string().uuid().safeParse(clubId).success) redirect("/admin/feedback");

  const asId = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "");
    return z.string().uuid().safeParse(s).success ? s : null;
  };
  const headId = asId(formData.get("headId"));
  const viceHeadId = asId(formData.get("viceHeadId"));

  const admin = createAdminClient();
  const { error } = await admin
    .from("clubs")
    .update({ feedback_head_id: headId, feedback_vice_head_id: viceHeadId })
    .eq("id", clubId);

  if (!error) {
    await writeAudit({
      actorId: session.id,
      action: "set_feedback_leaders",
      entity: "club",
      entityId: clubId,
      after: { headId, viceHeadId },
    });
  } else {
    console.error("feedback leader pick failed", error.message);
  }

  redirect("/admin/feedback");
}
```

Add `import { z } from "zod";` to that file's imports.

- [ ] **Step 3: Write the picker**

`src/components/admin/FeedbackLeaderPicker.tsx` — a plain form per club, no client state:

```tsx
import type { ClubLeaderChoice } from "@/lib/admin/feedback";
import { setClubLeadersAction } from "@/app/admin/(app)/feedback/actions";

/** Which head / vice head the public form names, per club. Only clubs where the
 *  choice is ambiguous (more than one candidate) actually need an answer; the
 *  rest are shown read-only so it's clear who is being named. */
export function FeedbackLeaderPicker({ clubs }: { clubs: ClubLeaderChoice[] }) {
  return (
    <div className="tablewrap" style={{ marginTop: 18 }}>
      <table className="admin">
        <thead>
          <tr><th>Club</th><th>Club head</th><th>Vice head</th><th /></tr>
        </thead>
        <tbody>
          {clubs.map((c) => {
            const needsChoice = c.heads.length > 1 || c.viceHeads.length > 1;
            return (
              <tr key={c.clubId}>
                <td style={{ fontWeight: needsChoice ? 600 : 400 }}>{c.clubName}</td>
                <td colSpan={3}>
                  <form action={setClubLeadersAction} className="stack" style={{ gap: 8 }}>
                    <input type="hidden" name="clubId" value={c.clubId} />
                    <select name="headId" defaultValue={c.curatedHeadId ?? ""}>
                      <option value="">
                        {c.heads.length === 1 ? `${c.heads[0].name} (only candidate)` : "Not shown"}
                      </option>
                      {c.heads.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <select name="viceHeadId" defaultValue={c.curatedViceHeadId ?? ""}>
                      <option value="">
                        {c.viceHeads.length === 1
                          ? `${c.viceHeads[0].name} (only candidate)`
                          : "Not shown"}
                      </option>
                      {c.viceHeads.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn btn-ghost btn-sm">Save</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

The empty option reads "(only candidate)" where the fallback in `resolveLeaders` will pick that person anyway, so the blank default isn't mistaken for "nobody".

- [ ] **Step 4: Mount it on the admin page**

In `src/app/admin/(app)/feedback/page.tsx`, fetch `listLeaderChoices()` alongside `listPeriods()` and render below the period table:

```tsx
      <h2 style={{ marginTop: 36 }}>Who the form names</h2>
      <p className="label" style={{ marginTop: 6, color: "var(--ink-2)" }}>
        A club with more than one head account on file names nobody until you
        choose here.
      </p>
      <FeedbackLeaderPicker clubs={choices} />
```

- [ ] **Step 5: Verify in a browser**

Open `/admin/feedback`. Coding Club, AppNova and AspireX show multiple candidates. Pick a head for Coding Club, save, then load `/feedback` with a period open and confirm Coding Club now shows that head's block. Confirm a `club_head` login still cannot reach the page.

- [ ] **Step 6: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/lib/admin/feedback.ts "src/app/admin/(app)/feedback" src/components/admin/FeedbackLeaderPicker.tsx
git commit -m "feat(feedback): per-club leader picker"
```

---

### Task 13: CSV export

**Files:**
- Create: `src/app/api/admin/feedback/export/route.ts`

**Interfaces:**
- Consumes: `requireSession`, `canView`; `listResponses`, `clubNames` (Task 11); `toCsv`, `istNumericDate`, `writeAudit`.
- Produces: `GET /api/admin/feedback/export?period=<uuid>`.

- [ ] **Step 1: Write the route**

```ts
import { requireSession } from "@/lib/auth/guards";
import { canView } from "@/lib/auth/capabilities";
import { listResponses, clubNames } from "@/lib/admin/feedback";
import { toCsv } from "@/lib/csv";
import { istNumericDate } from "@/lib/datetime";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Feedback CSV export for one period — view:feedback only, audited.
 *
 * ⚠️ This file is the RAW record: VTU, name and every free-text answer about
 * named people. It is exactly as sensitive as the table, which is why it sits
 * behind the same capability and is never linked from a public page.
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  if (!canView(guard.session, "view:feedback")) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const periodId = new URL(request.url).searchParams.get("period") ?? "";
  if (!periodId) {
    return Response.json({ error: "Missing period." }, { status: 400 });
  }

  const [rows, names] = await Promise.all([listResponses(periodId), clubNames()]);

  const headers = [
    "Submitted", "VTU", "Name", "Club",
    "Head", "Head rating", "Head feedback",
    "Vice head", "Vice rating", "Vice feedback",
    "Club rating", "Activities", "Suggestions",
  ];
  const body = rows.map((r) => [
    istNumericDate(r.createdAt),
    r.vtu,
    r.studentName,
    names.get(r.clubId) ?? "",
    r.headName ?? "",
    r.headRating ?? "",
    r.headComment ?? "",
    r.viceName ?? "",
    r.viceRating ?? "",
    r.viceComment ?? "",
    r.clubRating,
    r.activities,
    r.suggestions ?? "",
  ]);

  await writeAudit({
    actorId: guard.session.id,
    action: "csv_export",
    entity: "feedback_period",
    entityId: periodId,
    after: { responses: rows.length },
  });

  return new Response(toCsv(headers, body), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="feedback-${periodId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Verify the authz**

This is a GET, so curl works. With no session:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/admin/feedback/export?period=<uuid>"
```

Expected: `401` or a redirect from `requireSession` — **not** `200`. Then download it from the period page while signed in as the President and open it in a spreadsheet: non-ASCII names must render correctly (the BOM in `toCsv` handles this) and no cell may begin with `=`, `+`, `-` or `@` unquoted.

- [ ] **Step 3: Gate and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/app/api/admin/feedback/export/route.ts
git commit -m "feat(feedback): period CSV export"
```

---

### Task 14: Full gate, docs, and the owed cleanup

**Files:**
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a deployable branch.

- [ ] **Step 1: Run the whole gate**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all four pass. The test count should be roughly 432 + 29 new (11 schema + 9 leaders + 9 summary) + 1 rate-limit + 3 capability.

- [ ] **Step 2: Confirm no test rows survive**

```sql
select (select count(*) from feedback_responses) as responses,
       (select count(*) from feedback_periods) as periods;
```

Both must be `0` before the first real window. Delete anything left from the browser checks — this is the production database.

- [ ] **Step 3: Do the two owed data chores**

Both are recorded in the spec's Rollout section and are the owner's call to make, not the implementer's — surface them, don't silently execute:

1. **Deactivate the generic `Tech Head` seed account** (role `tech_head`, no club). It inherits `view:feedback` through the role grant, and it is a shared dev login.
2. **Curate Coding Club, AppNova and AspireX** in the new picker, so their heads are named on the form.

- [ ] **Step 4: Update `docs/STATUS.md`**

Add a block under "START HERE" in the same style as the existing entries, recording: the migration name and that it was applied before deploy; the five owner decisions D1–D5 with their accepted consequences; that the Faculty Advisor exclusion is deliberate and test-pinned; that averages are advisory because there is no submission cap; and the browser walkthrough status. Move "feedback + ratings" out of the TODO §6 Phase-3 list.

- [ ] **Step 5: Commit and push**

```bash
git add docs/STATUS.md
git commit -m "docs(status): club feedback portal shipped"
git push origin main   # auto-deploys to production
```

- [ ] **Step 6: Production smoke test**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cse-ccc.vercel.app/feedback
curl -s -o /dev/null -w '%{http_code}\n' https://cse-ccc.vercel.app/admin/feedback
```

Expected: `200` for `/feedback` (the closed page), `307` to the login for the admin route. Then open a real window from the admin panel and submit one genuine response end-to-end before telling students about it.
