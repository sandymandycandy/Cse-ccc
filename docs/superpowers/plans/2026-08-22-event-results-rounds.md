# Event Results & Rounds (§13.9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an event ordered rounds with per-student draft→publish standings that render publicly and seed the next round.

**Architecture:** New capability `manage:results` gates admin writes (service-role client + audit, same pattern as attendance/registrations). Pure ranking logic is unit-tested; admin actions wrap read/seed helpers; public reads go through the anon client where existing RLS already hides unpublished rows. One additive migration (`results.display_name`) lets public standings show names without exposing the RLS-private `registrations` table.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript strict, Supabase (Postgres + RLS), Zod, vitest (introduced here).

**Spec:** `docs/superpowers/specs/2026-08-22-event-results-rounds-design.md`

## Global Constraints

- Next **16.3.1** App Router; server components/actions by default. Never add `runtime = "edge"`.
- All admin mutations: `getAdminSession()` → resolve event `clubId` via `getEventForAttendance` → `canManage(session, "manage:results", clubId)` → `createAdminClient()` → mutate → `writeAudit()` → `revalidatePath()`. Club id is read from the DB, never from the request body.
- Service-role client (`createAdminClient`) is `server-only`; never import it into client components.
- Public reads use `createPublicClient()` (anon) so RLS applies. Do **not** add app-side publish checks — RLS (`results_public_read: published_at IS NOT NULL`) is the gate.
- Pure logic files (`src/lib/results.ts`) must NOT import `server-only` (they run under vitest/node).
- TypeScript strict; `npm run typecheck`, `npm run lint`, `npm run build` must stay green.
- Commit messages end with the repo's trailers:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UHpJaBApWWs8775CDkYZZ7
  ```

---

### Task 1: Pure ranking logic + vitest bootstrap

**Files:**
- Create: `src/lib/results.ts`
- Create: `src/lib/results.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` devDep + `test` scripts)

**Interfaces:**
- Produces:
  - `interface Standing { roll_no: string; display_name: string | null; score: number | null; rank: number | null; advanced: boolean; remarks: string | null }`
  - `function rankByScore<T extends { score: number | null; rank: number | null }>(rows: T[]): T[]` — returns a new array sorted by `score` desc; assigns **standard competition ranking** (equal scores share a rank; the next rank skips by the count of tied rows). Rows with `score === null` sort last and get `rank = null`.
  - `function orderStandings<T extends { rank: number | null; score: number | null; roll_no: string }>(rows: T[]): T[]` — new array ordered by `rank` asc (nulls last), then `score` desc (nulls last), then `roll_no` asc.

- [ ] **Step 1: Install vitest**

Run: `npm i -D vitest`
Expected: `vitest` appears in `package.json` devDependencies; lockfile updates.

- [ ] **Step 2: Add vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/results.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rankByScore, orderStandings } from "./results";

const row = (roll_no: string, score: number | null) => ({
  roll_no,
  display_name: roll_no,
  score,
  rank: null as number | null,
  advanced: false,
  remarks: null as string | null,
});

describe("rankByScore", () => {
  it("ranks by score descending, 1-based", () => {
    const out = rankByScore([row("a", 10), row("b", 30), row("c", 20)]);
    expect(out.map((r) => [r.roll_no, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("gives tied scores the same rank and skips the next (standard competition ranking)", () => {
    const out = rankByScore([row("a", 50), row("b", 50), row("c", 40)]);
    expect(out.map((r) => [r.roll_no, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("sorts null scores last with rank null", () => {
    const out = rankByScore([row("a", null), row("b", 10)]);
    expect(out.map((r) => [r.roll_no, r.rank])).toEqual([
      ["b", 1],
      ["a", null],
    ]);
  });
});

describe("orderStandings", () => {
  it("orders by rank asc, nulls last", () => {
    const out = orderStandings([
      { roll_no: "a", rank: null, score: null },
      { roll_no: "b", rank: 2, score: 5 },
      { roll_no: "c", rank: 1, score: 9 },
    ]);
    expect(out.map((r) => r.roll_no)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `results.ts` does not export `rankByScore` / `orderStandings`.

- [ ] **Step 6: Implement `src/lib/results.ts`**

```ts
// Pure standings logic (§13.9). No I/O, no `server-only` — runs under vitest.

export interface Standing {
  roll_no: string;
  display_name: string | null;
  score: number | null;
  rank: number | null;
  advanced: boolean;
  remarks: string | null;
}

/**
 * Assign standard competition ranking by score (desc). Equal scores share a
 * rank; the next rank skips by the number of tied rows. Rows with a null score
 * sort last and receive rank null. Returns a new array (input not mutated).
 */
export function rankByScore<T extends { score: number | null; rank: number | null }>(
  rows: T[],
): T[] {
  const scored = rows.filter((r) => r.score !== null);
  const unscored = rows.filter((r) => r.score === null);
  scored.sort((a, b) => (b.score as number) - (a.score as number));

  const ranked = scored.map((r, i, arr) => {
    // standard competition ranking: index of first row with this score, +1
    const first = arr.findIndex((x) => x.score === r.score);
    return { ...r, rank: first + 1 };
  });

  return [...ranked, ...unscored.map((r) => ({ ...r, rank: null }))];
}

/** Display order: rank asc (nulls last), then score desc (nulls last), then roll. */
export function orderStandings<
  T extends { rank: number | null; score: number | null; roll_no: string },
>(rows: T[]): T[] {
  const byNullable = (a: number | null, b: number | null, dir: 1 | -1) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1; // nulls last
    if (b === null) return -1;
    return (a - b) * dir;
  };
  return [...rows].sort(
    (a, b) =>
      byNullable(a.rank, b.rank, 1) ||
      byNullable(a.score, b.score, -1) ||
      a.roll_no.localeCompare(b.roll_no),
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all cases green).

- [ ] **Step 8: Commit**

```bash
git add src/lib/results.ts src/lib/results.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(results): pure ranking logic + vitest setup (§13.9)"
```

---

### Task 2: `manage:results` capability

**Files:**
- Modify: `src/lib/auth/capabilities.ts` (union + MATRIX row)
- Create: `src/lib/auth/capabilities.test.ts`

**Interfaces:**
- Consumes: existing `Capability`, `grantFor`, `canManage` from `src/lib/auth/capabilities.ts`.
- Produces: `"manage:results"` as a valid `Capability`, granted `all` to president/vice_president/tech_head/events_head, `own` to club_head/vice_head, `read` to faculty_advisor.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/capabilities.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { grantFor, canManage } from "./capabilities";

describe("manage:results grants", () => {
  it("grants all to org-wide organiser roles", () => {
    for (const role of ["president", "vice_president", "tech_head", "events_head"] as const) {
      expect(grantFor(role, "manage:results")).toBe("all");
    }
  });

  it("grants own to club heads and vice heads", () => {
    expect(grantFor("club_head", "manage:results")).toBe("own");
    expect(grantFor("vice_head", "manage:results")).toBe("own");
  });

  it("faculty is read-only; unlisted roles are none", () => {
    expect(grantFor("faculty_advisor", "manage:results")).toBe("read");
    expect(grantFor("docs_head", "manage:results")).toBe("none");
  });

  it("own grant is club-scoped", () => {
    const head = { role: "club_head", clubId: "c1" } as const;
    expect(canManage(head, "manage:results", "c1")).toBe(true);
    expect(canManage(head, "manage:results", "c2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/lib/auth/capabilities.test.ts`
Expected: FAIL — `"manage:results"` is not assignable to `Capability` (type error) / grant is `none`.

- [ ] **Step 3: Add the capability**

In `src/lib/auth/capabilities.ts`, add to the `Capability` union (next to `manage:registrations`):

```ts
  | "manage:results"
```

And add this row to `MATRIX` (place it after `manage:registrations`):

```ts
  "manage:results": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", events_head: "all", club_head: "own", vice_head: "own",
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/lib/auth/capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/capabilities.ts src/lib/auth/capabilities.test.ts
git commit -m "feat(auth): add manage:results capability (§13.9)"
```

---

### Task 3: Migration — `results.display_name`

**Files:**
- Create: `supabase/migrations/20260822120000_results_display_name.sql`
- Modify: `src/lib/database.types.ts` (regenerated)

**Interfaces:**
- Produces: `results.display_name` (nullable `text`) present in `Database["public"]["Tables"]["results"]["Row" | "Insert" | "Update"]`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260822120000_results_display_name.sql`:

```sql
-- §13.9: denormalized student name for public standings. Populated from the
-- student's registration at seed/save time; only ever public once the round is
-- published (existing results_public_read RLS gates on published_at). Additive
-- and nullable — safe on the live DB, no RLS change needed.
alter table public.results add column display_name text;
```

- [ ] **Step 2: Apply to the database**

Apply via the Supabase MCP `apply_migration` (name `results_display_name`, the SQL above) OR `supabase db push`. This targets the live project `svkbleeibbrjryeovvjw` (dev + prod share it); the column is additive so it does not break existing reads/writes.

- [ ] **Step 3: Regenerate types**

Run: `npm run types:gen`
Expected: `src/lib/database.types.ts` now lists `display_name: string | null` in the `results` Row/Insert/Update.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260822120000_results_display_name.sql src/lib/database.types.ts
git commit -m "feat(db): results.display_name for public standings (§13.9)"
```

---

### Task 4: Admin read/seed helpers — rounds + roster

**Files:**
- Create: `src/lib/admin/results.ts`

**Interfaces:**
- Consumes: `createAdminClient` (`@/lib/supabase/admin`), `getEventForAttendance` (`@/lib/admin/attendance`) for `clubId`, `Database` types.
- Produces:
  - `interface RoundRow { id: string; event_id: string; name: string; sort: number; status: "pending" | "active" | "completed"; starts_at: string | null }`
  - `interface RosterEntry { roll_no: string; display_name: string | null; registration_id: string | null; score: number | null; rank: number | null; advanced: boolean; remarks: string | null }`
  - `async function listRounds(eventId: string): Promise<RoundRow[]>` — ordered by `sort`.
  - `async function getRound(roundId: string): Promise<RoundRow | null>`
  - `async function getRoundRoster(roundId: string): Promise<{ rows: RosterEntry[]; seededFrom: string }>` — existing `results` rows for the round if any (`seededFrom: "saved"`); else round-1 seed from `registrations` where `attended = true` (`seededFrom: "attended (N)"`); else prior round's `advanced = true` rows (`seededFrom: "advancing in <prev name> (N)"`).
  - `async function roundIsPublished(roundId: string): Promise<boolean>` — true if any of the round's `results` has `published_at` set.

- [ ] **Step 1: Implement the helpers**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RoundRow {
  id: string;
  event_id: string;
  name: string;
  sort: number;
  status: "pending" | "active" | "completed";
  starts_at: string | null;
}

export interface RosterEntry {
  roll_no: string;
  display_name: string | null;
  registration_id: string | null;
  score: number | null;
  rank: number | null;
  advanced: boolean;
  remarks: string | null;
}

export async function listRounds(eventId: string): Promise<RoundRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_rounds")
    .select("id, event_id, name, sort, status, starts_at")
    .eq("event_id", eventId)
    .order("sort", { ascending: true });
  return (data ?? []) as RoundRow[];
}

export async function getRound(roundId: string): Promise<RoundRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_rounds")
    .select("id, event_id, name, sort, status, starts_at")
    .eq("id", roundId)
    .maybeSingle();
  return (data as RoundRow | null) ?? null;
}

export async function roundIsPublished(roundId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .not("published_at", "is", null);
  return (count ?? 0) > 0;
}

export async function getRoundRoster(
  roundId: string,
): Promise<{ rows: RosterEntry[]; seededFrom: string }> {
  const admin = createAdminClient();
  const round = await getRound(roundId);
  if (!round) return { rows: [], seededFrom: "unknown" };

  // 1) Already-saved rows win.
  const { data: saved } = await admin
    .from("results")
    .select("roll_no, display_name, registration_id, score, rank, advanced, remarks")
    .eq("round_id", roundId);
  if (saved && saved.length > 0) {
    return { rows: saved as RosterEntry[], seededFrom: "saved" };
  }

  // 2) Is this the first round of the event?
  const rounds = await listRounds(round.event_id);
  const idx = rounds.findIndex((r) => r.id === roundId);
  const emptyEntry = (roll_no: string, display_name: string | null, registration_id: string | null): RosterEntry => ({
    roll_no, display_name, registration_id, score: null, rank: null, advanced: false, remarks: null,
  });

  if (idx <= 0) {
    const { data: regs } = await admin
      .from("registrations")
      .select("id, roll_no, student_name")
      .eq("event_id", round.event_id)
      .eq("attended", true)
      .order("roll_no", { ascending: true });
    const rows = (regs ?? []).map((r) =>
      emptyEntry(r.roll_no, r.student_name, r.id),
    );
    return { rows, seededFrom: `attended (${rows.length})` };
  }

  // 3) Later round: prior round's advanced rows.
  const prev = rounds[idx - 1];
  const { data: adv } = await admin
    .from("results")
    .select("roll_no, display_name, registration_id")
    .eq("round_id", prev.id)
    .eq("advanced", true)
    .order("roll_no", { ascending: true });
  const rows = (adv ?? []).map((r) =>
    emptyEntry(r.roll_no, r.display_name, r.registration_id),
  );
  return { rows, seededFrom: `advancing in ${prev.name} (${rows.length})` };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (No unit test — this is DB I/O; it is exercised end-to-end in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/results.ts
git commit -m "feat(results): admin read/seed helpers for rounds + roster (§13.9)"
```

---

### Task 5: Admin write primitives — save + publish

**Files:**
- Modify: `src/lib/admin/results.ts` (append write primitives)

**Interfaces:**
- Consumes: `RosterEntry`, `getRound` (Task 4).
- Produces:
  - `async function createRoundRow(eventId: string, name: string, startsAt: string | null): Promise<string>` — inserts a round with `sort = max(sort)+1`, `status = 'pending'`; returns new round id.
  - `async function updateRoundRow(roundId: string, patch: { name?: string; status?: RoundRow["status"]; sort?: number; starts_at?: string | null }): Promise<void>`
  - `async function deleteRoundRow(roundId: string): Promise<void>` — deletes the round (its results cascade or are deleted first).
  - `async function replaceRoundResults(eventId: string, roundId: string, rows: RosterEntry[]): Promise<void>` — delete the round's rows, insert `rows` as draft (`published_at = null`).
  - `async function setRoundPublished(roundId: string, publish: boolean): Promise<void>` — set/clear `published_at` on all the round's rows.

- [ ] **Step 1: Implement the write primitives (append to `src/lib/admin/results.ts`)**

```ts
export async function createRoundRow(
  eventId: string,
  name: string,
  startsAt: string | null,
): Promise<string> {
  const admin = createAdminClient();
  const existing = await listRounds(eventId);
  const nextSort = existing.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
  const { data, error } = await admin
    .from("event_rounds")
    .insert({ event_id: eventId, name, sort: nextSort, starts_at: startsAt })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateRoundRow(
  roundId: string,
  patch: { name?: string; status?: RoundRow["status"]; sort?: number; starts_at?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("event_rounds").update(patch).eq("id", roundId);
}

export async function deleteRoundRow(roundId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("results").delete().eq("round_id", roundId);
  await admin.from("event_rounds").delete().eq("id", roundId);
}

export async function replaceRoundResults(
  eventId: string,
  roundId: string,
  rows: RosterEntry[],
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("results").delete().eq("round_id", roundId);
  if (rows.length === 0) return;
  const payload = rows
    .filter((r) => r.roll_no.trim() !== "")
    .map((r) => ({
      event_id: eventId,
      round_id: roundId,
      roll_no: r.roll_no.trim(),
      display_name: r.display_name,
      registration_id: r.registration_id,
      score: r.score,
      rank: r.rank,
      advanced: r.advanced,
      remarks: r.remarks,
      published_at: null,
    }));
  const { error } = await admin.from("results").insert(payload);
  if (error) throw new Error(error.message);
}

export async function setRoundPublished(roundId: string, publish: boolean): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("results")
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq("round_id", roundId);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/results.ts
git commit -m "feat(results): admin write primitives — save + publish (§13.9)"
```

---

### Task 6: Guarded server actions

**Files:**
- Create: `src/app/admin/(app)/events/[id]/results/actions.ts`

**Interfaces:**
- Consumes: `getAdminSession` (`@/lib/auth/guards`), `canManage` (`@/lib/auth/capabilities`), `getEventForAttendance` (`@/lib/admin/attendance`), Task 4/5 helpers, `writeAudit` (`@/lib/admin/audit`).
- Produces (all `"use server"`, all guard on `manage:results` for the event's club, all `revalidatePath` the admin results page):
  - `createRoundAction(formData: FormData): Promise<void>` — fields `eventId`, `name`, optional `startsAt`.
  - `updateRoundAction(formData: FormData): Promise<void>` — fields `eventId`, `roundId`, optional `name`/`status`.
  - `deleteRoundAction(formData: FormData): Promise<void>` — fields `eventId`, `roundId`.
  - `saveResultsAction(input: { eventId: string; roundId: string; rows: RosterEntry[] }): Promise<{ ok: boolean; error?: string }>` — blocked if the round is already published.
  - `publishRoundAction(formData: FormData): Promise<void>` / `unpublishRoundAction(formData: FormData): Promise<void>` — fields `eventId`, `roundId`.

- [ ] **Step 1: Implement the actions**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { writeAudit } from "@/lib/admin/audit";
import {
  createRoundRow, updateRoundRow, deleteRoundRow,
  replaceRoundResults, setRoundPublished, roundIsPublished,
  type RosterEntry,
} from "@/lib/admin/results";

async function authorize(eventId: string) {
  const session = await getAdminSession();
  if (!session) return null;
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:results", ev.clubId)) return null;
  return { session, ev };
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/results`);
  revalidatePath(`/events/${eventId}/results`);
  revalidatePath(`/events/${eventId}`);
}

export async function createRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim() || null;
  if (!eventId || !name) return;
  const auth = await authorize(eventId);
  if (!auth) return;
  const roundId = await createRoundRow(eventId, name, startsAt);
  await writeAudit({ actorId: auth.session.id, action: "round_create", entity: "event_round", entityId: roundId, after: { name } });
  revalidate(eventId);
}

export async function updateRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorize(eventId);
  if (!auth) return;
  const patch: { name?: string; status?: "pending" | "active" | "completed" } = {};
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (name) patch.name = name;
  if (status === "pending" || status === "active" || status === "completed") patch.status = status;
  await updateRoundRow(roundId, patch);
  await writeAudit({ actorId: auth.session.id, action: "round_update", entity: "event_round", entityId: roundId, after: patch });
  revalidate(eventId);
}

export async function deleteRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorize(eventId);
  if (!auth) return;
  if (await roundIsPublished(roundId)) return; // don't delete published standings
  await deleteRoundRow(roundId);
  await writeAudit({ actorId: auth.session.id, action: "round_delete", entity: "event_round", entityId: roundId });
  revalidate(eventId);
}

const rowSchema = z.object({
  roll_no: z.string().min(1),
  display_name: z.string().nullable(),
  registration_id: z.string().uuid().nullable(),
  score: z.number().nullable(),
  rank: z.number().int().nullable(),
  advanced: z.boolean(),
  remarks: z.string().nullable(),
});

export async function saveResultsAction(input: {
  eventId: string; roundId: string; rows: RosterEntry[];
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorize(input.eventId);
  if (!auth) return { ok: false, error: "Not permitted." };
  if (await roundIsPublished(input.roundId)) {
    return { ok: false, error: "Unpublish this round before editing it." };
  }
  const parsed = z.array(rowSchema).safeParse(input.rows);
  if (!parsed.success) return { ok: false, error: "Invalid results data." };
  await replaceRoundResults(input.eventId, input.roundId, parsed.data);
  await writeAudit({ actorId: auth.session.id, action: "results_save", entity: "event_round", entityId: input.roundId, after: { count: parsed.data.length } });
  revalidate(input.eventId);
  return { ok: true };
}

export async function publishRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorize(eventId);
  if (!auth) return;
  await setRoundPublished(roundId, true);
  await writeAudit({ actorId: auth.session.id, action: "results_publish", entity: "event_round", entityId: roundId });
  revalidate(eventId);
}

export async function unpublishRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorize(eventId);
  if (!auth) return;
  await setRoundPublished(roundId, false);
  await writeAudit({ actorId: auth.session.id, action: "results_unpublish", entity: "event_round", entityId: roundId });
  revalidate(eventId);
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/results/actions.ts"
git commit -m "feat(results): guarded server actions for rounds + publish (§13.9)"
```

---

### Task 7: Public query — `getPublishedResults`

**Files:**
- Modify: `src/lib/queries.ts` (append)

**Interfaces:**
- Consumes: `createPublicClient` (`@/lib/supabase/server`), `orderStandings` (`@/lib/results`).
- Produces:
  - `interface PublishedResult { roll_no: string; display_name: string | null; rank: number | null; score: number | null; advanced: boolean }`
  - `interface PublishedRound { id: string; name: string; sort: number; results: PublishedResult[] }`
  - `async function getPublishedResults(eventId: string): Promise<PublishedRound[]>` — rounds (asc `sort`) that have ≥1 published result; each round's results ordered via `orderStandings`. Uses anon client so RLS returns only published rows.

- [ ] **Step 1: Implement (append to `src/lib/queries.ts`)**

```ts
export interface PublishedResult {
  roll_no: string;
  display_name: string | null;
  rank: number | null;
  score: number | null;
  advanced: boolean;
}
export interface PublishedRound {
  id: string;
  name: string;
  sort: number;
  results: PublishedResult[];
}

export async function getPublishedResults(eventId: string): Promise<PublishedRound[]> {
  const supabase = createPublicClient();
  // RLS hides unpublished result rows and non-approved events automatically.
  const { data } = await supabase
    .from("event_rounds")
    .select("id, name, sort, results ( roll_no, display_name, rank, score, advanced, published_at )")
    .eq("event_id", eventId)
    .order("sort", { ascending: true });

  const rounds = (data ?? []) as unknown as Array<{
    id: string; name: string; sort: number;
    results: Array<PublishedResult & { published_at: string | null }>;
  }>;

  return rounds
    .map((r) => ({
      id: r.id,
      name: r.name,
      sort: r.sort,
      results: orderStandings(
        r.results.filter((x) => x.published_at !== null),
      ).map(({ roll_no, display_name, rank, score, advanced }) => ({
        roll_no, display_name, rank, score, advanced,
      })),
    }))
    .filter((r) => r.results.length > 0);
}
```

Add the import at the top of `queries.ts` if not present: `import { orderStandings } from "@/lib/results";`

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(results): public getPublishedResults query (§13.9)"
```

---

### Task 8: Public standings UI

**Files:**
- Create: `src/app/events/[id]/results/page.tsx`
- Modify: `src/app/events/[id]/page.tsx` (add a Results section + link)

**Interfaces:**
- Consumes: `getPublishedResults`, `getEventDetail` (`@/lib/queries`), `Panel` (`@/components/ui/Surface`).

- [ ] **Step 1: Create the results page**

`src/app/events/[id]/results/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { getEventDetail, getPublishedResults } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  return { title: event ? `Results — ${event.title}` : "Results" };
}

export default async function EventResultsPage({ params }: Params) {
  const { id } = await params;
  const [event, rounds] = await Promise.all([
    getEventDetail(id),
    getPublishedResults(id),
  ]);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/events/${id}`} className="text-sm underline">← {event.title}</Link>
      <h1 className="mt-2 text-2xl font-semibold">Results</h1>

      {rounds.length === 0 ? (
        <p className="mt-6 text-neutral-500">Results haven’t been published yet.</p>
      ) : (
        rounds.map((round) => (
          <Panel key={round.id} className="mt-6">
            <h2 className="text-lg font-medium">{round.name}</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-1 pr-3">Rank</th>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Roll</th>
                  <th className="py-1 pr-3">Score</th>
                  <th className="py-1">Advanced</th>
                </tr>
              </thead>
              <tbody>
                {round.results.map((r) => (
                  <tr key={r.roll_no} className="border-t border-neutral-200/60">
                    <td className="py-1 pr-3">{r.rank ?? "—"}</td>
                    <td className="py-1 pr-3">{r.display_name ?? "—"}</td>
                    <td className="py-1 pr-3">{r.roll_no}</td>
                    <td className="py-1 pr-3">{r.score ?? "—"}</td>
                    <td className="py-1">{r.advanced ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))
      )}
    </main>
  );
}
```

(Match the site's existing spacing/typography — mirror `src/app/events/[id]/page.tsx`. Adjust class names to the project's tokens if these differ.)

- [ ] **Step 2: Add a Results section to the event detail page**

In `src/app/events/[id]/page.tsx`, import and fetch, then render a section only when results exist:

```tsx
import { getEventDetail, getPublishedResults } from "@/lib/queries";
// ...
const rounds = await getPublishedResults(id);
// ...in JSX, where appropriate:
{rounds.length > 0 && (
  <Panel className="mt-6">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-medium">Results</h2>
      <Link href={`/events/${id}/results`} className="text-sm underline">View standings →</Link>
    </div>
    <p className="mt-1 text-sm text-neutral-500">
      {rounds.length} round{rounds.length > 1 ? "s" : ""} published.
    </p>
  </Panel>
)}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS; `/events/[id]/results` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/events/[id]/results/page.tsx" "src/app/events/[id]/page.tsx"
git commit -m "feat(results): public standings page + event-page section (§13.9)"
```

---

### Task 9: Admin results UI

**Files:**
- Create: `src/app/admin/(app)/events/[id]/results/page.tsx` (server)
- Create: `src/app/admin/(app)/events/[id]/results/ResultsEditor.tsx` (client)

**Interfaces:**
- Consumes: `requireViewPage("manage:results")` (`@/lib/auth/guards`), `getEventForAttendance` (`@/lib/admin/attendance`), `listRounds`/`getRoundRoster` (`@/lib/admin/results`), the Task 6 actions, `rankByScore` (`@/lib/results`).

- [ ] **Step 1: Create the server page**

`src/app/admin/(app)/events/[id]/results/page.tsx`:

```tsx
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRounds, getRoundRoster } from "@/lib/admin/results";
import { roundIsPublished } from "@/lib/admin/results";
import { createRoundAction } from "./actions";
import { ResultsEditor } from "./ResultsEditor";

type Params = { params: Promise<{ id: string }> };
type Search = { searchParams: Promise<{ round?: string }> };

export default async function AdminResultsPage({ params, searchParams }: Params & Search) {
  const session = await requireViewPage("manage:results");
  const { id: eventId } = await params;
  const { round: roundParam } = await searchParams;

  const ev = await getEventForAttendance(eventId);
  const canEdit = ev ? canManage(session, "manage:results", ev.clubId) : false;
  const rounds = await listRounds(eventId);
  const selectedId = roundParam ?? rounds[0]?.id ?? null;
  const roster = selectedId ? await getRoundRoster(selectedId) : null;
  const published = selectedId ? await roundIsPublished(selectedId) : false;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Results — {ev?.title ?? "Event"}</h1>

      <section className="flex flex-wrap gap-2">
        {rounds.map((r) => (
          <a key={r.id} href={`?round=${r.id}`}
             className={`rounded border px-3 py-1 text-sm ${r.id === selectedId ? "bg-neutral-900 text-white" : ""}`}>
            {r.name}
          </a>
        ))}
        {canEdit && (
          <form action={createRoundAction} className="flex gap-2">
            <input type="hidden" name="eventId" value={eventId} />
            <input name="name" placeholder="New round…" required
                   className="rounded border px-2 py-1 text-sm" />
            <button className="rounded border px-3 py-1 text-sm">Add round</button>
          </form>
        )}
      </section>

      {selectedId && roster ? (
        <ResultsEditor
          eventId={eventId}
          roundId={selectedId}
          initialRows={roster.rows}
          seededFrom={roster.seededFrom}
          published={published}
          canEdit={canEdit}
        />
      ) : (
        <p className="text-neutral-500">Create a round to enter results.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the client editor**

`src/app/admin/(app)/events/[id]/results/ResultsEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { rankByScore } from "@/lib/results";
import type { RosterEntry } from "@/lib/admin/results";
import { saveResultsAction, publishRoundAction, unpublishRoundAction } from "./actions";

export function ResultsEditor(props: {
  eventId: string;
  roundId: string;
  initialRows: RosterEntry[];
  seededFrom: string;
  published: boolean;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<RosterEntry[]>(props.initialRows);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = props.published || !props.canEdit;

  const update = (i: number, patch: Partial<RosterEntry>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const applyRankByScore = () => setRows((rs) => rankByScore(rs));

  const save = () =>
    start(async () => {
      const res = await saveResultsAction({ eventId: props.eventId, roundId: props.roundId, rows });
      setMsg(res.ok ? "Saved." : res.error ?? "Failed.");
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">Seeded from: {props.seededFrom}{props.published ? " · published" : " · draft"}</p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th>Roll</th><th>Name</th><th>Score</th><th>Rank</th><th>Advanced</th><th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.roll_no}-${i}`}>
              <td><input value={r.roll_no} disabled={locked} onChange={(e) => update(i, { roll_no: e.target.value })} className="w-24 border px-1" /></td>
              <td><input value={r.display_name ?? ""} disabled={locked} onChange={(e) => update(i, { display_name: e.target.value })} className="w-40 border px-1" /></td>
              <td><input type="number" value={r.score ?? ""} disabled={locked} onChange={(e) => update(i, { score: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 border px-1" /></td>
              <td><input type="number" value={r.rank ?? ""} disabled={locked} onChange={(e) => update(i, { rank: e.target.value === "" ? null : Number(e.target.value) })} className="w-16 border px-1" /></td>
              <td><input type="checkbox" checked={r.advanced} disabled={locked} onChange={(e) => update(i, { advanced: e.target.checked })} /></td>
              <td><input value={r.remarks ?? ""} disabled={locked} onChange={(e) => update(i, { remarks: e.target.value })} className="w-40 border px-1" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {props.canEdit && (
        <div className="flex items-center gap-2">
          {!props.published && (
            <>
              <button onClick={applyRankByScore} className="rounded border px-3 py-1">Rank by score</button>
              <button onClick={() => setRows((rs) => [...rs, { roll_no: "", display_name: "", registration_id: null, score: null, rank: null, advanced: false, remarks: null }])} className="rounded border px-3 py-1">Add row</button>
              <button onClick={save} disabled={pending} className="rounded border px-3 py-1">Save draft</button>
              <form action={publishRoundAction}>
                <input type="hidden" name="eventId" value={props.eventId} />
                <input type="hidden" name="roundId" value={props.roundId} />
                <button className="rounded bg-neutral-900 px-3 py-1 text-white">Publish</button>
              </form>
            </>
          )}
          {props.published && (
            <form action={unpublishRoundAction}>
              <input type="hidden" name="eventId" value={props.eventId} />
              <input type="hidden" name="roundId" value={props.roundId} />
              <button className="rounded border px-3 py-1">Unpublish to edit</button>
            </form>
          )}
          {msg && <span className="text-sm text-neutral-500">{msg}</span>}
        </div>
      )}
    </div>
  );
}
```

(Styling here is minimal/functional. Mirror the classes used in `src/app/admin/(app)/events/[id]/registrations/page.tsx` for visual consistency before finishing.)

- [ ] **Step 3: Add a "Results" link on the admin event surface**

Find where the admin event links to `attendance`/`registrations` (grep `events/${...}/attendance` under `src/app/admin`) and add a sibling link to `results`. Match the existing markup.

- [ ] **Step 4: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS; `/admin/events/[id]/results` in the route list.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/results/"
git commit -m "feat(results): admin rounds + standings editor UI (§13.9)"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full static checks**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 2: Drive the admin flow (real browser — server-action POSTs don't work over curl)**

Sign in at `/admin/login` as `tech@cse.test`. Open an event with ≥1 attended registration → `/admin/events/<id>/results`. Add round "Prelims", enter scores, click **Rank by score**, tick two students `advanced`, **Save draft**, then **Publish**. Add round "Finals" → confirm its roster auto-seeds from Prelims' advanced students.

- [ ] **Step 3: Confirm the public gate**

As an anonymous visitor (logged out / incognito):
- `GET /events/<id>/results` shows **Prelims** (published) with names, ranks, scores.
- Before publishing Finals, confirm **Finals does not appear**.
- Confirm the event page shows the "Results" section + link only when a round is published.

- [ ] **Step 4: Confirm RLS at the data layer**

Query Supabase REST with the **anon publishable key** (`sb_publishable_…` from `.env.local`) for the draft round's rows and confirm it returns `[]`; the same query with the service role returns them. (Or run the equivalent through the Supabase MCP: anon-context select of a draft round returns nothing.)

- [ ] **Step 5: Update project memory**

Mark §13.9 done in `C:\Users\SANDY\.claude\projects\C--Users-SANDY-Desktop-ccc\memory\cse-council-project.md` (backlog item 2) and note vitest is now set up.

---

## Self-Review

**Spec coverage:**
- Ordered rounds + per-student rank/score/advanced → Tasks 4–6, 9. ✓
- Draft → publish; RLS publish gate → Tasks 5–6 (`setRoundPublished`), 7 (anon query), 10 (verify). ✓
- Standings on event page + `/events/[id]/results` → Task 8. ✓
- Advancing students seed next round → Task 4 (`getRoundRoster` later-round branch), verified Task 10 Step 2. ✓
- Final round feeds winner certs later → `registration_id` linked in seed/save (Tasks 4–5); no cert UI (out of scope). ✓
- New capability `manage:results` incl. vice_head own → Task 2. ✓
- Public names via `results.display_name` → Task 3 migration; carried through seed/save/query/UI. ✓
- Ranking = score + auto-rank overridable → `rankByScore` (Task 1) applied in editor (Task 9), manual rank input remains editable. ✓
- Tests: pure logic + capability unit tests (Tasks 1–2); publish-gating / anon-can't-read-drafts integration (Task 10). ✓

**Placeholder scan:** no TBD/TODO; every code step has real code. Styling steps point to concrete existing files to mirror rather than inventing a design system. ✓

**Type consistency:** `RosterEntry` is defined in Task 4 and consumed unchanged by Tasks 5, 6, 9. `rankByScore`/`orderStandings` signatures match across Tasks 1, 7, 9. Action names (`saveResultsAction`, `publishRoundAction`, `unpublishRoundAction`, `createRoundAction`) match between Tasks 6 and 9. `getPublishedResults` shape matches between Tasks 7 and 8. ✓
