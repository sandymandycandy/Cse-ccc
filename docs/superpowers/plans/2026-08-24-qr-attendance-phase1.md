# QR Attendance — Phase 1 (Club-Member) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship club-member QR attendance — heads scan members' personal QR codes to mark them present at club sessions, with a live dashboard, attendance %, history, and a no-login member self-view.

**Architecture:** A new, parallel track beside the existing event self-scan (untouched). Extend `club_members` as the member/profile entity; two new tables (`club_attendance_sessions`, `club_attendance`) with a `UNIQUE(session_id, member_id)` duplicate-scan guard. A static `HMAC(member_id)` token (reusing `ATTENDANCE_HMAC_SECRET`) is the member's QR; the same token marks-present when a head scans it and powers `/m/[token]`. All writes go through service-role server actions/routes gated by a new `manage:members` capability; an `html5-qrcode` client scanner posts to a guarded scan route.

**Tech Stack:** Next 16 (App Router, RSC, server actions), TypeScript strict, Supabase (Postgres + RLS + service role), `qrcode` (already a dep), `html5-qrcode` (new dep), vitest, Zod, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-24-qr-attendance-design.md`

## Global Constraints

- **Phase 1 only** — club-member attendance. Do NOT touch the existing event attendance (`attendance_sessions`/`attendance_scans`/`student_devices`, `/a/[session]`, `/api/attendance/*`). The event flavor is a separate future plan.
- **DB writes via service role only.** New tables get RLS enabled with **no permissive policies**; all reads/writes go through `createAdminClient()` in server code. Never expose these tables to the anon/public client.
- **Every admin API route handler MUST call a guard** (`requireSession`/`requireRole`/`requireCapability`) — the ESLint rule `local/admin-route-requires-guard` fails the build otherwise.
- **Club scope read fresh from the DB**, never from the request body. Use `canManage(session, "manage:members", clubId)` where `clubId` comes from the loaded row.
- **Migrations:** apply to the live DB via the Supabase MCP `apply_migration`, AND mirror the SQL into `supabase/migrations/<timestamp>_<name>.sql` (repo = source of truth). Regenerate types via the MCP `generate_typescript_types` and write into `src/lib/database.types.ts` — the Supabase **CLI is not installed** and `npm run types:gen` truncates the file.
- **Verify commands:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` must all pass before each commit that ends a task.
- **Token secret:** reuse `ATTENDANCE_HMAC_SECRET` (already set in all envs). Do not invent a new secret.
- **Commit trailers:** end every commit message with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CAdAeuvMmMfBWNDtfjyFdD
  ```

---

## File Structure

**Create:**
- `supabase/migrations/20260824030000_club_attendance.sql` — Phase-1 schema.
- `src/lib/admin/members.ts` — member roster reads (service role).
- `src/lib/admin/attendance-club.ts` — session + attendance reads (roster %, present/absent, history, live feed, member self-view data).
- `src/lib/qr.ts` — QR image (data URL) generation via `qrcode`.
- `src/app/admin/(app)/attendance/actions.ts` — member CRUD + session open/close server actions.
- `src/app/admin/(app)/attendance/page.tsx` — dashboard (roster %, sessions, actions).
- `src/app/admin/(app)/attendance/members/page.tsx` — member list.
- `src/app/admin/(app)/attendance/members/new/page.tsx` — add member.
- `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx` — edit member + QR card + delete.
- `src/app/admin/(app)/attendance/sessions/[id]/page.tsx` — live session view.
- `src/app/admin/(app)/attendance/scan/page.tsx` — scanner page.
- `src/app/api/admin/attendance/club/scan/route.ts` — POST: mark present.
- `src/app/api/admin/attendance/club/feed/route.ts` — GET: live feed (polled).
- `src/app/m/[token]/page.tsx` — member self-view (public, no login).
- `src/components/admin/MemberForm.tsx` — add/edit member (client).
- `src/components/admin/DeleteMemberForm.tsx` — confirm-guarded delete (client).
- `src/components/admin/QrScanner.tsx` — html5-qrcode camera scanner (client).
- `src/components/admin/MemberQrCard.tsx` — printable QR card (server).
- `src/lib/attendance.test.ts` — token unit tests.
- `src/lib/qr.test.ts` — QR util unit test.

**Modify:**
- `src/lib/attendance.ts` — add `memberToken`/`verifyMemberToken`.
- `src/lib/auth/capabilities.ts` — add `manage:members` capability + grants.
- `src/lib/auth/capabilities.test.ts` — grant assertions.
- `src/lib/admin/form-state.ts` — add `MemberFormState`, `SessionFormState`.
- `src/app/admin/(app)/layout.tsx` — add "Attendance" nav link.
- `src/lib/database.types.ts` — regenerated after the migration.
- `package.json` — add `html5-qrcode`.

---

## Task 1: Database schema + regenerated types

**Files:**
- Create: `supabase/migrations/20260824030000_club_attendance.sql`
- Modify: `src/lib/database.types.ts` (regenerated)

**Interfaces:**
- Produces: tables `club_attendance_sessions`, `club_attendance`; enum `club_session_status`; columns `club_members.roll_no`, `club_members.is_active`. Downstream tasks read these via `createAdminClient()` and the regenerated `Database` types.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260824030000_club_attendance.sql`:

```sql
-- Club-member QR attendance (Phase 1). Applied to the live project via the
-- Supabase MCP; this file mirrors it so the repo stays the source of truth.

-- 1. Extend the member roster with an optional identifier + an active flag.
alter table public.club_members
  add column if not exists roll_no text,
  add column if not exists is_active boolean not null default true;

-- 2. A club attendance session (one club meeting). Dedicated status enum — NOT
--    coupled to the event attendance_sessions enum.
do $$ begin
  create type public.club_session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.club_attendance_sessions (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  title      text not null,
  opened_by  uuid references public.admin_users(id),
  opened_at  timestamptz not null default now(),
  status     public.club_session_status not null default 'open',
  closed_at  timestamptz,
  event_id   uuid references public.events(id) on delete set null   -- Phase-2 seam; unused now
);

-- At most one OPEN session per club at a time.
create unique index if not exists club_sessions_one_open
  on public.club_attendance_sessions (club_id) where status = 'open';

-- 3. One row = one member marked present in one session (the UNIQUE is the
--    duplicate-scan guard).
create table if not exists public.club_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.club_attendance_sessions(id) on delete cascade,
  member_id  uuid not null references public.club_members(id) on delete cascade,
  marked_by  uuid references public.admin_users(id),
  marked_at  timestamptz not null default now(),
  unique (session_id, member_id)
);
create index if not exists club_attendance_member on public.club_attendance (member_id);

-- 4. RLS ON, NO permissive policies → anon/auth clients get nothing; all access
--    is via the service role (server actions/routes). Matches SECURITY_SPEC.
alter table public.club_attendance_sessions enable row level security;
alter table public.club_attendance enable row level security;
```

- [ ] **Step 2: Apply to the live DB via the Supabase MCP**

Call the MCP tool `apply_migration` with name `club_attendance` and the SQL above.

- [ ] **Step 3: Verify the schema landed**

Call MCP `execute_sql`:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='club_members' and column_name in ('roll_no','is_active');
select to_regclass('public.club_attendance_sessions'), to_regclass('public.club_attendance');
```
Expected: both new columns listed; both `to_regclass` non-null.

- [ ] **Step 4: Regenerate DB types**

Call MCP `generate_typescript_types`; write its full output into `src/lib/database.types.ts` (overwrite). Do NOT run `npm run types:gen` (it truncates the file — CLI not installed).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the new tables/columns now exist in the types).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260824030000_club_attendance.sql src/lib/database.types.ts
git commit -m "feat(attendance): club-member attendance schema (Phase 1)"
```

---

## Task 2: `manage:members` capability

**Files:**
- Modify: `src/lib/auth/capabilities.ts`
- Test: `src/lib/auth/capabilities.test.ts`

**Interfaces:**
- Produces: capability string `"manage:members"` usable with `canManage`/`canView`/`grantFor`/`requireCapability`. Grants: `faculty_advisor=read, president=all, vice_president=all, tech_head=all, club_head=own, vice_head=own`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/auth/capabilities.test.ts`:

```ts
import { grantFor } from "./capabilities";

describe("manage:members grants", () => {
  it("club head/vice head manage their own club; org-wide manage all; faculty read", () => {
    expect(grantFor("club_head", "manage:members")).toBe("own");
    expect(grantFor("vice_head", "manage:members")).toBe("own");
    expect(grantFor("president", "manage:members")).toBe("all");
    expect(grantFor("tech_head", "manage:members")).toBe("all");
    expect(grantFor("faculty_advisor", "manage:members")).toBe("read");
    expect(grantFor("events_head", "manage:members")).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capabilities`
Expected: FAIL — `manage:members` not in the `Capability` union / MATRIX.

- [ ] **Step 3: Add the capability**

In `src/lib/auth/capabilities.ts`, add to the `Capability` union (next to `manage:content`):
```ts
  | "manage:members"
```
And add to `MATRIX` (place after the `manage:content` entry):
```ts
  "manage:members": {
    faculty_advisor: "read", president: "all", vice_president: "all",
    tech_head: "all", club_head: "own", vice_head: "own",
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capabilities`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/capabilities.ts src/lib/auth/capabilities.test.ts
git commit -m "feat(auth): add manage:members capability"
```

---

## Task 3: Member QR token (sign + verify)

**Files:**
- Modify: `src/lib/attendance.ts`
- Test: `src/lib/attendance.test.ts` (create)

**Interfaces:**
- Produces:
  - `memberToken(memberId: string): string` → `"<memberId>.<sig>"` where `sig` is a base64url HMAC.
  - `verifyMemberToken(token: string): string | null` → the `memberId` if the signature is valid (constant-time), else `null`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/attendance.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.ATTENDANCE_HMAC_SECRET = "test-secret-attendance";
});

// Import AFTER the env is set (the module reads the secret lazily, but be safe).
const { memberToken, verifyMemberToken } = await import("./attendance");

describe("member QR token", () => {
  const id = "11111111-1111-1111-1111-111111111111";

  it("round-trips a valid token back to the member id", () => {
    const t = memberToken(id);
    expect(t.startsWith(id + ".")).toBe(true);
    expect(verifyMemberToken(t)).toBe(id);
  });

  it("rejects a tampered signature", () => {
    const t = memberToken(id);
    const bad = t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
    expect(verifyMemberToken(bad)).toBe(null);
  });

  it("rejects a token whose id was swapped (sig no longer matches)", () => {
    const t = memberToken(id);
    const otherId = "22222222-2222-2222-2222-222222222222";
    const forged = otherId + "." + t.split(".")[1];
    expect(verifyMemberToken(forged)).toBe(null);
  });

  it("rejects malformed tokens", () => {
    expect(verifyMemberToken("")).toBe(null);
    expect(verifyMemberToken("nodot")).toBe(null);
    expect(verifyMemberToken("a.b.c")).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- attendance`
Expected: FAIL — `memberToken`/`verifyMemberToken` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/attendance.ts` (it already imports `createHmac`, `timingSafeEqual` and defines `hmacSecret()`):

```ts
// ── member QR token (static, head-scanned) ───────────────────────────────────
// A member's QR encodes `<memberId>.<sig>`; the same token both marks the member
// present (a head scans it) and authorises their read-only self-view. Static
// (no time slot): the head's authenticated session is the trust anchor.

function memberSig(memberId: string): string {
  return createHmac("sha256", hmacSecret())
    .update(`member:v1|${memberId}`)
    .digest("base64url");
}

/** The token to embed in a member's QR. */
export function memberToken(memberId: string): string {
  return `${memberId}.${memberSig(memberId)}`;
}

/** The member id if `token` carries a valid signature (constant-time), else null. */
export function verifyMemberToken(token: string): string | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [memberId, sig] = parts;
  if (!memberId || !sig) return null;
  const expected = Buffer.from(memberSig(memberId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? memberId : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- attendance`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat(attendance): static member QR token (sign + verify)"
```

---

## Task 4: QR image utility

**Files:**
- Create: `src/lib/qr.ts`
- Test: `src/lib/qr.test.ts`

**Interfaces:**
- Produces: `qrDataUrl(text: string): Promise<string>` → a `data:image/png;base64,…` string for embedding in `<img src>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/qr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { qrDataUrl } from "./qr";

describe("qrDataUrl", () => {
  it("produces a PNG data URL for a URL", async () => {
    const out = await qrDataUrl("https://example.com/m/abc.def");
    expect(out.startsWith("data:image/png;base64,")).toBe(true);
    expect(out.length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- qr`
Expected: FAIL — `src/lib/qr.ts` missing.

- [ ] **Step 3: Implement**

Create `src/lib/qr.ts`:

```ts
import QRCode from "qrcode";

/** A PNG data URL for `text`, sized for on-screen scanning + printing. */
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 320, margin: 2, errorCorrectionLevel: "M" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- qr`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qr.ts src/lib/qr.test.ts
git commit -m "feat(attendance): QR image data-URL utility"
```

---

## Task 5: Member data layer + CRUD actions

**Files:**
- Create: `src/lib/admin/members.ts`
- Create: `src/app/admin/(app)/attendance/actions.ts`
- Modify: `src/lib/admin/form-state.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `getAdminSession`, `canManage`, `grantFor`, `resolveOwningClub`, `writeAudit`, `Database`.
- Produces:
  - `src/lib/admin/members.ts`:
    - `interface AdminMemberRow { id: string; name: string; rollNo: string | null; role: MemberRole; isActive: boolean; sort: number; clubId: string; clubName: string | null }`
    - `type MemberRole = "head" | "vice_head" | "member"`
    - `listMembers(clubId: string): Promise<AdminMemberRow[]>`
    - `interface MemberForEdit { id: string; name: string; rollNo: string | null; role: MemberRole; sort: number; isActive: boolean; clubId: string }`
    - `getMemberForEdit(id: string): Promise<MemberForEdit | null>`
  - `src/app/admin/(app)/attendance/actions.ts`: `createMemberAction`, `updateMemberAction`, `deleteMemberAction` (all `(prev: MemberFormState, formData) => Promise<MemberFormState>` except delete which is `(formData) => Promise<void>`).
  - `MemberFormState` in form-state.ts.

- [ ] **Step 1: Add form-state types**

In `src/lib/admin/form-state.ts` append:
```ts
export interface MemberFormState {
  error?: string;
}

export interface SessionFormState {
  error?: string;
}
```

- [ ] **Step 2: Write the member data layer**

Create `src/lib/admin/members.ts`:
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];

export interface AdminMemberRow {
  id: string;
  name: string;
  rollNo: string | null;
  role: MemberRole;
  isActive: boolean;
  sort: number;
  clubId: string;
  clubName: string | null;
}

export interface MemberForEdit {
  id: string;
  name: string;
  rollNo: string | null;
  role: MemberRole;
  sort: number;
  isActive: boolean;
  clubId: string;
}

export async function listMembers(clubId: string): Promise<AdminMemberRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, role, is_active, sort, club_id, clubs(name)")
    .eq("club_id", clubId)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    rollNo: m.roll_no,
    role: m.role,
    isActive: m.is_active,
    sort: m.sort,
    clubId: m.club_id,
    clubName: m.clubs?.name ?? null,
  }));
}

export async function getMemberForEdit(id: string): Promise<MemberForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, role, sort, is_active, club_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    rollNo: data.roll_no,
    role: data.role,
    sort: data.sort,
    isActive: data.is_active,
    clubId: data.club_id,
  };
}
```

- [ ] **Step 3: Write the member CRUD actions**

Create `src/app/admin/(app)/attendance/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { resolveOwningClub } from "@/lib/admin/club-scope";
import { writeAudit } from "@/lib/admin/audit";
import { getMemberForEdit } from "@/lib/admin/members";
import type { MemberFormState } from "@/lib/admin/form-state";

const MemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  rollNo: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.enum(["head", "vice_head", "member"]),
  sort: z.coerce.number().int().min(0).max(9999).optional().or(z.literal("")),
  isActive: z.union([z.literal("on"), z.literal("")]),
  // resolveOwningClub uses "manage:members" grant; "" = council-wide is INVALID
  // for members (a member always belongs to a club), so require a uuid for `all`.
  clubId: z.union([z.literal(""), z.string().uuid()]),
});

function parse(formData: FormData) {
  return MemberSchema.safeParse({
    name: formData.get("name"),
    rollNo: formData.get("rollNo") ?? "",
    role: formData.get("role"),
    sort: formData.get("sort") ?? "",
    isActive: formData.get("isActive") ? "on" : "",
    clubId: formData.get("clubId") ?? "",
  });
}

export async function createMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — name and role are required." };

  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.clubId == null) return { error: "Pick a club for this member." };
  if (!canManage(session, "manage:members", resolved.clubId)) {
    return { error: "You can't add members to that club." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .insert({
      club_id: resolved.clubId,
      name: parsed.data.name,
      roll_no: parsed.data.rollNo ? parsed.data.rollNo : null,
      role: parsed.data.role,
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : 0,
      is_active: parsed.data.isActive === "on",
      socials: {},
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add the member. Try again." };

  await writeAudit({
    actorId: session.id, action: "create", entity: "club_member",
    entityId: data.id, after: { name: parsed.data.name, role: parsed.data.role, clubId: resolved.clubId },
  });
  redirect("/admin/attendance/members");
}

export async function updateMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Missing member reference." };
  const existing = await getMemberForEdit(id);
  if (!existing) return { error: "That member no longer exists." };
  if (!canManage(session, "manage:members", existing.clubId)) {
    return { error: "You can't manage that member." };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { error: "Check the form — name and role are required." };

  // A club-scoped admin cannot move a member to another club; org-wide can.
  const resolved = resolveOwningClub(session, "manage:members", parsed.data.clubId);
  if ("error" in resolved) return { error: resolved.error };
  const targetClub = resolved.clubId ?? existing.clubId;
  if (!canManage(session, "manage:members", targetClub)) {
    return { error: "You can't file members there." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("club_members")
    .update({
      name: parsed.data.name,
      roll_no: parsed.data.rollNo ? parsed.data.rollNo : null,
      role: parsed.data.role,
      sort: typeof parsed.data.sort === "number" ? parsed.data.sort : 0,
      is_active: parsed.data.isActive === "on",
      club_id: targetClub,
    })
    .eq("id", id);
  if (error) return { error: "Could not save your changes. Try again." };

  await writeAudit({
    actorId: session.id, action: "update", entity: "club_member", entityId: id,
    before: { name: existing.name, active: existing.isActive },
    after: { name: parsed.data.name, active: parsed.data.isActive === "on" },
  });
  redirect("/admin/attendance/members");
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance/members");
  const existing = await getMemberForEdit(id);
  if (!existing) redirect("/admin/attendance/members");
  if (!canManage(session, "manage:members", existing.clubId)) redirect("/admin/attendance/members");

  const admin = createAdminClient();
  const { error } = await admin.from("club_members").delete().eq("id", id);
  if (!error) {
    await writeAudit({
      actorId: session.id, action: "delete", entity: "club_member", entityId: id,
      before: { name: existing.name, clubId: existing.clubId },
    });
  }
  redirect("/admin/attendance/members");
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (No unit test here — the actions redirect and can't be curled; they're exercised via the read-path + guard checks in Task 12.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/members.ts "src/app/admin/(app)/attendance/actions.ts" src/lib/admin/form-state.ts
git commit -m "feat(attendance): member data layer + CRUD actions"
```

---

## Task 6: Member management UI + nav

**Files:**
- Create: `src/components/admin/MemberForm.tsx`
- Create: `src/components/admin/DeleteMemberForm.tsx`
- Create: `src/components/admin/MemberQrCard.tsx`
- Create: `src/app/admin/(app)/attendance/members/page.tsx`
- Create: `src/app/admin/(app)/attendance/members/new/page.tsx`
- Create: `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx`
- Modify: `src/app/admin/(app)/layout.tsx`

**Interfaces:**
- Consumes: `createMemberAction`, `updateMemberAction`, `deleteMemberAction`, `listMembers`, `getMemberForEdit`, `listClubsBrief`, `canCreateForCapability`, `grantFor`, `memberToken`, `qrDataUrl`, `requireViewPage`, `NEXT_PUBLIC_SITE_URL`.
- Produces: the `/admin/attendance/members` CRUD surface + a nav link. Resolves the acting club: club-scoped admins use `session.clubId`; org-wide admins pass `?club=<id>`.

- [ ] **Step 1: MemberForm (client)**

Create `src/components/admin/MemberForm.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import type { MemberFormState } from "@/lib/admin/form-state";

type MemberAction = (prev: MemberFormState, formData: FormData) => Promise<MemberFormState>;
const initialState: MemberFormState = {};

export interface MemberInitial {
  name: string;
  rollNo: string;
  role: "head" | "vice_head" | "member";
  sort: number;
  isActive: boolean;
  clubId: string | null;
}

export function MemberForm({
  action, submitLabel = "Add member", id, initial, clubs,
}: {
  action: MemberAction;
  submitLabel?: string;
  id?: string;
  initial?: MemberInitial;
  clubs?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} style={{ marginTop: 20, maxWidth: 560 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div>
      ) : null}
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required maxLength={120} defaultValue={initial?.name} />
      </div>
      <div className="field">
        <label htmlFor="rollNo">Roll number (optional)</label>
        <input id="rollNo" name="rollNo" maxLength={40} defaultValue={initial?.rollNo} />
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" defaultValue={initial?.role ?? "member"}>
          <option value="member">Member</option>
          <option value="vice_head">Vice Head</option>
          <option value="head">Head</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="sort">Sort order</label>
        <input id="sort" name="sort" type="number" min={0} max={9999} defaultValue={initial?.sort ?? 0} style={{ maxWidth: 120 }} />
      </div>
      {clubs ? (
        <div className="field">
          <label htmlFor="clubId">Club</label>
          <select id="clubId" name="clubId" defaultValue={initial?.clubId ?? ""}>
            <option value="" disabled>Choose a club…</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : null}
      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} style={{ width: "auto" }} />
        <span>Active (counts toward attendance)</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: DeleteMemberForm (client)**

Create `src/components/admin/DeleteMemberForm.tsx`:
```tsx
"use client";

import { deleteMemberAction } from "@/app/admin/(app)/attendance/actions";

export function DeleteMemberForm({ id }: { id: string }) {
  return (
    <form
      action={deleteMemberAction}
      onSubmit={(e) => {
        if (!window.confirm("Remove this member? Their attendance history is deleted too. This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>
        Remove member
      </button>
    </form>
  );
}
```

- [ ] **Step 3: MemberQrCard (server)**

Create `src/components/admin/MemberQrCard.tsx`:
```tsx
import { memberToken } from "@/lib/attendance";
import { qrDataUrl } from "@/lib/qr";
import { env } from "@/lib/env";

/** A printable QR card for a member. The QR encodes the member self-view URL,
 *  which also carries the token a head's scanner reads. */
export async function MemberQrCard({ memberId, name }: { memberId: string; name: string }) {
  const url = `${env.NEXT_PUBLIC_SITE_URL}/m/${memberToken(memberId)}`;
  const dataUrl = await qrDataUrl(url);
  return (
    <div style={{ display: "inline-block", textAlign: "center", padding: 16, border: "1px solid var(--rule)", borderRadius: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR code for ${name}`} width={200} height={200} style={{ width: 200, height: 200 }} />
      <div className="label" style={{ marginTop: 8 }}>{name}</div>
    </div>
  );
}
```
Note: confirm `src/lib/env.ts` exports `env.NEXT_PUBLIC_SITE_URL`. If it exports a differently-named accessor, use that; if there is no site-url export, read `process.env.NEXT_PUBLIC_SITE_URL` directly. Verify by opening `src/lib/env.ts` first.

- [ ] **Step 4: Member list page**

Create `src/app/admin/(app)/attendance/members/page.tsx`:
```tsx
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listMembers } from "@/lib/admin/members";

const ROLE_LABEL: Record<string, string> = { head: "Head", vice_head: "Vice Head", member: "Member" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
  const grant = grantFor(session.role, "manage:members");
  // Club-scoped admins are pinned to their own club; org-wide pass ?club=.
  const clubId = grant === "own" ? session.clubId : (club ?? null);
  if (!clubId) {
    return (
      <div className="admin-page">
        <div className="eyebrow">Attendance</div>
        <h1 style={{ margin: "6px 0 0" }}>Members</h1>
        <p className="lead" style={{ marginTop: 12 }}>
          Choose a club from the <Link href="/admin/attendance" style={{ color: "var(--forest)" }}>dashboard</Link> to manage its members.
        </p>
      </div>
    );
  }

  const members = await listMembers(clubId);
  const canCreate = canCreateForCapability(session, "manage:members");
  const newHref = grant === "all" ? `/admin/attendance/members/new?club=${clubId}` : "/admin/attendance/members/new";

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Attendance</div>
          <h1 style={{ margin: "6px 0 0" }}>Members</h1>
        </div>
        {canCreate ? <Link href={newHref} className="btn btn-primary">Add member</Link> : null}
      </div>
      {members.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>No members yet.</div>
      ) : (
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead><tr><th>Name</th><th>Roll</th><th>Role</th><th>Active</th><th>Edit</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.name}</td>
                  <td>{m.rollNo ?? "—"}</td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td>{m.isActive ? "Yes" : "No"}</td>
                  <td><Link href={`/admin/attendance/members/${m.id}/edit`} className="label" style={{ color: "var(--forest)" }}>Edit →</Link></td>
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

- [ ] **Step 5: New + Edit member pages**

Create `src/app/admin/(app)/attendance/members/new/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { canCreateForCapability } from "@/lib/admin/club-scope";
import { listClubsBrief } from "@/lib/admin/clubs";
import { MemberForm } from "@/components/admin/MemberForm";
import { createMemberAction } from "../../actions";

export default async function NewMemberPage() {
  const session = await requireViewPage("manage:members");
  if (!canCreateForCapability(session, "manage:members")) redirect("/admin/attendance/members");
  const clubs = grantFor(session.role, "manage:members") === "all" ? await listClubsBrief() : undefined;
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance</div>
      <h1 style={{ margin: "6px 0 0" }}>Add member</h1>
      <MemberForm action={createMemberAction} clubs={clubs} />
    </div>
  );
}
```

Create `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getMemberForEdit } from "@/lib/admin/members";
import { listClubsBrief } from "@/lib/admin/clubs";
import { MemberForm } from "@/components/admin/MemberForm";
import { DeleteMemberForm } from "@/components/admin/DeleteMemberForm";
import { MemberQrCard } from "@/components/admin/MemberQrCard";
import { updateMemberAction } from "../../../actions";

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const member = await getMemberForEdit(id);
  if (!member) notFound();
  if (!canManage(session, "manage:members", member.clubId)) redirect("/admin/attendance/members");
  const clubs = grantFor(session.role, "manage:members") === "all" ? await listClubsBrief() : undefined;
  return (
    <div className="admin-page" style={{ maxWidth: 620 }}>
      <div className="eyebrow">Attendance</div>
      <h1 style={{ margin: "6px 0 0" }}>Edit member</h1>
      <MemberForm
        action={updateMemberAction}
        submitLabel="Save changes"
        id={member.id}
        clubs={clubs}
        initial={{
          name: member.name, rollNo: member.rollNo ?? "", role: member.role,
          sort: member.sort, isActive: member.isActive, clubId: member.clubId,
        }}
      />
      <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
        <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 12px" }}>QR card</h2>
        <MemberQrCard memberId={member.id} name={member.name} />
        <p className="body-text" style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10 }}>
          Print or share this. A head scans it to mark attendance; the member can open it to see their record.
        </p>
      </section>
      <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
        <div className="label" style={{ marginBottom: 6, color: "var(--rust)" }}>Remove</div>
        <DeleteMemberForm id={member.id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Nav link**

In `src/app/admin/(app)/layout.tsx`, add after the Announcements/Gallery/Achievements block:
```tsx
    ...(canView(session, "manage:members")
      ? [{ href: "/admin/attendance", label: "Attendance" }]
      : []),
```

- [ ] **Step 7: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS; routes `/admin/attendance/members`, `/admin/attendance/members/new`, `/admin/attendance/members/[id]/edit` compile.

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/(app)/attendance/members" src/components/admin/MemberForm.tsx src/components/admin/DeleteMemberForm.tsx src/components/admin/MemberQrCard.tsx "src/app/admin/(app)/layout.tsx"
git commit -m "feat(attendance): member management UI + QR card + nav"
```

---

## Task 7: Attendance session data layer + open/close actions

**Files:**
- Create: `src/lib/admin/attendance-club.ts`
- Modify: `src/app/admin/(app)/attendance/actions.ts` (add session actions)

**Interfaces:**
- Produces:
  - `src/lib/admin/attendance-club.ts`:
    - `interface SessionRow { id: string; title: string; status: "open" | "closed"; openedAt: string; closedAt: string | null; presentCount: number; clubId: string }`
    - `getOpenSession(clubId: string): Promise<SessionRow | null>`
    - `listSessions(clubId: string): Promise<SessionRow[]>`
    - `interface SessionDetail { session: SessionRow; present: { memberId: string; name: string; markedAt: string }[]; absent: { memberId: string; name: string }[] }`
    - `getSessionDetail(sessionId: string): Promise<SessionDetail | null>`
    - `interface RosterPct { memberId: string; name: string; attended: number; eligible: number; pct: number }`
    - `rosterWithPercent(clubId: string): Promise<RosterPct[]>`
    - `liveFeed(sessionId: string): Promise<{ open: boolean; count: number; present: { memberId: string; name: string }[] } | null>`
  - session actions in actions.ts: `openSessionAction(prev: SessionFormState, formData) => Promise<SessionFormState>`, `closeSessionAction(formData) => Promise<void>`.

- [ ] **Step 1: Write the data layer**

Create `src/lib/admin/attendance-club.ts`:
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SessionRow {
  id: string;
  title: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  presentCount: number;
  clubId: string;
}

async function countPresent(sessionId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("club_attendance")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return count ?? 0;
}

export async function getOpenSession(clubId: string): Promise<SessionRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id")
    .eq("club_id", clubId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id, title: data.title, status: data.status, openedAt: data.opened_at,
    closedAt: data.closed_at, clubId: data.club_id, presentCount: await countPresent(data.id),
  };
}

export async function listSessions(clubId: string): Promise<SessionRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id")
    .eq("club_id", clubId)
    .order("opened_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data ?? [];
  return Promise.all(rows.map(async (s) => ({
    id: s.id, title: s.title, status: s.status, openedAt: s.opened_at,
    closedAt: s.closed_at, clubId: s.club_id, presentCount: await countPresent(s.id),
  })));
}

export interface SessionDetail {
  session: SessionRow;
  present: { memberId: string; name: string; markedAt: string }[];
  absent: { memberId: string; name: string }[];
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions")
    .select("id, title, status, opened_at, closed_at, club_id")
    .eq("id", sessionId).maybeSingle();
  if (!s) return null;

  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, marked_at, club_members(name)")
    .eq("session_id", sessionId);
  const present = (marks ?? []).map((m) => ({
    memberId: m.member_id, name: m.club_members?.name ?? "—", markedAt: m.marked_at,
  }));
  const presentIds = new Set(present.map((p) => p.memberId));

  const { data: roster } = await admin
    .from("club_members")
    .select("id, name")
    .eq("club_id", s.club_id).eq("is_active", true).order("name");
  const absent = (roster ?? []).filter((m) => !presentIds.has(m.id)).map((m) => ({ memberId: m.id, name: m.name }));

  return {
    session: {
      id: s.id, title: s.title, status: s.status, openedAt: s.opened_at,
      closedAt: s.closed_at, clubId: s.club_id, presentCount: present.length,
    },
    present, absent,
  };
}

export interface RosterPct {
  memberId: string; name: string; attended: number; eligible: number; pct: number;
}

export async function rosterWithPercent(clubId: string): Promise<RosterPct[]> {
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("club_members")
    .select("id, name, created_at")
    .eq("club_id", clubId).eq("is_active", true).order("name");
  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, opened_at").eq("club_id", clubId).eq("status", "closed");
  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, session_id, club_attendance_sessions!inner(club_id)")
    .eq("club_attendance_sessions.club_id", clubId);

  const sess = sessions ?? [];
  const attendedByMember = new Map<string, number>();
  for (const m of marks ?? []) {
    attendedByMember.set(m.member_id, (attendedByMember.get(m.member_id) ?? 0) + 1);
  }
  return (members ?? []).map((mem) => {
    // Eligible = closed sessions on/after the member joined (fairer denominator).
    const eligible = sess.filter((s) => s.opened_at >= mem.created_at).length;
    const attended = attendedByMember.get(mem.id) ?? 0;
    const pct = eligible === 0 ? 0 : Math.round((attended / eligible) * 100);
    return { memberId: mem.id, name: mem.name, attended, eligible, pct };
  });
}

export async function liveFeed(
  sessionId: string,
): Promise<{ open: boolean; count: number; present: { memberId: string; name: string }[] } | null> {
  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions").select("status").eq("id", sessionId).maybeSingle();
  if (!s) return null;
  const { data: marks } = await admin
    .from("club_attendance")
    .select("member_id, marked_at, club_members(name)")
    .eq("session_id", sessionId).order("marked_at", { ascending: false });
  const present = (marks ?? []).map((m) => ({ memberId: m.member_id, name: m.club_members?.name ?? "—" }));
  return { open: s.status === "open", count: present.length, present };
}
```

- [ ] **Step 2: Add session open/close actions**

Append to `src/app/admin/(app)/attendance/actions.ts` (add imports for `resolveOwningClub` already present, `getOpenSession`, `SessionFormState`, `grantFor`):
```ts
import { grantFor } from "@/lib/auth/capabilities";
import { getOpenSession } from "@/lib/admin/attendance-club";
import type { SessionFormState } from "@/lib/admin/form-state";

const SessionSchema = z.object({
  title: z.string().trim().min(2).max(140),
  clubId: z.union([z.literal(""), z.string().uuid()]),
});

export async function openSessionAction(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = SessionSchema.safeParse({ title: formData.get("title"), clubId: formData.get("clubId") ?? "" });
  if (!parsed.success) return { error: "Give the session a title." };

  const grant = grantFor(session.role, "manage:members");
  const clubId = grant === "own" ? session.clubId : (parsed.data.clubId || null);
  if (!clubId) return { error: "Pick a club for this session." };
  if (!canManage(session, "manage:members", clubId)) return { error: "You can't run sessions for that club." };

  // One open session per club at a time (also enforced by a partial unique index).
  const already = await getOpenSession(clubId);
  if (already) return { error: "A session is already open for this club. Close it first." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_attendance_sessions")
    .insert({ club_id: clubId, title: parsed.data.title, opened_by: session.id, status: "open" })
    .select("id").single();
  if (error || !data) return { error: "Could not open the session. Try again." };

  await writeAudit({
    actorId: session.id, action: "open", entity: "club_attendance_session",
    entityId: data.id, after: { title: parsed.data.title, clubId },
  });
  redirect(`/admin/attendance/sessions/${data.id}`);
}

export async function closeSessionAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/attendance");

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("club_attendance_sessions").select("club_id, status").eq("id", id).maybeSingle();
  if (!s) redirect("/admin/attendance");
  if (!canManage(session, "manage:members", s.club_id)) redirect("/admin/attendance");

  if (s.status === "open") {
    await admin.from("club_attendance_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
    await writeAudit({ actorId: session.id, action: "close", entity: "club_attendance_session", entityId: id });
  }
  redirect(`/admin/attendance/sessions/${id}`);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/attendance-club.ts "src/app/admin/(app)/attendance/actions.ts"
git commit -m "feat(attendance): session data layer + open/close actions"
```

---

## Task 8: Scan API route + live-feed route

**Files:**
- Create: `src/app/api/admin/attendance/club/scan/route.ts`
- Create: `src/app/api/admin/attendance/club/feed/route.ts`

**Interfaces:**
- Consumes: `requireSession`, `requireSameOrigin`, `canManage`, `verifyMemberToken`, `liveFeed`, `createAdminClient`, `writeAudit`.
- Produces:
  - `POST /api/admin/attendance/club/scan` body `{ sessionId: string; token: string }` → `200 {status:"marked"|"already", member:{id,name}}` | `4xx {error}`.
  - `GET /api/admin/attendance/club/feed?session=<id>` → `200 {open,count,present:[{memberId,name}]}` | `4xx {error}`.

- [ ] **Step 1: Write the scan route**

Create `src/app/api/admin/attendance/club/scan/route.ts`:
```ts
import { requireSession, requireSameOrigin } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { verifyMemberToken } from "@/lib/attendance";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/admin/audit";

/** Mark a member present by scanning their QR — manage:members, own-club scoped. */
export async function POST(request: Request) {
  const bad = requireSameOrigin(request);
  if (bad) return bad;
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  let body: { sessionId?: string; token?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  const sessionId = String(body.sessionId ?? "");
  const memberId = verifyMemberToken(String(body.token ?? ""));
  if (!sessionId || !memberId) return Response.json({ error: "Invalid QR." }, { status: 400 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .from("club_attendance_sessions").select("id, club_id, status").eq("id", sessionId).maybeSingle();
  if (!sess) return Response.json({ error: "Session not found." }, { status: 404 });
  if (!canManage(guard.session, "manage:members", sess.club_id)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }
  if (sess.status !== "open") return Response.json({ error: "Session is closed." }, { status: 409 });

  const { data: member } = await admin
    .from("club_members").select("id, name, club_id, is_active").eq("id", memberId).maybeSingle();
  if (!member || member.club_id !== sess.club_id || !member.is_active) {
    return Response.json({ error: "Not a member of this club." }, { status: 403 });
  }

  // Idempotent: the UNIQUE(session_id, member_id) makes a re-scan a no-op.
  const { error } = await admin
    .from("club_attendance")
    .insert({ session_id: sessionId, member_id: memberId, marked_by: guard.session.id });
  if (error) {
    // 23505 = unique_violation → already present.
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ status: "already", member: { id: member.id, name: member.name } });
    }
    return Response.json({ error: "Could not record attendance." }, { status: 500 });
  }

  await writeAudit({
    actorId: guard.session.id, action: "scan", entity: "club_attendance",
    entityId: sessionId, after: { memberId: member.id },
  });
  return Response.json({ status: "marked", member: { id: member.id, name: member.name } });
}
```

- [ ] **Step 2: Write the live-feed route**

Create `src/app/api/admin/attendance/club/feed/route.ts`:
```ts
import { requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveFeed } from "@/lib/admin/attendance-club";

/** Live present-feed for a session — manage:members, own-club scoped. Polled. */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!sessionId) return Response.json({ error: "Missing session." }, { status: 400 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .from("club_attendance_sessions").select("club_id").eq("id", sessionId).maybeSingle();
  if (!sess) return Response.json({ error: "Not found." }, { status: 404 });
  if (!canManage(guard.session, "manage:members", sess.club_id)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }
  const feed = await liveFeed(sessionId);
  return Response.json(feed, { headers: { "cache-control": "no-store" } });
}
```

- [ ] **Step 3: Verify the guard rule + build**

Run: `npm run lint && npm run build`
Expected: PASS — the `admin-route-requires-guard` rule is satisfied (both handlers call `requireSession`); routes compile.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/admin/attendance/club"
git commit -m "feat(attendance): scan + live-feed API routes"
```

---

## Task 9: Camera scanner UI + scan page

**Files:**
- Modify: `package.json` (add `html5-qrcode`)
- Create: `src/components/admin/QrScanner.tsx`
- Create: `src/app/admin/(app)/attendance/scan/page.tsx`

**Interfaces:**
- Consumes: `getOpenSession`, the scan route, `grantFor`, `requireViewPage`.
- Produces: `<QrScanner sessionId={…} />` client component that runs the camera, POSTs decoded tokens to the scan route, and shows per-scan feedback.

- [ ] **Step 1: Add the dependency**

Run: `npm install html5-qrcode`
Then run `npm install --package-lock-only` to keep `package-lock.json` in sync (Vercel `npm ci` fails on lockfile drift — see STATUS gotcha).

- [ ] **Step 2: Write the scanner component**

Create `src/components/admin/QrScanner.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface Feedback { kind: "marked" | "already" | "error"; text: string; }

/** Continuous camera scanner. Decodes a member QR (a URL ending in the token),
 *  posts it to the scan route, and shows feedback. Debounces repeat decodes.
 *  html5-qrcode is imported dynamically inside the effect so the module is never
 *  evaluated during SSR (it touches browser APIs). */
export function QrScanner({ sessionId }: { sessionId: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [count, setCount] = useState(0);
  const lastRef = useRef<{ token: string; at: number } | null>(null);

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;

    async function onDecode(text: string) {
      // The QR encodes …/m/<memberId>.<sig>; take the last path segment as the token.
      const token = text.split("/").pop() ?? text;
      const now = Date.now();
      if (lastRef.current && lastRef.current.token === token && now - lastRef.current.at < 3000) return;
      lastRef.current = { token, at: now };
      try {
        const r = await fetch("/api/admin/attendance/club/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, token }),
        });
        const j = await r.json();
        if (r.ok && j.status === "marked") {
          setFeedback({ kind: "marked", text: `✓ ${j.member.name}` });
          setCount((c) => c + 1);
        } else if (r.ok && j.status === "already") {
          setFeedback({ kind: "already", text: `Already in: ${j.member.name}` });
        } else {
          setFeedback({ kind: "error", text: j.error ?? "Scan failed." });
        }
      } catch {
        setFeedback({ kind: "error", text: "Network error — try again." });
      }
    }

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      scanner = new Html5Qrcode("qr-reader");
      await scanner
        .start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onDecode, () => {})
        .catch(() => setFeedback({ kind: "error", text: "Couldn't start the camera. Grant permission and reload." }));
    })();

    return () => {
      scanner?.stop().catch(() => {});
    };
  }, [sessionId]);

  const color = feedback?.kind === "marked" ? "var(--forest)" : feedback?.kind === "already" ? "var(--ink-2)" : "var(--rust)";
  return (
    <div style={{ maxWidth: 360 }}>
      <div id="qr-reader" style={{ width: "100%", borderRadius: 8, overflow: "hidden" }} />
      <div style={{ marginTop: 12, minHeight: 24, fontWeight: 500, color }}>{feedback?.text ?? "Point the camera at a member's QR."}</div>
      <div className="label" style={{ color: "var(--ink-3)" }}>Marked this run: {count}</div>
    </div>
  );
}
```

- [ ] **Step 3: Write the scan page**

Create `src/app/admin/(app)/attendance/scan/page.tsx`:
```tsx
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getOpenSession } from "@/lib/admin/attendance-club";
import { QrScanner } from "@/components/admin/QrScanner";

// QrScanner is a client component; it's safe to import directly because it only
// touches the camera / html5-qrcode inside useEffect (never during SSR). Do NOT
// use next/dynamic({ ssr: false }) here — that's disallowed in a Server Component.

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
  const grant = grantFor(session.role, "manage:members");
  const clubId = grant === "own" ? session.clubId : (club ?? null);

  if (!clubId || !canManage(session, "manage:members", clubId)) {
    return <div className="admin-page"><h1>Scan</h1><p className="lead">Pick your club from the <Link href="/admin/attendance">dashboard</Link>.</p></div>;
  }
  const open = await getOpenSession(clubId);

  return (
    <div className="admin-page">
      <div className="eyebrow">Attendance</div>
      <h1 style={{ margin: "6px 0 12px" }}>Scan</h1>
      {open ? (
        <>
          <p className="lead" style={{ marginBottom: 16 }}>Session: <strong>{open.title}</strong></p>
          <QrScanner sessionId={open.id} />
          <p className="body-text" style={{ marginTop: 16 }}>
            <Link href={`/admin/attendance/sessions/${open.id}`} style={{ color: "var(--forest)" }}>Live dashboard →</Link>
          </p>
        </>
      ) : (
        <div className="cal-empty">No open session. Open one from the <Link href="/admin/attendance" style={{ color: "var(--forest)" }}>dashboard</Link>.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `npm run typecheck && npm run build`
Expected: PASS; `/admin/attendance/scan` compiles (the scanner is a client-only dynamic import).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/admin/QrScanner.tsx "src/app/admin/(app)/attendance/scan"
git commit -m "feat(attendance): camera scanner (html5-qrcode) + scan page"
```

---

## Task 10: Dashboard + live session view

**Files:**
- Create: `src/app/admin/(app)/attendance/page.tsx`
- Create: `src/app/admin/(app)/attendance/sessions/[id]/page.tsx`
- Create: `src/components/admin/LiveSession.tsx`

**Interfaces:**
- Consumes: `rosterWithPercent`, `listSessions`, `getOpenSession`, `getSessionDetail`, `openSessionAction`, `closeSessionAction`, `listClubsBrief`, `istNumericDate`, the feed route.
- Produces: the dashboard at `/admin/attendance` and the per-session live view.

- [ ] **Step 1: LiveSession (client, polls the feed)**

Create `src/components/admin/LiveSession.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";

interface Feed { open: boolean; count: number; present: { memberId: string; name: string }[] }

export function LiveSession({ sessionId, initial }: { sessionId: string; initial: Feed }) {
  const [feed, setFeed] = useState<Feed>(initial);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/admin/attendance/club/feed?session=${sessionId}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as Feed;
        if (active) setFeed(j);
      } catch { /* keep last frame */ }
    };
    const iv = setInterval(poll, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [sessionId]);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="att-count"><strong>{feed.count}</strong><span>present{feed.open ? " · live" : " · closed"}</span></div>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "grid", gap: 4 }}>
        {feed.present.map((p) => <li key={p.memberId} className="rule" style={{ paddingBottom: 6 }}>✓ {p.name}</li>)}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Session live-view page**

Create `src/app/admin/(app)/attendance/sessions/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getSessionDetail } from "@/lib/admin/attendance-club";
import { LiveSession } from "@/components/admin/LiveSession";
import { closeSessionAction } from "../../actions";
import { istNumericDate } from "@/lib/datetime";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:members");
  const { id } = await params;
  const detail = await getSessionDetail(id);
  if (!detail) notFound();
  if (!canManage(session, "manage:members", detail.session.clubId)) redirect("/admin/attendance");

  const { session: s, present, absent } = detail;
  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Attendance · {istNumericDate(s.openedAt)}</div>
          <h1 style={{ margin: "6px 0 0" }}>{s.title}</h1>
        </div>
        {s.status === "open" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/admin/attendance/scan`} className="btn btn-primary">Scan</Link>
            <form action={closeSessionAction}><input type="hidden" name="id" value={s.id} />
              <button className="btn" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Close</button>
            </form>
          </div>
        ) : <span className="abadge abadge-approved">Closed</span>}
      </div>

      <LiveSession sessionId={s.id} initial={{ open: s.status === "open", count: present.length, present: present.map((p) => ({ memberId: p.memberId, name: p.name })) }} />

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Absent ({absent.length})</h2>
      {absent.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>Everyone's in.</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
          {absent.map((a) => <li key={a.memberId} className="rule" style={{ paddingBottom: 6, color: "var(--ink-2)" }}>{a.name}</li>)}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Dashboard page**

Create `src/app/admin/(app)/attendance/page.tsx`:
```tsx
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { rosterWithPercent, listSessions, getOpenSession } from "@/lib/admin/attendance-club";
import { OpenSessionForm } from "@/components/admin/OpenSessionForm";
import { istNumericDate } from "@/lib/datetime";

export default async function AttendanceDashboard({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
  const grant = grantFor(session.role, "manage:members");
  const clubs = grant === "all" ? await listClubsBrief() : [];
  const clubId = grant === "own" ? session.clubId : (club ?? (clubs[0]?.id ?? null));

  if (!clubId || !canManage(session, "manage:members", clubId)) {
    return <div className="admin-page"><h1>Attendance</h1><p className="lead">No club to show.</p></div>;
  }

  const [roster, sessions, open] = await Promise.all([
    rosterWithPercent(clubId), listSessions(clubId), getOpenSession(clubId),
  ]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div><div className="eyebrow">Attendance</div><h1 style={{ margin: "6px 0 0" }}>Dashboard</h1></div>
        <Link href={`/admin/attendance/members${grant === "all" ? `?club=${clubId}` : ""}`} className="btn">Manage members</Link>
      </div>

      {grant === "all" && clubs.length > 0 ? (
        <form method="get" style={{ marginTop: 12 }}>
          <select name="club" defaultValue={clubId} style={{ maxWidth: 260 }}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-sm" style={{ marginLeft: 8 }}>View</button>
        </form>
      ) : null}

      <section style={{ marginTop: 20 }}>
        {open ? (
          <div className="note">
            Session open: <strong>{open.title}</strong> · {open.presentCount} present.{" "}
            <Link href={`/admin/attendance/sessions/${open.id}`} style={{ color: "var(--forest)" }}>Open live view →</Link>
          </div>
        ) : (
          <OpenSessionForm clubId={grant === "all" ? clubId : null} />
        )}
      </section>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Roster attendance</h2>
      {roster.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No active members yet.</p> : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th>Member</th><th>Attended</th><th>Eligible</th><th>%</th></tr></thead>
            <tbody>{roster.map((r) => (
              <tr key={r.memberId}><td style={{ fontWeight: 500 }}>{r.name}</td><td>{r.attended}</td><td>{r.eligible}</td><td>{r.pct}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>Session history</h2>
      {sessions.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p> : (
        <div className="tablewrap">
          <table className="admin">
            <thead><tr><th>Title</th><th>When</th><th>Status</th><th>Present</th></tr></thead>
            <tbody>{sessions.map((s) => (
              <tr key={s.id}><td><Link href={`/admin/attendance/sessions/${s.id}`} style={{ color: "var(--forest)" }}>{s.title}</Link></td>
                <td>{istNumericDate(s.openedAt)}</td><td>{s.status}</td><td>{s.presentCount}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: OpenSessionForm (client)**

Create `src/components/admin/OpenSessionForm.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { openSessionAction } from "@/app/admin/(app)/attendance/actions";
import type { SessionFormState } from "@/lib/admin/form-state";

const initial: SessionFormState = {};

export function OpenSessionForm({ clubId }: { clubId: string | null }) {
  const [state, action, pending] = useActionState(openSessionAction, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      {clubId ? <input type="hidden" name="clubId" value={clubId} /> : null}
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="title">New session</label>
        <input id="title" name="title" required maxLength={140} placeholder="Weekly sync" />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Opening…" : "Open session"}</button>
      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)", width: "100%" }}>{state.error}</div> : null}
    </form>
  );
}
```
Note: the dashboard's org-wide club `<select>` uses a plain `method="get"` form — the "View" button submits `?club=<id>`; no client JS needed.

- [ ] **Step 5: Build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS; `/admin/attendance` and `/admin/attendance/sessions/[id]` compile.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(app)/attendance/page.tsx" "src/app/admin/(app)/attendance/sessions" src/components/admin/LiveSession.tsx src/components/admin/OpenSessionForm.tsx
git commit -m "feat(attendance): dashboard + live session view"
```

---

## Task 11: Member self-view (`/m/[token]`, no login)

**Files:**
- Create: `src/app/m/[token]/page.tsx`
- Modify: `src/lib/admin/attendance-club.ts` (add `getMemberAttendance`)

**Interfaces:**
- Consumes: `verifyMemberToken`, `createAdminClient`.
- Produces: `getMemberAttendance(memberId): Promise<{ name; clubName; role; attended; eligible; pct; history: {title; at; present}[] } | null>` and the public read-only page.

- [ ] **Step 1: Add the member-attendance read**

Append to `src/lib/admin/attendance-club.ts`:
```ts
export interface MemberSelfView {
  name: string;
  clubName: string | null;
  role: string;
  attended: number;
  eligible: number;
  pct: number;
  history: { title: string; at: string; present: boolean }[];
}

export async function getMemberAttendance(memberId: string): Promise<MemberSelfView | null> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("club_members")
    .select("id, name, role, created_at, club_id, clubs(name)")
    .eq("id", memberId).maybeSingle();
  if (!m) return null;

  const { data: sessions } = await admin
    .from("club_attendance_sessions")
    .select("id, title, opened_at").eq("club_id", m.club_id).eq("status", "closed")
    .order("opened_at", { ascending: false });
  const { data: marks } = await admin
    .from("club_attendance").select("session_id").eq("member_id", memberId);
  const attendedIds = new Set((marks ?? []).map((x) => x.session_id));

  const eligibleSessions = (sessions ?? []).filter((s) => s.opened_at >= m.created_at);
  const attended = eligibleSessions.filter((s) => attendedIds.has(s.id)).length;
  const eligible = eligibleSessions.length;
  return {
    name: m.name, clubName: m.clubs?.name ?? null, role: m.role,
    attended, eligible, pct: eligible === 0 ? 0 : Math.round((attended / eligible) * 100),
    history: eligibleSessions.map((s) => ({ title: s.title, at: s.opened_at, present: attendedIds.has(s.id) })),
  };
}
```

- [ ] **Step 2: Write the self-view page**

Create `src/app/m/[token]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyMemberToken } from "@/lib/attendance";
import { getMemberAttendance } from "@/lib/admin/attendance-club";
import { istNumericDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My attendance", robots: { index: false } };

export default async function MemberSelfView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const memberId = verifyMemberToken(decodeURIComponent(token));
  if (!memberId) notFound();
  const view = await getMemberAttendance(memberId);
  if (!view) notFound();

  return (
    <section className="section" style={{ paddingTop: 56, maxWidth: 560 }}>
      <div className="eyebrow">{view.clubName ?? "Club"}</div>
      <h1 style={{ margin: "12px 0 0" }}>{view.name}</h1>
      <p className="lead" style={{ marginTop: 8 }}>Your attendance</p>

      <div className="att-count" style={{ marginTop: 20 }}>
        <strong>{view.pct}%</strong><span>{view.attended} of {view.eligible} sessions</span>
      </div>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>History</h2>
      {view.history.length === 0 ? <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p> : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
          {view.history.map((h, i) => (
            <li key={i} className="rule" style={{ paddingBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>{h.title} · <span className="label" style={{ color: "var(--ink-3)" }}>{istNumericDate(h.at)}</span></span>
              <span style={{ color: h.present ? "var(--forest)" : "var(--rust)" }}>{h.present ? "Present" : "Absent"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run typecheck && npm run build`
Expected: PASS; `/m/[token]` compiles.

- [ ] **Step 4: Commit**

```bash
git add "src/app/m/[token]" src/lib/admin/attendance-club.ts
git commit -m "feat(attendance): no-login member self-view at /m/[token]"
```

---

## Task 12: End-to-end verification + STATUS update

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Full green check**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all PASS (tests include the new token, qr, capability specs).

- [ ] **Step 2: Read-path verification (seed → assert → clean up)**

Using the Supabase MCP `execute_sql`, seed a temporary club member + a closed session + one attendance mark (prefix names `zzz-verify-tmp`), then start the dev server (`npm run dev`) and verify:
- `GET /admin/attendance` → 307 to `/admin/login` when unauthenticated (guard).
- Mint a session JWE (see STATUS "Verifying admin flows headless") for a `tech_head`, and `GET /admin/attendance?club=<clubId>` → 200 showing the roster with the seeded member and a computed %.
- Compute the member token with the same secret and `GET /m/<token>` → 200 showing the member's history; a tampered token → 404.
- `POST /api/admin/attendance/club/scan` with a forged-but-validly-signed token for the seeded member into an OPEN seeded session → `{status:"marked"}`; repeat → `{status:"already"}`.
Then delete all `zzz-verify-tmp` rows.

Document the exact commands + outputs in the task notes. (The **camera scanner UI** itself is NOT verifiable headless — note it for a real-phone pass by the owner.)

- [ ] **Step 3: Update STATUS.md**

Add a "Club-member QR attendance (Phase 1)" entry under the built-features section; add browser-verification checklist items (open session → scan a member's QR on a phone → dashboard count increments → member opens their QR link). Note the Phase-2 event flavor remains spec'd-not-built, and the emailed-QR email template is the out-of-repo dependency.

- [ ] **Step 4: Commit + push**

```bash
git add docs/STATUS.md
git commit -m "docs: STATUS.md — club-member QR attendance (Phase 1) shipped"
git push origin main
```

---

## Self-Review (author's check against the spec)

- **Spec coverage:** roles/capability (Task 2) · extend club_members (Task 1) · member CRUD (Tasks 5–6) · per-member QR + card (Tasks 3,4,6) · sessions open/close + one-open guard (Tasks 1,7) · scan + duplicate guard (Tasks 1,8) · dashboard live/roster%/history (Task 10) · member self-view (Task 11) · RLS-locked, service-role, guarded routes (Tasks 1,8) · headless-verification + camera caveat (Task 12). Phase-2 event flavor intentionally out of scope.
- **Placeholder scan:** none — every step has concrete code. Two explicit "open first / confirm" notes (env.ts accessor in Task 6 Step 3; the dashboard club-select `onChange` in Task 10 Step 4) are verification instructions, not deferred work.
- **Type consistency:** `memberToken`/`verifyMemberToken`, `manage:members`, `SessionRow`/`RosterPct`/`SessionDetail`/`MemberSelfView`, `MemberFormState`/`SessionFormState`, and route contracts (`{sessionId,token}` → `{status,member}`) are used identically across tasks.
