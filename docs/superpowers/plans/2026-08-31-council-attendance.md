# Council / Leadership Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third, independent attendance surface for the org-wide council/leadership body — its own self-registered roster (6 layer-2 core roles + club heads + vice-heads), onboarded manually, with council meeting sessions marked present/absent by president/VP/tech head.

**Architecture:** Dedicated `council_*` tables reusing the tested pure engine (`summarizeAttendance`, `diffPresence`) and mirroring the club-member admin UI. New `manage:council` capability (pres/VP/tech = all, faculty = read). Join link → pending → manual onboard, exactly like the club-member flow. v1 is admin-side only (no public lookup, no analytics; free-text designation).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Supabase (service-role admin client + MCP for migrations/types), vitest, zod.

**Spec:** `docs/superpowers/specs/2026-08-31-council-attendance-design.md`

## Global Constraints

- **Branch:** `feat/council-attendance` (already created; the spec commit `d60fd85` is on it). Do not commit to `main`.
- **Live/shared DB:** dev and prod share one Supabase project (`svkbleeibbrjryeovvjw`). The **additive** council migration IS applied to the live DB via the Supabase **MCP** `apply_migration` (project convention — additive migrations are safe on the shared DB). Create no stray test rows; delete any you create to verify.
- **Regenerate types via MCP, never the CLI** — `mcp__plugin_supabase_supabase__generate_typescript_types`, write output to `src/lib/database.types.ts` (the CLI truncates it).
- **Server-action POSTs can't be curled** — verify mutations in a browser or via direct DB read; route-handler APIs curl fine.
- **`dangerouslySetInnerHTML` is ESLint-banned.** All writes go through the service-role admin client; council tables are RLS-on with no policies.
- **Verify gate before done:** `npm run typecheck` ✓ / `npm run lint` ✓ / `npm test` ✓ / `npm run build` ✓ — state real output.
- **Test style:** `import { describe, it, expect } from "vitest";`. Run one file with `npx vitest run <path>`.
- **Pure logic is unit-tested; DB-backed layers (data layer, actions, pages) are typecheck + build + walkthrough-verified**, per the project convention.
- **Naming:** council is org-wide — **no `club_id`, no club scope**. Guards use `canManage(session, "manage:council")` for mutations and `canView(session, "manage:council")` for viewing (NOT `canViewClub`, which needs a club id).

---

### Task 1: `manage:council` capability

**Files:**
- Modify: `src/lib/auth/capabilities.ts`
- Test: `src/lib/auth/capabilities.test.ts`

**Interfaces:**
- Produces: the `"manage:council"` capability, grantable via `grantFor`/`canManage`/`canView`. Consumed by Tasks 5–7 (actions, pages, nav).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/auth/capabilities.test.ts`:

```ts
describe("manage:council", () => {
  it("president, VP, and tech head can manage; faculty can only view; heads cannot", () => {
    expect(canManage({ role: "president", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "vice_president", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "tech_head", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "faculty_advisor", clubId: null }, "manage:council")).toBe(false);
    expect(canView({ role: "faculty_advisor", clubId: null }, "manage:council")).toBe(true);
    expect(canManage({ role: "club_head", clubId: "c1" }, "manage:council")).toBe(false);
    expect(canView({ role: "club_head", clubId: "c1" }, "manage:council")).toBe(false);
    expect(canView({ role: "events_head", clubId: null }, "manage:council")).toBe(false);
  });
});
```

(Confirm `canManage`/`canView` are already imported at the top of the test file; add them to the import if not.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth/capabilities.test.ts`
Expected: FAIL — `"manage:council"` is not a valid `Capability` (type error) / grant is `none`.

- [ ] **Step 3: Add the capability**

In `src/lib/auth/capabilities.ts`, add to the `Capability` union (near `manage:members`):

```ts
  | "manage:council" // the council / leadership attendance roster + sessions (org-wide)
```

And add the matrix row (place it right after the `manage:members` entry):

```ts
  // The council / leadership attendance body is org-wide (no club scope), so only
  // all/read/none. Taken by president + VP + tech head; faculty view-only.
  "manage:council": {
    faculty_advisor: "read", president: "all", vice_president: "all", tech_head: "all",
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/auth/capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/capabilities.ts src/lib/auth/capabilities.test.ts
git commit -m "feat(council): add manage:council capability (pres/VP/tech = all)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 2: Migration + regenerate types

**Files:**
- Create: `supabase/migrations/20260831010000_council_attendance.sql`
- Modify: `src/lib/database.types.ts` (regenerated via MCP)

**Interfaces:**
- Produces: live tables `council_members`, `council_attendance_sessions`, `council_attendance`, `council_settings` (seeded singleton), and their TS types. Consumed by Tasks 4–7.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260831010000_council_attendance.sql` with the exact SQL from the spec's "Data model" section (the four `create table` statements incl. the `council_members_roll_unique` partial index, the `council_session_status` enum, the `council_attendance_member` index, the `council_settings` singleton with `check (singleton)` + `unique (singleton)` + the seed insert, and the four `enable row level security` lines).

- [ ] **Step 2: Apply it to the live DB via the Supabase MCP**

Call `mcp__plugin_supabase_supabase__apply_migration` with name `council_attendance` and the file's SQL. (Additive + RLS-on-no-policies — safe on the shared DB; existing code is unaffected.)

- [ ] **Step 3: Verify the tables live**

Call `mcp__plugin_supabase_supabase__execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name like 'council\_%';
select count(*) as settings_rows from public.council_settings;
```
Expected: all four `council_*` tables present; `settings_rows = 1`.

- [ ] **Step 4: Regenerate types**

Call `mcp__plugin_supabase_supabase__generate_typescript_types` and overwrite `src/lib/database.types.ts` with the result. Confirm it now contains `council_members`, `council_attendance_sessions`, `council_attendance`, `council_settings`.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: passes (types now include the council tables).

```bash
git add supabase/migrations/20260831010000_council_attendance.sql src/lib/database.types.ts
git commit -m "feat(council): council attendance tables + regenerated types

Additive migration (applied to the live DB via MCP): council_members,
council_attendance_sessions, council_attendance, council_settings (singleton
join token). RLS on, no policies — service-role only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 3: Council self-register validator

**Files:**
- Create: `src/lib/council/validation.ts`
- Test: `src/lib/council/validation.test.ts`

**Interfaces:**
- Consumes: `ROLL_RE`, `PHONE_RE`, `VELTECH_EMAIL_RE` from `src/lib/roster/validation.ts`.
- Produces: `CouncilRegisterValue { name; roll; email; phone; designation }` and `validateCouncilRegistration(input): { ok: true; value } | { ok: false; errors }`. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/council/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateCouncilRegistration } from "./validation";

const good = {
  name: "Asha Rao", roll: "21001", email: "vtu21001@veltech.edu.in",
  phone: "9876543210", designation: "Robotics Club Head",
};

describe("validateCouncilRegistration", () => {
  it("accepts a well-formed submission", () => {
    const r = validateCouncilRegistration(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.designation).toBe("Robotics Club Head");
  });

  it("requires a designation", () => {
    const r = validateCouncilRegistration({ ...good, designation: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.designation).toBeTruthy();
  });

  it("reuses the roll↔email rule", () => {
    const r = validateCouncilRegistration({ ...good, email: "vtu99999@veltech.edu.in" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });

  it("rejects a bad phone", () => {
    const r = validateCouncilRegistration({ ...good, phone: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/council/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/council/validation.ts`:

```ts
import { ROLL_RE, PHONE_RE, VELTECH_EMAIL_RE } from "@/lib/roster/validation";

export interface CouncilRegisterValue {
  name: string; roll: string; email: string; phone: string; designation: string;
}

/** Self-register validation for a council member. Reuses the roster field rules
 *  (roll/email/phone + the roll↔email match) and adds a required designation. */
export function validateCouncilRegistration(input: {
  name: unknown; roll: unknown; email: unknown; phone: unknown; designation: unknown;
}): { ok: true; value: CouncilRegisterValue } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = String(input.name ?? "").trim();
  const roll = String(input.roll ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = String(input.phone ?? "").trim();
  const designation = String(input.designation ?? "").trim();

  if (name.length < 2 || name.length > 120) errors.name = "Enter your full name.";
  if (!ROLL_RE.test(roll)) errors.roll = "Roll number must be exactly 5 digits.";
  const m = VELTECH_EMAIL_RE.exec(email);
  if (!m) errors.email = "Use your vtuXXXXX@veltech.edu.in email.";
  else if (ROLL_RE.test(roll) && m[1] !== roll) errors.email = "Email digits must match your roll number.";
  if (!PHONE_RE.test(phone)) errors.phone = "Phone must be exactly 10 digits (no +91).";
  if (designation.length < 2 || designation.length > 80)
    errors.designation = "Enter your role (e.g. Robotics Club Head).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, roll, email, phone, designation } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/council/validation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/council/validation.ts src/lib/council/validation.test.ts
git commit -m "feat(council): self-register validator (reuses roster rules + designation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 4: Council data layer

**Files:**
- Create: `src/lib/admin/attendance-council.ts`

**Interfaces:**
- Consumes: `summarizeAttendance` (`./attendance-math`), `diffPresence` (`./attendance-presence`), `createAdminClient`.
- Produces (consumed by Tasks 5–7):
  - `getCouncilByJoinToken(token: string): Promise<{ id: string } | null>`
  - `rotateJoinToken(): Promise<void>`
  - `listMembers(): Promise<CouncilMember[]>` where `CouncilMember = { id; name; rollNo; email; phone; designation; isActive; approvedAt; createdAt }`
  - `getMemberForEdit(id: string): Promise<CouncilMember | null>`
  - `rosterWithPercent(): Promise<{ memberId; name; designation; attended; eligible; pct }[]>`
  - `listSessions(): Promise<CouncilSession[]>` where `CouncilSession = { id; title; status; openedAt; closedAt; sessionDate; startTime; endTime; presentCount }`
  - `createSession(input: { title; sessionDate; startTime; endTime; openedBy }): Promise<string>`
  - `setSessionStatus(sessionId, status: "open"|"closed"): Promise<void>`
  - `getSessionMarking(sessionId): Promise<{ session: CouncilSession; roster: { memberId; name; designation; present: boolean }[] } | null>`
  - `savePresence(sessionId, desiredIds: string[], markedBy: string): Promise<void>`

- [ ] **Step 1: Write the data layer**

Create `src/lib/admin/attendance-council.ts` — mirrors `attendance-club.ts` with **no `club_id`** (single org-wide group), tables `council_*`, and a `designation` field on members:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeAttendance } from "./attendance-math";
import { diffPresence } from "./attendance-presence";

const NO_MARKS: ReadonlySet<string> = new Set();
const SESSION_COLS = "id, title, status, opened_at, closed_at, session_date, start_time, end_time";
const MEMBER_COLS = "id, full_name, roll_no, email, phone, designation, is_active, approved_at, created_at";

export interface CouncilMember {
  id: string; name: string; rollNo: string | null; email: string | null; phone: string | null;
  designation: string; isActive: boolean; approvedAt: string | null; createdAt: string;
}
export interface CouncilSession {
  id: string; title: string; status: "open" | "closed"; openedAt: string; closedAt: string | null;
  sessionDate: string | null; startTime: string | null; endTime: string | null; presentCount: number;
}

interface RawMember {
  id: string; full_name: string; roll_no: string | null; email: string | null; phone: string | null;
  designation: string; is_active: boolean; approved_at: string | null; created_at: string;
}
function mapMember(m: RawMember): CouncilMember {
  return {
    id: m.id, name: m.full_name, rollNo: m.roll_no, email: m.email, phone: m.phone,
    designation: m.designation, isActive: m.is_active, approvedAt: m.approved_at, createdAt: m.created_at,
  };
}

interface RawSession {
  id: string; title: string; status: "open" | "closed"; opened_at: string; closed_at: string | null;
  session_date: string | null; start_time: string | null; end_time: string | null;
}
function mapSession(s: RawSession, presentCount: number): CouncilSession {
  return {
    id: s.id, title: s.title, status: s.status, openedAt: s.opened_at, closedAt: s.closed_at,
    sessionDate: s.session_date, startTime: s.start_time, endTime: s.end_time, presentCount,
  };
}
function sessionDateOf(s: { session_date: string | null; opened_at: string }): string {
  return (s.session_date ?? s.opened_at).slice(0, 10);
}

async function countPresent(sessionId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("council_attendance").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  return count ?? 0;
}

/** Resolve the singleton join token → truthy when it matches, else null. */
export async function getCouncilByJoinToken(token: string): Promise<{ id: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null; // non-uuid → not found (no 500 on a bad literal)
  const admin = createAdminClient();
  const { data } = await admin
    .from("council_settings").select("id").eq("join_token", token).maybeSingle();
  return data ? { id: data.id } : null;
}

export async function rotateJoinToken(): Promise<void> {
  const admin = createAdminClient();
  await admin.from("council_settings").update({ join_token: crypto.randomUUID() }).eq("singleton", true);
}

/** The current join token (for the admin "copy link" control). Ensures the singleton exists. */
export async function getJoinToken(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("council_settings").select("join_token").eq("singleton", true).maybeSingle();
  return data?.join_token ?? null;
}

export async function listMembers(): Promise<CouncilMember[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("council_members").select(MEMBER_COLS).order("full_name");
  return (data ?? []).map(mapMember);
}

export async function getMemberForEdit(id: string): Promise<CouncilMember | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("council_members").select(MEMBER_COLS).eq("id", id).maybeSingle();
  return data ? mapMember(data) : null;
}

export interface CouncilRosterPct {
  memberId: string; name: string; designation: string; attended: number; eligible: number; pct: number;
}
export async function rosterWithPercent(): Promise<CouncilRosterPct[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("council_members").select("id, full_name, designation, created_at")
    .eq("is_active", true).not("approved_at", "is", null).order("full_name");
  const { data: sessions } = await admin
    .from("council_attendance_sessions").select("id, session_date, opened_at");
  const { data: marks } = await admin.from("council_attendance").select("member_id, session_id");

  const sess = (sessions ?? []).map((s) => ({ id: s.id, date: sessionDateOf(s) }));
  const attendedByMember = new Map<string, Set<string>>();
  for (const m of marks ?? []) {
    const set = attendedByMember.get(m.member_id) ?? new Set<string>();
    set.add(m.session_id);
    attendedByMember.set(m.member_id, set);
  }
  return (members ?? []).map((mem) => {
    const { attended, eligible, pct } = summarizeAttendance(
      sess, mem.created_at.slice(0, 10), attendedByMember.get(mem.id) ?? NO_MARKS);
    return { memberId: mem.id, name: mem.full_name, designation: mem.designation, attended, eligible, pct };
  });
}

export async function listSessions(): Promise<CouncilSession[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_attendance_sessions").select(SESSION_COLS)
    .order("session_date", { ascending: false, nullsFirst: false })
    .order("opened_at", { ascending: false }).limit(200);
  if (error) throw error;
  return Promise.all((data ?? []).map(async (s) => mapSession(s, await countPresent(s.id))));
}

export async function createSession(input: {
  title: string; sessionDate: string; startTime: string; endTime: string; openedBy: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("council_attendance_sessions")
    .insert({
      title: input.title, opened_by: input.openedBy,
      session_date: input.sessionDate, start_time: input.startTime, end_time: input.endTime,
    })
    .select("id").single();
  if (error || !data) throw error ?? new Error("session insert failed");
  return data.id;
}

export async function setSessionStatus(sessionId: string, status: "open" | "closed"): Promise<void> {
  const admin = createAdminClient();
  await admin.from("council_attendance_sessions")
    .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
    .eq("id", sessionId);
}

export async function getSessionMarking(
  sessionId: string,
): Promise<{ session: CouncilSession; roster: { memberId: string; name: string; designation: string; present: boolean }[] } | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("council_attendance_sessions").select(SESSION_COLS).eq("id", sessionId).maybeSingle();
  if (!s) return null;
  const { data: marks } = await admin.from("council_attendance").select("member_id").eq("session_id", sessionId);
  const present = new Set((marks ?? []).map((m) => m.member_id));
  const { data: members } = await admin
    .from("council_members").select("id, full_name, designation")
    .eq("is_active", true).not("approved_at", "is", null).order("full_name");
  const roster = (members ?? []).map((m) => ({
    memberId: m.id, name: m.full_name, designation: m.designation, present: present.has(m.id),
  }));
  return { session: mapSession(s, present.size), roster };
}

export async function savePresence(sessionId: string, desiredIds: string[], markedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { data: marks } = await admin.from("council_attendance").select("member_id").eq("session_id", sessionId);
  const current = new Set((marks ?? []).map((m) => m.member_id));
  const { toAdd, toRemove } = diffPresence(current, new Set(desiredIds));
  if (toAdd.length > 0) {
    await admin.from("council_attendance")
      .insert(toAdd.map((memberId) => ({ session_id: sessionId, member_id: memberId, marked_by: markedBy })));
  }
  if (toRemove.length > 0) {
    await admin.from("council_attendance").delete().eq("session_id", sessionId).in("member_id", toRemove);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes — every `council_*` table/column resolves against the regenerated types. (If a column name mismatches, fix here against `database.types.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/attendance-council.ts
git commit -m "feat(council): data layer (roster, sessions, marking) reusing the engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 5: Public self-register (join page + form + register route)

**Files:**
- Create: `src/components/roster/CouncilRegisterForm.tsx`
- Create: `src/app/council/join/[token]/page.tsx`
- Create: `src/app/api/council/register/route.ts`

**Interfaces:**
- Consumes: `getCouncilByJoinToken` (Task 4), `validateCouncilRegistration` (Task 3), `checkMemberSignupLimits` (`@/lib/rate-limit`), `createAdminClient`.
- Produces: the public `/council/join/[token]` surface and `POST /api/council/register`.

- [ ] **Step 1: Council register form**

Create `src/components/roster/CouncilRegisterForm.tsx` by mirroring `src/components/roster/SelfRegisterForm.tsx` with these deltas:
- Add `"designation"` to `FieldKey` (`type FieldKey = "name" | "email" | "roll" | "phone" | "designation"`).
- POST to `"/api/council/register"` (not `/api/roster/register`).
- On success, **do not** redirect to `/attendance` (no public lookup in v1). Instead set a success state and render a confirmation: `"Thanks — you're on the pending list. A council admin will approve you."` (replace the form with this note). Add `const [done, setDone] = useState(false)`; on `res.ok` `setDone(true)`; early-return the confirmation `<div className="note">…</div>` when `done`.
- Add a **Designation** field (place it after Full name), reusing the `.field`/`hint`/`aria` pattern:

```tsx
<div className={rowClass("designation")} style={{ margin: 0 }}>
  <label htmlFor="designation">Your role on the council</label>
  <input
    id="designation" name="designation" required maxLength={80}
    placeholder="e.g. Robotics Club Head / President"
    aria-invalid={!!fieldErrors.designation}
    aria-describedby={describedBy("designation")}
  />
  {hint("designation")}
</div>
```
- Button label: `"Join council roster"`.

- [ ] **Step 2: Join page**

Create `src/app/council/join/[token]/page.tsx` by mirroring `src/app/join/[token]/page.tsx` with these deltas:
- Import `getCouncilByJoinToken` from `@/lib/admin/attendance-council` and `CouncilRegisterForm` from `@/components/roster/CouncilRegisterForm`.
- `const council = await getCouncilByJoinToken(token); if (!council) notFound();`
- No club colour/tagline — use a fixed accent (drop the `--club-accent` custom prop or set it to `var(--forest)`).
- Eyebrow: `"CSE Council"`; heading: `"Join the council roster"`; lead: `"Add your details to join the council attendance roster."`
- STEPS: `["Add your details and submit.", "The president or VP approves you.", "You'll be marked at council meetings."]`
- Render `<CouncilRegisterForm token={token} />`.

- [ ] **Step 3: Register route**

Create `src/app/api/council/register/route.ts` by mirroring `src/app/api/roster/register/route.ts` with these deltas:
- Import `getCouncilByJoinToken` from `@/lib/admin/attendance-council` and `validateCouncilRegistration` from `@/lib/council/validation`.
- Resolve `const council = token ? await getCouncilByJoinToken(token) : null;` → 404 when null.
- Validate with `validateCouncilRegistration({ name, roll, email, phone, designation: form.get("designation") })`.
- Insert into `council_members`:

```ts
  const { error } = await admin.from("council_members").insert({
    full_name: parsed.value.name, roll_no: parsed.value.roll,
    email: parsed.value.email, phone: parsed.value.phone,
    designation: parsed.value.designation, is_active: true, approved_at: null,
  });
```
- Keep the 300 KB cap, the `checkMemberSignupLimits({ ip, roll })` rate-limit, the 23505 → 409 "already registered", and the `{ ok: true, roll }` success shape.

- [ ] **Step 4: Typecheck, lint, build, route smoke**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; the routes `/council/join/[token]` and `/api/council/register` appear in the manifest.

Route smoke (needs `npm run dev` in another shell; skip if unavailable — build proves compilation):
- `GET /council/join/not-a-uuid` → 404.
- `POST /api/council/register` with an empty body → 400 with `fields` (no DB write).
- `POST /api/council/register` with a valid body but a bogus token → 404.

- [ ] **Step 5: Commit**

```bash
git add src/components/roster/CouncilRegisterForm.tsx "src/app/council/join/[token]/page.tsx" src/app/api/council/register/route.ts
git commit -m "feat(council): public join link + self-register (pending)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 6: Admin roster management (members pages + actions + nav)

**Files:**
- Create: `src/app/admin/(app)/council/actions.ts`
- Create: `src/components/admin/CouncilMemberForm.tsx`
- Create: `src/app/admin/(app)/council/members/page.tsx`
- Create: `src/app/admin/(app)/council/members/new/page.tsx`
- Create: `src/app/admin/(app)/council/members/[id]/edit/page.tsx`
- Modify: `src/app/admin/(app)/layout.tsx` (nav entry)

**Note:** the club `MemberForm` (`sort` + `clubId`, no `designation`) and `SessionRoster` (imports the club actions directly) are club-coupled, so the council gets its own `CouncilMemberForm` here and `CouncilSessionRoster` in Task 7 rather than reusing them.

**Interfaces:**
- Consumes: Task 4 data layer, `canManage`/`canView` (`manage:council`), `writeAudit`, `getAdminSession`/`requireViewPage`, `MemberFormState` (`@/lib/admin/form-state`).
- Produces: the member-management actions consumed by the pages in this task and Task 7.

- [ ] **Step 1: Council actions (member half + token + session half)**

Create `src/app/admin/(app)/council/actions.ts` by mirroring `src/app/admin/(app)/attendance/actions.ts` with these deltas (this file holds BOTH the member actions used here AND the session actions used in Task 7):
- **Drop all club scoping** — no `resolveOwningClub`, no `clubId` field; every guard is `canManage(session, "manage:council")` (no club arg). Redirect targets are `/admin/council/members` (member actions) and `/admin/council` / `/admin/council/sessions/<id>` (session actions).
- Data-layer imports come from `@/lib/admin/attendance-council`; member reads use its `getMemberForEdit`.
- **MemberSchema:** `{ name, rollNo, email(optional), phone, designation: z.string().trim().min(2).max(80), isActive }` — no `sort`, no `clubId`, no `role`.
- `createMemberAction` inserts into `council_members`: `{ full_name, roll_no, email|null, phone, designation, is_active, approved_at: new Date().toISOString() }` (admin-added members are onboarded immediately). 23505 → "already registered".
- `updateMemberAction` updates `council_members` `{ full_name, roll_no, email|null, phone, designation, is_active }` by id; guard `canManage(session,"manage:council")` (fetch existing via `getMemberForEdit`).
- `deleteMemberAction`, `onboardMemberAction`, `rejectMemberAction` — mirror the club versions, guard `manage:council`, entity `"council_member"`, redirect `/admin/council/members`. `rejectMemberAction` only deletes a still-pending row (`approvedAt == null`).
- Replace `resetJoinTokenAction(clubId)` with **`rotateJoinTokenAction()`** (no id): guard `manage:council`, call `rotateJoinToken()` from the data layer, audit entity `"council_settings"`, redirect `/admin/council/members`.
- **Session actions** (`createSessionAction`, `saveAttendanceAction`, `saveAndCloseAction`, `reopenSessionAction`): mirror the club versions with SessionSchema dropping `clubId`; `createSessionAction` calls the data layer `createSession({ title, sessionDate, startTime, endTime, openedBy })` and redirects to `/admin/council/sessions/<id>`; the save/close/reopen actions guard `manage:council` (fetch via `getSessionMarking`) and redirect under `/admin/council/...`. Keep the `endTime <= startTime` check and the audit writes (entity `"council_attendance_session"`).

- [ ] **Step 2: Members page**

Create `src/app/admin/(app)/council/members/page.tsx` by mirroring `src/app/admin/(app)/attendance/members/page.tsx` with these deltas:
- View guard: `const session = await requireViewPage("manage:council");` then `if (!canView(session, "manage:council")) redirect("/admin");` — **no club picker, no `?club=` param** (single org-wide roster).
- `canEdit = canManage(session, "manage:council")`.
- Load `listMembers()` + `rosterWithPercent()` (for % beside each onboarded member) + `getJoinToken()` (for the copy-link control) from `@/lib/admin/attendance-council`.
- Split rows: **Pending** = `approvedAt == null` (show Onboard/Reject forms → `onboardMemberAction`/`rejectMemberAction`); **Onboarded** = the rest (serial #, name, designation, roll, %, Edit link, Delete). Show a **Copy join link** block with the full `${SITE_URL}/council/join/${token}` and a **Rotate link** form (`rotateJoinTokenAction`). An **Add member** link → `/admin/council/members/new`.
- Each member row shows `designation` (there is no club column).

- [ ] **Step 3: CouncilMemberForm + New/Edit pages**

First create `src/components/admin/CouncilMemberForm.tsx` by mirroring `src/components/admin/MemberForm.tsx` with these deltas: drop the `sort` and `clubId`/`clubs` inputs; add a required **Designation** text field (`name="designation"`, maxLength 80, after Name); the `initial` shape is `{ name; rollNo; email; phone; designation; isActive }` (no `sort`/`clubId`); keep `useActionState` + `MemberFormState` + the `id` hidden input for edit. Fields rendered: Name, Designation, Roll number, Email (contact), Phone, Active.

Then create `src/app/admin/(app)/council/members/new/page.tsx` and `.../members/[id]/edit/page.tsx` by mirroring the club equivalents with these deltas:
- View/manage guard on `manage:council` (`requireViewPage("manage:council")` + `canManage`); **no `listClubsBrief`, no club prop**.
- New page renders `<CouncilMemberForm action={createMemberAction} />`; Edit page loads the member via `getMemberForEdit(id)` from `@/lib/admin/attendance-council`, `notFound()` when null, and renders `<CouncilMemberForm action={updateMemberAction} id={id} submitLabel="Save member" initial={{ name, rollNo: rollNo ?? "", email: email ?? "", phone: phone ?? "", designation, isActive }} />`.

- [ ] **Step 4: Nav entry**

In `src/app/admin/(app)/layout.tsx`, add after the Attendance entry:

```tsx
    ...(canView(session, "manage:council")
      ? [{ href: "/admin/council", label: "Council" }]
      : []),
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/council/members`, `/admin/council/members/new`, `/admin/council/members/[id]/edit` in the manifest.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(app)/council" "src/app/admin/(app)/layout.tsx"
git commit -m "feat(council): admin roster management + onboarding + join link + nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 7: Council dashboard + session marking

**Files:**
- Create: `src/components/admin/CouncilSessionRoster.tsx`
- Create: `src/app/admin/(app)/council/page.tsx`
- Create: `src/app/admin/(app)/council/sessions/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 4 data layer, the session actions from Task 6's `actions.ts`, `canView`/`canManage` (`manage:council`).
- Produces: the dashboard + marking UI. No new exports.

- [ ] **Step 1: Dashboard**

Create `src/app/admin/(app)/council/page.tsx` by mirroring `src/app/admin/(app)/attendance/page.tsx` with these deltas:
- View guard `manage:council` (via `requireViewPage("manage:council")` + `canView`); **no club picker**.
- `canEdit = canManage(session, "manage:council")`.
- Load `listSessions()` + `rosterWithPercent()`.
- **Create meeting** form (title + `session_date` + `start_time` + `end_time`) → `createSessionAction` (from `./actions`), shown only when `canEdit`.
- **Session history** table: title, date, time, present-count, **Open** button linking to `/admin/council/sessions/${s.id}`.
- **Roster** section: serial #, name, designation, attendance % (from `rosterWithPercent`).
- Link to **Members** (`/admin/council/members`).
- Reuse `AttendanceAnalytics`? **No** — analytics is deferred (spec). Only the plain roster + % here.

- [ ] **Step 2: CouncilSessionRoster + session marking page**

First create `src/components/admin/CouncilSessionRoster.tsx` by mirroring `src/components/admin/SessionRoster.tsx` with these deltas: import `saveAttendanceAction`, `saveAndCloseAction`, `reopenSessionAction` from `@/app/admin/(app)/council/actions` (the council actions, NOT the club ones); extend `Row` to `{ memberId; name; designation: string; present: boolean }` and render the designation as a muted subtitle under the name (e.g. a `<span className="label">` line). Everything else (present-set state, Mark-all/Clear, Save-draft / Save&close / Reopen buttons, hidden `present` inputs) is identical.

Then create `src/app/admin/(app)/council/sessions/[id]/page.tsx` by mirroring `src/app/admin/(app)/attendance/sessions/[id]/page.tsx` with these deltas:
- View guard `manage:council` (`requireViewPage("manage:council")` + `canView`); `canEdit = canManage(session, "manage:council")`.
- Load `getSessionMarking(id)` from `@/lib/admin/attendance-council`; `notFound()` when null.
- Render `<CouncilSessionRoster sessionId={id} roster={detail.roster} canEdit={canEdit} status={detail.session.status} />` (the roster rows already carry `designation`).
- Status badge (open/closed) + the saved/closed/reopened query-flag notes, same as the club page. The Save/close/reopen actions are wired inside `CouncilSessionRoster`, so the page itself needs no direct action import.

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/council` and `/admin/council/sessions/[id]` in the manifest.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(app)/council/page.tsx" "src/app/admin/(app)/council/sessions"
git commit -m "feat(council): dashboard + session present/absent marking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 8: Final gate + STATUS.md

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Full verify gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass. Record the test count (was 176 + council capability/validation additions).

- [ ] **Step 2: Route smoke (optional, needs `npm run dev`)**

- `/council/join/not-a-uuid` → 404; `POST /api/council/register` bad body → 400 (no write); `/admin/council`, `/admin/council/members` (no cookie) → 307→login. Skip if no dev server; the build manifest already proves the routes exist.

- [ ] **Step 3: Update STATUS.md**

Add an IN-FLIGHT / PRE-MERGE block at the top of "🚦 START HERE" summarising the council attendance feature: the new `council_*` tables + `manage:council` capability; join link → pending → manual onboard; pres/VP/tech manage, faculty read, heads on-roster-only; manual present/absent sessions reusing the pure engine; v1 admin-side only (public lookup + analytics deferred). Note the **migration IS applied** to the live DB (additive), the new test count, and the **owed human walkthrough** (self-register on the council join link → onboard → create a meeting → mark → confirm % moves; confirm a club_head sees no Council manage controls).

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): record council / leadership attendance feature

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Post-plan (owner-gated, not part of execution)

- **Merge + deploy:** fast-forward `feat/council-attendance` → `main` → `git push origin main` (auto-deploys) — only when the owner says so.
- **Owed human walkthrough:** Task 8 Step 3 (server-action POSTs can't be curled).
- **Then Feature 2** (club publish/visibility toggle) — its own brainstorm → spec → plan.
