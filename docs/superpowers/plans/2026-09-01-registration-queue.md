# Scheduled Registration + Waiting Room + Manual Waitlist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organisers schedule when event registration opens (with a public countdown), give the open-time rush a "holding your place" waiting-room submit instead of raw errors, and turn the overflow into a manually-promotable waitlist.

**Architecture:** Keep the existing per-event `FOR UPDATE` lock in `register_for_event` as the single serialization point (no new queue infra). Fold the waitlist into `registrations` as `confirmed_at IS NULL` rows carrying a `waitlist_position`. Surface the already-existing `registration_opens_at`/`registration_closes_at` columns in the admin form and on the public page; the RPC gains a `not_open` status so the client knows when to keep waiting vs. stop.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Supabase Postgres (service-role RPC via `@supabase/supabase-js`), vitest, Zod. IST time model throughout.

**Spec:** `docs/superpowers/specs/2026-09-01-registration-queue-design.md`

## Global Constraints

- **Times are IST (UTC+5:30, no DST).** Convert `datetime-local` inputs with `istLocalToUTC` (store UTC ISO); render back with `istLocalInput`. Both in `src/lib/datetime.ts`.
- **Never oversell.** All seat/waitlist assignment stays inside the RPC's `select … for update` block. Do not add a second write path.
- **`CreateSchema` in `events/actions.ts` is `.strict()`** — any new form field must be declared there or the parse rejects the whole form.
- **Public seat count counts `confirmed_at IS NOT NULL` only** (`get_registration_counts`) — waitlisted rows must have `confirmed_at = NULL` so "X/60" stays correct. Do not change that RPC.
- **Server actions & routes:** service-role writes only, Zod-validated, `writeAudit` on mutations, own-club scoped via `canManage(session, capability, clubId)`, and scope every registration write to `event_id` **and** row id (the `shortlistAction` IDOR lesson).
- **Migrations are additive** and applied to the shared/live DB via Supabase MCP `apply_migration` (project id `svkbleeibbrjryeovvjw`). File them under `supabase/migrations/` with the exact names below.
- **Test command:** `npm test` (vitest run) or `npx vitest run <path>`. `npm run typecheck` / `npm run lint` / `npm run build` for the gate.
- **Commit** after each task with a green gate for that task.

---

### Task 1: Migration — `registrations.waitlist_position`

**Files:**
- Create: `supabase/migrations/20260901000000_registration_waitlist_position.sql`

**Interfaces:**
- Produces: a nullable `registrations.waitlist_position int` column and a partial index; consumed by Task 2 (RPC) and Task 8 (admin list).

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Waitlist folded into registrations: an unconfirmed row (confirmed_at IS NULL)
-- carrying a per-event queue position. Additive; safe on live prod (nullable).
-- ============================================================================
alter table public.registrations
  add column if not exists waitlist_position int;

-- Order the waitlist for an event; only unconfirmed rows carry a position.
create index if not exists registrations_waitlist_idx
  on public.registrations (event_id, waitlist_position)
  where confirmed_at is null and waitlist_position is not null;
```

- [ ] **Step 2: Apply to the live DB**

Use Supabase MCP `apply_migration` with name `registration_waitlist_position` and the SQL above.

- [ ] **Step 3: Verify via probe**

Use Supabase MCP `execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='registrations' and column_name='waitlist_position';
```
Expected: one row, `integer`, `YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260901000000_registration_waitlist_position.sql
git commit -m "feat(db): add registrations.waitlist_position for the folded waitlist"
```

---

### Task 2: Migration — `register_for_event` revision (`not_open` split + waitlist-as-registration)

**Files:**
- Create: `supabase/migrations/20260901010000_register_for_event_waitlist.sql`

**Interfaces:**
- Consumes: `registrations.waitlist_position` (Task 1).
- Produces: `register_for_event(uuid,text,text,text,text,text,int,jsonb)` returning `(status text, registration_id uuid)`, where `status ∈ {no_event, closed, not_open, duplicate, submitted, registered, waitlisted, full}`. The `waitlisted`/`registered` row id lets callers read back `waitlist_position`. Consumed by Task 7 (route).

- [ ] **Step 1: Write the migration** (full function — `create or replace`, same signature as v2)

```sql
-- ============================================================================
-- register_for_event — split "not yet open" (not_open) from "closed", and make
-- the waitlist an unconfirmed registration row with a per-event position
-- (replacing the write to the legacy public.waitlist table). Same jsonb
-- signature as v2; seat award still under the per-event FOR UPDATE lock.
-- ============================================================================
create or replace function public.register_for_event(
  p_event_id       uuid,
  p_student_name   text  default null,
  p_roll_no        text  default null,
  p_email          text  default null,
  p_phone          text  default null,
  p_department     text  default null,
  p_year           int   default null,
  p_custom_answers jsonb default null
)
returns table (status text, registration_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_occupied int;
  v_existing uuid;
  v_new_id   uuid;
  v_pos      int;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    status := 'no_event'; registration_id := null; return next; return;
  end if;

  if v_event.approval_status <> 'approved' or v_event.status <> 'published' then
    status := 'closed'; registration_id := null; return next; return;
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    status := 'not_open'; registration_id := null; return next; return;
  end if;
  if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    status := 'closed'; registration_id := null; return next; return;
  end if;

  -- dedup: roll if present, else email if present (covers confirmed + waitlisted)
  if p_roll_no is not null then
    select id into v_existing from public.registrations
     where event_id = p_event_id and roll_no = p_roll_no;
  elsif p_email is not null then
    select id into v_existing from public.registrations
     where event_id = p_event_id and email = p_email;
  end if;
  if v_existing is not null then
    status := 'duplicate'; registration_id := v_existing; return next; return;
  end if;

  -- shortlist mode: accept everyone, no capacity check
  if v_event.selection_mode = 'shortlist' then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, confirmed_at)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, now())
    returning id into v_new_id;
    status := 'submitted'; registration_id := v_new_id; return next; return;
  end if;

  -- seats mode: capacity check on confirmed rows
  select count(*) into v_occupied from public.registrations
   where event_id = p_event_id and confirmed_at is not null;

  if v_event.capacity is null or v_occupied < v_event.capacity then
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, confirmed_at)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, now())
    returning id into v_new_id;
    status := 'registered'; registration_id := v_new_id; return next; return;

  elsif v_event.waitlist_enabled then
    -- waitlist = unconfirmed registration with the next per-event position
    select coalesce(max(waitlist_position), 0) + 1 into v_pos
      from public.registrations
      where event_id = p_event_id and confirmed_at is null;
    insert into public.registrations
      (event_id, student_name, roll_no, email, phone, department, year, custom_answers, confirmed_at, waitlist_position)
    values
      (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year, p_custom_answers, null, v_pos)
    returning id into v_new_id;
    status := 'waitlisted'; registration_id := v_new_id; return next; return;

  else
    status := 'full'; registration_id := null; return next; return;
  end if;
end;
$$;

revoke execute on function public.register_for_event(uuid,text,text,text,text,text,int,jsonb) from public, anon, authenticated;
grant  execute on function public.register_for_event(uuid,text,text,text,text,text,int,jsonb) to service_role;
```

- [ ] **Step 2: Apply to the live DB**

Supabase MCP `apply_migration`, name `register_for_event_waitlist`, SQL above.

- [ ] **Step 3: Verify via probe**

Supabase MCP `execute_sql`:
```sql
select pg_get_function_identity_arguments(oid) as args
from pg_proc where proname = 'register_for_event';
```
Expected: still shows the `…, p_custom_answers jsonb` overload (and the legacy text overload if the drop is still held). No error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260901010000_register_for_event_waitlist.sql
git commit -m "feat(db): register_for_event splits not_open, waitlists as unconfirmed rows"
```

---

### Task 3: Pure countdown helper

**Files:**
- Create: `src/lib/registration/countdown.ts`
- Test: `src/lib/registration/countdown.test.ts`

**Interfaces:**
- Produces: `formatCountdown(msLeft: number): { days: number; hours: number; minutes: number; seconds: number; done: boolean }` and `countdownLabel(parts): string`. Consumed by Task 6 (`RegistrationCountdown`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatCountdown, countdownLabel } from "./countdown";

describe("formatCountdown", () => {
  it("breaks a duration into d/h/m/s", () => {
    const ms = (((2 * 24 + 4) * 60 + 12) * 60 + 5) * 1000; // 2d 4h 12m 5s
    expect(formatCountdown(ms)).toEqual({ days: 2, hours: 4, minutes: 12, seconds: 5, done: false });
  });
  it("clamps to zero and marks done at/below 0", () => {
    expect(formatCountdown(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
    expect(formatCountdown(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
  it("rounds sub-second remainders down to whole seconds", () => {
    expect(formatCountdown(1999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1, done: false });
  });
});

describe("countdownLabel", () => {
  it("drops leading zero units but keeps trailing ones", () => {
    expect(countdownLabel(formatCountdown(65_000))).toBe("1m 05s");
    expect(countdownLabel(formatCountdown(3_600_000))).toBe("1h 00m 00s");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/registration/countdown.test.ts`
Expected: FAIL — "Cannot find module './countdown'".

- [ ] **Step 3: Write minimal implementation**

```ts
export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Break a remaining-milliseconds value into whole d/h/m/s (floored), clamped at 0. */
export function formatCountdown(msLeft: number): CountdownParts {
  if (msLeft <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const totalSeconds = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, done: false };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2d 04h 12m 05s", dropping only the leading zero units. */
export function countdownLabel(p: CountdownParts): string {
  const parts: string[] = [];
  if (p.days > 0) parts.push(`${p.days}d`);
  if (parts.length || p.hours > 0) parts.push(`${p.hours > 0 || parts.length ? pad(p.hours) : p.hours}h`);
  if (parts.length || p.minutes > 0) parts.push(`${parts.length ? pad(p.minutes) : p.minutes}m`);
  parts.push(`${parts.length ? pad(p.seconds) : p.seconds}s`);
  return parts.join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/registration/countdown.test.ts`
Expected: PASS (all cases). If `countdownLabel` mismatches, adjust padding so `65_000 → "1m 05s"` and `3_600_000 → "1h 00m 00s"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration/countdown.ts src/lib/registration/countdown.test.ts
git commit -m "feat(registration): pure countdown formatter"
```

---

### Task 4: Pure waiting-room retry helper

**Files:**
- Create: `src/lib/registration/retry.ts`
- Test: `src/lib/registration/retry.test.ts`

**Interfaces:**
- Produces:
  - `shouldRetry(outcome: RetryOutcome): boolean`
  - `nextDelay(attempt: number, retryAfterSeconds?: number): number`
  - `MAX_ATTEMPTS: number`
  - types `RetryOutcome = { kind: "http"; status: number } | { kind: "network" } | { kind: "status"; status: string }`
- Consumed by Task 7 (`RegisterForm` submit loop).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { shouldRetry, nextDelay, MAX_ATTEMPTS } from "./retry";

describe("shouldRetry", () => {
  it("retries transient transport failures", () => {
    expect(shouldRetry({ kind: "http", status: 429 })).toBe(true);
    expect(shouldRetry({ kind: "http", status: 503 })).toBe(true);
    expect(shouldRetry({ kind: "network" })).toBe(true);
  });
  it("retries a not_open body (clock skew — opening imminently)", () => {
    expect(shouldRetry({ kind: "status", status: "not_open" })).toBe(true);
  });
  it("stops on terminal outcomes", () => {
    for (const s of ["registered", "submitted", "waitlisted", "duplicate", "full", "closed"]) {
      expect(shouldRetry({ kind: "status", status: s })).toBe(false);
    }
    expect(shouldRetry({ kind: "http", status: 400 })).toBe(false);
    expect(shouldRetry({ kind: "http", status: 404 })).toBe(false);
  });
});

describe("nextDelay", () => {
  it("honors Retry-After (seconds → ms) when given", () => {
    expect(nextDelay(1, 3)).toBe(3000);
  });
  it("grows with attempt and stays within a jittered cap band", () => {
    const d0 = nextDelay(0);
    const d3 = nextDelay(3);
    expect(d0).toBeGreaterThanOrEqual(400);
    expect(d0).toBeLessThanOrEqual(400 + 400); // base + max jitter
    expect(d3).toBeGreaterThan(d0);
    expect(nextDelay(99)).toBeLessThanOrEqual(4000 + 400); // capped + jitter
  });
  it("exposes a sane attempt ceiling", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/registration/retry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RetryOutcome =
  | { kind: "http"; status: number }
  | { kind: "network" }
  | { kind: "status"; status: string };

export const MAX_ATTEMPTS = 8;
const BASE_MS = 400;
const CAP_MS = 4000;
const JITTER_MS = 400;

/** Retry only transient outcomes; every terminal registration result stops the loop. */
export function shouldRetry(outcome: RetryOutcome): boolean {
  if (outcome.kind === "network") return true;
  if (outcome.kind === "http") return outcome.status === 429 || outcome.status === 503;
  return outcome.status === "not_open";
}

/** Capped exponential backoff with additive jitter; Retry-After (s) wins when present. */
export function nextDelay(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return Math.round(retryAfterSeconds * 1000);
  }
  const backoff = Math.min(CAP_MS, BASE_MS * 2 ** attempt);
  return backoff + Math.floor(Math.random() * JITTER_MS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/registration/retry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration/retry.ts src/lib/registration/retry.test.ts
git commit -m "feat(registration): pure waiting-room retry policy"
```

---

### Task 5: Admin — schedule + waitlist toggle in the event form

**Files:**
- Create: `src/lib/registration/schedule.ts`
- Test: `src/lib/registration/schedule.test.ts`
- Modify: `src/app/admin/(app)/events/actions.ts` (CreateSchema, parseEvent, create insert, update object + validation)
- Modify: `src/components/admin/EventForm.tsx` (EventFormInitial + three inputs)
- Modify: `src/lib/admin/queries.ts` (`getEventForEdit`: select + row type + return)
- Modify: `src/app/admin/(app)/events/[id]/edit/page.tsx` (pass new initial fields)

**Interfaces:**
- Consumes: `istLocalToUTC`, `istLocalInput` (`src/lib/datetime.ts`).
- Produces: `parseSchedule(opensLocal, closesLocal, startsAtUTC): { ok: true; opensAt: string | null; closesAt: string | null } | { ok: false; error: string }`; `EventFormInitial` gains `registrationOpensAtLocal: string`, `registrationClosesAtLocal: string`, `waitlistEnabled: boolean`.

- [ ] **Step 1: Write the failing test for `parseSchedule`**

```ts
import { describe, it, expect } from "vitest";
import { parseSchedule } from "./schedule";

const START = "2026-09-05T10:00:00.000Z"; // event start (UTC)

describe("parseSchedule", () => {
  it("returns nulls when both fields are empty", () => {
    expect(parseSchedule("", "", START)).toEqual({ ok: true, opensAt: null, closesAt: null });
  });
  it("converts IST wall-clock inputs to UTC instants", () => {
    const r = parseSchedule("2026-09-01T17:00", "2026-09-03T17:00", START);
    expect(r).toEqual({ ok: true, opensAt: "2026-09-01T11:30:00.000Z", closesAt: "2026-09-03T11:30:00.000Z" });
  });
  it("rejects opens after closes", () => {
    const r = parseSchedule("2026-09-03T17:00", "2026-09-01T17:00", START);
    expect(r.ok).toBe(false);
  });
  it("rejects opens after the event starts", () => {
    const r = parseSchedule("2026-09-06T17:00", "", START); // opens after Sep 5 start
    expect(r.ok).toBe(false);
  });
  it("rejects a malformed datetime", () => {
    expect(parseSchedule("not-a-date", "", START).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/registration/schedule.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parseSchedule`**

```ts
import { istLocalToUTC } from "@/lib/datetime";

type Ok = { ok: true; opensAt: string | null; closesAt: string | null };
type Err = { ok: false; error: string };

/** Validate + convert the two IST datetime-local schedule inputs to UTC ISO (or null). */
export function parseSchedule(
  opensLocal: string,
  closesLocal: string,
  startsAtUTC: string,
): Ok | Err {
  const opensAt = opensLocal ? istLocalToUTC(opensLocal) : null;
  const closesAt = closesLocal ? istLocalToUTC(closesLocal) : null;
  if (opensLocal && !opensAt) return { ok: false, error: "Enter a valid registration open time." };
  if (closesLocal && !closesAt) return { ok: false, error: "Enter a valid registration close time." };
  if (opensAt && closesAt && new Date(opensAt) > new Date(closesAt)) {
    return { ok: false, error: "Registration must open before it closes." };
  }
  if (opensAt && new Date(opensAt) > new Date(startsAtUTC)) {
    return { ok: false, error: "Registration should open before the event starts." };
  }
  return { ok: true, opensAt, closesAt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/registration/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `events/actions.ts`**

In `CreateSchema` add (keep `.strict()`):
```ts
    registrationOpensAt: z.string().optional(),
    registrationClosesAt: z.string().optional(),
    waitlistEnabled: z.coerce.boolean().optional(),
```
In `parseEvent`, add:
```ts
    registrationOpensAt: formData.get("registrationOpensAt") || undefined,
    registrationClosesAt: formData.get("registrationClosesAt") || undefined,
    waitlistEnabled: formData.get("waitlistEnabled") === "on",
```
In `createEventAction`, after `startsAt`/`endsAt` are computed and validated, add:
```ts
import { parseSchedule } from "@/lib/registration/schedule";
// …
const sched = parseSchedule(
  parsed.data.registrationOpensAt ?? "",
  parsed.data.registrationClosesAt ?? "",
  startsAt,
);
if (!sched.ok) return { error: sched.error };
```
Add to the insert object:
```ts
    registration_opens_at: sched.opensAt,
    registration_closes_at: sched.closesAt,
    waitlist_enabled: parsed.data.waitlistEnabled ?? true,
```
In `updateEventAction`, compute `sched` the same way (after `startsAt`/`endsAt`), guard, and add to the `update` object (extend its inline type with the three fields):
```ts
    registration_opens_at: sched.opensAt,
    registration_closes_at: sched.closesAt,
    waitlist_enabled: parsed.data.waitlistEnabled ?? true,
```

- [ ] **Step 6: Add the three inputs to `EventForm.tsx`**

Extend `EventFormInitial`:
```ts
  registrationOpensAtLocal: string;
  registrationClosesAtLocal: string;
  waitlistEnabled: boolean;
```
After the Capacity field, add:
```tsx
      <div className="grid-2">
        <div className="field">
          <label htmlFor="registrationOpensAt">Registration opens (IST) — optional</label>
          <input id="registrationOpensAt" name="registrationOpensAt" type="datetime-local"
            defaultValue={initial?.registrationOpensAtLocal} />
          <span className="hint">Leave blank to open immediately. Students see a countdown until then.</span>
        </div>
        <div className="field">
          <label htmlFor="registrationClosesAt">Registration closes (IST) — optional</label>
          <input id="registrationClosesAt" name="registrationClosesAt" type="datetime-local"
            defaultValue={initial?.registrationClosesAtLocal} />
        </div>
      </div>
      <div className="field">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" name="waitlistEnabled" defaultChecked={initial ? initial.waitlistEnabled : true} />
          Allow a waitlist when the seats fill
        </label>
        <span className="hint">Extra students join a waitlist you can promote from on the registrations page.</span>
      </div>
```
(Use the same `grid-2` wrapper the Starts/Ends row uses; if that row uses a different class, match it.)

- [ ] **Step 7: Return the new fields from `getEventForEdit`**

In `src/lib/admin/queries.ts`, add `registration_opens_at, registration_closes_at, waitlist_enabled` to the `getEventForEdit` select string and its inline row type, add to the `EventForEdit` interface:
```ts
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  waitlistEnabled: boolean;
```
and to the returned object:
```ts
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    waitlistEnabled: row.waitlist_enabled ?? true,
```

- [ ] **Step 8: Bridge them in the edit page**

In `src/app/admin/(app)/events/[id]/edit/page.tsx`, extend the `initial={{ … }}` object:
```tsx
          registrationOpensAtLocal: event.registrationOpensAt ? istLocalInput(event.registrationOpensAt) : "",
          registrationClosesAtLocal: event.registrationClosesAt ? istLocalInput(event.registrationClosesAt) : "",
          waitlistEnabled: event.waitlistEnabled,
```

- [ ] **Step 9: Gate**

Run: `npm run typecheck && npx vitest run src/lib/registration/schedule.test.ts && npm run lint`
Expected: typecheck clean, schedule test PASS, lint clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/registration/schedule.ts src/lib/registration/schedule.test.ts src/app/admin/\(app\)/events/actions.ts src/components/admin/EventForm.tsx src/lib/admin/queries.ts "src/app/admin/(app)/events/[id]/edit/page.tsx"
git commit -m "feat(events): set registration open/close time + waitlist toggle in the event form"
```

---

### Task 6: Public — registration phase + countdown on the event page

**Files:**
- Create: `src/lib/registration/phase.ts`
- Test: `src/lib/registration/phase.test.ts`
- Create: `src/components/RegistrationCountdown.tsx`
- Modify: `src/lib/queries.ts` (`getEventDetail` + its EVENT-detail select and returned type)
- Modify: `src/app/events/[id]/page.tsx` (branch on phase)

**Interfaces:**
- Consumes: `formatCountdown`/`countdownLabel` (Task 3), `istFullDate`/`istTimeRange` or similar from `src/lib/datetime.ts`.
- Produces: `registrationPhase(nowMs, opensAtISO, closesAtISO): "before" | "open" | "closed"`; `getEventDetail` returns additionally `registrationOpensAt: string | null` and `registrationClosesAt: string | null`.

- [ ] **Step 1: Write the failing test for `registrationPhase`**

```ts
import { describe, it, expect } from "vitest";
import { registrationPhase } from "./phase";

const T = (iso: string) => new Date(iso).getTime();

describe("registrationPhase", () => {
  it("is 'open' when there is no schedule", () => {
    expect(registrationPhase(T("2026-09-01T00:00:00Z"), null, null)).toBe("open");
  });
  it("is 'before' strictly before the open time", () => {
    expect(registrationPhase(T("2026-09-01T10:00:00Z"), "2026-09-01T11:30:00Z", null)).toBe("before");
  });
  it("is 'open' between open and close", () => {
    expect(registrationPhase(T("2026-09-01T12:00:00Z"), "2026-09-01T11:30:00Z", "2026-09-03T11:30:00Z")).toBe("open");
  });
  it("is 'closed' after the close time", () => {
    expect(registrationPhase(T("2026-09-04T00:00:00Z"), "2026-09-01T11:30:00Z", "2026-09-03T11:30:00Z")).toBe("closed");
  });
  it("opens exactly at the open instant (inclusive)", () => {
    expect(registrationPhase(T("2026-09-01T11:30:00Z"), "2026-09-01T11:30:00Z", null)).toBe("open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/registration/phase.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `registrationPhase`**

```ts
export type RegPhase = "before" | "open" | "closed";

/** Pure phase decision for a registration window. `now` and both bounds in ms/ISO. */
export function registrationPhase(
  nowMs: number,
  opensAtISO: string | null,
  closesAtISO: string | null,
): RegPhase {
  if (opensAtISO && nowMs < new Date(opensAtISO).getTime()) return "before";
  if (closesAtISO && nowMs > new Date(closesAtISO).getTime()) return "closed";
  return "open";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/registration/phase.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `getEventDetail`**

In `src/lib/queries.ts`: add `registration_opens_at, registration_closes_at` to the detail query's column select; add `registrationOpensAt`/`registrationClosesAt` (ISO or null) to the returned object and its type. (Search for where `getEventDetail` maps its row — mirror how `capacity`/`selectionMode` are returned.)

- [ ] **Step 6: Build `RegistrationCountdown.tsx`** (client component)

```tsx
"use client";
import { useEffect, useState } from "react";
import { formatCountdown, countdownLabel } from "@/lib/registration/countdown";

export function RegistrationCountdown({ opensAt }: { opensAt: string }) {
  const target = new Date(opensAt).getTime();
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const parts = formatCountdown(target - now);
  if (parts.done) {
    // Reveal the form when the countdown elapses (client-only re-render trigger).
    return <RevealOnOpen />;
  }
  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>Registration opens in</div>
      <div style={{ font: "500 22px var(--mono)", color: "var(--forest)" }}>{countdownLabel(parts)}</div>
    </div>
  );
}

function RevealOnOpen() {
  // Force a full reload once, so the server re-renders in the "open" phase with the form.
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), 500 + Math.floor(Math.random() * 1500));
    return () => clearTimeout(t);
  }, []);
  return <div className="label">Opening now…</div>;
}
```
(The 0.5–2s jittered reload both reveals the form and spreads the herd. `RegisterForm`'s own submit-retry, Task 7, covers the residual clock-skew `not_open`.)

- [ ] **Step 7: Branch the event page on phase**

In `src/app/events/[id]/page.tsx`, replace the sidebar Register block with a phase branch:
```tsx
import { registrationPhase } from "@/lib/registration/phase";
import { RegistrationCountdown } from "@/components/RegistrationCountdown";
// …
const phase = registrationPhase(Date.now(), event.registrationOpensAt, event.registrationClosesAt);
// …in the sidebar, replacing the current "Register" section body:
{phase === "before" && event.registrationOpensAt ? (
  <RegistrationCountdown opensAt={event.registrationOpensAt} />
) : phase === "closed" ? (
  <p className="body-text">Registration for this event has closed.</p>
) : (
  <RegisterForm eventId={event.id} schema={event.registrationForm} isFull={isFull} mode={event.selectionMode} />
)}
```
Keep the existing "Register / Join the waitlist" heading, but only render the form in the `open` branch.

- [ ] **Step 8: Gate**

Run: `npm run typecheck && npx vitest run src/lib/registration/phase.test.ts && npm run lint`
Expected: clean + PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/registration/phase.ts src/lib/registration/phase.test.ts src/components/RegistrationCountdown.tsx src/lib/queries.ts "src/app/events/[id]/page.tsx"
git commit -m "feat(events): public registration countdown + phase-gated form"
```

---

### Task 7: Public — waiting-room submit + route status passthrough

**Files:**
- Modify: `src/app/api/registrations/route.ts` (return `not_open`; include `position`)
- Modify: `src/components/RegisterForm.tsx` (retry loop + waiting-room UI + position message)

**Interfaces:**
- Consumes: `shouldRetry`, `nextDelay`, `MAX_ATTEMPTS` (Task 4); RPC statuses (Task 2).
- Produces: the finished student-facing flow. No new exports.

- [ ] **Step 1: Route — pass `not_open` and the waitlist position**

In `route.ts`, after the RPC call, read the row and branch:
```ts
const row = data?.[0];
const status = row?.status ?? "full";
if (status === "no_event") return Response.json({ error: "Event not found." }, { status: 404 });
if (status === "not_open") return Response.json({ status }, { status: 409 });
if (status === "closed") {
  return Response.json({ status, error: "Registration for this event is closed." }, { status: 409 });
}
if (status === "waitlisted" && row?.registration_id) {
  const { data: pos } = await admin
    .from("registrations")
    .select("waitlist_position")
    .eq("id", row.registration_id)
    .maybeSingle();
  return Response.json({ status, position: pos?.waitlist_position ?? null });
}
return Response.json({ status });
```

- [ ] **Step 2: RegisterForm — extract the POST into a retrying submit**

Add a helper inside the component that performs one POST and classifies the outcome, then loops using the Task 4 policy. Replace the body of `onSubmit`'s try-block:
```tsx
import { shouldRetry, nextDelay, MAX_ATTEMPTS } from "@/lib/registration/retry";
// …
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function submitOnce(payload: unknown): Promise<
  | { done: true; data: Result }
  | { done: false; retryAfter?: number }
> {
  let res: Response;
  try {
    res = await fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { done: false }; // network → retry
  }
  const data = (await res.json().catch(() => ({}))) as Result;
  const outcome = data.status
    ? { kind: "status" as const, status: data.status }
    : { kind: "http" as const, status: res.status };
  if (shouldRetry(outcome)) {
    const ra = Number(res.headers.get("retry-after") ?? "");
    return { done: false, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : undefined };
  }
  return { done: true, data: res.ok ? data : { error: data.error ?? "Something went wrong.", status: data.status, fields: data.fields, position: (data as Result).position } };
}
```
Then in `onSubmit`, set a new `waiting` state and loop:
```tsx
setSubmitting(true);
setWaiting(false);
setResult(null);
const payload = { eventId, answers, website: String(fd.get("website") ?? "") };
let final: Result | null = null;
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const r = await submitOnce(payload);
  if (r.done) { final = r.data; break; }
  setWaiting(true);
  await sleep(nextDelay(attempt, r.retryAfter));
}
setSubmitting(false);
setWaiting(false);
setResult(final ?? { error: "It's very busy right now. Please try again in a moment." });
```

- [ ] **Step 3: RegisterForm — waiting-room panel + position message**

Add `const [waiting, setWaiting] = useState(false);` and, above the form's return (before the terminal-status check), render the panel while waiting:
```tsx
if (waiting) {
  return (
    <div className="stack" style={{ gap: 8, textAlign: "center", padding: "12px 0" }}>
      <div className="label">Holding your place…</div>
      <p className="body-text">You're in line. Hang tight — this can take a moment when a lot of people register at once. Please don't close this tab.</p>
    </div>
  );
}
```
Extend the `Result` type with `position?: number | null`, and in `ResultMessage` show the waitlist position:
```tsx
if (status === "waitlisted") {
  return (
    <div>
      <h3 style={{ fontSize: 22 }}>You&rsquo;re on the waitlist</h3>
      <p className="body-text" style={{ marginTop: 8 }}>
        {typeof position === "number" ? `You're #${position} in line. ` : ""}
        This event is full — the organiser may pull you in if a seat opens up.
      </p>
    </div>
  );
}
```
(Thread `position` from `result` into `ResultMessage` as a prop.)

- [ ] **Step 4: Gate**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/registration/retry.test.ts`
Expected: clean + PASS. (The client loop itself is covered by the Task-4 unit tests over its policy; component behaviour is walkthrough-verified.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/registrations/route.ts src/components/RegisterForm.tsx
git commit -m "feat(registration): waiting-room submit with backoff + waitlist position"
```

---

### Task 8: Admin — waitlist section + manual promote

**Files:**
- Modify: `src/lib/admin/registrations.ts` (`RegistrationRow` + select + map)
- Create: `src/lib/registration/waitlist.ts`
- Test: `src/lib/registration/waitlist.test.ts`
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts` (`promoteWaitlistAction`)
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx` (Waitlist section)

**Interfaces:**
- Consumes: `listRegistrations` rows, `canManage`, `getEventForAttendance`, `enqueueEmail`, `writeAudit`.
- Produces: `splitRegistrations(rows): { confirmed: RegistrationRow[]; waitlist: RegistrationRow[] }`; `promoteWaitlistAction(formData): Promise<void>`.

- [ ] **Step 1: Add `waitlistPosition` to `RegistrationRow`**

In `src/lib/admin/registrations.ts`: add `waitlistPosition: number | null;` to `RegistrationRow`; add `waitlist_position` to the select string and the inline row type; map `waitlistPosition: r.waitlist_position ?? null`.

- [ ] **Step 2: Write the failing test for `splitRegistrations`**

```ts
import { describe, it, expect } from "vitest";
import { splitRegistrations } from "./waitlist";
import type { RegistrationRow } from "@/lib/admin/registrations";

const row = (over: Partial<RegistrationRow>): RegistrationRow => ({
  id: "x", name: "A", roll: "r", department: null, year: null, email: "e",
  phone: null, confirmed: true, attended: false, method: null,
  customAnswers: null, shortlistedAt: null, waitlistPosition: null, ...over,
});

describe("splitRegistrations", () => {
  it("separates confirmed from waitlisted and orders the waitlist by position", () => {
    const rows = [
      row({ id: "c1", confirmed: true }),
      row({ id: "w2", confirmed: false, waitlistPosition: 2 }),
      row({ id: "w1", confirmed: false, waitlistPosition: 1 }),
    ];
    const { confirmed, waitlist } = splitRegistrations(rows);
    expect(confirmed.map((r) => r.id)).toEqual(["c1"]);
    expect(waitlist.map((r) => r.id)).toEqual(["w1", "w2"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/registration/waitlist.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `splitRegistrations`**

```ts
import type { RegistrationRow } from "@/lib/admin/registrations";

/** Partition rows into confirmed vs waitlisted (unconfirmed, ordered by position). */
export function splitRegistrations(rows: RegistrationRow[]): {
  confirmed: RegistrationRow[];
  waitlist: RegistrationRow[];
} {
  const confirmed = rows.filter((r) => r.confirmed);
  const waitlist = rows
    .filter((r) => !r.confirmed && r.waitlistPosition != null)
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
  return { confirmed, waitlist };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/registration/waitlist.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `promoteWaitlistAction`**

In `src/app/admin/(app)/events/[id]/registrations/actions.ts` (mirrors `toggleAttendanceAction`'s guard):
```ts
export async function promoteWaitlistAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  const registrationId = String(formData.get("registrationId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!uuid.safeParse(registrationId).success || !uuid.safeParse(eventId).success) return;

  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) return;

  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("registrations")
    .select("id, email, student_name, confirmed_at")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!reg || reg.confirmed_at) return; // gone or already confirmed

  await admin
    .from("registrations")
    .update({ confirmed_at: new Date().toISOString(), waitlist_position: null })
    .eq("id", registrationId)
    .eq("event_id", eventId);

  if (reg.email) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await enqueueEmail({
      template: "registration_promoted",
      toEmail: reg.email,
      toName: reg.student_name ?? "",
      subject: `A seat opened up — ${ev.title}`,
      payload: { eventTitle: ev.title, url: base ? `${base}/events/${eventId}` : undefined },
      priority: 2,
    });
  }

  await writeAudit({
    actorId: session.id,
    action: "waitlist_promote",
    entity: "registration",
    entityId: registrationId,
  });
  revalidatePath(`/admin/events/${eventId}/registrations`);
}
```
(Confirm `getEventForAttendance`, `canManage`, `createAdminClient`, `enqueueEmail`, `writeAudit`, `revalidatePath`, and `uuid` are already imported in this file — they are used by the existing actions; add none that already exist.)

- [ ] **Step 7: Render the Waitlist section**

In `registrations/page.tsx`: import `splitRegistrations` and `promoteWaitlistAction`. After computing `regs`, derive:
```tsx
const { confirmed: confirmedRows, waitlist: waitlistRows } = splitRegistrations(regs);
```
Render the main table from `confirmedRows` instead of `regs` for seats mode (leave shortlist mode using `regs`, since it has no waitlist). Below the table, when `!isShortlist && waitlistRows.length > 0`, add:
```tsx
<div style={{ marginTop: 28 }}>
  <div className="label" style={{ marginBottom: 8 }}>Waitlist ({waitlistRows.length})</div>
  <div className="tablewrap">
    <table className="admin">
      <thead><tr><th>#</th><th>Name</th><th>Roll</th><th>Dept · Yr</th>{canEdit ? <th>Promote</th> : null}</tr></thead>
      <tbody>
        {waitlistRows.map((r) => (
          <tr key={r.id}>
            <td>{r.waitlistPosition}</td>
            <td style={{ fontWeight: 500 }}>{r.name}</td>
            <td>{r.roll}</td>
            <td>{r.department ?? "—"}{r.year ? ` · ${r.year}` : ""}</td>
            {canEdit ? (
              <td>
                <form action={promoteWaitlistAction}>
                  <input type="hidden" name="registrationId" value={r.id} />
                  <input type="hidden" name="eventId" value={id} />
                  <button type="submit" className="btn btn-sm btn-accent">Promote to registered</button>
                </form>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  <span className="hint">Promoting confirms the student (past capacity if needed) and emails them.</span>
</div>
```
Update the header count line to reflect confirmed vs waitlist if desired (e.g. `${confirmedRows.length} registered · ${waitlistRows.length} waitlisted`).

- [ ] **Step 8: Gate**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/registration/waitlist.test.ts`
Expected: clean + PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/registrations.ts src/lib/registration/waitlist.ts src/lib/registration/waitlist.test.ts "src/app/admin/(app)/events/[id]/registrations/actions.ts" "src/app/admin/(app)/events/[id]/registrations/page.tsx"
git commit -m "feat(registrations): waitlist section with manual promote"
```

---

### Task 9: Full gate + live smoke

**Files:** none (verification only).

- [ ] **Step 1: Whole-suite gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: typecheck ✓, lint ✓, all tests ✓ (prior count + the 4 new suites: countdown, retry, schedule, phase, waitlist), build ✓.

- [ ] **Step 2: Dev-server read/guard smoke**

Start `npm run dev`. Confirm:
- An event with a **future** `registration_opens_at` → `/events/<id>` renders the countdown, **no** form in the DOM.
- `POST /api/registrations` for that event (curl, valid body) → `409 {"status":"not_open"}`, **no** row written.
- An event past `registration_closes_at` → page shows "closed"; POST → `409 {"status":"closed"}`.
- `/admin/events/<id>/registrations` (no cookie) → 307 → login.

- [ ] **Step 3: Record the owed human walkthrough**

Add to `docs/STATUS.md` START-HERE the owed browser walkthrough from the spec (create seats event w/ near-future open time → countdown → register to capacity → waitlist overflow → promote from admin → confirm email queued). Commit:
```bash
git add docs/STATUS.md
git commit -m "docs(status): registration queue feature — owed walkthrough + summary"
```

---

## Self-Review

**Spec coverage:**
- Scheduled open/close time (spec §3) → Task 5. ✓
- Public countdown + phase gating (spec §4) → Task 6. ✓
- Waiting-room submit + `not_open` split + position message (spec §2b, §4) → Tasks 2, 7. ✓
- Waitlist folded into registrations + column/index (spec §1, §2b) → Tasks 1, 2. ✓
- Manual promote from registrations page + email + audit (spec §5) → Task 8. ✓
- Concurrency unchanged / single lock (spec "Concurrency") → preserved in Task 2 (no second write path). ✓
- Security (guards, event-scoped writes, rate-limit-respecting retry) (spec "Security") → Tasks 7, 8. ✓
- Testing (countdown, retry, schedule, phase, waitlist) (spec "Testing") → Tasks 3, 4, 5, 6, 8. ✓
- Migrations additive + applied via MCP (spec "Migrations") → Tasks 1, 2. ✓

**Placeholder scan:** No "TBD"/"handle appropriately"/"similar to" — every code step carries concrete code. Migration filenames concrete. ✓

**Type consistency:** `RegistrationRow.waitlistPosition` defined in Task 8 Step 1 and consumed by `splitRegistrations` (Step 4) and the page (Step 7). `Result.position` added in Task 7 Step 1 (route) and Task 7 Step 3 (form). `parseSchedule`/`registrationPhase`/`formatCountdown`/`shouldRetry`/`nextDelay` signatures match between producer and consumer tasks. RPC statuses (`not_open`, `waitlisted`, …) consistent between Task 2 (producer), Task 7 (route/form consumer), and Task 4 (retry policy). ✓

## Notes for the executor

- The `event_updated` notification in `updateEventAction` currently fires on time/venue/title/desc/capacity changes; you are **not** adding schedule changes to that trigger (a shifted open time need not email confirmed registrants). Leave that block alone.
- Do **not** touch `get_registration_counts` — waitlisted rows are `confirmed_at NULL` and are already excluded.
- The legacy `public.waitlist` table is now unused but **not** dropped in this feature.
- If `grid-2` isn't the class used by the Starts/Ends row in `EventForm.tsx`, match whatever wrapper that row uses so the two schedule inputs sit side by side.
