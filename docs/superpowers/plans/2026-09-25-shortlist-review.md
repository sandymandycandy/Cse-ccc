# Shortlist Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On shortlist-mode events, review every registration on its own page, put each team in Not decided / Shortlisted / Waiting list, then Finalise to email the shortlisted and admit them to attendance — which shows only finalised teams.

**Architecture:** One additive column `registrations.shortlist_decision` holds the draft category; the existing `shortlisted_at` keeps meaning "finalised + emailed", so the attendance guard is untouched. Pure logic lives in `src/lib/registration/shortlist.ts`; two server actions in a new `shortlist/actions.ts`; a new `/shortlist` page with one client component; the attendance page, participants page, CSV and nav are adjusted.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase (service-role client), zod, vitest + `react-dom/server` for component tests.

**Spec:** `docs/superpowers/specs/2026-09-25-shortlist-review-design.md`

## Global Constraints

- Seats-mode events behave **exactly** as before (incl. `waitlist_position` auto-waitlist and Promote).
- Waiting-list and Not-decided teams are **never** emailed.
- A team is emailed "You're selected" **at most once** — enforced by a conditional update, not by a read-then-write.
- Every write filters by **both** `id` and `event_id`; auth = `getAdminSession` + `canManageEvent(session, "manage:registrations", ev.hosts)`.
- Moving a team away from `shortlist` clears `shortlisted_at`, `attended`, `absent_members`, `checked_in_at`, `checked_in_by`, `checkin_method` in the same update.
- Finalise sends inline up to `INLINE_MAX` (50, `src/lib/admin/broadcast-audience.ts`) recipients; above that it queues with `enqueueEmailBatch` (drained from `/admin/outbox`) — same rule as the broadcast page.
- No browser `confirm()`/`alert()` — confirmations are on-page.
- Migrations go through the Supabase MCP `apply_migration` on project `jisahccdnthzgibszwnq`. **Never `supabase db push`.**
- Files are LF-only; do not rewrite files through Python text mode.
- Gate before done: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.

## Review Focus

1. **Double Finalise** (double-click, two admins) → each team emailed once. Pinned by the conditional update's filters in Task 3 (`finalisePatchFilter` test).
2. **Moving a finalised, already-marked-present team to Waiting list** → it leaves attendance and no `attended` survives (certificates read `attended`). Pinned by `decisionPatch` test in Task 2.
3. **Seats-mode event** → `/shortlist` redirects; attendance page lists all confirmed rows as before. Pinned by `attendanceRows` seats test in Task 2.
4. **Search on the Review page with a filter chip active** → a team matched by a member's name is kept whole and counts stay per category. Pinned by `filterReview` test in Task 2.
5. **Finalise with 0 pending** → button disabled; action is a no-op returning `emailed: 0`. Pinned in Task 4 render test (disabled) and Task 3 (`pendingCount` 0).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260925000000_registration_shortlist_decision.sql` (create) | column + check + backfill |
| `src/lib/database.types.ts` (modify) | add `shortlist_decision` to registrations Row/Insert/Update |
| `src/lib/admin/registrations.ts` (modify) | `RegistrationRow.shortlistDecision` |
| `src/lib/registration/shortlist.ts` (create) | pure: states, labels, filters, counts, patches, attendance rows |
| `src/lib/registration/shortlist.test.ts` (create) | its tests |
| `src/app/admin/(app)/events/[id]/shortlist/actions.ts` (create) | `setShortlistDecisionAction`, `finaliseShortlistAction` |
| `src/app/admin/(app)/events/[id]/shortlist/page.tsx` (create) | Review page (server) |
| `src/components/admin/ShortlistReview.tsx` (create) | client: chips, search, cards, 3-way switch, finalise confirm |
| `src/components/admin/ShortlistReview.test.tsx` (create) | render tests |
| `src/components/admin/ParticipantsRoster.tsx` (modify) | export `TeamCard`; optional per-team badge |
| `src/app/admin/(app)/events/[id]/registrations/page.tsx` (modify) | finalised-only rows, drop checkboxes, Review link, empty state |
| `src/app/admin/(app)/events/[id]/registrations/actions.ts` (modify) | delete `shortlistAction`, `unshortlistAction` |
| `src/app/admin/(app)/events/[id]/participants/page.tsx` (modify) | category badges + Review link |
| `src/app/api/admin/registrations/export/route.ts` (modify) | `Category` column |
| `src/lib/admin/queries.ts`, `src/components/admin/EventRowActions.tsx`, `src/app/admin/(app)/events/page.tsx`, `src/app/admin/(app)/events/[id]/edit/page.tsx` (modify) | Review nav link on shortlist events |
| `docs/STATUS.md` (modify) | ship note |

---

### Task 1: Column, types, and the row field

**Files:**
- Create: `supabase/migrations/20260925000000_registration_shortlist_decision.sql`
- Modify: `src/lib/database.types.ts` (registrations Row ~1960, Insert ~1984, Update ~2008)
- Modify: `src/lib/admin/registrations.ts`
- Modify: `src/lib/registration/waitlist.test.ts` (row factory gains the field)

**Interfaces:**
- Produces: `RegistrationRow.shortlistDecision: "shortlist" | "waitlist" | null`

- [ ] **Step 1: Write the migration**

```sql
-- Shortlist review (spec 2026-09-25). The draft category an organiser gives a
-- registration on a shortlist-mode event: null = not decided. `shortlisted_at`
-- keeps its meaning — finalised and emailed — so attendance eligibility is
-- unchanged. Seats-mode events never read this column.
alter table public.registrations
  add column if not exists shortlist_decision text
    check (shortlist_decision in ('shortlist', 'waitlist'));

-- Rows shortlisted under the old one-click flow were already emailed: they are
-- Shortlisted and finalised, so Finalise never emails them again.
update public.registrations
  set shortlist_decision = 'shortlist'
  where shortlisted_at is not null and shortlist_decision is null;
```

- [ ] **Step 2: Apply it live via MCP** — `mcp__plugin_supabase_supabase__apply_migration` with project `jisahccdnthzgibszwnq`, name `registration_shortlist_decision`, the SQL above. (Additive; the deployed code never reads it, so it is safe before deploy.) Verify:

```sql
select shortlist_decision, count(*) filter (where shortlisted_at is not null) as finalised, count(*)
from registrations group by 1;
```
Expected: every row with `shortlisted_at` has `shortlist_decision = 'shortlist'`.

- [ ] **Step 3: Add the column to `database.types.ts`** — directly after each `shortlisted_at` line in the `registrations` table:

Row: `          shortlist_decision: string | null`
Insert and Update: `          shortlist_decision?: string | null`

- [ ] **Step 4: Add the field to `RegistrationRow`** in `src/lib/admin/registrations.ts`:

After `shortlistedAt: string | null;` in the interface:
```ts
  /** Shortlist-mode draft category; null = not decided. Finalised = shortlistedAt set. */
  shortlistDecision: "shortlist" | "waitlist" | null;
```
Append `, shortlist_decision` to the select string after `shortlisted_at`. In the cast type add `shortlist_decision: "shortlist" | "waitlist" | null;`. In the map add `shortlistDecision: r.shortlist_decision ?? null,` after `shortlistedAt`.

- [ ] **Step 5: Fix the test factory** in `src/lib/registration/waitlist.test.ts` — add `shortlistDecision: null,` after `shortlistedAt: null,`.

- [ ] **Step 6: Typecheck** — `npm run typecheck`. Expected: PASS (fix any other `RegistrationRow` literals it names by adding `shortlistDecision: null`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260925000000_registration_shortlist_decision.sql src/lib/database.types.ts src/lib/admin/registrations.ts src/lib/registration/waitlist.test.ts
git commit -m "feat(shortlist): registrations.shortlist_decision column"
```

---

### Task 2: Pure shortlist logic

**Files:**
- Create: `src/lib/registration/shortlist.ts`
- Test: `src/lib/registration/shortlist.test.ts`

**Interfaces:**
- Consumes: `RegistrationRow` shape (only `shortlistDecision`, `shortlistedAt`)
- Produces:
  - `type ShortlistDecision = "shortlist" | "waitlist" | null`
  - `type ShortlistState = "undecided" | "waitlist" | "picked" | "finalised"`
  - `shortlistState(r: { shortlistDecision: ShortlistDecision; shortlistedAt: string | null }): ShortlistState`
  - `STATE_LABEL: Record<ShortlistState, string>`
  - `type ReviewView = "All" | "Not decided" | "Shortlisted" | "Waiting list"`; `REVIEW_VIEWS: ReviewView[]`
  - `inView(state: ShortlistState, view: ReviewView): boolean`
  - `reviewCounts(states: ShortlistState[]): Record<ReviewView, number>`
  - `filterReview<T extends { state: ShortlistState; search: unknown[] }>(items: T[], query: string, view: ReviewView): T[]`
  - `pendingCount(states: ShortlistState[]): number`
  - `decisionPatch(next: ShortlistDecision): DecisionPatch`
  - `attendanceRows<T extends { shortlistedAt: string | null }>(rows: T[], mode: "seats" | "shortlist"): T[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  attendanceRows,
  decisionPatch,
  filterReview,
  pendingCount,
  reviewCounts,
  shortlistState,
  type ShortlistState,
} from "./shortlist";

describe("shortlistState", () => {
  it("maps decision × finalised to four states", () => {
    expect(shortlistState({ shortlistDecision: null, shortlistedAt: null })).toBe("undecided");
    expect(shortlistState({ shortlistDecision: "waitlist", shortlistedAt: null })).toBe("waitlist");
    expect(shortlistState({ shortlistDecision: "shortlist", shortlistedAt: null })).toBe("picked");
    expect(shortlistState({ shortlistDecision: "shortlist", shortlistedAt: "2026-09-25T00:00:00Z" })).toBe("finalised");
  });
});

describe("review filtering", () => {
  const items = [
    { id: "a", state: "undecided" as ShortlistState, search: ["Owls", { team: [{ n: "Asha" }] }] },
    { id: "b", state: "picked" as ShortlistState, search: ["Hawks"] },
    { id: "c", state: "finalised" as ShortlistState, search: ["Crows"] },
    { id: "d", state: "waitlist" as ShortlistState, search: ["Doves", "Asha"] },
  ];

  it("counts: Shortlisted covers picked and finalised", () => {
    expect(reviewCounts(items.map((i) => i.state))).toEqual({
      All: 4, "Not decided": 1, Shortlisted: 2, "Waiting list": 1,
    });
  });

  it("filters by view and by any nested value, keeping teams whole", () => {
    expect(filterReview(items, "", "Shortlisted").map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterReview(items, "asha", "All").map((i) => i.id)).toEqual(["a", "d"]);
    expect(filterReview(items, "asha", "Waiting list").map((i) => i.id)).toEqual(["d"]);
  });

  it("pendingCount is shortlisted-not-yet-emailed only", () => {
    expect(pendingCount(items.map((i) => i.state))).toBe(1);
    expect(pendingCount(["finalised", "waitlist", "undecided"])).toBe(0);
  });
});

describe("decisionPatch", () => {
  it("to shortlist only sets the decision (finalise stamps shortlisted_at)", () => {
    expect(decisionPatch("shortlist")).toEqual({ shortlist_decision: "shortlist" });
  });

  it("away from shortlist clears finalisation and every attendance trace", () => {
    const cleared = {
      shortlisted_at: null, attended: false, absent_members: [],
      checked_in_at: null, checked_in_by: null, checkin_method: null,
    };
    expect(decisionPatch("waitlist")).toEqual({ shortlist_decision: "waitlist", ...cleared });
    expect(decisionPatch(null)).toEqual({ shortlist_decision: null, ...cleared });
  });
});

describe("attendanceRows", () => {
  const rows = [{ id: "x", shortlistedAt: null }, { id: "y", shortlistedAt: "2026-09-25T00:00:00Z" }];
  it("seats: every row passes through", () => {
    expect(attendanceRows(rows, "seats").map((r) => r.id)).toEqual(["x", "y"]);
  });
  it("shortlist: finalised rows only", () => {
    expect(attendanceRows(rows, "shortlist").map((r) => r.id)).toEqual(["y"]);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run src/lib/registration/shortlist.test.ts`. Expected: FAIL, cannot resolve `./shortlist`.

- [ ] **Step 3: Implement**

```ts
import { matchesAny } from "@/lib/admin/roster-filter";

/**
 * Shortlist review (spec 2026-09-25). Pure and client-safe: the review page's
 * chips and search run in the browser; the actions reuse the patches.
 *
 * `shortlist_decision` is the organiser's draft category; `shortlisted_at` means
 * finalised — the team was emailed and is in attendance.
 */
export type ShortlistDecision = "shortlist" | "waitlist" | null;
export type ShortlistState = "undecided" | "waitlist" | "picked" | "finalised";

export function shortlistState(r: {
  shortlistDecision: ShortlistDecision;
  shortlistedAt: string | null;
}): ShortlistState {
  if (r.shortlistDecision === "shortlist") return r.shortlistedAt ? "finalised" : "picked";
  if (r.shortlistDecision === "waitlist") return "waitlist";
  return "undecided";
}

export const STATE_LABEL: Record<ShortlistState, string> = {
  undecided: "Not decided",
  waitlist: "Waiting list",
  picked: "Shortlisted",
  finalised: "Shortlisted · emailed",
};

export type ReviewView = "All" | "Not decided" | "Shortlisted" | "Waiting list";
export const REVIEW_VIEWS: ReviewView[] = ["All", "Not decided", "Shortlisted", "Waiting list"];

export function inView(state: ShortlistState, view: ReviewView): boolean {
  switch (view) {
    case "All": return true;
    case "Not decided": return state === "undecided";
    case "Shortlisted": return state === "picked" || state === "finalised";
    case "Waiting list": return state === "waitlist";
  }
}

export function reviewCounts(states: ShortlistState[]): Record<ReviewView, number> {
  const out = { All: 0, "Not decided": 0, Shortlisted: 0, "Waiting list": 0 } as Record<ReviewView, number>;
  for (const s of states) for (const v of REVIEW_VIEWS) if (inView(s, v)) out[v]++;
  return out;
}

export function filterReview<T extends { state: ShortlistState; search: unknown[] }>(
  items: T[],
  query: string,
  view: ReviewView,
): T[] {
  return items.filter((i) => inView(i.state, view) && matchesAny(i.search, query));
}

/** Teams Finalise would email now: shortlisted, not yet emailed. */
export function pendingCount(states: ShortlistState[]): number {
  return states.filter((s) => s === "picked").length;
}

export type DecisionPatch =
  | { shortlist_decision: "shortlist" }
  | {
      shortlist_decision: "waitlist" | null;
      shortlisted_at: null;
      attended: false;
      absent_members: number[];
      checked_in_at: null;
      checked_in_by: null;
      checkin_method: null;
    };

/**
 * The row update for a category change. Leaving Shortlisted un-finalises the
 * team and wipes its attendance — certificates follow `attended`, so a removed
 * team must not keep one.
 */
export function decisionPatch(next: ShortlistDecision): DecisionPatch {
  if (next === "shortlist") return { shortlist_decision: "shortlist" };
  return {
    shortlist_decision: next,
    shortlisted_at: null,
    attended: false,
    absent_members: [],
    checked_in_at: null,
    checked_in_by: null,
    checkin_method: null,
  };
}

/** Who the attendance page lists: seats → everyone given; shortlist → finalised only. */
export function attendanceRows<T extends { shortlistedAt: string | null }>(
  rows: T[],
  mode: "seats" | "shortlist",
): T[] {
  return mode === "shortlist" ? rows.filter((r) => r.shortlistedAt != null) : rows;
}
```

- [ ] **Step 4: Run** — `npx vitest run src/lib/registration/shortlist.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration/shortlist.ts src/lib/registration/shortlist.test.ts
git commit -m "feat(shortlist): pure review states, filters and patches"
```

---

### Task 3: Server actions

**Files:**
- Create: `src/app/admin/(app)/events/[id]/shortlist/actions.ts`

**Interfaces:**
- Consumes: `decisionPatch`, `ShortlistDecision` (Task 2); `teamRecipients`, `enqueueEmail`, `enqueueEmailBatch`, `shouldQueue`, `BULK_PRIORITY`, `writeAudit`, `getEventForAttendance`, `getEventFormSchema`, `canManageEvent`, `getAdminSession`.
- Produces:
  - `setShortlistDecisionAction(input: { eventId: string; registrationId: string; decision: ShortlistDecision }): Promise<{ ok: true } | { ok: false; error: string }>`
  - `finaliseShortlistAction(input: { eventId: string }): Promise<{ ok: true; teams: number; recipients: number; queued: boolean } | { ok: false; error: string }>`

No unit test file: both actions are auth + one Supabase call; their logic (`decisionPatch`) is tested in Task 2 and the end-to-end check in Task 7 exercises them against the real DB.

- [ ] **Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManageEvent } from "@/lib/admin/event-hosts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { enqueueEmail, enqueueEmailBatch, type EnqueueEmailArgs } from "@/lib/email";
import { BULK_PRIORITY } from "@/lib/email/bulk";
import { shouldQueue } from "@/lib/admin/broadcast-audience";
import { writeAudit } from "@/lib/admin/audit";
import { decisionPatch } from "@/lib/registration/shortlist";

const uuid = z.string().uuid();
const decisionInput = z.object({
  eventId: uuid,
  registrationId: uuid,
  decision: z.enum(["shortlist", "waitlist"]).nullable(),
});
const DENIED = { ok: false as const, error: "You can't change the shortlist for this event." };
const SAVE_FAILED = { ok: false as const, error: "Could not save — refresh and try again." };

/** Own-club (or co-host) manager of a shortlist-mode event, or null. */
async function authorise(eventId: string) {
  const session = await getAdminSession();
  if (!session) return null;
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManageEvent(session, "manage:registrations", ev.hosts)) return null;
  const { schema, selectionMode } = await getEventFormSchema(eventId);
  if (selectionMode !== "shortlist") return null;
  return { session, ev, schema };
}

function revalidate(eventId: string) {
  for (const p of ["shortlist", "registrations", "participants"]) {
    revalidatePath(`/admin/events/${eventId}/${p}`);
  }
}

/** Put one registration in a category. Silent: never emails. */
export async function setShortlistDecisionAction(input: {
  eventId: string;
  registrationId: string;
  decision: "shortlist" | "waitlist" | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = decisionInput.safeParse(input);
  if (!parsed.success) return DENIED;
  const { eventId, registrationId, decision } = parsed.data;
  const auth = await authorise(eventId);
  if (!auth) return DENIED;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .update(decisionPatch(decision))
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .select("id");
  if (error || !data?.length) return SAVE_FAILED;

  await writeAudit({
    actorId: auth.session.id,
    action: "shortlist_decision",
    entity: "registration",
    entityId: registrationId,
    after: { decision },
  });
  revalidate(eventId);
  return { ok: true };
}

/**
 * Email every shortlisted-but-not-yet-emailed team and admit them to attendance.
 * One conditional update both stamps and claims the rows: only rows it returns
 * are emailed, so a double click or two admins at once cannot email a team twice.
 */
export async function finaliseShortlistAction(input: {
  eventId: string;
}): Promise<{ ok: true; teams: number; recipients: number; queued: boolean } | { ok: false; error: string }> {
  if (!uuid.safeParse(input.eventId).success) return DENIED;
  const eventId = input.eventId;
  const auth = await authorise(eventId);
  if (!auth) return DENIED;

  const admin = createAdminClient();
  const { data: claimed, error } = await admin
    .from("registrations")
    .update({ shortlisted_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("shortlist_decision", "shortlist")
    .is("shortlisted_at", null)
    .select("id, email, student_name, custom_answers");
  if (error) return SAVE_FAILED;
  const rows = claimed ?? [];

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const payload = { eventTitle: auth.ev.title, url: base ? `${base}/events/${eventId}` : undefined };
  const mails: EnqueueEmailArgs[] = rows.flatMap((r) =>
    teamRecipients(auth.schema, r.custom_answers as Record<string, unknown> | null, r.email).map((to) => ({
      template: "registration_shortlisted",
      toEmail: to,
      toName: to === r.email?.toLowerCase() ? (r.student_name ?? "") : "",
      subject: `You're selected — ${auth.ev.title}`,
      payload,
      priority: 2,
    })),
  );

  // Past INLINE_MAX, sequential SMTP sends would outrun the function limit —
  // queue them for the Outbox instead, as the broadcast page does.
  const queued = shouldQueue(mails.length);
  if (queued) {
    await enqueueEmailBatch(mails.map((m) => ({ ...m, priority: BULK_PRIORITY })));
  } else {
    for (const m of mails) await enqueueEmail(m);
  }

  await writeAudit({
    actorId: auth.session.id,
    action: "shortlist_finalise",
    entity: "event",
    entityId: eventId,
    after: { teams: rows.length, recipients: mails.length, queued },
  });
  revalidate(eventId);
  return { ok: true, teams: rows.length, recipients: mails.length, queued };
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck`. Expected: PASS. (If `enqueueEmail`'s arg type rejects `priority` on `EnqueueEmailArgs`, it doesn't — it's declared there; if `.is("shortlisted_at", null)` typing complains, it's the standard supabase-js filter.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/shortlist/actions.ts"
git commit -m "feat(shortlist): set-decision and race-safe finalise actions"
```

---

### Task 4: Review page and client component

**Files:**
- Modify: `src/components/admin/ParticipantsRoster.tsx` (export `TeamCard`, used by `TeamGrid`)
- Create: `src/components/admin/ShortlistReview.tsx`
- Test: `src/components/admin/ShortlistReview.test.tsx`
- Create: `src/app/admin/(app)/events/[id]/shortlist/page.tsx`
- Modify: `src/app/globals.css` (three small rules)

**Interfaces:**
- Consumes: Task 2 exports; Task 3 actions; `TeamGroup`, `listTeams`, `teamSearchValues` from `@/lib/registration-form/participants`.
- Produces:
  - `TeamCard({ team, badge, children }: { team: TeamGroup; badge?: ReactNode; children?: ReactNode })`
  - `ReviewItem = { id: string; team: TeamGroup; state: ShortlistState; search: unknown[] }`
  - `ShortlistReview({ eventId, items, canEdit }: { eventId: string; items: ReviewItem[]; canEdit: boolean })`

- [ ] **Step 1: Extract `TeamCard`** in `ParticipantsRoster.tsx`. Replace the body of `TeamGrid`'s `teams.map(...)` `<article>` with a new exported component, keeping markup byte-identical except the added `badge` and `children` slots:

```tsx
export function TeamCard({ team, badge, children }: { team: TeamGroup; badge?: ReactNode; children?: ReactNode }) {
  return (
    <article className="team-card">
      <div className="team-card-head">
        <span className="n">{teamLabel(team)}</span>
        <span className="c">
          {badge}
          {team.people.length} {team.people.length === 1 ? "person" : "people"}
        </span>
      </div>
      {/* …the existing team.people.map(...) and team-answers block, unchanged… */}
      {children}
    </article>
  );
}

function TeamGrid({ teams, badges }: { teams: TeamGroup[]; badges?: Record<number, ReactNode> }) {
  return (
    <div className="team-grid">
      {teams.map((team) => <TeamCard key={team.index} team={team} badge={badges?.[team.index]} />)}
    </div>
  );
}
```

Move the existing people + answers JSX verbatim into `TeamCard` where the comment sits (do not leave the comment). Add `type ReactNode` to the `react` import. `badges` is used in Task 6.

- [ ] **Step 2: Write the failing component test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortlistReview, type ReviewItem } from "./ShortlistReview";

vi.mock("@/app/admin/(app)/events/[id]/shortlist/actions", () => ({
  setShortlistDecisionAction: vi.fn(),
  finaliseShortlistAction: vi.fn(),
}));

const item = (id: string, state: ReviewItem["state"], name: string): ReviewItem => ({
  id,
  state,
  team: {
    index: Number(id.slice(1)),
    name,
    people: [{ index: 1, name: "Lead", roll: "L1", department: null, year: null, email: null, phone: null, role: "leader", team: 1, teamOf: "Lead" }],
    answers: [],
  },
  search: [name],
});

describe("ShortlistReview", () => {
  it("shows counts per category and the pending finalise number", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit items={[item("r1", "undecided", "Owls"), item("r2", "picked", "Hawks"), item("r3", "finalised", "Crows"), item("r4", "waitlist", "Doves")]} />,
    );
    expect(html).toContain("Shortlisted (2)");
    expect(html).toContain("Waiting list (1)");
    expect(html).toContain("Finalise &amp; email (1)");
    expect(html).toContain("Emailed");
  });

  it("disables Finalise when nothing is pending", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit items={[item("r1", "finalised", "Crows"), item("r2", "waitlist", "Doves")]} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Finalise &amp; email \(0\)/);
  });

  it("read-only viewers see categories but no switch or finalise", () => {
    const html = renderToStaticMarkup(
      <ShortlistReview eventId="e" canEdit={false} items={[item("r1", "picked", "Hawks")]} />,
    );
    expect(html).not.toContain("Finalise");
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain("Shortlisted");
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run src/components/admin/ShortlistReview.test.tsx`. Expected: FAIL, cannot resolve `./ShortlistReview`.

- [ ] **Step 4: Implement `ShortlistReview.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { TeamGroup } from "@/lib/registration-form/participants";
import {
  REVIEW_VIEWS,
  STATE_LABEL,
  filterReview,
  pendingCount,
  reviewCounts,
  type ReviewView,
  type ShortlistDecision,
  type ShortlistState,
} from "@/lib/registration/shortlist";
import { finaliseShortlistAction, setShortlistDecisionAction } from "@/app/admin/(app)/events/[id]/shortlist/actions";
import { TeamCard } from "./ParticipantsRoster";

export interface ReviewItem {
  id: string;
  team: TeamGroup;
  state: ShortlistState;
  search: unknown[];
}

const CHOICES: { decision: ShortlistDecision; label: string }[] = [
  { decision: null, label: "Not decided" },
  { decision: "shortlist", label: "Shortlist" },
  { decision: "waitlist", label: "Waiting list" },
];
const decisionOf = (s: ShortlistState): ShortlistDecision =>
  s === "picked" || s === "finalised" ? "shortlist" : s === "waitlist" ? "waitlist" : null;
const stateFor = (d: ShortlistDecision): ShortlistState =>
  d === "shortlist" ? "picked" : d === "waitlist" ? "waitlist" : "undecided";
const BADGE: Record<ShortlistState, string> = {
  undecided: "abadge abadge-past",
  waitlist: "abadge abadge-pending",
  picked: "abadge abadge-approved",
  finalised: "abadge abadge-approved",
};

/**
 * Review every registration on a shortlist event: put each team in a category
 * (silent, saved at once), then Finalise to email the shortlisted. A finalised
 * team being moved out gets an inline confirm — it was already told.
 */
export function ShortlistReview({ eventId, items, canEdit }: { eventId: string; items: ReviewItem[]; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<ReviewView>("All");
  const [confirmOut, setConfirmOut] = useState<{ id: string; decision: ShortlistDecision } | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [shown, patch] = useOptimistic(items, (rows: ReviewItem[], p: { id: string; state: ShortlistState }) =>
    rows.map((r) => (r.id === p.id ? { ...r, state: p.state } : r)));

  const states = shown.map((i) => i.state);
  const counts = reviewCounts(states);
  const toSend = pendingCount(states);
  const rows = filterReview(shown, q, view);

  function choose(item: ReviewItem, decision: ShortlistDecision) {
    if (decisionOf(item.state) === decision) return;
    if (item.state === "finalised" && confirmOut?.id !== item.id) {
      setConfirmOut({ id: item.id, decision });
      return;
    }
    setConfirmOut(null);
    setError("");
    setNotice("");
    startTransition(async () => {
      patch({ id: item.id, state: stateFor(decision) });
      try {
        const res = await setShortlistDecisionAction({ eventId, registrationId: item.id, decision });
        if (!res.ok) setError(res.error);
      } catch {
        setError("Could not save — refresh and try again.");
      }
    });
  }

  function finalise() {
    setConfirmFinal(false);
    setError("");
    startTransition(async () => {
      try {
        const res = await finaliseShortlistAction({ eventId });
        if (!res.ok) return setError(res.error);
        setNotice(
          res.teams === 0
            ? "Nothing new to send — every shortlisted team was already emailed."
            : `${res.teams} ${res.teams === 1 ? "team" : "teams"} emailed and added to attendance.${res.queued ? " The emails are queued in the Outbox." : ""}`,
        );
      } catch {
        setError("Could not finalise — refresh and try again.");
      }
    });
  }

  if (items.length === 0) return <div className="cal-empty">No registrations yet.</div>;

  return (
    <>
      {canEdit ? (
        <div className="shortlist-bar">
          {confirmFinal ? (
            <span className="shortlist-confirm" role="alert">
              Email {toSend} {toSend === 1 ? "team" : "teams"} that they&rsquo;re selected?
              <button type="button" className="btn btn-accent btn-sm" onClick={finalise} disabled={pending}>Confirm</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmFinal(false)}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="btn btn-accent btn-sm" disabled={toSend === 0 || pending} onClick={() => setConfirmFinal(true)}>
              Finalise &amp; email ({toSend})
            </button>
          )}
          <span className="hint">Choosing a category sends nothing. Finalise emails the shortlisted and adds them to attendance.</span>
        </div>
      ) : null}
      {notice ? (
        <p className="note" role="status">
          {notice} <Link href={`/admin/events/${eventId}/registrations`}>Open attendance</Link>
        </p>
      ) : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true"><Search size={17} /></span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, roll, email, team, answers…" aria-label="Search registrations" />
          </div>
        </div>
        <div className="listbar-row" role="group" aria-label="Filter by category">
          {REVIEW_VIEWS.map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => setView(v)}>
              {v} ({counts[v]})
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="cal-empty">Nothing here.</div>
      ) : (
        <div className="team-grid">
          {rows.map((item) => (
            <TeamCard
              key={item.id}
              team={item.team}
              badge={<span className={BADGE[item.state]} style={{ marginRight: 8 }}>{item.state === "finalised" ? "Emailed" : STATE_LABEL[item.state]}</span>}
            >
              {canEdit ? (
                <div className="shortlist-choice">
                  <div className="seg" role="radiogroup" aria-label={`Category for ${item.team.name ?? `team ${item.team.index}`}`}>
                    {CHOICES.map((c) => (
                      <button key={c.label} type="button" role="radio"
                        aria-checked={decisionOf(item.state) === c.decision}
                        data-on={decisionOf(item.state) === c.decision}
                        data-kind={c.decision ?? "none"}
                        onClick={() => choose(item, c.decision)}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {confirmOut?.id === item.id ? (
                    <p className="shortlist-warn" role="alert">
                      This team was already told they&rsquo;re selected — you&rsquo;ll need to tell them yourself.
                      Their attendance will be cleared.{" "}
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => choose(item, confirmOut.decision)}>Confirm</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmOut(null)}>Cancel</button>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </TeamCard>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: CSS** — append to `src/app/globals.css` next to the `.seg` rules (~line 2770):

```css
  .seg > button[data-kind="shortlist"][data-on="true"] { background: var(--forest-tint); color: var(--forest); }
  .seg > button[data-kind="waitlist"][data-on="true"] { background: var(--clay-tint); color: var(--clay); }
  .seg > button[data-kind="none"][data-on="true"] { background: var(--line-2); color: var(--ink-2); }
  .shortlist-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 18px; }
  .shortlist-confirm { display: inline-flex; flex-wrap: wrap; gap: 8px; align-items: center; font: 500 13px var(--sans); }
  .shortlist-choice { margin-top: 12px; }
  .shortlist-choice .seg { display: inline-flex; flex-wrap: wrap; }
  .shortlist-warn { margin-top: 8px; font: 400 12.5px/1.5 var(--sans); color: var(--rust); }
```

- [ ] **Step 6: Run** — `npx vitest run src/components/admin/ShortlistReview.test.tsx src/components/admin`. Expected: PASS (existing roster/board tests unaffected).

- [ ] **Step 7: Page** — `src/app/admin/(app)/events/[id]/shortlist/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManageEvent, canViewEvent } from "@/lib/admin/event-hosts";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { listTeams, teamSearchValues } from "@/lib/registration-form/participants";
import { shortlistState } from "@/lib/registration/shortlist";
import { ShortlistReview, type ReviewItem } from "@/components/admin/ShortlistReview";

/** Review every registration on a shortlist event and sort it into a category. */
export default async function ShortlistPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  if (!canViewEvent(session, "manage:registrations", ev.hosts)) redirect("/admin/events");
  const canEdit = canManageEvent(session, "manage:registrations", ev.hosts);

  const [regs, { schema, selectionMode }] = await Promise.all([listRegistrations(id), getEventFormSchema(id)]);
  if (selectionMode !== "shortlist") redirect(`/admin/events/${id}/registrations`);

  const teams = listTeams(regs, schema);
  const items: ReviewItem[] = regs.map((r, i) => ({
    id: r.id,
    team: teams[i],
    state: shortlistState(r),
    search: [...teamSearchValues(teams[i]), r.customAnswers],
  }));

  return (
    <div className="admin-page">
      <Link href="/admin/events" className="label" style={{ color: "var(--forest)" }}>← Events</Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Review &amp; shortlist</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6 }}>{regs.length} registered</p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Link href={`/admin/events/${id}/registrations`} className="btn btn-ghost btn-sm">Attendance</Link>
          <Link href={`/admin/events/${id}/participants`} className="btn btn-ghost btn-sm">Who&rsquo;s registered</Link>
        </div>
      </div>
      <ShortlistReview eventId={id} items={items} canEdit={canEdit} />
    </div>
  );
}
```

- [ ] **Step 8: Typecheck + lint** — `npm run typecheck && npm run lint`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/ParticipantsRoster.tsx src/components/admin/ShortlistReview.tsx src/components/admin/ShortlistReview.test.tsx "src/app/admin/(app)/events/[id]/shortlist/page.tsx" src/app/globals.css
git commit -m "feat(shortlist): review page — categories, search, finalise"
```

---

### Task 5: Attendance shows finalised teams only

**Files:**
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx`
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts` (delete `shortlistAction` lines 80–143 and `unshortlistAction` lines 203–227, with their doc comments)

**Interfaces:**
- Consumes: `attendanceRows` (Task 2)

- [ ] **Step 1: Rows** — in `page.tsx` replace

```ts
  const shortlisted = regs.filter((r) => r.shortlistedAt).length;
  // Seats mode splits confirmed (the main table) from the waitlist; shortlist
  // mode has no waitlist, so the main table shows everything.
  const { confirmed: confirmedRows, waitlist: waitlistRows } = splitRegistrations(regs);
  const rows = isShortlist ? regs : confirmedRows;
```
with
```ts
  // Seats mode splits confirmed (the main table) from the waitlist. Shortlist
  // mode admits only finalised teams — the rest live on the Review page.
  const { confirmed: confirmedRows, waitlist: waitlistRows } = splitRegistrations(regs);
  const rows = isShortlist ? attendanceRows(regs, "shortlist") : confirmedRows;
```
and import `attendanceRows` from `@/lib/registration/shortlist`. Remove the `shortlistAction, unshortlistAction` imports.

- [ ] **Step 2: Header** — the counts line for shortlist mode becomes:

```tsx
            {isShortlist
              ? `${rows.length} shortlisted ${rows.length === 1 ? "team" : "teams"} · ${peoplePresent} ${peoplePresent === 1 ? "person" : "people"} present`
              : /* seats line unchanged */}
```
In the header link stack, before "Who's registered", add:
```tsx
          {isShortlist ? (
            <Link href={`/admin/events/${id}/shortlist`} className="btn btn-accent btn-sm">Review &amp; shortlist</Link>
          ) : null}
```

- [ ] **Step 3: Body** — delete the `{isShortlist && canEdit ? (<form id="shortlist-form" …>) : null}` block and the `rowLead` / `rowTail` props passed to `RegistrationsBoard`. Change the empty check from `regs.length === 0` to `rows.length === 0 && waitlistRows.length === 0`, with the message:

```tsx
        <div className="cal-empty">
          {isShortlist ? (
            <>No shortlisted teams yet. <Link href={`/admin/events/${id}/shortlist`}>Review registrations</Link> and finalise the shortlist.</>
          ) : "No registrations yet."}
        </div>
```

- [ ] **Step 4: Actions file** — delete `shortlistAction` and `unshortlistAction`; remove now-unused imports (`redirect` only if nothing else uses it — `grep -n "redirect(" actions.ts` first).

- [ ] **Step 5: Check nothing else referenced them** — `grep -rn "shortlistAction\|unshortlistAction" src`. Expected: no hits except the new `finaliseShortlistAction`.

- [ ] **Step 6: Gate** — `npm run typecheck && npm run lint && npm test`. Expected: PASS. (`RegistrationsBoard` keeps its optional `rowLead`/`rowTail` props — the seats path doesn't use them either; leave them, removing is unrelated churn.)

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/registrations/page.tsx" "src/app/admin/(app)/events/[id]/registrations/actions.ts"
git commit -m "feat(shortlist): attendance lists finalised teams only"
```

---

### Task 6: Badges, CSV category, navigation

**Files:**
- Modify: `src/components/admin/ParticipantsRoster.tsx` (thread `badges` through)
- Modify: `src/app/admin/(app)/events/[id]/participants/page.tsx`
- Modify: `src/app/api/admin/registrations/export/route.ts`
- Modify: `src/lib/admin/queries.ts`, `src/components/admin/EventRowActions.tsx`, `src/app/admin/(app)/events/page.tsx`, `src/app/admin/(app)/events/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `shortlistState`, `STATE_LABEL` (Task 2); `TeamGrid`'s `badges` (Task 4)
- Produces: `AdminEventRow.selectionMode: "seats" | "shortlist"`; `ParticipantsRoster` prop `badges?: Record<number, ReactNode>`

- [ ] **Step 1: Roster badges** — `ParticipantsRoster` gains `badges?: Record<number, ReactNode>` and passes it to the main `<TeamGrid teams={shown} badges={badges} />`. For solo events (`SoloTable`) no badge — the category is a team-card concern; the Review page covers solo events.

- [ ] **Step 2: Participants page** — after `const teams = listTeams(rows, schema);`:

```tsx
  const badges = isShortlist
    ? Object.fromEntries(
        rows.map((r, i) => {
          const s = shortlistState(r);
          const cls = s === "waitlist" ? "abadge-pending" : s === "undecided" ? "abadge-past" : "abadge-approved";
          return [teams[i].index, <span key="b" className={`abadge ${cls}`} style={{ marginRight: 8 }}>{STATE_LABEL[s]}</span>];
        }),
      )
    : undefined;
```
Pass `badges={badges}` to `ParticipantsRoster`. In the header stack add, first:
```tsx
          {isShortlist ? (
            <Link href={`/admin/events/${id}/shortlist`} className="btn btn-accent btn-sm">Review &amp; shortlist</Link>
          ) : null}
```

- [ ] **Step 3: CSV** — in `export/route.ts`, header `"Shortlisted"` → `"Category"`; cell `r.shortlistedAt ? "yes" : "no"` → `STATE_LABEL[shortlistState(r)]`. Seats events get "Not decided" — acceptable but noisy; use `selectionMode === "shortlist" ? STATE_LABEL[shortlistState(r)] : ""` (the route already loads the schema via `getEventFormSchema`; destructure `selectionMode` there). Map `"Shortlisted · emailed"` stays as is.

- [ ] **Step 4: Event list nav** — in `src/lib/admin/queries.ts`: add `selection_mode` to `EVENT_SELECT` (`"id, title, starts_at, ends_at, status, approval_status, created_by, selection_mode, " + …`), `selection_mode: "seats" | "shortlist" | null;` to `EventRow`, `selectionMode: "seats" | "shortlist";` to `AdminEventRow`, and `selectionMode: e.selection_mode ?? "seats",` in `toRow`.

`EventRowActions` gets `shortlist?: boolean` and, before the Attendance link:
```tsx
    {shortlist ? <Link href={`/admin/events/${id}/shortlist`} className="event-icon-action" aria-label={`Review and shortlist for ${title}`} title="Review & shortlist"><ListChecks size={17} aria-hidden="true" /><span className="event-action-label">Shortlist</span></Link> : null}
```
(import `ListChecks` from `lucide-react`). In `events/page.tsx`: `<EventRowActions key="actions" id={e.id} title={e.title} shortlist={e.selectionMode === "shortlist"} />`.

Edit page: next to the "Registrations & attendance" link, when `event.selectionMode === "shortlist"`, add `<Link href={`/admin/events/${id}/shortlist`} className="btn btn-ghost btn-sm"><ListChecks size={16} aria-hidden="true" /> Review &amp; shortlist</Link>` (wrap both links in a `<div className="stack" style={{ gap: 10 }}>`).

- [ ] **Step 5: Gate** — `npm run typecheck && npm run lint && npm test`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/ParticipantsRoster.tsx "src/app/admin/(app)/events/[id]/participants/page.tsx" src/app/api/admin/registrations/export/route.ts src/lib/admin/queries.ts src/components/admin/EventRowActions.tsx "src/app/admin/(app)/events/page.tsx" "src/app/admin/(app)/events/[id]/edit/page.tsx"
git commit -m "feat(shortlist): category badges, CSV category, Review links"
```

---

### Task 7: Verify end to end, then document

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Full gate** — `npm run typecheck && npm run lint && npm test && npm run build`. Expected: all PASS.

- [ ] **Step 2: End-to-end on the dev server** (shared live DB — note every id you create and delete them after). Start `npm run dev`, sign in as an admin (creds in memory `cse-council-project`). Create a shortlist-mode event with a team block; submit 4 teams (A–D) from `/events/<id>`, each with a member email you own or a test address.
  1. `/admin/events/<id>/registrations` → "No shortlisted teams yet".
  2. `/admin/events/<id>/shortlist` → A, B Shortlist; C Waiting list; D untouched. Reload: categories persisted. `select count(*) from email_log where created_at > now() - interval '10 minutes' and template = 'registration_shortlisted'` → **0**.
  3. Finalise → confirm → notice "2 teams emailed". SQL: one `registration_shortlisted` row per member email of A and B, none for C/D.
  4. Attendance lists A and B only. Finalise button shows (0) and is disabled.
  5. Move C to Shortlist → Finalise (1) → only C's members queued.
  6. Mark A present on attendance; on Review move A to Waiting list → warning shows → Confirm. A gone from attendance; `select attended, shortlisted_at, checkin_method from registrations where id = '<A>'` → `false, null, null`.
  7. Participants page shows badges; CSV has `Category`.
  8. A seats event: `/admin/events/<seats-id>/shortlist` redirects to its registrations; its registrations page unchanged.
- [ ] **Step 3: Clean up** — delete the test event's registrations, `email_log` rows, and the event via MCP `execute_sql` (scoped by the ids noted).
- [ ] **Step 4: STATUS.md** — add a dated entry at the top: shortlist review shipped; migration `registration_shortlist_decision` APPLIED LIVE; the three states; attendance = finalised only; Finalise race-safe + >50 recipients queue to Outbox; `shortlistAction`/`unshortlistAction` removed.
- [ ] **Step 5: Commit** — `git add docs/STATUS.md && git commit -m "docs(status): shortlist review shipped"`. Deploy only when the user asks.
