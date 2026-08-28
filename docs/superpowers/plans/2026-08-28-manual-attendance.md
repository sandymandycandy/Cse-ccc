# Manual Roster Attendance + Self-Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the club-member QR attendance system and the PIN/TOTP member portal with (a) a self-registration link, (b) head approval + full member CRUD, (c) name/date/time-slot sessions with manual present/absent marking, and (d) a public roll-number attendance lookup.

**Architecture:** The existing `club_attendance_sessions` / `club_attendance` tables already model "one row = present," so marking needs no new attendance table — a Save diffs the desired present-set against existing rows. Self-registrations land as `pending` (`club_members.approved_at IS NULL`) via a public route, and a head onboards them. All member PII (photo/phone/email/roll) is read server-side via the service role only; the public lookup surfaces name + club + % only. The separate event self-scan flow is untouched.

**Tech Stack:** Next 16 (App Router, Turbopack, Server Components + Server Actions), React 19, TypeScript strict, Supabase (Postgres + RLS + Storage, service-role writes), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-manual-attendance-design.md`

## Global Constraints

- **Next.js is non-standard here** — read `node_modules/next/dist/docs/` before writing framework code; `middleware` is `proxy.ts` (`proxy()`), not `middleware.ts`.
- **All DB access is service-role** via `createAdminClient()` from `@/lib/supabase/admin`; tables have RLS on with no permissive policies. Never add anon write grants.
- **Roll is PII** — the anon grant on `club_members` excludes `roll_no`/`email`/`phone`; keep it that way. The public lookup reads via the service role.
- **Server-action POSTs can't be curled** ("Failed to find Server Action") — verify them in a browser or by asserting the DB effect. **Route handlers (`route.ts`) curl fine.**
- **The live DB is shared by dev and prod.** Additive migrations are safe to apply mid-build; **destructive drops run only AFTER the new code is deployed** (Task 11). Seed rows deleted after verifying.
- **`dangerouslySetInnerHTML` is ESLint-banned.** No raw HTML.
- **Regenerate types via the Supabase MCP** (`generate_typescript_types`), never `npm run types:gen` (it truncates). If the MCP is unavailable, hand-add the columns to `database.types.ts` (Task 1 lists the exact additions), as was done for `venue_text`.
- **Field rules (copy verbatim):** roll `^\d{5}$`; email `^vtu\d{5}@veltech\.edu\.in$` (case-insensitive) whose 5 digits equal the roll; phone `^\d{10}$`; photo image (png/jpeg/webp) ≤ **204800 bytes** (200 KB).
- **Verify gate after every task:** `npm run typecheck && npm run lint && npm test && npm run build` all green.
- **Branch:** do this work on a feature branch (`feat/manual-attendance`), never directly on `main`.

---

## File Structure

**New:**
- `supabase/migrations/20260828000000_manual_attendance_additive.sql` — columns, join_token, private bucket (safe, applied during build).
- `supabase/migrations/20260828010000_drop_member_portal.sql` — drops orphans (applied post-deploy, Task 11).
- `src/lib/roster/validation.ts` (+ `.test.ts`) — pure field validators.
- `src/lib/admin/attendance-presence.ts` (+ `.test.ts`) — pure `diffPresence`.
- `src/app/join/[token]/page.tsx` — public self-registration page.
- `src/components/roster/SelfRegisterForm.tsx` — client form (multipart fetch).
- `src/app/api/roster/register/route.ts` — public POST handler.
- `src/app/attendance/page.tsx` — public roll-number lookup.
- `src/components/admin/CreateSessionForm.tsx` — replaces `OpenSessionForm`.
- `src/components/admin/SessionRoster.tsx` — marking UI, replaces `LiveSession`.
- `src/components/admin/JoinLinkPanel.tsx` — copy/reset the club join link.

**Modify:** `src/lib/admin/attendance-club.ts`, `src/lib/admin/attendance-math.ts`, `src/lib/admin/members.ts`, `src/lib/rate-limit.ts`, `src/lib/admin/image-upload.ts`, `src/lib/admin/clubs.ts`, `src/lib/attendance.ts` (strip member tokens), `src/lib/attendance.test.ts`, `src/app/admin/(app)/attendance/actions.ts`, `.../attendance/page.tsx`, `.../attendance/sessions/[id]/page.tsx`, `.../attendance/members/page.tsx`, `.../members/[id]/edit/page.tsx`, `.../members/new/page.tsx`, `src/components/admin/MemberForm.tsx`, `src/proxy.ts`, `package.json`, `src/lib/database.types.ts`, `docs/STATUS.md`.

**Delete (Task 10):** `src/app/member/**`, `src/lib/member/**`, `src/components/member/**`, `src/app/api/member/qr/route.ts`, `src/app/m/[token]/page.tsx`, `src/app/api/admin/attendance/club/scan/route.ts`, `src/app/api/admin/attendance/club/feed/route.ts`, `src/app/admin/(app)/attendance/scan/page.tsx`, `src/components/admin/QrScanner.tsx`, `MemberQrCard.tsx`, `MemberLoginAccess.tsx`, `LiveSession.tsx`, `OpenSessionForm.tsx`, `src/lib/qr.ts`, `src/lib/qr.test.ts`.

---

## Task 1: Additive DB migration + regenerate types

**Files:**
- Create: `supabase/migrations/20260828000000_manual_attendance_additive.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: new columns `club_members.approved_at`, `club_attendance_sessions.session_date/start_time/end_time`, `clubs.join_token`; private Storage bucket `member-photos`. All later tasks consume these.

- [ ] **Step 1: Write the migration file**

```sql
-- Manual attendance + self-registration (additive half — safe to apply while the
-- old code still runs; the destructive drops live in 20260828010000).

-- 1. Sessions become scheduled meetings: name + date + time slot. Nullable so
--    existing rows survive; new sessions always set them. The old open/close
--    columns (status, closed_at) are left in place but unused.
alter table public.club_attendance_sessions
  add column if not exists session_date date,
  add column if not exists start_time   time,
  add column if not exists end_time      time;

-- 2. Self-registrations land pending. NULL = pending; a timestamp = onboarded.
alter table public.club_members
  add column if not exists approved_at timestamptz;
-- Existing members stay active.
update public.club_members set approved_at = created_at where approved_at is null;
-- One roster row per roll number.
create unique index if not exists club_members_roll_unique
  on public.club_members (roll_no) where roll_no is not null;

-- 3. The reusable self-registration link token (rotatable to kill a leaked link).
alter public.clubs is null;  -- placeholder guard removed below
alter table public.clubs
  add column if not exists join_token uuid not null default gen_random_uuid();

-- 4. Private bucket for passport photos (PII — service-role read only).
insert into storage.buckets (id, name, public)
  values ('member-photos', 'member-photos', false)
  on conflict (id) do nothing;
```

> NOTE: delete the stray `alter public.clubs is null;` line — it is not valid SQL and must not ship. (It is here only so a careless copy-paste fails loudly in review rather than silently.) The real statement is the `alter table public.clubs ... add column ... join_token` below it.

- [ ] **Step 2: Apply it to the live DB via the Supabase MCP**

Use the Supabase MCP `apply_migration` with name `manual_attendance_additive` and the SQL above (with the stray line removed). If the MCP is disconnected, apply the same SQL through the Supabase SQL editor.

- [ ] **Step 3: Regenerate `database.types.ts`**

Run the Supabase MCP `generate_typescript_types` and overwrite `src/lib/database.types.ts` with its output. **If the MCP is unavailable**, hand-add to the existing generated types (mirroring the `venue_text` precedent):
- `club_members` Row/Insert/Update: `approved_at: string | null`
- `club_attendance_sessions` Row/Insert/Update: `session_date: string | null`, `start_time: string | null`, `end_time: string | null`
- `clubs` Row: `join_token: string`; Insert/Update: `join_token?: string`

- [ ] **Step 4: Verify the gate**

Run: `npm run typecheck && npm run build`
Expected: PASS (no code uses the new columns yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260828000000_manual_attendance_additive.sql src/lib/database.types.ts
git commit -m "feat(attendance): additive migration — session date/time, member approval, club join token, member-photos bucket"
```

---

## Task 2: Pure roster validators (TDD)

**Files:**
- Create: `src/lib/roster/validation.ts`
- Test: `src/lib/roster/validation.test.ts`

**Interfaces:**
- Produces:
  - `validateRegistration(input: { name; roll; email; phone }) => { ok: true; value: { name; roll; email; phone } } | { ok: false; errors: Record<string,string> }`
  - `validatePhoto(file: { size: number; type: string } | null) => string | null` (error message or null)
  - constants `ROLL_RE`, `PHONE_RE`, `VELTECH_EMAIL_RE`, `MAX_PHOTO_BYTES`, `PHOTO_TYPES`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/roster/validation.test.ts
import { describe, it, expect } from "vitest";
import { validateRegistration, validatePhoto, MAX_PHOTO_BYTES } from "./validation";

const good = { name: "Asha Rao", roll: "12345", email: "vtu12345@veltech.edu.in", phone: "9876543210" };

describe("validateRegistration", () => {
  it("accepts a well-formed submission and normalizes email to lower-case", () => {
    const r = validateRegistration({ ...good, email: "VTU12345@Veltech.edu.in" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.email).toBe("vtu12345@veltech.edu.in");
  });
  it("rejects a roll that is not exactly 5 digits", () => {
    expect(validateRegistration({ ...good, roll: "1234" }).ok).toBe(false);
    expect(validateRegistration({ ...good, roll: "123456" }).ok).toBe(false);
    expect(validateRegistration({ ...good, roll: "12a45" }).ok).toBe(false);
  });
  it("rejects a non-veltech email", () => {
    expect(validateRegistration({ ...good, email: "asha@gmail.com" }).ok).toBe(false);
  });
  it("rejects when the email digits do not match the roll", () => {
    const r = validateRegistration({ ...good, email: "vtu99999@veltech.edu.in" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });
  it("rejects a phone that is not exactly 10 digits", () => {
    expect(validateRegistration({ ...good, phone: "+919876543210" }).ok).toBe(false);
    expect(validateRegistration({ ...good, phone: "98765" }).ok).toBe(false);
  });
  it("rejects a short name", () => {
    expect(validateRegistration({ ...good, name: "A" }).ok).toBe(false);
  });
});

describe("validatePhoto", () => {
  it("requires a photo", () => {
    expect(validatePhoto(null)).toBeTruthy();
    expect(validatePhoto({ size: 0, type: "image/png" })).toBeTruthy();
  });
  it("rejects a non-image type", () => {
    expect(validatePhoto({ size: 1000, type: "application/pdf" })).toBeTruthy();
  });
  it("rejects a photo over 200 KB", () => {
    expect(validatePhoto({ size: MAX_PHOTO_BYTES + 1, type: "image/jpeg" })).toBeTruthy();
  });
  it("accepts a valid photo", () => {
    expect(validatePhoto({ size: 1000, type: "image/jpeg" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/roster/validation.test.ts`
Expected: FAIL ("Cannot find module './validation'").

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/roster/validation.ts
export const ROLL_RE = /^\d{5}$/;
export const PHONE_RE = /^\d{10}$/;
export const VELTECH_EMAIL_RE = /^vtu(\d{5})@veltech\.edu\.in$/i;
export const MAX_PHOTO_BYTES = 200 * 1024;
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface RegisterValue { name: string; roll: string; email: string; phone: string }

export function validateRegistration(input: {
  name: unknown; roll: unknown; email: unknown; phone: unknown;
}): { ok: true; value: RegisterValue } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = String(input.name ?? "").trim();
  const roll = String(input.roll ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = String(input.phone ?? "").trim();

  if (name.length < 2 || name.length > 120) errors.name = "Enter your full name.";
  if (!ROLL_RE.test(roll)) errors.roll = "Roll number must be exactly 5 digits.";
  const m = VELTECH_EMAIL_RE.exec(email);
  if (!m) errors.email = "Use your vtuXXXXX@veltech.edu.in email.";
  else if (ROLL_RE.test(roll) && m[1] !== roll) errors.email = "Email digits must match your roll number.";
  if (!PHONE_RE.test(phone)) errors.phone = "Phone must be exactly 10 digits (no +91).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, roll, email, phone } };
}

export function validatePhoto(file: { size: number; type: string } | null): string | null {
  if (!file || file.size === 0) return "A passport photo is required.";
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "Photo must be PNG, JPEG or WebP.";
  if (file.size > MAX_PHOTO_BYTES) return "Photo must be 200 KB or smaller.";
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/roster/validation.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster/validation.ts src/lib/roster/validation.test.ts
git commit -m "feat(roster): pure self-registration field validators"
```

---

## Task 3: Pure `diffPresence` (TDD)

**Files:**
- Create: `src/lib/admin/attendance-presence.ts`
- Test: `src/lib/admin/attendance-presence.test.ts`

**Interfaces:**
- Produces: `diffPresence(current: ReadonlySet<string>, desired: ReadonlySet<string>) => { toAdd: string[]; toRemove: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/admin/attendance-presence.test.ts
import { describe, it, expect } from "vitest";
import { diffPresence } from "./attendance-presence";

describe("diffPresence", () => {
  it("adds newly-present and removes newly-absent, leaving unchanged alone", () => {
    const current = new Set(["a", "b"]);
    const desired = new Set(["b", "c"]);
    const { toAdd, toRemove } = diffPresence(current, desired);
    expect(toAdd.sort()).toEqual(["c"]);
    expect(toRemove.sort()).toEqual(["a"]);
  });
  it("is a no-op when the sets are equal", () => {
    const s = new Set(["x", "y"]);
    expect(diffPresence(s, new Set(["x", "y"]))).toEqual({ toAdd: [], toRemove: [] });
  });
  it("adds all when current is empty", () => {
    expect(diffPresence(new Set(), new Set(["a", "b"])).toAdd.sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/admin/attendance-presence.test.ts`
Expected: FAIL ("Cannot find module './attendance-presence'").

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/admin/attendance-presence.ts
/**
 * Pure diff between the present-set already stored for a session and the set the
 * head just submitted. Kept free of DB/`server-only` imports so it is unit-testable
 * (mirrors the attendance-math extraction). `toAdd` → insert club_attendance rows;
 * `toRemove` → delete them.
 */
export function diffPresence(
  current: ReadonlySet<string>,
  desired: ReadonlySet<string>,
): { toAdd: string[]; toRemove: string[] } {
  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));
  return { toAdd, toRemove };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/admin/attendance-presence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/attendance-presence.ts src/lib/admin/attendance-presence.test.ts
git commit -m "feat(attendance): pure diffPresence for manual marking"
```

---

## Task 4: `summarizeAttendance` → date-based (TDD)

**Files:**
- Modify: `src/lib/admin/attendance-math.ts`
- Modify: `src/lib/admin/attendance-math.test.ts`

**Interfaces:**
- Produces (changed signature): `summarizeAttendance(sessions: readonly { id: string; date: string }[], joinedDate: string, attendedSessionIds: ReadonlySet<string>) => { attended; eligible; pct }`. `date`/`joinedDate` are `YYYY-MM-DD` strings.

- [ ] **Step 1: Update the test to the date-based shape**

Replace the body of `src/lib/admin/attendance-math.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { summarizeAttendance } from "./attendance-math";

const s = (id: string, date: string) => ({ id, date });

describe("summarizeAttendance", () => {
  it("counts only sessions dated on/after the member joined", () => {
    const sessions = [s("1", "2026-08-01"), s("2", "2026-08-10"), s("3", "2026-08-20")];
    const r = summarizeAttendance(sessions, "2026-08-10", new Set(["2", "3"]));
    expect(r.eligible).toBe(2); // sessions 2 and 3
    expect(r.attended).toBe(2);
    expect(r.pct).toBe(100);
  });
  it("never exceeds 100% (a mark on a pre-join session is ignored)", () => {
    const sessions = [s("1", "2026-08-01"), s("2", "2026-08-20")];
    const r = summarizeAttendance(sessions, "2026-08-10", new Set(["1", "2"]));
    expect(r.eligible).toBe(1);
    expect(r.attended).toBe(1);
    expect(r.pct).toBe(100);
  });
  it("returns 0% when there are no eligible sessions", () => {
    expect(summarizeAttendance([], "2026-08-10", new Set())).toEqual({ attended: 0, eligible: 0, pct: 0 });
  });
  it("rounds the percentage", () => {
    const sessions = [s("1", "2026-08-01"), s("2", "2026-08-02"), s("3", "2026-08-03")];
    expect(summarizeAttendance(sessions, "2026-08-01", new Set(["1"])).pct).toBe(33);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/admin/attendance-math.test.ts`
Expected: FAIL (current signature uses `opened_at`, not `date`).

- [ ] **Step 3: Update the implementation**

In `src/lib/admin/attendance-math.ts`, replace the `summarizeAttendance` function (keep the file's doc comment, updating the field name) with:

```ts
export function summarizeAttendance(
  sessions: readonly { id: string; date: string }[],
  joinedDate: string,
  attendedSessionIds: ReadonlySet<string>,
): AttendanceSummary {
  const eligible = sessions.filter((s) => s.date >= joinedDate);
  const attended = eligible.filter((s) => attendedSessionIds.has(s.id)).length;
  return {
    attended,
    eligible: eligible.length,
    pct: eligible.length === 0 ? 0 : Math.round((attended / eligible.length) * 100),
  };
}
```

Update the doc comment's reference from `opened_at` to a session `date` (`YYYY-MM-DD`), keeping the "lexicographic = chronological" note.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/admin/attendance-math.test.ts`
Expected: PASS. (Callers are updated in Task 5 — the full `typecheck` gate runs there.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/attendance-math.ts src/lib/admin/attendance-math.test.ts
git commit -m "refactor(attendance): summarizeAttendance keys on session date not open-time"
```

---

## Task 5: Attendance data layer (`attendance-club.ts` + clubs helper)

**Files:**
- Modify: `src/lib/admin/attendance-club.ts`
- Modify: `src/lib/admin/clubs.ts`

**Interfaces:**
- Consumes: `summarizeAttendance` (Task 4), `diffPresence` (Task 3).
- Produces:
  - `SessionRow` now includes `sessionDate: string | null; startTime: string | null; endTime: string | null`.
  - `createSession(input) => string` — inserts and returns the new session id.
  - `getSessionMarking(sessionId) => { session: SessionRow; roster: { memberId; name; present: boolean }[] } | null`
  - `savePresence(sessionId, desiredIds: string[], markedBy: string) => void`
  - `getMemberAttendanceByRoll(roll) => { status: "pending" } | { status: "active"; name; clubName; attended; eligible; pct; history } | null`
  - `getClubByJoinToken(token) => { id: string; name: string } | null` (in `clubs.ts`)

- [ ] **Step 1: Add `getClubByJoinToken` to `clubs.ts`**

Append to `src/lib/admin/clubs.ts`:

```ts
/** Resolve a self-registration link token to its club. Service-role only. */
export async function getClubByJoinToken(token: string): Promise<{ id: string; name: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name")
    .eq("join_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
```

- [ ] **Step 2: Rework `attendance-club.ts`**

Apply these changes (the module keeps `getOpenSession`/`listSessions`/`getSessionDetail`/`liveFeed`/`getMemberAttendance` only where still used; the dashboard and session page are rewired in Task 6, so replace the file's exports as below).

Replace the `SessionRow` interface and add date/time to every select + mapping:

```ts
export interface SessionRow {
  id: string;
  title: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  presentCount: number;
  clubId: string;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
}
```

In `listSessions`, change the select to `"id, title, status, opened_at, closed_at, club_id, session_date, start_time, end_time"` and map the three new fields (`sessionDate: s.session_date, startTime: s.start_time, endTime: s.end_time`). Order by `session_date` desc then `opened_at` desc:

```ts
    .order("session_date", { ascending: false, nullsFirst: false })
    .order("opened_at", { ascending: false })
```

Add the session-marking read (approved + active roster, seeded present flags):

```ts
export async function getSessionMarking(
  sessionId: string,
): Promise<{ session: SessionRow; roster: { memberId: string; name: string; present: boolean }[] } | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id, session_date, start_time, end_time")
    .eq("id", sessionId).maybeSingle();
  if (!s) return null;

  const { data: marks } = await admin
    .from("club_attendance").select("member_id").eq("session_id", sessionId);
  const present = new Set((marks ?? []).map((m) => m.member_id));

  const { data: members } = await admin
    .from("club_members")
    .select("id, name")
    .eq("club_id", s.club_id).eq("is_active", true).not("approved_at", "is", null)
    .order("name");

  const roster = (members ?? []).map((m) => ({ memberId: m.id, name: m.name, present: present.has(m.id) }));
  return {
    session: {
      id: s.id, title: s.title, status: s.status, openedAt: s.opened_at, closedAt: s.closed_at,
      clubId: s.club_id, presentCount: present.size,
      sessionDate: s.session_date, startTime: s.start_time, endTime: s.end_time,
    },
    roster,
  };
}
```

Add session creation + save:

```ts
export async function createSession(input: {
  clubId: string; title: string; sessionDate: string; startTime: string; endTime: string; openedBy: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .insert({
      club_id: input.clubId, title: input.title, opened_by: input.openedBy,
      session_date: input.sessionDate, start_time: input.startTime, end_time: input.endTime,
    })
    .select("id").single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data.id;
}

export async function savePresence(sessionId: string, desiredIds: string[], markedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { data: marks } = await admin
    .from("club_attendance").select("member_id").eq("session_id", sessionId);
  const current = new Set((marks ?? []).map((m) => m.member_id));
  const desired = new Set(desiredIds);
  const { toAdd, toRemove } = diffPresence(current, desired);
  if (toAdd.length > 0) {
    await admin.from("club_attendance")
      .insert(toAdd.map((memberId) => ({ session_id: sessionId, member_id: memberId, marked_by: markedBy })));
  }
  if (toRemove.length > 0) {
    await admin.from("club_attendance").delete().eq("session_id", sessionId).in("member_id", toRemove);
  }
}
```

Add the import at the top: `import { diffPresence } from "./attendance-presence";`.

Rework `rosterWithPercent` to count **all** sessions (no status filter) and use `session_date` (coalescing legacy null dates to the date part of `opened_at`):

```ts
export async function rosterWithPercent(clubId: string): Promise<RosterPct[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("club_members")
    .select("id, name, created_at")
    .eq("club_id", clubId).eq("is_active", true).not("approved_at", "is", null).order("name");
  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, session_date, opened_at").eq("club_id", clubId);
  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, session_id, club_attendance_sessions!inner(club_id)")
    .eq("club_attendance_sessions.club_id", clubId);

  const sess = (sessions ?? []).map((s) => ({ id: s.id, date: (s.session_date ?? s.opened_at).slice(0, 10) }));
  const attendedByMember = new Map<string, Set<string>>();
  for (const m of marks ?? []) {
    const set = attendedByMember.get(m.member_id) ?? new Set<string>();
    set.add(m.session_id);
    attendedByMember.set(m.member_id, set);
  }
  return (members ?? []).map((mem) => {
    const { attended, eligible, pct } = summarizeAttendance(sess, mem.created_at.slice(0, 10), attendedByMember.get(mem.id) ?? NO_MARKS);
    return { memberId: mem.id, name: mem.name, attended, eligible, pct };
  });
}
```

Add the public roll lookup (replaces the old `getMemberAttendance(memberId)`; delete that old function since `/m/[token]` and `/member` — its only callers — are removed in Task 10):

```ts
export type RollLookup =
  | { status: "pending"; name: string; clubName: string | null }
  | { status: "active"; name: string; clubName: string | null; attended: number; eligible: number; pct: number;
      history: { title: string; date: string; present: boolean }[] };

export async function getMemberAttendanceByRoll(roll: string): Promise<RollLookup | null> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("club_members")
    .select("id, name, created_at, approved_at, club_id, clubs(name)")
    .eq("roll_no", roll).maybeSingle();
  if (!m) return null;
  const clubName = m.clubs?.name ?? null;
  if (!m.approved_at) return { status: "pending", name: m.name, clubName };

  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, title, session_date, opened_at").eq("club_id", m.club_id);
  const { data: marks } = await admin
    .from("club_attendance").select("session_id").eq("member_id", m.id);
  const attendedIds = new Set((marks ?? []).map((x) => x.session_id));

  const rows = (sessions ?? []).map((s) => ({
    id: s.id, title: s.title, date: (s.session_date ?? s.opened_at).slice(0, 10),
  })).sort((a, b) => (a.date < b.date ? 1 : -1));
  const joined = m.created_at.slice(0, 10);
  const { attended, eligible, pct } = summarizeAttendance(rows, joined, attendedIds);
  const history = rows.filter((s) => s.date >= joined).map((s) => ({ title: s.title, date: s.date, present: attendedIds.has(s.id) }));
  return { status: "active", name: m.name, clubName, attended, eligible, pct, history };
}
```

Delete the now-unused `getSessionDetail`, `liveFeed`, and `MemberSelfView`/`getMemberAttendance` exports (their callers — session page, feed route, `/m`, `/member` — are replaced in Task 6 / deleted in Task 10). Keep `getOpenSession` only if Task 6 still references it; otherwise delete it too.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: errors ONLY in files rewired by later tasks (dashboard/session page/actions). If `attendance-club.ts` itself type-errors, fix it. (Full green is reached at Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/attendance-club.ts src/lib/admin/clubs.ts
git commit -m "feat(attendance): data layer for scheduled sessions, manual marking, roll lookup"
```

---

## Task 6: Sessions UI + actions (create with date/slot, manual marking)

**Files:**
- Modify: `src/app/admin/(app)/attendance/actions.ts`
- Create: `src/components/admin/CreateSessionForm.tsx`
- Create: `src/components/admin/SessionRoster.tsx`
- Modify: `src/app/admin/(app)/attendance/page.tsx`
- Modify: `src/app/admin/(app)/attendance/sessions/[id]/page.tsx`
- Delete: `src/components/admin/OpenSessionForm.tsx`, `src/components/admin/LiveSession.tsx`

**Interfaces:**
- Consumes: `createSession`, `getSessionMarking`, `savePresence`, `listSessions`, `rosterWithPercent` (Task 5).
- Produces: `createSessionAction(prev, formData) => SessionFormState`; `saveAttendanceAction(formData) => void`.

- [ ] **Step 1: Replace the session actions in `actions.ts`**

Remove `openSessionAction`, `closeSessionAction`, and the `getOpenSession` import. Add (keep the existing imports of `getAdminSession`, `canManage`, `resolveOwningClub`, `writeAudit`, `createAdminClient`, `z`, `redirect`):

```ts
import { createSession, savePresence, getSessionMarking } from "@/lib/admin/attendance-club";

const SessionSchema = z.object({
  title: z.string().trim().min(2).max(140),
  clubId: z.union([z.literal(""), z.string().uuid()]),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick an end time."),
});

export async function createSessionAction(_prev: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  const parsed = SessionSchema.safeParse({
    title: formData.get("title"), clubId: formData.get("clubId") ?? "",
    sessionDate: formData.get("sessionDate"), startTime: formData.get("startTime"), endTime: formData.get("endTime"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the session details." };
  if (parsed.data.endTime <= parsed.data.startTime) return { error: "End time must be after the start time." };

  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.clubId == null) return { error: "Pick a club for this session." };
  if (!canManage(session, "manage:members", resolved.clubId)) return { error: "You can't run sessions for that club." };

  const id = await createSession({
    clubId: resolved.clubId, title: parsed.data.title, sessionDate: parsed.data.sessionDate,
    startTime: parsed.data.startTime, endTime: parsed.data.endTime, openedBy: session.id,
  });
  await writeAudit({ actorId: session.id, action: "open", entity: "club_attendance_session", entityId: id,
    after: { title: parsed.data.title, clubId: resolved.clubId, date: parsed.data.sessionDate } });
  redirect(`/admin/attendance/sessions/${id}`);
}

export async function saveAttendanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!z.string().uuid().safeParse(sessionId).success) redirect("/admin/attendance");
  const detail = await getSessionMarking(sessionId);
  if (!detail) redirect("/admin/attendance");
  if (!canManage(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");

  const present = formData.getAll("present").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  await savePresence(sessionId, present, session.id);
  await writeAudit({ actorId: session.id, action: "update", entity: "club_attendance_session", entityId: sessionId,
    after: { present: present.length } });
  redirect(`/admin/attendance/sessions/${sessionId}?saved=1`);
}
```

- [ ] **Step 2: Create `CreateSessionForm.tsx`**

```tsx
// src/components/admin/CreateSessionForm.tsx
"use client";
import { useActionState } from "react";
import { createSessionAction } from "@/app/admin/(app)/attendance/actions";
import type { SessionFormState } from "@/lib/admin/form-state";

const initial: SessionFormState = {};

export function CreateSessionForm({ clubId }: { clubId: string | null }) {
  const [state, action, pending] = useActionState(createSessionAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 460 }}>
      {clubId ? <input type="hidden" name="clubId" value={clubId} /> : null}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="title">Session name</label>
        <input id="title" name="title" required maxLength={140} placeholder="Weekly sync" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="sessionDate">Date</label>
        <input id="sessionDate" name="sessionDate" type="date" required />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label htmlFor="startTime">Start</label>
          <input id="startTime" name="startTime" type="time" required />
        </div>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label htmlFor="endTime">End</label>
          <input id="endTime" name="endTime" type="time" required />
        </div>
      </div>
      <button className="btn btn-primary" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? "Creating…" : "Create session & take attendance"}
      </button>
      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{state.error}</div> : null}
    </form>
  );
}
```

- [ ] **Step 3: Create `SessionRoster.tsx`**

```tsx
// src/components/admin/SessionRoster.tsx
"use client";
import { useState } from "react";
import { saveAttendanceAction } from "@/app/admin/(app)/attendance/actions";

interface Row { memberId: string; name: string; present: boolean }

export function SessionRoster({ sessionId, roster, canEdit }: { sessionId: string; roster: Row[]; canEdit: boolean }) {
  const [present, setPresent] = useState<Set<string>>(() => new Set(roster.filter((r) => r.present).map((r) => r.memberId)));
  const toggle = (id: string) => setPresent((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setAll = (on: boolean) => setPresent(on ? new Set(roster.map((r) => r.memberId)) : new Set());

  if (roster.length === 0) return <p className="body-text" style={{ color: "var(--ink-3)" }}>No approved members yet.</p>;

  return (
    <form action={saveAttendanceAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="att-count" style={{ marginBottom: 12 }}>
        <strong>{present.size}</strong><span>of {roster.length} present</span>
      </div>
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => setAll(true)}>Mark all present</button>
          <button type="button" className="btn btn-sm" onClick={() => setAll(false)}>Clear</button>
        </div>
      ) : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
        {roster.map((r) => {
          const on = present.has(r.memberId);
          return (
            <li key={r.memberId} className="rule" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              {on ? <input type="hidden" name="present" value={r.memberId} /> : null}
              {canEdit ? (
                <button type="button" className="btn btn-sm"
                  onClick={() => toggle(r.memberId)}
                  style={on ? { background: "var(--forest)", color: "#fff", borderColor: "var(--forest)" } : undefined}
                  aria-pressed={on}>
                  {on ? "Present" : "Absent"}
                </button>
              ) : <span className="label" style={{ color: on ? "var(--forest)" : "var(--ink-3)" }}>{on ? "Present" : "Absent"}</span>}
            </li>
          );
        })}
      </ul>
      {canEdit ? <button className="btn btn-primary" style={{ marginTop: 16 }}>Save attendance</button> : null}
    </form>
  );
}
```

- [ ] **Step 4: Rewrite the session page**

Replace `src/app/admin/(app)/attendance/sessions/[id]/page.tsx` with:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canViewClub } from "@/lib/auth/capabilities";
import { getSessionMarking } from "@/lib/admin/attendance-club";
import { SessionRoster } from "@/components/admin/SessionRoster";
import { istNumericDate } from "@/lib/datetime";

export default async function SessionPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const { saved } = await searchParams;
  const detail = await getSessionMarking(id);
  if (!detail) notFound();
  if (!canViewClub(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");
  const canEdit = canManage(session, "manage:members", detail.session.clubId);
  const s = detail.session;
  const slot = s.startTime && s.endTime ? ` · ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}` : "";

  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance · {s.sessionDate ? istNumericDate(s.sessionDate) : istNumericDate(s.openedAt)}{slot}</div>
      <h1 style={{ margin: "6px 0 16px" }}>{s.title}</h1>
      {saved ? <div className="note" style={{ marginBottom: 16 }}>Attendance saved.</div> : null}
      <SessionRoster sessionId={s.id} roster={detail.roster} canEdit={canEdit} />
    </div>
  );
}
```

> `istNumericDate` accepts a `YYYY-MM-DD` string safely (used elsewhere for `poster`/dates). Verify by reading `src/lib/datetime.ts` before relying on it; if it needs a full timestamp, pass `${s.sessionDate}T00:00:00Z`.

- [ ] **Step 5: Update the dashboard**

In `src/app/admin/(app)/attendance/page.tsx`: change the import `OpenSessionForm` → `CreateSessionForm` and the JSX `<OpenSessionForm .../>` → `<CreateSessionForm clubId={grant === "all" ? clubId : null} />`. Remove the `getOpenSession` import and the `open` variable and its `Promise.all` slot (drop the "Session open … live view" note entirely — there is no open/close now). The session-history table stays but add a date/slot column:

Replace the history `thead`/`tbody` with:

```tsx
            <thead><tr><th>Session</th><th>Date</th><th>Slot</th><th>Present</th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/admin/attendance/sessions/${s.id}`} style={{ color: "var(--forest)" }}>{s.title}</Link></td>
                <td>{s.sessionDate ? istNumericDate(s.sessionDate) : istNumericDate(s.openedAt)}</td>
                <td>{s.startTime && s.endTime ? `${s.startTime.slice(0,5)}–${s.endTime.slice(0,5)}` : "—"}</td>
                <td>{s.presentCount}</td>
              </tr>
            ))}</tbody>
```

And change the `Promise.all` to `const [roster, sessions] = await Promise.all([rosterWithPercent(clubId), listSessions(clubId)]);` (drop `getOpenSession`). The "Create session" form renders whenever `canManageClub` (no open-session branch):

```tsx
      <section style={{ marginTop: 20 }}>
        {canManageClub ? <CreateSessionForm clubId={grant === "all" ? clubId : null} />
          : <p className="body-text" style={{ color: "var(--ink-3)" }}>Only club heads can create sessions.</p>}
      </section>
```

- [ ] **Step 6: Delete the dead components**

```bash
git rm src/components/admin/OpenSessionForm.tsx src/components/admin/LiveSession.tsx
```

- [ ] **Step 7: Verify the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS. (The club feed route still exists but is now unreferenced — deleted in Task 10.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(attendance): scheduled sessions + manual present/absent marking"
```

---

## Task 7: Member CRUD, approval (Onboard/Reject), join link, photo

**Files:**
- Modify: `src/lib/admin/members.ts`
- Modify: `src/app/admin/(app)/attendance/actions.ts`
- Modify: `src/components/admin/MemberForm.tsx`
- Modify: `src/app/admin/(app)/attendance/members/page.tsx`
- Modify: `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx`
- Modify: `src/app/admin/(app)/attendance/members/new/page.tsx` (no change needed unless it imports removed symbols — verify)
- Modify: `src/lib/admin/image-upload.ts`
- Create: `src/components/admin/JoinLinkPanel.tsx`

**Interfaces:**
- Consumes: `getClubByJoinToken` is not needed here; `handleImageUpload` with `maxBytes` (added here).
- Produces: `onboardMemberAction(formData)=>void`, `rejectMemberAction(formData)=>void`, `resetJoinTokenAction(formData)=>void`; `listPendingMembers(clubId)`, `getClubJoinToken(clubId)`, member photo signed URL in `getMemberForEdit`.

- [ ] **Step 1: Extend `image-upload.ts` with a size cap param**

In `src/lib/admin/image-upload.ts`, change the signature and cap:

```ts
export async function handleImageUpload(
  formData: FormData,
  opts: { bucket: string; field?: string; maxBytes?: number },
): Promise<{ path?: string; error?: string }> {
  const file = formData.get(opts.field ?? "image");
  if (!(file instanceof File) || file.size === 0) return {};
  const max = opts.maxBytes ?? MAX_IMAGE;
  if (file.size > max) return { error: `Image must be ${Math.round(max / 1024)} KB or smaller.` };
  // ...unchanged from here (ext check + upload)...
}
```

- [ ] **Step 2: Extend `members.ts`**

Add `approvedAt` + `photoPath` to `MemberForEdit` and `AdminMemberRow`; select them; add pending list + join-token read + a signed-photo-URL helper. Append/adjust:

```ts
export interface AdminMemberRow {
  id: string; name: string; rollNo: string | null; role: MemberRole;
  isActive: boolean; sort: number; clubId: string; clubName: string | null;
  approvedAt: string | null;
}
```

In `listMembers`, add `approved_at` to the select and map `approvedAt: m.approved_at`, and filter to approved only (`.not("approved_at", "is", null)`).

Add:

```ts
export async function listPendingMembers(clubId: string): Promise<AdminMemberRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, role, is_active, sort, club_id, approved_at, clubs(name)")
    .eq("club_id", clubId).is("approved_at", null).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id, name: m.name, rollNo: m.roll_no, role: m.role, isActive: m.is_active,
    sort: m.sort, clubId: m.club_id, clubName: m.clubs?.name ?? null, approvedAt: m.approved_at,
  }));
}

export async function getClubJoinToken(clubId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("clubs").select("join_token").eq("id", clubId).maybeSingle();
  return data?.join_token ?? null;
}

/** A short-lived signed URL for a member's photo in the private bucket (admin view only). */
export async function memberPhotoUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from("member-photos").createSignedUrl(photoPath, 300);
  return data?.signedUrl ?? null;
}
```

In `getMemberForEdit`, add `photo_path, approved_at` to the select and to the returned object (`photoPath: data.photo_path, approvedAt: data.approved_at`), and add those two fields to the `MemberForEdit` interface. **Remove `isMemberActivated`** (it reads `club_member_auth`, dropped in Task 11) — the edit page stops using it in Step 5.

- [ ] **Step 3: Rework member actions in `actions.ts`**

Remove: `generateMemberLinkAction`, `resetMemberAccessAction`, `requireOwnClubMember`, and the imports of `createMemberInvite`, `resetMemberAccess`, `ensureAuthRow`, `enqueueEmail`, `MemberInviteState`. In `MemberSchema` add nothing (photo handled separately). Update `createMemberAction` and `updateMemberAction` to (a) upload the photo and (b) set approval; add the three new actions:

In `createMemberAction`, after building the row, add a photo upload and `approved_at`:

```ts
  const photo = await handleImageUpload(formData, { bucket: "member-photos", field: "photo", maxBytes: 200 * 1024 });
  if (photo.error) return { error: photo.error };
  // ...in the .insert({...}) add:
  //   photo_path: photo.path ?? null,
  //   approved_at: new Date().toISOString(),   // admin-added members are auto-approved
```

In `updateMemberAction`, upload an optional replacement photo and only overwrite `photo_path` when a new file was provided:

```ts
  const photo = await handleImageUpload(formData, { bucket: "member-photos", field: "photo", maxBytes: 200 * 1024 });
  if (photo.error) return { error: photo.error };
  // ...in the .update({...}) add (conditionally):
  //   ...(photo.path ? { photo_path: photo.path } : {}),
```

Add the import `import { handleImageUpload } from "@/lib/admin/image-upload";` and keep `getMemberForEdit` import.

Append the approval + token actions (own-club guarded):

```ts
export async function onboardMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance/members");
  const member = await getMemberForEdit(id);
  if (!member) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  const admin = createAdminClient();
  await admin.from("club_members").update({ approved_at: new Date().toISOString() }).eq("id", id);
  await writeAudit({ actorId: session.id, action: "update", entity: "club_member", entityId: id, after: { onboarded: true } });
  redirect(`/admin/attendance/members?club=${member.clubId}`);
}

export async function rejectMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance/members");
  const member = await getMemberForEdit(id);
  if (!member) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  if (member.approvedAt) redirect(`/admin/attendance/members?club=${member.clubId}`); // only reject pending
  const admin = createAdminClient();
  await admin.from("club_members").delete().eq("id", id);
  await writeAudit({ actorId: session.id, action: "delete", entity: "club_member", entityId: id, before: { name: member.name, pending: true } });
  redirect(`/admin/attendance/members?club=${member.clubId}`);
}

export async function resetJoinTokenAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const clubId = String(formData.get("clubId") ?? "");
  if (!z.string().uuid().safeParse(clubId).success) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", clubId)) redirect("/admin/attendance/members");
  const admin = createAdminClient();
  await admin.from("clubs").update({ join_token: crypto.randomUUID() }).eq("id", clubId);
  await writeAudit({ actorId: session.id, action: "update", entity: "club", entityId: clubId, after: { joinTokenReset: true } });
  redirect(`/admin/attendance/members?club=${clubId}`);
}
```

- [ ] **Step 4: Add a photo field to `MemberForm.tsx`**

Add `photoUrl?: string | null` to `MemberInitial`. Change the form tag to `encType="multipart/form-data"` (a plain `<form action={formAction}>` with a file input works with server actions in this Next version — verify against `node_modules/next/dist/docs/`; if needed add `encType`). Fix the email label (login copy is gone) and add a photo input + preview:

```tsx
      <div className="field">
        <label htmlFor="email">Email (contact)</label>
        <input id="email" name="email" type="email" maxLength={200} defaultValue={initial?.email} placeholder="vtuxxxxx@veltech.edu.in" />
      </div>
      <div className="field">
        <label htmlFor="photo">Passport photo (≤ 200 KB){initial ? " — leave empty to keep current" : ""}</label>
        {initial?.photoUrl ? <img src={initial.photoUrl} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 4, marginBottom: 8 }} /> : null}
        <input id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
      </div>
```

Update the roll input placeholder to `12345` and add `inputMode="numeric"`, and the phone input placeholder to `10-digit mobile`.

- [ ] **Step 5: Rewrite the member-edit page (drop login block + QR)**

Replace `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx` with a version that removes `MemberQrCard`, `MemberLoginAccess`, `isMemberActivated`, and the two removed actions, and adds the photo preview:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getMemberForEdit, memberPhotoUrl } from "@/lib/admin/members";
import { listClubsBrief } from "@/lib/admin/clubs";
import { MemberForm } from "@/components/admin/MemberForm";
import { DeleteMemberForm } from "@/components/admin/DeleteMemberForm";
import { updateMemberAction } from "../../../actions";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const member = await getMemberForEdit(id);
  if (!member) notFound();
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  const clubs = grantFor(session.role, "manage:members") === "all" ? await listClubsBrief() : undefined;
  const photoUrl = await memberPhotoUrl(member.photoPath);
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance{member.approvedAt ? "" : " · pending"}</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit member</h1>
      <MemberForm
        action={updateMemberAction} submitLabel="Save changes" id={member.id} clubs={clubs}
        initial={{
          name: member.name, rollNo: member.rollNo ?? "", email: member.email ?? "", phone: member.phone ?? "",
          sort: member.sort, isActive: member.isActive, clubId: member.clubId, photoUrl,
        }}
      />
      <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>Remove</div>
        <DeleteMemberForm id={member.id} />
      </section>
    </div>
  );
}
```

Add `photoPath` + `approvedAt` to `MemberForEdit` (Step 2 covered this) and `photoUrl` to `MemberInitial` (Step 4).

- [ ] **Step 6: Create `JoinLinkPanel.tsx`**

```tsx
// src/components/admin/JoinLinkPanel.tsx
"use client";
import { useState } from "react";
import { resetJoinTokenAction } from "@/app/admin/(app)/attendance/actions";

export function JoinLinkPanel({ clubId, url }: { clubId: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="note" style={{ display: "grid", gap: 8 }}>
      <div><strong>Self-registration link</strong> — share with your club; members fill their details and land as pending.</div>
      <code style={{ wordBreak: "break-all", fontSize: 12 }}>{url}</code>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm"
          onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied!" : "Copy link"}
        </button>
        <form action={resetJoinTokenAction}>
          <input type="hidden" name="clubId" value={clubId} />
          <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Reset link</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add pending approvals + join link to the members page**

In `src/app/admin/(app)/attendance/members/page.tsx`, after computing `clubId`, load the extras and render a pending section + the panel. Add imports:

```tsx
import { listMembers, listPendingMembers, getClubJoinToken } from "@/lib/admin/members";
import { JoinLinkPanel } from "@/components/admin/JoinLinkPanel";
import { onboardMemberAction, rejectMemberAction } from "../../actions";
```

Replace `const members = await listMembers(clubId);` with:

```tsx
  const [members, pending, joinToken] = await Promise.all([
    listMembers(clubId), listPendingMembers(clubId), getClubJoinToken(clubId),
  ]);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const joinUrl = joinToken ? `${base}/join/${joinToken}` : "";
```

After the page head, before the members table, add:

```tsx
      {canCreate && joinUrl ? <div style={{ marginTop: 16 }}><JoinLinkPanel clubId={clubId} url={joinUrl} /></div> : null}

      {pending.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 8px" }}>Pending approvals ({pending.length})</h2>
          <div className="tablewrap">
            <table className="admin">
              <thead><tr><th>Name</th><th>Roll</th><th></th></tr></thead>
              <tbody>{pending.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <form action={onboardMemberAction}><input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-sm btn-primary">Onboard</button></form>
                    <form action={rejectMemberAction}><input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Reject</button></form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
```

(The `canCreate`/`grant`/`newHref` logic stays as-is; the members table stays as-is.)

- [ ] **Step 8: Verify `members/new/page.tsx`**

It imports only `createMemberAction`, `MemberForm`, `listClubsBrief`, guards — none removed. No change needed. Confirm `npm run typecheck` doesn't flag it.

- [ ] **Step 9: Verify the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS.

> `MemberQrCard.tsx` / `MemberLoginAccess.tsx` are now unreferenced (still importing the soon-deleted libs, but that compiles). They are deleted in Task 10.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(attendance): member CRUD + photo + Onboard/Reject approvals + join link"
```

---

## Task 8: Public self-registration (link → form → route)

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Create: `src/app/join/[token]/page.tsx`
- Create: `src/components/roster/SelfRegisterForm.tsx`
- Create: `src/app/api/roster/register/route.ts`

**Interfaces:**
- Consumes: `validateRegistration`, `validatePhoto` (Task 2), `handleImageUpload` (Task 7), `getClubByJoinToken` (Task 5).
- Produces: `POST /api/roster/register` (multipart); `checkMemberSignupLimits`.

- [ ] **Step 1: Add the signup rate limit**

Append to `src/lib/rate-limit.ts`:

```ts
/** Self-registration: 5 per IP / 10 min, plus 3 per roll / hour. First trip wins. */
export function checkMemberSignupLimits(input: { ip: string; roll: string }): RateResult {
  const checks: RateResult[] = [
    rateLimit(`signup:ip:${input.ip}`, 5, 10 * MIN),
    rateLimit(`signup:roll:${input.roll}`, 3, HOUR),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/** Public roll lookup: 20 per IP / 10 min. */
export function checkRollLookupLimits(ip: string): RateResult {
  return rateLimit(`lookup:ip:${ip}`, 20, 10 * MIN);
}
```

- [ ] **Step 2: Create the public route handler**

```ts
// src/app/api/roster/register/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { getClubByJoinToken } from "@/lib/admin/clubs";
import { validateRegistration, validatePhoto } from "@/lib/roster/validation";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { checkMemberSignupLimits } from "@/lib/rate-limit";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 300_000) return Response.json({ error: "Payload too large." }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const token = String(form.get("token") ?? "");
  const club = token ? await getClubByJoinToken(token) : null;
  if (!club) return Response.json({ error: "This registration link is invalid." }, { status: 404 });

  const parsed = validateRegistration({
    name: form.get("name"), roll: form.get("roll"), email: form.get("email"), phone: form.get("phone"),
  });
  if (!parsed.ok) return Response.json({ error: "Please check the form.", fields: parsed.errors }, { status: 400 });

  const photoFile = form.get("photo");
  const photoErr = validatePhoto(photoFile instanceof File ? { size: photoFile.size, type: photoFile.type } : null);
  if (photoErr) return Response.json({ error: photoErr, fields: { photo: photoErr } }, { status: 400 });

  const ip = clientIp(request);
  const limit = checkMemberSignupLimits({ ip, roll: parsed.value.roll });
  if (!limit.ok) return Response.json({ error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const photo = await handleImageUpload(form, { bucket: "member-photos", field: "photo", maxBytes: 200 * 1024 });
  if (photo.error) return Response.json({ error: photo.error }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("club_members").insert({
    club_id: club.id, name: parsed.value.name, roll_no: parsed.value.roll,
    email: parsed.value.email, phone: parsed.value.phone, photo_path: photo.path ?? null,
    role: "member", is_active: true, approved_at: null, sort: 0, socials: {},
  });
  if (error?.code === "23505") return Response.json({ error: "That roll number is already registered." }, { status: 409 });
  if (error) { console.error("roster register failed", error); return Response.json({ error: "Something went wrong. Try again." }, { status: 500 }); }

  return Response.json({ ok: true, roll: parsed.value.roll });
}
```

- [ ] **Step 3: Create the client form**

```tsx
// src/components/roster/SelfRegisterForm.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SelfRegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("token", token);
    const res = await fetch("/api/roster/register", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { router.push(`/attendance?roll=${json.roll}&new=1`); return; }
    setError(json.error ?? "Something went wrong.");
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 460 }}>
      {error ? <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{error}</div> : null}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="name">Full name</label>
        <input id="name" name="name" required maxLength={120} placeholder="Your full name" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="roll">VTU roll number</label>
        <input id="roll" name="roll" required inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="12345" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="email">College email</label>
        <input id="email" name="email" type="email" required placeholder="vtu12345@veltech.edu.in" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="phone">Phone (10 digits)</label>
        <input id="phone" name="phone" required inputMode="numeric" pattern="\d{10}" maxLength={10} placeholder="9876543210" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="photo">Passport photo (≤ 200 KB)</label>
        <input id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" required />
      </div>
      <button className="btn btn-primary" disabled={busy} style={{ justifySelf: "start" }}>
        {busy ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Create the public page**

```tsx
// src/app/join/[token]/page.tsx
import { notFound } from "next/navigation";
import { getClubByJoinToken } from "@/lib/admin/clubs";
import { SelfRegisterForm } from "@/components/roster/SelfRegisterForm";

export const metadata = { robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const club = await getClubByJoinToken(token);
  if (!club) notFound();
  return (
    <main className="container" style={{ maxWidth: 560, padding: "48px 20px" }}>
      <div className="eyebrow">{club.name}</div>
      <h1 style={{ margin: "6px 0 8px" }}>Join the roster</h1>
      <p className="lead" style={{ marginBottom: 20 }}>
        Fill in your details. Your club head will approve you, after which you can check your attendance any time by roll number.
      </p>
      <SelfRegisterForm token={token} />
    </main>
  );
}
```

- [ ] **Step 5: Verify by curl (route handlers curl fine)**

Run the dev server (`npm run dev`), then:

```bash
# invalid token → 404
curl -s -o /dev/null -w "%{http_code}\n" -F token=bad -F name=Test -F roll=12345 \
  -F email=vtu12345@veltech.edu.in -F phone=9876543210 -F photo=@some-small.jpg \
  http://localhost:3000/api/roster/register   # expect 404

# bad roll → 400
curl -s -F token=<REAL_CLUB_join_token> -F name=Test -F roll=99 \
  -F email=vtu99@veltech.edu.in -F phone=9876543210 -F photo=@some-small.jpg \
  http://localhost:3000/api/roster/register   # expect {"error":...,"fields":{"roll":...}}
```

Get a real `join_token` via the Supabase MCP/SQL (`select join_token from clubs limit 1`). Do **one** valid insert with a throwaway roll, confirm the row lands as pending (`approved_at is null`), then **delete it** (`delete from club_members where roll_no='<throwaway>'`) and delete the uploaded object from `member-photos` — the live DB is shared.

- [ ] **Step 6: Verify the gate & commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add -A
git commit -m "feat(roster): public self-registration link, form, and route"
```

---

## Task 9: Public roll-number attendance lookup

**Files:**
- Create: `src/app/attendance/page.tsx`

**Interfaces:**
- Consumes: `getMemberAttendanceByRoll` (Task 5), `checkRollLookupLimits` (Task 8), `istNumericDate`.

- [ ] **Step 1: Create the lookup page**

```tsx
// src/app/attendance/page.tsx
import { headers } from "next/headers";
import { getMemberAttendanceByRoll } from "@/lib/admin/attendance-club";
import { checkRollLookupLimits } from "@/lib/rate-limit";
import { istNumericDate } from "@/lib/datetime";
import { ROLL_RE } from "@/lib/roster/validation";

export const metadata = { title: "Check attendance", robots: { index: false } };

export default async function AttendanceLookup({ searchParams }: { searchParams: Promise<{ roll?: string; new?: string }> }) {
  const { roll, new: isNew } = await searchParams;
  let result: Awaited<ReturnType<typeof getMemberAttendanceByRoll>> | null = null;
  let notice: string | null = null;

  if (roll && ROLL_RE.test(roll)) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (checkRollLookupLimits(ip).ok) result = await getMemberAttendanceByRoll(roll);
    else notice = "Too many lookups. Please try again in a few minutes.";
  } else if (roll) {
    notice = "Enter a 5-digit roll number.";
  }

  return (
    <main className="container" style={{ maxWidth: 560, padding: "48px 20px" }}>
      <div className="eyebrow">CSE Council</div>
      <h1 style={{ margin: "6px 0 16px" }}>Check your attendance</h1>
      {isNew ? <div className="note" style={{ marginBottom: 16 }}>You&rsquo;re registered — awaiting approval by your club head.</div> : null}
      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input name="roll" inputMode="numeric" pattern="\d{5}" maxLength={5} defaultValue={roll} placeholder="Your 5-digit roll" style={{ maxWidth: 220 }} />
        <button className="btn btn-primary">Check</button>
      </form>
      {notice ? <p className="body-text" style={{ color: "var(--ink-2)" }}>{notice}</p> : null}
      {roll && !notice && !result ? <p className="body-text" style={{ color: "var(--ink-2)" }}>No attendance record for that roll number.</p> : null}
      {result?.status === "pending" ? (
        <p className="body-text">{result.name} — registration pending approval by {result.clubName ?? "your club"}.</p>
      ) : null}
      {result?.status === "active" ? (
        <section>
          <h2 style={{ font: "400 20px var(--serif)", margin: "0 0 4px" }}>{result.name}</h2>
          <p className="body-text" style={{ color: "var(--ink-2)" }}>{result.clubName ?? "—"}</p>
          <div className="att-count" style={{ margin: "16px 0" }}>
            <strong>{result.pct}%</strong><span>{result.attended} of {result.eligible} sessions</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
            {result.history.map((h, i) => (
              <li key={i} className="rule" style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6 }}>
                <span>{h.title} · {istNumericDate(h.date)}</span>
                <span style={{ color: h.present ? "var(--forest)" : "var(--ink-3)" }}>{h.present ? "Present" : "Absent"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Verify read paths**

Run the dev server; visit `/attendance` (form shows), `/attendance?roll=00000` (no record), and — after seeding+approving a throwaway member — `/attendance?roll=<that>` (shows name/club/%). Confirm **no** phone/email/photo appears anywhere on the page. Delete the throwaway row after.

- [ ] **Step 3: Verify the gate & commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

```bash
git add -A
git commit -m "feat(roster): public roll-number attendance lookup"
```

---

## Task 10: Remove QR + member portal, strip shared lib, fix proxy, drop deps

**Files:**
- Delete: `src/app/member/**`, `src/lib/member/**`, `src/components/member/**`, `src/app/api/member/qr/route.ts`, `src/app/m/[token]/page.tsx`, `src/app/api/admin/attendance/club/scan/route.ts`, `src/app/api/admin/attendance/club/feed/route.ts`, `src/app/admin/(app)/attendance/scan/page.tsx`, `src/components/admin/QrScanner.tsx`, `MemberQrCard.tsx`, `MemberLoginAccess.tsx`, `src/lib/qr.ts`, `src/lib/qr.test.ts`
- Modify: `src/lib/attendance.ts`, `src/lib/attendance.test.ts`, `src/proxy.ts`, `package.json`

**Interfaces:** none produced; this removes dead surface.

- [ ] **Step 1: Delete the dead files**

```bash
git rm -r src/app/member src/lib/member src/components/member \
  src/app/api/member/qr/route.ts src/app/m src/app/api/admin/attendance/club/scan/route.ts \
  src/app/api/admin/attendance/club/feed/route.ts src/app/admin/(app)/attendance/scan/page.tsx \
  src/components/admin/QrScanner.tsx src/components/admin/MemberQrCard.tsx \
  src/components/admin/MemberLoginAccess.tsx src/lib/qr.ts src/lib/qr.test.ts
```

(Remove now-empty `src/app/api/admin/attendance/club/` and `src/app/api/member/` dirs if git leaves them.)

- [ ] **Step 2: Strip member-token exports from `src/lib/attendance.ts`**

Remove the `memberToken`, `memberExpiringToken`, `verifyMemberToken`, `verifyMemberExpiringToken` functions and any `member:v1|`-related constants/helpers used **only** by them. **Keep** everything the event flow uses: `DEVICE_COOKIE`, `newDeviceId`, `deviceHash`, `verifyCode`, `isSessionOpen`, `currentCode`, `secondsLeft`. Then remove the member-token `describe`/`it` blocks from `src/lib/attendance.test.ts`, keeping the device/code tests.

- [ ] **Step 3: Fix `proxy.ts`**

Remove the `import { MEMBER_COOKIE } from "@/lib/member/session";` line, the entire `if (pathname.startsWith("/member")) { … }` block, and change the matcher to `matcher: ["/admin/:path*"]`.

- [ ] **Step 4: Drop the QR dependencies**

```bash
npm remove html5-qrcode qrcode
```

(This updates `package.json` + `package-lock.json`. If `qrcode` had an `@types/qrcode`, remove that too: `npm remove @types/qrcode`.)

- [ ] **Step 5: Confirm nothing dangles**

Run: `grep -rEn "@/lib/qr|@/lib/member|memberToken|verifyMemberToken|MemberQrCard|MemberLoginAccess|LiveSession|OpenSessionForm|html5-qrcode|/member" src` — expect **no** hits in `src` (docs may still mention them). Fix any stragglers.

- [ ] **Step 6: Verify the gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS, with the test count dropped by the removed member-portal/qr suites and raised by the new pure tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(attendance): remove all club QR + the member login portal"
```

---

## Task 11: Drop migration (post-deploy) + STATUS update

**Files:**
- Create: `supabase/migrations/20260828010000_drop_member_portal.sql`
- Modify: `docs/STATUS.md`

**Interfaces:** none.

- [ ] **Step 1: Write the drop migration**

```sql
-- Manual attendance (destructive half). Apply ONLY AFTER the new code is deployed
-- to prod — the old member portal + old openSessionAction reference these objects.
drop table if exists public.member_invites;
drop table if exists public.club_member_auth;
alter table public.club_attendance_sessions drop column if exists qr_ttl_seconds;
drop index if exists public.club_sessions_one_open;
```

- [ ] **Step 2: Update `docs/STATUS.md`**

Under START HERE, add a shipped entry describing the manual-attendance rework (QR + member portal removed; self-registration + approval + scheduled sessions + manual marking + public roll lookup live), note the two migrations (additive applied during build; drop applied post-deploy), and remove/annotate the now-obsolete QR/member-portal "owed walkthrough" items. Add the new human-only walkthroughs: self-register via the club link → head Onboards → create a session → mark present/absent → check attendance by roll.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260828010000_drop_member_portal.sql docs/STATUS.md
git commit -m "chore(attendance): drop-migration for orphaned portal tables + STATUS"
```

- [ ] **Step 4: Post-merge/deploy — apply the drop migration**

After `main` is deployed to prod (so old code is gone), apply `20260828010000_drop_member_portal.sql` to the live DB via the Supabase MCP `apply_migration` (name `drop_member_portal`) or the SQL editor. Verify: `select to_regclass('public.club_member_auth')` → null.

---

## Self-Review

**Spec coverage:**
- §2 removals → Task 10 (+ Task 6 removes OpenSessionForm/LiveSession, Task 7 the login block). ✅
- §2c strip-not-delete `attendance.ts` → Task 10 Step 2. ✅
- §3 data model → Task 1 (additive) + Task 11 (drops). ✅
- §4 self-registration (fields, validation, route, pending, one-time confirmation) → Tasks 2, 8 (+ redirect to `/attendance?...&new=1`). ✅
- §5 approval + head CRUD + join link → Task 7. ✅
- §6 sessions name/date/slot → Tasks 5, 6. ✅
- §7 manual marking (default absent, save diff) → Tasks 3, 6. ✅
- §8 public roll lookup (name+club+% only, rate-limited) → Tasks 5, 9. ✅
- §9 attendance math on session_date → Task 4 + Task 5 callers. ✅
- §10 reused infra (rate-limit, image-upload maxBytes, capabilities, audit) → Tasks 7, 8. ✅
- §11 testing → pure tests in Tasks 2–4; curl in Task 8; walkthroughs in Task 11. ✅

**Placeholder scan:** the only intentional "wrong" line is the flagged stray `alter public.clubs is null;` in Task 1, with an explicit instruction to delete it — no silent placeholders elsewhere.

**Type consistency:** `SessionRow` gains `sessionDate/startTime/endTime` (Task 5) and is consumed with those names in Task 6. `MemberForEdit` gains `photoPath/approvedAt` (Task 7 Step 2) consumed in Step 5. `summarizeAttendance({id,date})` (Task 4) matches the `sess`/`rows` shapes built in Task 5. `getMemberAttendanceByRoll` returns the discriminated `RollLookup` consumed in Task 9. `handleImageUpload(..., {maxBytes})` defined Task 7 Step 1, used Tasks 7–8.

**Open items carried from the spec:** route name `/join/[token]` (namespace freed by the recruitment removal); `status`/`closed_at` columns retained-but-unused (not dropped). Both are the owner-accepted choices from the spec's §14.
