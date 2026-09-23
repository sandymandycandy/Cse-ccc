# Registrations Team Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wide registrations table with a compact team list + detail card, and record per-person attendance (present by default, untick absentees) that certificates and the CSV export follow.

**Architecture:** One additive column `registrations.absent_members smallint[]` holds the team positions (index into `teamOf()`, leader = 0) that did not attend; `attended` keeps meaning "the team showed up". A pure helper owns every invariant; a small server-only lib does the DB I/O; the page builds plain serialisable entries for a client board that marks via server actions with `useOptimistic`.

**Tech Stack:** Next.js 16 App Router (server actions, `revalidatePath`), React 19 (`useOptimistic`, `useTransition`), Supabase (service-role admin client), Vitest + `react-dom/server` static rendering, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-23-registrations-team-attendance-design.md`

## Global Constraints

- Work on branch `feat/registrations-team-attendance` (main auto-deploys to production). Do not push or merge without the owner's go-ahead.
- Files are **LF-only**; never rewrite files through Python text mode or tools that convert line endings.
- Migration is additive: `absent_members smallint[] not null default '{}'`, **no backfill**. Apply to the live DB (Supabase project `jisahccdnthzgibszwnq`) only after the owner confirms, and **before** the code is deployed.
- Do not run `npm run types:gen` (it truncates `database.types.ts`); edit the generated types by hand or via the Supabase MCP `generate_typescript_types`.
- Invariants (one place: `src/lib/admin/team-attendance.ts`): `attended=false ⇒ absent=[]`; all positions absent ⇒ `attended=false, absent=[]`; out-of-range positions dropped; solo events never write `absent_members`.
- Authorisation for every write: `canManageEvent(session, "manage:registrations", ev.hosts)` + `isAttendanceEligible`. Every write is audited.
- Supabase errors in new code **throw** (matches `454f244`).
- Style with existing tokens (`--ink-*`, `--forest`, `--rust`, `--line`, `--paper*`) in `src/app/admin/(app)/admin-workspace.css`; reuse `listbar`, `view-chip`, `abadge`, `btn` classes.
- Gate before hand-off: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm run build`, `git diff --check` all clean.

---

### Task 0: Branch

- [ ] **Step 1:** `git switch -c feat/registrations-team-attendance` (from a clean `main`; the spec + this plan are the only uncommitted files — commit them first on the branch: `git add docs/superpowers && git commit -m "docs: registrations team attendance spec + plan"`).

---

### Task 1: Column, types, row field

**Files:**
- Create: `supabase/migrations/20260923000000_registration_absent_members.sql`
- Modify: `src/lib/database.types.ts` (the `registrations` Row/Insert/Update blocks, ~line 1939)
- Modify: `src/lib/admin/registrations.ts:6-67`

**Interfaces:**
- Produces: `RegistrationRow.absentMembers: number[]` (always an array).

- [ ] **Step 1: Write the migration**

```sql
-- Per-person event attendance. `attended` still means the team (or solo
-- registrant) showed up; this lists the team positions — index into the
-- registration's team as teamOf() reads it, leader = 0 — that did not.
-- Empty = everyone present, so every existing attended row keeps its meaning.
alter table public.registrations
  add column if not exists absent_members smallint[] not null default '{}';
```

- [ ] **Step 2: Add the column to `database.types.ts`** — in `registrations`: `Row` gets `absent_members: number[]`, `Insert` and `Update` get `absent_members?: number[]` (keep alphabetical order with neighbours).

- [ ] **Step 3: Carry it through `listRegistrations`** — add `absent_members` to the select string, `absent_members: number[] | null;` to the cast type, `absentMembers: r.absent_members ?? [],` to the mapper, and to the interface:

```ts
  /** Team positions (leader = 0) marked absent on an attended entry. Empty = all present. */
  absentMembers: number[];
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → clean. (Every `RegistrationRow` literal in tests must gain `absentMembers: []`; fix any the compiler lists.)

- [ ] **Step 5: Commit** — `git add supabase/migrations src/lib/database.types.ts src/lib/admin/registrations.ts && git commit -m "feat(registrations): absent_members column for per-person attendance"`

- [ ] **Step 6: Apply live (owner-confirmed)** — ask the owner, then Supabase MCP `apply_migration` with name `registration_absent_members` and the SQL above. Verify with `execute_sql`: `select column_name, data_type, column_default from information_schema.columns where table_name='registrations' and column_name='absent_members';` → one row, `ARRAY`, `'{}'::smallint[]`.

---

### Task 2: Pure attendance helper

**Files:**
- Create: `src/lib/admin/team-attendance.ts`
- Test: `src/lib/admin/team-attendance.test.ts`

**Interfaces:**
- Produces:
  - `type TeamMark = "unmarked" | "present" | "partial"`
  - `normaliseAbsent(size: number, absent: readonly number[]): number[]` — sorted, unique, in range
  - `teamMark(size: number, attended: boolean, absent: readonly number[]): TeamMark`
  - `presentPositions(size: number, attended: boolean, absent: readonly number[]): number[]`
  - `setPerson(size: number, current: { attended: boolean; absent: readonly number[] }, position: number, present: boolean): { attended: boolean; absent: number[] } | null` — `null` when `position` is out of range
  - `presentOf<T>(people: readonly T[], attended: boolean, absent: readonly number[]): T[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { normaliseAbsent, presentOf, presentPositions, setPerson, teamMark } from "./team-attendance";

describe("team attendance", () => {
  it("reads an attended team with no absentees as everyone present", () => {
    expect(teamMark(4, true, [])).toBe("present");
    expect(presentPositions(4, true, [])).toEqual([0, 1, 2, 3]);
  });

  it("reads absentees as partly present, and an unattended team as unmarked", () => {
    expect(teamMark(4, true, [2])).toBe("partial");
    expect(presentPositions(4, true, [2])).toEqual([0, 1, 3]);
    expect(teamMark(4, false, [])).toBe("unmarked");
    expect(presentPositions(4, false, [1])).toEqual([]);
  });

  it("drops duplicate and out-of-range positions", () => {
    expect(normaliseAbsent(3, [2, 2, 7, -1, 0])).toEqual([0, 2]);
    expect(teamMark(3, true, [9])).toBe("present");
  });

  it("marks one person absent on an attended team", () => {
    expect(setPerson(4, { attended: true, absent: [] }, 2, false)).toEqual({ attended: true, absent: [2] });
  });

  it("marks them back present", () => {
    expect(setPerson(4, { attended: true, absent: [1, 2] }, 2, true)).toEqual({ attended: true, absent: [1] });
  });

  it("marking one person absent on an unmarked team attends it with just that person absent", () => {
    expect(setPerson(4, { attended: false, absent: [] }, 3, false)).toEqual({ attended: true, absent: [3] });
  });

  it("marking one person present on an unmarked team marks everyone present", () => {
    expect(setPerson(4, { attended: false, absent: [] }, 0, true)).toEqual({ attended: true, absent: [] });
  });

  it("collapses a team with everyone absent back to unmarked", () => {
    expect(setPerson(2, { attended: true, absent: [0] }, 1, false)).toEqual({ attended: false, absent: [] });
  });

  it("rejects a position outside the team", () => {
    expect(setPerson(2, { attended: true, absent: [] }, 2, false)).toBeNull();
    expect(setPerson(2, { attended: true, absent: [] }, -1, false)).toBeNull();
  });

  it("treats a solo registrant as a team of one", () => {
    expect(setPerson(1, { attended: false, absent: [] }, 0, true)).toEqual({ attended: true, absent: [] });
    expect(setPerson(1, { attended: true, absent: [] }, 0, false)).toEqual({ attended: false, absent: [] });
  });

  it("filters people to those present", () => {
    expect(presentOf(["a", "b", "c"], true, [1])).toEqual(["a", "c"]);
    expect(presentOf(["a", "b"], false, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/admin/team-attendance.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Per-person event attendance, as one pure rule set shared by the actions, the
 * registrations board, certificates and the CSV export.
 *
 * `attended` means the team (or solo registrant) showed up. `absent` lists the
 * team positions — index into teamOf(), leader = 0 — that did not. Present is
 * the default: an attended team with no absentees is everyone present, which is
 * how every row written before per-person marking reads.
 */
export type TeamMark = "unmarked" | "present" | "partial";

export function normaliseAbsent(size: number, absent: readonly number[]): number[] {
  return [...new Set(absent)]
    .filter((p) => Number.isInteger(p) && p >= 0 && p < size)
    .sort((a, b) => a - b);
}

export function teamMark(size: number, attended: boolean, absent: readonly number[]): TeamMark {
  if (!attended) return "unmarked";
  return normaliseAbsent(size, absent).length > 0 ? "partial" : "present";
}

export function presentPositions(size: number, attended: boolean, absent: readonly number[]): number[] {
  if (!attended) return [];
  const out = new Set(normaliseAbsent(size, absent));
  return Array.from({ length: size }, (_, i) => i).filter((i) => !out.has(i));
}

/** Apply one person's toggle. Null when the position is not on the team. */
export function setPerson(
  size: number,
  current: { attended: boolean; absent: readonly number[] },
  position: number,
  present: boolean,
): { attended: boolean; absent: number[] } | null {
  if (!Number.isInteger(position) || position < 0 || position >= size) return null;
  const base = current.attended ? normaliseAbsent(size, current.absent) : [];
  const absent = present ? base.filter((p) => p !== position) : normaliseAbsent(size, [...base, position]);
  // Nobody came → the team did not attend.
  if (absent.length >= size) return { attended: false, absent: [] };
  return { attended: true, absent };
}

export function presentOf<T>(people: readonly T[], attended: boolean, absent: readonly number[]): T[] {
  const keep = new Set(presentPositions(people.length, attended, absent));
  return people.filter((_, i) => keep.has(i));
}
```

- [ ] **Step 4: Run** — same command → PASS (11 tests).

- [ ] **Step 5: Commit** — `git add src/lib/admin/team-attendance.* && git commit -m "feat(registrations): pure per-person attendance rules"`

---

### Task 3: Member attendance action (and full-team clears absentees)

**Files:**
- Create: `src/lib/admin/registration-attendance.ts`
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts:22-71` (+ new action appended)
- Test: `src/lib/admin/registration-attendance.test.ts`

**Interfaces:**
- Consumes: `setPerson` (Task 2), `teamOf` from `@/lib/certificates/fields`, `getEventFormSchema`, `isAttendanceEligible`.
- Produces:
  - lib: `getRegistrationForMarking(eventId: string, registrationId: string): Promise<MarkingRow | null>`, `writeRegistrationAttendance(input: { eventId: string; registrationId: string; attended: boolean; absent: number[]; actorId: string; stampCheckIn: boolean }): Promise<void>`, `type MarkingRow = RegistrationForFields & { attended: boolean; absent: number[]; shortlistedAt: string | null }`
  - action: `setMemberAttendanceAction(input: { eventId: string; registrationId: string; position: number; present: boolean }): Promise<MemberAttendanceResult>` where `type MemberAttendanceResult = { ok: true; attended: boolean; absent: number[] } | { ok: false; error: string }`
  - `toggleAttendanceAction` also writes `absent_members: []` (both directions).

- [ ] **Step 1: Write the lib** (`registration-attendance.ts`)

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RegistrationForFields } from "@/lib/certificates/fields";

export type MarkingRow = RegistrationForFields & {
  attended: boolean;
  absent: number[];
  shortlistedAt: string | null;
};

/** One registration, scoped to its event, with what marking needs. */
export async function getRegistrationForMarking(eventId: string, registrationId: string): Promise<MarkingRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("student_name, roll_no, department, year, email, phone, team_name, custom_answers, attended, absent_members, shortlisted_at")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.student_name ?? "",
    roll: data.roll_no ?? "",
    department: data.department,
    year: data.year,
    email: data.email ?? "",
    phone: data.phone,
    teamName: data.team_name ?? null,
    customAnswers: (data.custom_answers as Record<string, unknown> | null) ?? null,
    attended: data.attended,
    absent: data.absent_members ?? [],
    shortlistedAt: data.shortlisted_at ?? null,
  };
}

/** Persist a team's attendance. Check-in stamps move only when `attended` flips. */
export async function writeRegistrationAttendance(input: {
  eventId: string;
  registrationId: string;
  attended: boolean;
  absent: number[];
  actorId: string;
  stampCheckIn: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("registrations")
    .update({
      attended: input.attended,
      absent_members: input.absent,
      ...(input.stampCheckIn
        ? {
            checked_in_at: input.attended ? new Date().toISOString() : null,
            checked_in_by: input.attended ? input.actorId : null,
            checkin_method: input.attended ? "manual" : null,
          }
        : {}),
    })
    .eq("id", input.registrationId)
    .eq("event_id", input.eventId);
  if (error) throw error;
}
```

- [ ] **Step 2: Write the failing action tests** (`registration-attendance.test.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), event: vi.fn(), manage: vi.fn(), schema: vi.fn(),
  row: vi.fn(), write: vi.fn(), audit: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/admin/event-hosts", () => ({ canManageEvent: mocks.manage }));
vi.mock("@/lib/admin/attendance", () => ({ getEventForAttendance: mocks.event }));
vi.mock("@/lib/admin/registrations", () => ({ getEventFormSchema: mocks.schema }));
vi.mock("@/lib/admin/registration-attendance", () => ({
  getRegistrationForMarking: mocks.row, writeRegistrationAttendance: mocks.write,
}));
vi.mock("@/lib/admin/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/email", () => ({ enqueueEmail: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      // toggleAttendanceAction reads shortlisted_at before marking present…
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { shortlisted_at: null } }) }) }) }),
      // …then writes the row.
      update: (v: unknown) => { mocks.update(v); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
    }),
  }),
}));

import { setMemberAttendanceAction, toggleAttendanceAction } from "@/app/admin/(app)/events/[id]/registrations/actions";

const eventId = "10000000-0000-4000-8000-000000000001";
const registrationId = "10000000-0000-4000-8000-000000000002";
const teamSchema = [{ id: "team", kind: "team", label: "Team", maxMembers: 3, members: [{ key: "n", kind: "short_text", label: "Name" }] }];
const row = (over = {}) => ({
  name: "Leader", roll: "L1", department: null, year: null, email: "l@x.in", phone: null, teamName: "Owls",
  customAnswers: { team: [{ n: "Asha" }, { n: "Ravi" }] }, attended: true, absent: [], shortlistedAt: null, ...over,
});
const call = (position: number, present: boolean) => setMemberAttendanceAction({ eventId, registrationId, position, present });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "admin" });
  mocks.event.mockResolvedValue({ hosts: [] });
  mocks.manage.mockReturnValue(true);
  mocks.schema.mockResolvedValue({ schema: teamSchema, selectionMode: "seats" });
  mocks.row.mockResolvedValue(row());
});

describe("per-person attendance action", () => {
  it("marks one member absent on an attended team and audits it", async () => {
    await expect(call(2, false)).resolves.toEqual({ ok: true, attended: true, absent: [2] });
    expect(mocks.write).toHaveBeenCalledWith({ eventId, registrationId, attended: true, absent: [2], actorId: "admin", stampCheckIn: false });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "attend_member", entity: "registration", entityId: registrationId,
      after: { position: 2, name: "Ravi", present: false },
    }));
  });

  it("attends an unmarked team and stamps the check-in", async () => {
    mocks.row.mockResolvedValue(row({ attended: false }));
    await expect(call(1, false)).resolves.toEqual({ ok: true, attended: true, absent: [1] });
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ attended: true, stampCheckIn: true }));
  });

  it("rejects a position outside the team without writing", async () => {
    await expect(call(3, false)).resolves.toEqual({ ok: false, error: expect.any(String) });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("refuses an unshortlisted row on a shortlist event", async () => {
    mocks.schema.mockResolvedValue({ schema: teamSchema, selectionMode: "shortlist" });
    await expect(call(0, true)).resolves.toMatchObject({ ok: false });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("refuses a viewer who cannot manage the event", async () => {
    mocks.manage.mockReturnValue(false);
    await expect(call(0, true)).resolves.toMatchObject({ ok: false });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("marking the full team present clears absentees", async () => {
    const f = new FormData();
    f.set("registrationId", registrationId); f.set("eventId", eventId); f.set("attend", "1");
    await toggleAttendanceAction(f);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ attended: true, absent_members: [] }));
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run src/lib/admin/registration-attendance.test.ts` → FAIL (`setMemberAttendanceAction` not exported).

- [ ] **Step 4: Implement in `actions.ts`**

In `toggleAttendanceAction`'s `.update({...})`, add `absent_members: [],` and check its `error` (`const { error } = await admin...; if (error) throw error;`). Update its doc comment: "Marks or clears the whole team; either way every per-person absence is cleared." Then append:

```ts
export type MemberAttendanceResult =
  | { ok: true; attended: boolean; absent: number[] }
  | { ok: false; error: string };

/**
 * One person on a team, present or absent (spec 2026-09-23). Present is the
 * default, so this records exceptions; the rules live in team-attendance.ts.
 */
export async function setMemberAttendanceAction(input: {
  eventId: string;
  registrationId: string;
  position: number;
  present: boolean;
}): Promise<MemberAttendanceResult> {
  const denied = { ok: false as const, error: "You can't mark attendance for this entry." };
  const session = await getAdminSession();
  if (!session) return denied;
  if (!uuid.safeParse(input.eventId).success || !uuid.safeParse(input.registrationId).success) return denied;

  const ev = await getEventForAttendance(input.eventId);
  if (!ev || !canManageEvent(session, "manage:registrations", ev.hosts)) return denied;

  const [{ schema, selectionMode }, reg] = await Promise.all([
    getEventFormSchema(input.eventId),
    getRegistrationForMarking(input.eventId, input.registrationId),
  ]);
  if (!reg || !isAttendanceEligible(reg, selectionMode)) return denied;

  const team = teamOf(reg, schema);
  const people = team.length > 0 ? team.map((p) => p.name || p.roll) : [reg.name];
  const next = setPerson(people.length, { attended: reg.attended, absent: reg.absent }, input.position, input.present);
  if (!next) return { ok: false, error: "Could not save — refresh and try again." };

  // Solo entries never carry per-person absences.
  const absent = team.length > 0 ? next.absent : [];
  await writeRegistrationAttendance({
    eventId: input.eventId,
    registrationId: input.registrationId,
    attended: next.attended,
    absent,
    actorId: session.id,
    stampCheckIn: next.attended !== reg.attended,
  });
  await writeAudit({
    actorId: session.id,
    action: "attend_member",
    entity: "registration",
    entityId: input.registrationId,
    after: { position: input.position, name: people[input.position], present: input.present },
  });
  revalidatePath(`/admin/events/${input.eventId}/registrations`);
  return { ok: true, attended: next.attended, absent };
}
```

Imports to add: `import { teamOf } from "@/lib/certificates/fields";`, `import { setPerson } from "@/lib/admin/team-attendance";`, `import { getRegistrationForMarking, writeRegistrationAttendance } from "@/lib/admin/registration-attendance";`. Confirm `writeAudit`'s entry type accepts `after` (it does in `attendance/actions.ts`).

- [ ] **Step 5: Run** — same command → PASS (6 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit** — `git add src/lib/admin/registration-attendance.* "src/app/admin/(app)/events/[id]/registrations/actions.ts" && git commit -m "feat(registrations): mark one team member present or absent"`

---

### Task 4: Certificates follow each person

**Files:**
- Modify: `src/lib/admin/certificates.ts:593-635` (participants recipients) and `:920-1015` (`listCertificateEvents`)
- Test: `src/lib/admin/team-attendance.test.ts` (add a certificate-shaped case)

**Interfaces:**
- Consumes: `RegistrationRow.absentMembers` (Task 1), `presentPositions`, `presentOf` (Task 2), `teamOf`.

- [ ] **Step 1: Add the failing test** (append to `team-attendance.test.ts`) — pins the recipient rule the certificates loop uses:

```ts
  it("skips an absent leader but keeps their present teammates (certificate rule)", () => {
    const team = [{ name: "Lead", isLeader: true }, { name: "Asha", isLeader: false }, { name: "Ravi", isLeader: false }];
    const present = presentOf(team, true, [0, 2]);
    expect(present.some((p) => p.isLeader)).toBe(false);
    expect(present.map((p) => p.name)).toEqual(["Asha"]);
  });
```

Run `npx vitest run src/lib/admin/team-attendance.test.ts` → PASS (the rule already holds; this pins it before wiring).

- [ ] **Step 2: Recipients loop** — inside `for (const registration of registrations.filter((r) => r.attended))`:

```ts
      const team = teamOf(registration, event.schema);
      // Per-person attendance: leader is position 0; solo entries have no team.
      const present = presentOf(team, true, registration.absentMembers);
      const leaderPresent = team.length === 0 || present.some((p) => p.isLeader);
```

Wrap the existing `taken.add(key); out.push({ ...kind: "registration"... })` in `if (leaderPresent) { ... }`, and change the member loop to `for (const member of present.filter((p) => !p.isLeader))`. `teamLabel` still derives from `team.length` (unchanged). `deliverTo: member.email ?? leaderEmail` is unchanged — delivery address only.

- [ ] **Step 3: Counts in `listCertificateEvents`** — replace the first `selectAll` (`select("event_id")`) with one that loads what counting needs, and delete the separate `teamRegistrations` query:

```ts
    selectAll<{ event_id: string | null; custom_answers: Json | null; absent_members: number[] | null }>((from, to) =>
      admin.from("registrations").select("event_id, custom_answers, absent_members").eq("attended", true).range(from, to),
    ),
```

Keep the first loop only adding `eventIds` (drop its `attendedPerEvent` increment). After `schemas` is built, replace the `membersPerEvent` loop with:

```ts
  // Everyone present on each attended entry: the registrant alone on a solo
  // event, otherwise the team minus its per-person absences.
  const presentPerEvent = new Map<string, number>();
  for (const row of attendedRows) {
    if (!row.event_id) continue;
    const schema = schemas.get(row.event_id) ?? [];
    // `teamOf` drops people with neither name nor roll, so the stub leader needs
    // a name to keep position 0 — absences are indexed with the leader included.
    const team = schema.length
      ? teamOf(
          { name: "leader", roll: "", department: null, year: null, email: "", phone: null, teamName: null, customAnswers: row.custom_answers as Record<string, unknown> | null },
          schema,
        )
      : [];
    const size = team.length || 1;
    const n = presentPositions(size, true, team.length > 0 ? row.absent_members ?? [] : []).length;
    presentPerEvent.set(row.event_id, (presentPerEvent.get(row.event_id) ?? 0) + n);
  }
```

and `people: (presentPerEvent.get(e.id) ?? 0) + (sheetPerEvent.get(e.id) ?? 0),`. Remove the now-unused `attendedPerEvent` / `membersPerEvent` and the deleted `teamRegistrations` from the destructuring. Old count = 1 + members; new count with no absentees = `team.length` (leader + members) — identical, so existing hub numbers do not move.

- [ ] **Step 4: Import** `presentOf, presentPositions` from `./team-attendance`. Run `npx tsc --noEmit && npx vitest run src/lib/admin src/lib/certificates` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/admin/certificates.ts src/lib/admin/team-attendance.test.ts && git commit -m "feat(certificates): skip team members marked absent"`

---

### Task 5: CSV export

**Files:**
- Modify: `src/app/api/admin/registrations/export/route.ts:30-55`
- Modify: `src/lib/admin/team-attendance.ts` (+ `attendanceCell`, `absentNames`)
- Test: `src/lib/admin/team-attendance.test.ts`

**Interfaces:**
- Produces: `attendanceCell(size: number, attended: boolean, absent: readonly number[]): "yes" | "partial" | "no"`, `absentNames(people: readonly { name: string; roll: string }[], attended: boolean, absent: readonly number[]): string`

- [ ] **Step 1: Failing tests** (append)

```ts
  it("formats the export cells", () => {
    expect(attendanceCell(3, true, [])).toBe("yes");
    expect(attendanceCell(3, true, [1])).toBe("partial");
    expect(attendanceCell(3, false, [])).toBe("no");
    const people = [{ name: "Lead", roll: "L1" }, { name: "Asha", roll: "A2" }, { name: "", roll: "R3" }];
    expect(absentNames(people, true, [1, 2])).toBe("Asha (A2); R3");
    expect(absentNames(people, false, [1])).toBe("");
  });
```

Run → FAIL (not exported).

- [ ] **Step 2: Implement** (append to `team-attendance.ts`)

```ts
export function attendanceCell(size: number, attended: boolean, absent: readonly number[]): "yes" | "partial" | "no" {
  const mark = teamMark(size, attended, absent);
  return mark === "present" ? "yes" : mark === "partial" ? "partial" : "no";
}

export function absentNames(
  people: readonly { name: string; roll: string }[],
  attended: boolean,
  absent: readonly number[],
): string {
  if (!attended) return "";
  return normaliseAbsent(people.length, absent)
    .map((i) => {
      const { name, roll } = people[i];
      return name && roll ? `${name} (${roll})` : name || roll;
    })
    .join("; ");
}
```

Run → PASS.

- [ ] **Step 3: Wire the route** — import `teamOf` and the two helpers; add header `"Absent members"` right after `"Attended"`; in the row mapper:

```ts
  const rows = regs.map((r) => {
    const team = teamOf(r, schema);
    const size = team.length || 1;
    return [
      /* …existing cells up to confirmed… */
      attendanceCell(size, r.attended, r.absentMembers),
      absentNames(team, r.attended, r.absentMembers),
      /* …method, shortlisted, answer columns unchanged… */
    ];
  });
```

(`schema` is already loaded in the route for `answerColumns`; reuse it.)

- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run src/lib/admin/team-attendance.test.ts` → clean/PASS.

- [ ] **Step 5: Commit** — `git add src/app/api/admin/registrations/export/route.ts src/lib/admin/team-attendance.* && git commit -m "feat(export): per-person attendance columns"`

---

### Task 6: Registrations board + detail card

**Files:**
- Create: `src/components/admin/RegistrationsBoard.tsx` (client)
- Create: `src/components/admin/RegistrationCard.tsx` (client)
- Modify: `src/app/admin/(app)/admin-workspace.css` (append `regboard-*` / `regcard-*`)
- Test: `src/components/admin/RegistrationsBoard.test.tsx`

**Interfaces:**
- Consumes: `teamMark`, `presentPositions`, `setPerson` (Task 2); `setMemberAttendanceAction`, `MemberAttendanceResult`, `toggleAttendanceAction` (Task 3); `matchesAny` from `@/lib/admin/roster-filter`.
- Produces (types exported from `RegistrationsBoard.tsx`):

```ts
export interface BoardPerson {
  position: number;
  name: string;
  role: "Leader" | "Member" | null;   // null on solo events
  roll: string;
  deptYear: string;                   // "CSE · 3" or ""
  email: string | null;
  phone: string | null;
}
export interface BoardAnswer { label: string; value: string; href: string | null }
export interface BoardEntry {
  id: string;
  title: string;          // team name, else leader/registrant name
  leader: string | null;  // null on solo events
  people: BoardPerson[];  // solo: exactly the registrant
  attended: boolean;
  absent: number[];
  eligible: boolean;
  answers: BoardAnswer[];
  search: unknown[];      // name, team, roll, email, phone, customAnswers
}
export type BoardView = "All" | "Not marked" | "Present" | "Partly present";
export function filterEntries(entries: BoardEntry[], query: string, view: BoardView): BoardEntry[];
export function viewCounts(entries: BoardEntry[]): Record<BoardView, number>;
export function RegistrationsBoard(props: {
  eventId: string;
  entries: BoardEntry[];
  canEdit: boolean;
  isTeamEvent: boolean;
  /** Per-row node at the start of the row (shortlist checkbox), keyed by entry id.
   *  A record, not a function: it crosses the server→client boundary. */
  rowLead?: Record<string, ReactNode>;
  /** Per-row node after the mark action (shortlisted badge / undo), keyed by id. */
  rowTail?: Record<string, ReactNode>;
}): JSX.Element;
```

- [ ] **Step 1: Failing tests**

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationsBoard, filterEntries, viewCounts, type BoardEntry } from "./RegistrationsBoard";
import { RegistrationCard } from "./RegistrationCard";

vi.mock("@/app/admin/(app)/events/[id]/registrations/actions", () => ({
  setMemberAttendanceAction: vi.fn(), toggleAttendanceAction: vi.fn(),
}));

const entry = (over: Partial<BoardEntry> = {}): BoardEntry => ({
  id: "r1", title: "Owls", leader: "Lead", attended: false, absent: [], eligible: true,
  people: [
    { position: 0, name: "Lead", role: "Leader", roll: "L1", deptYear: "CSE · 3", email: "l@x.in", phone: null },
    { position: 1, name: "Asha", role: "Member", roll: "A2", deptYear: "", email: null, phone: null },
  ],
  answers: [{ label: "Project", value: "Drone", href: null }],
  search: ["Lead", "Owls", "L1", { team: [{ n: "Asha", r: "A2" }] }],
  ...over,
});

describe("registrations board", () => {
  it("counts each view", () => {
    const rows = [entry(), entry({ id: "r2", attended: true }), entry({ id: "r3", attended: true, absent: [1] })];
    expect(viewCounts(rows)).toEqual({ All: 3, "Not marked": 1, Present: 1, "Partly present": 1 });
    expect(filterEntries(rows, "", "Partly present").map((r) => r.id)).toEqual(["r3"]);
  });

  it("finds a team by a member's roll number", () => {
    expect(filterEntries([entry(), entry({ id: "r2", search: ["Other"] })], "a2", "All").map((r) => r.id)).toEqual(["r1"]);
  });

  it("renders compact rows with team, leader, head-count and the full-team action", () => {
    const html = renderToStaticMarkup(<RegistrationsBoard eventId="e" entries={[entry({ attended: true, absent: [1] })]} canEdit isTeamEvent />);
    expect(html).toContain("Owls");
    expect(html).toContain("Lead");
    expect(html).toContain("2 people · 1 present");
    expect(html).toContain("Partly present");
    expect(html).toContain("Undo");
    expect(html).not.toContain("Project"); // answers live in the card, not the row
  });

  it("offers Mark full team present on an unmarked team, and hides it for viewers", () => {
    expect(renderToStaticMarkup(<RegistrationsBoard eventId="e" entries={[entry()]} canEdit isTeamEvent />)).toContain("Mark full team present");
    expect(renderToStaticMarkup(<RegistrationsBoard eventId="e" entries={[entry()]} canEdit={false} isTeamEvent />)).not.toContain("Mark full team present");
  });

  it("card lists every person with a switch, then the answers", () => {
    const html = renderToStaticMarkup(
      <RegistrationCard eventId="e" entry={entry({ attended: true, absent: [1] })} canEdit onClose={() => {}} onMark={() => {}} pending={false} error="" />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Asha");
    expect(html).toContain("A2");
    expect(html).toMatch(/aria-label="Asha absent" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Lead present" aria-pressed="true"/);
    expect(html).toContain("Drone");
  });

  it("card presses nothing on an unmarked team", () => {
    const html = renderToStaticMarkup(
      <RegistrationCard eventId="e" entry={entry()} canEdit onClose={() => {}} onMark={() => {}} pending={false} error="" />,
    );
    expect(html).not.toContain('aria-pressed="true"');
  });
});
```

Run `npx vitest run src/components/admin/RegistrationsBoard.test.tsx` → FAIL (modules missing).

- [ ] **Step 2: Implement `RegistrationCard.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { teamMark, presentPositions } from "@/lib/admin/team-attendance";
import type { BoardEntry } from "./RegistrationsBoard";

const BADGE = { unmarked: ["Not marked", "abadge"], present: ["Present", "abadge abadge-approved"], partial: ["Partly present", "abadge abadge-pending"] } as const;

export function RegistrationCard({ entry, canEdit, onClose, onMark, pending, error }: {
  eventId: string;
  entry: BoardEntry;
  canEdit: boolean;
  onClose: () => void;
  onMark: (position: number, present: boolean) => void;
  pending: boolean;
  error: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const size = entry.people.length;
  const mark = teamMark(size, entry.attended, entry.absent);
  const present = new Set(presentPositions(size, entry.attended, entry.absent));
  const [badgeText, badgeClass] = BADGE[mark];
  const writable = canEdit && entry.eligible;

  return (
    <>
      <div className="regcard-backdrop" onClick={onClose} aria-hidden />
      <section className="regcard" role="dialog" aria-modal="true" aria-labelledby={`regcard-${entry.id}`}>
        <header className="regcard-head">
          <div>
            <h2 id={`regcard-${entry.id}`}>{entry.title}</h2>
            {entry.leader ? <p className="hint">Led by {entry.leader}</p> : null}
          </div>
          <span className={badgeClass}>{badgeText}</span>
          <button ref={closeRef} type="button" className="regcard-close" aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="regcard-body">
          <h3 className="label">People</h3>
          {mark === "unmarked" && writable ? <p className="hint">Not marked yet. Marking anyone counts the rest of the team as present.</p> : null}
          <ul className="regcard-people">
            {entry.people.map((p) => {
              const on = present.has(p.position);
              return (
                <li key={p.position}>
                  <div className="regcard-person">
                    <strong>{p.name || p.roll}</strong>
                    {p.role ? <span className="label">{p.role}</span> : null}
                    <span className="hint">{[p.roll, p.deptYear, p.email, p.phone].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="regcard-toggle" role="group" aria-label={`${p.name || p.roll} attendance`}>
                    {([true, false] as const).map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        aria-label={`${p.name || p.roll} ${value ? "present" : "absent"}`}
                        aria-pressed={mark !== "unmarked" && on === value}
                        data-kind={value ? "present" : "absent"}
                        disabled={!writable || pending}
                        onClick={() => onMark(p.position, value)}
                      >
                        {value ? "Present" : "Absent"}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {error ? <p role="alert" className="regcard-error">{error}</p> : null}

          {entry.answers.length > 0 ? (
            <>
              <h3 className="label">Answers</h3>
              <dl className="regcard-answers">
                {entry.answers.map((a) => (
                  <div key={a.label}>
                    <dt>{a.label}</dt>
                    <dd>{a.href ? <a href={a.href} target="_blank" rel="noopener noreferrer">link ↗</a> : a.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
```

Each person gets a Present / Absent pair. On an unmarked team neither is pressed (spec); pressing **Absent** attends the team with just that person absent, pressing **Present** attends everyone — both via `setPerson`, so no extra logic here.

- [ ] **Step 3: Implement `RegistrationsBoard.tsx`**

```tsx
"use client";

import { useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { matchesAny } from "@/lib/admin/roster-filter";
import { presentPositions, setPerson, teamMark } from "@/lib/admin/team-attendance";
import { setMemberAttendanceAction, toggleAttendanceAction } from "@/app/admin/(app)/events/[id]/registrations/actions";
import { RegistrationCard } from "./RegistrationCard";

/* BoardPerson, BoardAnswer, BoardEntry, BoardView — exactly as in Interfaces above */

const VIEWS: BoardView[] = ["All", "Not marked", "Present", "Partly present"];
const markOf = (e: BoardEntry) => teamMark(e.people.length, e.attended, e.absent);
const VIEW_MARK = { "Not marked": "unmarked", Present: "present", "Partly present": "partial" } as const;

export function filterEntries(entries: BoardEntry[], query: string, view: BoardView): BoardEntry[] {
  return entries.filter((e) => (view === "All" || markOf(e) === VIEW_MARK[view]) && matchesAny(e.search, query));
}

export function viewCounts(entries: BoardEntry[]): Record<BoardView, number> {
  const out = { All: entries.length, "Not marked": 0, Present: 0, "Partly present": 0 };
  for (const e of entries) {
    const m = markOf(e);
    out[m === "unmarked" ? "Not marked" : m === "present" ? "Present" : "Partly present"]++;
  }
  return out;
}

type Patch = { id: string; attended: boolean; absent: number[] };

export function RegistrationsBoard({ eventId, entries, canEdit, isTeamEvent, rowLead, rowTail }: {
  eventId: string; entries: BoardEntry[]; canEdit: boolean; isTeamEvent: boolean;
  rowLead?: Record<string, ReactNode>; rowTail?: Record<string, ReactNode>;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<BoardView>("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [shown, applyPatch] = useOptimistic(entries, (rows: BoardEntry[], p: Patch) =>
    rows.map((r) => (r.id === p.id ? { ...r, attended: p.attended, absent: p.absent } : r)));

  const counts = viewCounts(shown);
  const rows = filterEntries(shown, q, view);
  const open = shown.find((e) => e.id === openId) ?? null;

  function markTeam(e: BoardEntry, attend: boolean) {
    setError("");
    startTransition(async () => {
      applyPatch({ id: e.id, attended: attend, absent: [] });
      const f = new FormData();
      f.set("registrationId", e.id); f.set("eventId", eventId); f.set("attend", attend ? "1" : "0");
      try { await toggleAttendanceAction(f); } catch { setError("Could not save — refresh and try again."); }
    });
  }

  function markPerson(e: BoardEntry, position: number, present: boolean) {
    const next = setPerson(e.people.length, e, position, present);
    if (!next) return;
    setError("");
    startTransition(async () => {
      applyPatch({ id: e.id, ...next });
      try {
        const res = await setMemberAttendanceAction({ eventId, registrationId: e.id, position, present });
        if (!res.ok) setError(res.error);
      } catch { setError("Could not save — refresh and try again."); }
    });
  }

  function close() {
    const id = openId;
    setOpenId(null);
    setError("");
    if (id) rowRefs.current.get(id)?.focus();
  }

  const noun = isTeamEvent ? "team" : "registration";
  return (
    <>
      <div className="listbar">
        <div className="listbar-row">
          <div className="listbar-search">
            <span aria-hidden="true"><Search size={17} /></span>
            <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={isTeamEvent ? "Search team, leader, member, roll…" : "Search name, roll, email, any answer…"}
              aria-label={`Search ${noun}s by any detail`} />
            {q ? <button type="button" className="listbar-clear" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button> : null}
          </div>
          <div className="view-chips">
            {VIEWS.map((v) => (
              <button key={v} type="button" className="view-chip" aria-pressed={view === v} onClick={() => setView(v)}>
                {v}<span>{counts[v]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="listbar-meta"><p className="count-note" aria-live="polite">Showing {rows.length} of {shown.length} {noun}s</p></div>
      </div>

      {rows.length === 0 ? (
        <div className="table-empty"><h2>No matching {noun}s</h2><button type="button" className="btn btn-ghost" onClick={() => { setQ(""); setView("All"); }}>Clear filters</button></div>
      ) : (
        <ul className="regboard" aria-label={`${noun}s`}>
          {rows.map((e) => {
            const size = e.people.length;
            const m = markOf(e);
            const here = presentPositions(size, e.attended, e.absent).length;
            return (
              <li key={e.id} className="regboard-row" data-mark={m}>
                {rowLead?.[e.id]}
                <button type="button" className="regboard-open" ref={(el) => { if (el) rowRefs.current.set(e.id, el); }} onClick={() => setOpenId(e.id)}>
                  <strong>{e.title}</strong>
                  {e.leader ? <span className="hint">Leader · {e.leader}</span> : null}
                </button>
                <span className="regboard-count">
                  {isTeamEvent ? `${size} ${size === 1 ? "person" : "people"} · ${here} present` : m === "unmarked" ? "" : "Present"}
                </span>
                <span className={m === "present" ? "abadge abadge-approved" : m === "partial" ? "abadge abadge-pending" : "abadge"}>
                  {m === "present" ? "Present" : m === "partial" ? "Partly present" : "Not marked"}
                </span>
                {canEdit && e.eligible ? (
                  <button type="button" className={`btn btn-sm ${e.attended ? "btn-ghost" : "btn-accent"}`} disabled={pending} onClick={() => markTeam(e, !e.attended)}>
                    {e.attended ? "Undo" : isTeamEvent ? "Mark full team present" : "Mark present"}
                  </button>
                ) : <span />}
                {rowTail?.[e.id]}
              </li>
            );
          })}
        </ul>
      )}
      {error && !open ? <p role="alert" className="regcard-error">{error}</p> : null}

      {open ? (
        <RegistrationCard eventId={eventId} entry={open} canEdit={canEdit} onClose={close} pending={pending} error={error}
          onMark={(position, present) => markPerson(open, position, present)} />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: CSS** — append to `admin-workspace.css`:

```css
/* Registrations board: one compact row per team, details in a card. */
.regboard { list-style: none; margin: 12px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
.regboard-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto auto auto; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); }
.regboard-row:first-child { border-top: 0; }
.regboard-open { all: unset; cursor: pointer; display: grid; gap: 2px; min-width: 0; }
.regboard-open strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.regboard-open:focus-visible { outline: 2px solid var(--forest); outline-offset: 4px; border-radius: 4px; }
.regboard-count { color: var(--ink-3); font-size: 13px; white-space: nowrap; }
@media (max-width: 720px) {
  .regboard-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .regboard-count { grid-column: 2; }
  .regboard-row > .btn { grid-column: 1 / -1; }
}
.regcard-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .35); z-index: 60; }
.regcard { position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: auto; background: var(--paper); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 24px 60px rgb(0 0 0 / .25); }
.regcard-head { position: sticky; top: 0; display: flex; gap: 12px; align-items: start; padding: 18px 20px; background: var(--paper); border-bottom: 1px solid var(--line); }
.regcard-head > div { flex: 1; min-width: 0; }
.regcard-head h2 { margin: 0; font-size: 20px; }
.regcard-close { all: unset; cursor: pointer; padding: 6px; border-radius: 8px; }
.regcard-close:focus-visible { outline: 2px solid var(--forest); }
.regcard-body { padding: 16px 20px 22px; display: grid; gap: 12px; }
.regcard-people { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.regcard-people li { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
.regcard-person { display: grid; gap: 2px; min-width: 0; }
.regcard-person .hint { overflow-wrap: anywhere; }
.regcard-toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; flex: none; }
.regcard-toggle button { padding: 6px 12px; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 13px; cursor: pointer; }
.regcard-toggle button + button { border-left: 1px solid var(--line); }
.regcard-toggle button[data-kind="present"][aria-pressed="true"] { background: var(--forest); color: var(--paper); }
.regcard-toggle button[data-kind="absent"][aria-pressed="true"] { background: var(--rust); color: var(--paper); }
.regcard-toggle button:focus-visible { outline: 2px solid var(--forest); outline-offset: -2px; }
.regcard-toggle button:disabled { opacity: .55; cursor: default; }
.regcard-error { color: var(--rust); margin: 8px 0 0; }
.regcard-answers { margin: 0; display: grid; gap: 10px; }
.regcard-answers dt { color: var(--ink-3); font-size: 12px; }
.regcard-answers dd { margin: 2px 0 0; overflow-wrap: anywhere; }
```

Check `abadge-pending` exists (`grep -n "abadge-" src/app/globals.css src/app/admin -r`); if not, use the amber class the codebase already has for pending states.

- [ ] **Step 5: Run** — `npx vitest run src/components/admin/RegistrationsBoard.test.tsx` → PASS (6 tests); `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit** — `git add src/components/admin/Registration* "src/app/admin/(app)/admin-workspace.css" && git commit -m "feat(registrations): team board with per-person attendance card"`

---

### Task 7: Page uses the board

**Files:**
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx`

**Interfaces:**
- Consumes: `RegistrationsBoard`, `BoardEntry` (Task 6); `teamOf`; `answerColumns`; `presentPositions` (Task 2).

- [ ] **Step 1: Build entries** — replace the `SearchableTable` block (keep the header, shortlist form, waitlist section). Add, before `return`:

```tsx
  const teamIds = schema.filter((f) => f.kind === "team").map((f) => f.id);
  const answerCols = columns.filter((c) => !teamIds.some((id) => c.key.startsWith(`${id}.`)));
  const deptYear = (d: string | null, y: string | number | null) => [d, y].filter((v) => v != null && v !== "").join(" · ");

  const entries: BoardEntry[] = rows.map((r) => {
    const team = teamOf(r, schema);
    const people = team.length > 0
      ? team.map((p, position) => ({
          position, name: p.name, role: p.isLeader ? ("Leader" as const) : ("Member" as const),
          roll: p.roll, deptYear: deptYear(p.department, p.year), email: p.email, phone: p.phone,
        }))
      : [{ position: 0, name: r.name, role: null, roll: r.roll, deptYear: deptYear(r.department, r.year), email: r.email || null, phone: r.phone }];
    return {
      id: r.id,
      title: (hasTeam && r.teamName?.trim()) || r.name || r.roll || "Registrant",
      leader: hasTeam ? r.name : null,
      people,
      attended: r.attended,
      absent: r.absentMembers,
      eligible: isAttendanceEligible(r, selectionMode),
      answers: answerCols.map((c) => {
        const value = c.get(r.customAnswers);
        return { label: c.label, value, href: c.kind === "link" && isSafeHttpUrl(value) ? value : null };
      }),
      search: [r.name, r.teamName, r.roll, r.department, r.year, r.email, r.phone, r.customAnswers],
    };
  });
  const peoplePresent = entries.reduce((n, e) => n + presentPositions(e.people.length, e.attended, e.absent).length, 0);
```

- [ ] **Step 2: Header line** (seats mode) — `${confirmedRows.length} ${hasTeam ? "teams" : "registered"} · ${peoplePresent} ${peoplePresent === 1 ? "person" : "people"} present${waitlist…}`; shortlist wording unchanged.

- [ ] **Step 3: Render the board** in place of `<SearchableTable …/>`:

```tsx
          <RegistrationsBoard
            eventId={id}
            entries={entries}
            canEdit={canEdit}
            isTeamEvent={hasTeam}
            rowLead={isShortlist && canEdit ? Object.fromEntries(rows.map((r) => [r.id,
              <input key="sel" type="checkbox" name="selected" form="shortlist-form" value={r.id} aria-label={`Select ${r.name || r.roll || "registrant"}`} />])) : undefined}
            rowTail={isShortlist ? Object.fromEntries(rows.map((r) => [r.id, r.shortlistedAt ? (
              <span key="sl" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <span className="abadge abadge-approved">Shortlisted</span>
                {canEdit ? (
                  <form action={unshortlistAction} style={{ display: "inline" }}>
                    <input type="hidden" name="registrationId" value={r.id} />
                    <input type="hidden" name="eventId" value={id} />
                    <button type="submit" className="btn btn-sm btn-ghost">Undo</button>
                  </form>
                ) : null}
              </span>
            ) : null])) : undefined}
          />
```

Remove now-unused imports (`SearchableTable`, `toggleAttendanceAction`) and the `teamSize` helper; add `teamOf`, `presentPositions`, `RegistrationsBoard`, `type BoardEntry`.

- [ ] **Step 4:** `npx tsc --noEmit && npx eslint "src/app/admin/(app)/events" src/components/admin` → clean. `npx vitest run` → all pass.

- [ ] **Step 5: Commit** — `git add "src/app/admin/(app)/events/[id]/registrations/page.tsx" && git commit -m "feat(registrations): page renders the team board"`

---

### Task 8: Verify in the browser, gate, STATUS

- [ ] **Step 1: Gate** — `git diff --check main... && npx tsc --noEmit && npx eslint src && npx vitest run && npm run build` → all clean. Record the test count.
- [ ] **Step 2: Browser (needs the migration applied, Task 1 Step 6)** — `npm run dev`, sign in, open `/admin/events/4f6a6f19-7435-4c14-947f-fdce1cfec8d1/registrations` at desktop and 390px: rows compact, search by a member's roll finds the team, chips count correctly, card opens/closes (Esc, backdrop, ✕) and returns focus. **Do not click mark buttons on live data without the owner's go-ahead** — the dev server talks to the production DB.
- [ ] **Step 3: STATUS.md** — add a START HERE entry (built on branch, migration state, behaviour: present-by-default, certificates skip absentees, export columns, issued certs not revoked).
- [ ] **Step 4: Commit** — `git commit -am "docs(status): registrations team attendance"`; then hand back to the owner for merge/push.
