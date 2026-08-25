# Member Portal & Member Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give club members their own login on the public site — a one-time
head-generated link sets up a PIN + authenticator (TOTP); after that they sign in
with email + PIN + TOTP to show their attendance QR and view their attendance/history.

**Architecture:** A second, isolated auth surface parallel to the 9-admin panel.
Onboarding mirrors the admin invite flow (`/admin/accept-invite`). Credentials live
in a new `club_member_auth` table (service-role only); one-time links in
`member_invites` (mirrors `admin_invites`). A separate HMAC-signed cookie
(`__Host-ccc.member`) carries the member session, guarded by `/member/*` in
`proxy.ts` and re-validated server-side by `requireMember()`. The scanner, QR token,
and attendance math are reused unchanged.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript strict,
Supabase (Postgres + RLS, service-role writes), Auth.js v5 (admin only — members do
NOT use Auth.js), `otpauth` (TOTP), `hash-wasm` argon2id, vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-member-portal-design.md` — read it
alongside this plan; the plan implements that spec.

## Global Constraints

- **This is NOT stock Next.js** — read `node_modules/next/dist/docs/` before writing
  routing/middleware/server-action code; heed deprecations. Middleware file is
  `src/proxy.ts` (exports `proxy`), not `middleware.ts`.
- **Members never use Auth.js.** Their session is a bespoke signed cookie. Keep it
  fully isolated from the admin `next-auth` session (different cookie, different HMAC
  domain-prefix).
- **All member credential + PII tables are service-role only** — no `anon` /
  `authenticated` grants. Reads/writes go through `createAdminClient()` in
  `"use server"` / route handlers only. Never expose `email`, `phone`, or anything in
  `club_member_auth` / `member_invites` to the anon Supabase client.
- **Server-action POSTs can't be curled** ("Failed to find Server Action") — verify
  mutations in a browser or by asserting the DB effect. Route handlers curl fine.
- **The live DB is shared by dev and prod.** MCP migrations hit production. Delete any
  test rows you seed.
- **Supabase CLI is NOT installed** — apply migrations via the Supabase **MCP**
  (`apply_migration`) and regenerate types via MCP `generate_typescript_types` (never
  `npm run types:gen`, which truncates the file).
- **`dangerouslySetInnerHTML` is ESLint-banned.** Render plain React.
- **Club scope is server-enforced**: every head-side member mutation must call
  `canManage(session, "manage:members", member.clubId)` with `club_id` read fresh
  from the DB — never trust a club id from the request body.
- **Verify gate before "done":** `npm run typecheck && npm run lint && npm test &&
  npm run build` all green.
- **Branch:** the repo is on a detached HEAD — start on a fresh branch
  `feat/member-portal` off `main` before Task 1.

---

### Task 0: Create the working branch

**Files:** none (git only).

- [ ] **Step 1: Cut the feature branch**

```bash
git fetch origin
git checkout -b feat/member-portal origin/main
```

- [ ] **Step 2: Confirm a clean baseline**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; existing 78 tests pass.

---

### Task 1: Database migration + regenerated types

**Files:**
- Create: `supabase/migrations/20260825120000_member_portal.sql`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: `club_members.email`, `club_members.phone`; tables `club_member_auth`,
  `member_invites`; unique index `club_members_email_unique`. Later tasks read/write
  these via `createAdminClient()`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260825120000_member_portal.sql`:

```sql
-- Member portal: contact PII + login credentials + one-time login links.
-- See docs/superpowers/specs/2026-08-25-member-portal-design.md

-- 1. Contact PII on the roster row (email is also the login identifier).
alter table public.club_members add column if not exists email text;
alter table public.club_members add column if not exists phone text;

-- One email → one member (case-insensitive). One student = one club, so global.
create unique index if not exists club_members_email_unique
  on public.club_members (lower(email)) where email is not null;

-- 2. Credentials, isolated from the roster row. Service-role only.
create table if not exists public.club_member_auth (
  member_id        uuid primary key references public.club_members(id) on delete cascade,
  pin_hash         text,
  totp_secret_enc  text,
  totp_enrolled_at timestamptz,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  session_epoch    int not null default 0,
  activated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.club_member_auth enable row level security;
-- No policies + no grants to anon/authenticated ⇒ default deny (service role bypasses RLS).
revoke all on public.club_member_auth from anon, authenticated;

-- 3. One-time login links (mirrors admin_invites). Service-role only.
create table if not exists public.member_invites (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.club_members(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_by  uuid references public.admin_users(id),
  created_at  timestamptz not null default now()
);
create index if not exists member_invites_token_hash_idx on public.member_invites (token_hash);
alter table public.member_invites enable row level security;
revoke all on public.member_invites from anon, authenticated;

-- 3b. Anti-proxy rotating QR (spec §6a): head-set validity window for the on-screen
--     member QR. Null ⇒ the portal falls back to a 60s default.
alter table public.club_attendance_sessions add column if not exists qr_ttl_seconds int;

-- 4. Keep the new PII off the anon column grant on club_members (extends
--    20260825000000_club_members_rollno_privacy.sql). Anon may read ONLY these
--    public columns; email/phone/roll_no stay server-side.
revoke select on public.club_members from anon;
grant select (id, club_id, name, role, photo_path, socials, sort, is_active, created_at)
  on public.club_members to anon;
```

- [ ] **Step 2: Apply the migration to the live DB via Supabase MCP**

Use the Supabase MCP `apply_migration` tool with name `member_portal` and the SQL
above (project_ref `svkbleeibbrjryeovvjw`). Do NOT use the Supabase CLI.

- [ ] **Step 3: Verify the schema landed**

Use MCP `list_tables` (or `execute_sql`) to confirm `club_member_auth` and
`member_invites` exist, and that `club_members` now has `email` + `phone`. Also
confirm the anon grant excludes `email`:

```sql
select column_name from information_schema.role_column_grants
where grantee = 'anon' and table_name = 'club_members' order by column_name;
```
Expected: NO `email`, `phone`, or `roll_no` rows.

- [ ] **Step 4: Regenerate types via MCP**

Call MCP `generate_typescript_types` and overwrite `src/lib/database.types.ts` with
its output. Confirm `club_member_auth`, `member_invites`, and `club_members.email`
appear.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add supabase/migrations/20260825120000_member_portal.sql src/lib/database.types.ts
git commit -m "feat(member-portal): schema — member auth, invites, contact PII + anon lockdown"
```

---

### Task 2: Member session token (`src/lib/member/session.ts`)

Pure, dependency-free, HMAC-signed cookie value — mirrors the `idle.ts` pattern,
domain-separated so it can never collide with the admin token.

**Files:**
- Create: `src/lib/member/session.ts`
- Test: `src/lib/member/session.test.ts`

**Interfaces:**
- Produces:
  - `MEMBER_COOKIE: string`
  - `interface MemberSessionPayload { memberId: string; clubId: string; epoch: number }`
  - `makeMemberSession(payload, now?, ttlMs?): string`
  - `readMemberSession(raw, now?): MemberSessionPayload | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/member/session.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { makeMemberSession, readMemberSession } from "./session";

const payload = { memberId: "m-1", clubId: "c-1", epoch: 3 };

beforeAll(() => { process.env.NEXTAUTH_SECRET = "test-secret-value-please"; });

describe("member session token", () => {
  it("round-trips a valid payload", () => {
    const t = makeMemberSession(payload, 1_000);
    expect(readMemberSession(t, 2_000)).toEqual(payload);
  });

  it("rejects a tampered body", () => {
    const t = makeMemberSession(payload, 1_000);
    const [body, sig] = t.split(".");
    const bad = `${body}x.${sig}`;
    expect(readMemberSession(bad, 2_000)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const t = makeMemberSession(payload, 1_000);
    expect(readMemberSession(t.slice(0, -2) + "zz", 2_000)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = makeMemberSession(payload, 1_000, 60_000); // exp = 61_000
    expect(readMemberSession(t, 62_000)).toBeNull();
  });

  it("rejects empty / malformed input", () => {
    expect(readMemberSession(undefined)).toBeNull();
    expect(readMemberSession("")).toBeNull();
    expect(readMemberSession("no-dot")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/member/session.test.ts`
Expected: FAIL ("Cannot find module './session'").

- [ ] **Step 3: Write the implementation**

Create `src/lib/member/session.ts`:

```ts
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Member session cookie value (spec §5.5). A compact signed token —
 * `base64url(JSON{memberId,clubId,epoch,exp}).hmac` — mirroring the idle.ts HMAC
 * pattern, but domain-separated with a prefix so it can NEVER be confused with the
 * admin next-auth session. Members do not use Auth.js.
 */

export const MEMBER_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ccc.member" : "ccc.member";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (spec §5.5)
const DOMAIN = "member-session:v1|";

export interface MemberSessionPayload {
  memberId: string;
  clubId: string;
  epoch: number;
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set.");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(DOMAIN + body).digest("base64url");
}

export function makeMemberSession(
  payload: MemberSessionPayload,
  now: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + ttlMs }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readMemberSession(
  raw: string | undefined | null,
  now: number = Date.now(),
): MemberSessionPayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const provided = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof d.exp !== "number" || d.exp < now) return null;
    if (typeof d.memberId !== "string" || typeof d.clubId !== "string" || typeof d.epoch !== "number") {
      return null;
    }
    return { memberId: d.memberId, clubId: d.clubId, epoch: d.epoch };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/member/session.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/member/session.ts src/lib/member/session.test.ts
git commit -m "feat(member-portal): signed member session cookie helper"
```

---

### Task 3: Lockout math (`src/lib/member/lockout.ts`)

Pure helpers for the brute-force lockout, kept separate so they're unit-testable
without a DB.

**Files:**
- Create: `src/lib/member/lockout.ts`
- Test: `src/lib/member/lockout.test.ts`

**Interfaces:**
- Produces:
  - `MAX_FAILED = 5`, `LOCKOUT_MS = 900_000`
  - `isLocked(lockedUntil: string | null, now?): boolean`
  - `nextFailureState(failedAttempts, now?): { failed_attempts: number; locked_until: string | null }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/member/lockout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isLocked, nextFailureState, MAX_FAILED, LOCKOUT_MS } from "./lockout";

describe("member lockout", () => {
  it("is not locked when locked_until is null or past", () => {
    expect(isLocked(null, 1000)).toBe(false);
    expect(isLocked(new Date(500).toISOString(), 1000)).toBe(false);
  });

  it("is locked while locked_until is in the future", () => {
    expect(isLocked(new Date(2000).toISOString(), 1000)).toBe(true);
  });

  it("does not lock before MAX_FAILED", () => {
    const s = nextFailureState(MAX_FAILED - 2, 1000); // → MAX_FAILED-1
    expect(s.failed_attempts).toBe(MAX_FAILED - 1);
    expect(s.locked_until).toBeNull();
  });

  it("locks on the MAX_FAILED-th failure", () => {
    const s = nextFailureState(MAX_FAILED - 1, 1000); // → MAX_FAILED
    expect(s.failed_attempts).toBe(MAX_FAILED);
    expect(s.locked_until).toBe(new Date(1000 + LOCKOUT_MS).toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/member/lockout.test.ts`
Expected: FAIL ("Cannot find module './lockout'").

- [ ] **Step 3: Write the implementation**

Create `src/lib/member/lockout.ts`:

```ts
/** Member login brute-force lockout (spec §5.4). Pure — DB persistence lives in auth.ts. */

export const MAX_FAILED = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** True while a lock is still in effect. */
export function isLocked(lockedUntil: string | null, now: number = Date.now()): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > now;
}

/** The row state to persist after one more failed attempt. */
export function nextFailureState(
  failedAttempts: number,
  now: number = Date.now(),
): { failed_attempts: number; locked_until: string | null } {
  const failed = failedAttempts + 1;
  return {
    failed_attempts: failed,
    locked_until: failed >= MAX_FAILED ? new Date(now + LOCKOUT_MS).toISOString() : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/member/lockout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/member/lockout.ts src/lib/member/lockout.test.ts
git commit -m "feat(member-portal): pure lockout math for member login"
```

---

### Task 4: Member invites data layer (`src/lib/member/invites.ts`)

DB-backed; mirrors `src/lib/admin/invites.ts`. No unit test (DB integration, like the
admin equivalent) — verified by typecheck here and the browser walkthrough in Task 12.

**Files:**
- Create: `src/lib/member/invites.ts`

**Interfaces:**
- Consumes: `generateConfirmToken`, `hashToken` (`src/lib/tokens.ts`).
- Produces:
  - `createMemberInvite({ memberId, createdBy }): Promise<{ token: string; expiresAt: string }>`
  - `validateMemberInvite(rawToken): Promise<{ id: string; memberId: string; clubId: string } | null>`
  - `consumeMemberInvite(inviteId): Promise<boolean>`

- [ ] **Step 1: Write the implementation**

Create `src/lib/member/invites.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateConfirmToken, hashToken } from "@/lib/tokens";

/**
 * One-time member login links (spec §5.1) — a direct mirror of admin invites.
 * A 32-byte token is generated, stored only as its SHA-256 hash, and expires.
 * Consuming it (in the accept flow) sets the member's PIN + TOTP.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (spec §12)

export async function createMemberInvite(input: {
  memberId: string;
  createdBy: string;
}): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  const { raw, hash } = generateConfirmToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const { error } = await admin.from("member_invites").insert({
    member_id: input.memberId,
    token_hash: hash,
    expires_at: expiresAt,
    created_by: input.createdBy,
  });
  if (error) throw error;
  return { token: raw, expiresAt };
}

/** A live invite for `rawToken` (with the member's club), or null. */
export async function validateMemberInvite(
  rawToken: string,
): Promise<{ id: string; memberId: string; clubId: string } | null> {
  if (!rawToken) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("member_invites")
    .select("id, member_id, expires_at, consumed_at, club_members(club_id, is_active)")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data || data.consumed_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  const member = data.club_members as unknown as { club_id: string; is_active: boolean } | null;
  if (!member || !member.is_active) return null;
  return { id: data.id, memberId: data.member_id, clubId: member.club_id };
}

/** Atomically mark an invite consumed. Returns false if it was already used. */
export async function consumeMemberInvite(inviteId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("member_invites")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  return !!data;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/lib/member/invites.ts
git commit -m "feat(member-portal): member invite data layer (mirror of admin invites)"
```

---

### Task 5: Member auth data layer (`src/lib/member/auth.ts`)

DB-backed credential read/write + the member guard. Composes Tasks 2–3. No unit test
(DB integration); verified by typecheck + walkthrough.

**Files:**
- Create: `src/lib/member/auth.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` (`password.ts`); `verifyTotp`,
  `decryptSecret`, `encryptSecret` (`totp.ts`); `isLocked`, `nextFailureState`
  (`lockout.ts`); `makeMemberSession`, `MemberSessionPayload` (`session.ts`).
- Produces:
  - `interface MemberCredRow { memberId: string; clubId: string; name: string; email: string; pinHash: string | null; totpSecretEnc: string | null; activatedAt: string | null; failedAttempts: number; lockedUntil: string | null; sessionEpoch: number; isActive: boolean }`
  - `findMemberForLogin(email): Promise<MemberCredRow | null>`
  - `verifyMemberLogin(row, pin, totp): Promise<boolean>`
  - `commitSetup({ memberId, pin, encSecret }): Promise<void>`
  - `recordLoginFailure(memberId, failedAttempts): Promise<void>`
  - `resetLoginFailures(memberId): Promise<void>`
  - `resetMemberAccess(memberId): Promise<void>` (clears creds, bumps epoch)
  - `ensureAuthRow(memberId): Promise<void>`

- [ ] **Step 1: Write the implementation**

Create `src/lib/member/auth.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { verifyTotp, decryptSecret } from "@/lib/auth/totp";
import { isLocked, nextFailureState } from "./lockout";

export interface MemberCredRow {
  memberId: string;
  clubId: string;
  name: string;
  email: string;
  pinHash: string | null;
  totpSecretEnc: string | null;
  activatedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  sessionEpoch: number;
  isActive: boolean;
}

/** Look up a member (with credentials) by email, case-insensitive. */
export async function findMemberForLogin(email: string): Promise<MemberCredRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("club_members")
    .select(
      "id, club_id, name, email, is_active, club_member_auth(pin_hash, totp_secret_enc, activated_at, failed_attempts, locked_until, session_epoch)",
    )
    .ilike("email", email)
    .maybeSingle();
  if (!data) return null;
  const a = data.club_member_auth as unknown as {
    pin_hash: string | null; totp_secret_enc: string | null; activated_at: string | null;
    failed_attempts: number; locked_until: string | null; session_epoch: number;
  } | null;
  return {
    memberId: data.id, clubId: data.club_id, name: data.name, email: data.email ?? "",
    isActive: data.is_active,
    pinHash: a?.pin_hash ?? null, totpSecretEnc: a?.totp_secret_enc ?? null,
    activatedAt: a?.activated_at ?? null, failedAttempts: a?.failed_attempts ?? 0,
    lockedUntil: a?.locked_until ?? null, sessionEpoch: a?.session_epoch ?? 0,
  };
}

/** True only if the account is active, not locked, and BOTH factors verify. */
export async function verifyMemberLogin(
  row: MemberCredRow, pin: string, totp: string,
): Promise<boolean> {
  if (!row.isActive || !row.activatedAt || !row.pinHash || !row.totpSecretEnc) return false;
  if (isLocked(row.lockedUntil)) return false;
  if (!(await verifyPassword(pin, row.pinHash))) return false;
  return verifyTotp(decryptSecret(row.totpSecretEnc), totp);
}

/** Persist PIN + enrolled TOTP secret and mark the account activated. */
export async function commitSetup(input: {
  memberId: string; pin: string; encSecret: string;
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const pin_hash = await hashPassword(input.pin);
  // Upsert: the auth row may not exist yet if the member predates provisioning.
  const { error } = await admin.from("club_member_auth").upsert({
    member_id: input.memberId,
    pin_hash,
    totp_secret_enc: input.encSecret,
    totp_enrolled_at: now,
    activated_at: now,
    failed_attempts: 0,
    locked_until: null,
    updated_at: now,
  });
  if (error) throw error;
}

export async function recordLoginFailure(memberId: string, failedAttempts: number): Promise<void> {
  const admin = createAdminClient();
  await admin.from("club_member_auth")
    .update({ ...nextFailureState(failedAttempts), updated_at: new Date().toISOString() })
    .eq("member_id", memberId);
}

export async function resetLoginFailures(memberId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("club_member_auth")
    .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("member_id", memberId);
}

/** Head-driven recovery: wipe creds and bump the epoch (kills live sessions). */
export async function resetMemberAccess(memberId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("club_member_auth")
    .select("session_epoch").eq("member_id", memberId).maybeSingle();
  const epoch = (data?.session_epoch ?? 0) + 1;
  await admin.from("club_member_auth").upsert({
    member_id: memberId,
    pin_hash: null, totp_secret_enc: null, totp_enrolled_at: null, activated_at: null,
    failed_attempts: 0, locked_until: null, session_epoch: epoch,
    updated_at: new Date().toISOString(),
  });
}

/** Provision an empty auth row when a member is created with an email. */
export async function ensureAuthRow(memberId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("club_member_auth")
    .upsert({ member_id: memberId }, { onConflict: "member_id", ignoreDuplicates: true });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/lib/member/auth.ts
git commit -m "feat(member-portal): member credential data layer (login verify, setup, reset)"
```

---

### Task 6: Member guard (`src/lib/member/guards.ts`)

**Files:**
- Create: `src/lib/member/guards.ts`

**Interfaces:**
- Consumes: `MEMBER_COOKIE`, `readMemberSession` (`session.ts`).
- Produces:
  - `interface MemberSession { memberId: string; clubId: string; name: string; email: string }`
  - `getMemberSession(): Promise<MemberSession | null>`
  - `requireMember(): Promise<MemberSession>` (redirects to `/member/login` on failure)

- [ ] **Step 1: Write the implementation**

Create `src/lib/member/guards.ts`:

```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBER_COOKIE, readMemberSession } from "./session";

export interface MemberSession {
  memberId: string;
  clubId: string;
  name: string;
  email: string;
}

/** Authoritative member check: cookie signature + DB epoch + still-active + activated. */
export const getMemberSession = cache(async function (): Promise<MemberSession | null> {
  const raw = (await cookies()).get(MEMBER_COOKIE)?.value;
  const payload = readMemberSession(raw);
  if (!payload) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("club_members")
    .select("id, name, email, club_id, is_active, club_member_auth(session_epoch, activated_at)")
    .eq("id", payload.memberId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  const a = data.club_member_auth as unknown as { session_epoch: number; activated_at: string | null } | null;
  if (!a || !a.activated_at || a.session_epoch !== payload.epoch) return null;

  return { memberId: data.id, clubId: data.club_id, name: data.name, email: data.email ?? "" };
});

export async function requireMember(): Promise<MemberSession> {
  const s = await getMemberSession();
  if (!s) redirect("/member/login");
  return s;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/lib/member/guards.ts
git commit -m "feat(member-portal): requireMember guard (cookie + DB re-validation)"
```

---

### Task 7: Proxy matcher + layout chrome

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `MEMBER_COOKIE` (`session.ts`).

- [ ] **Step 1: Add the member branch to `src/proxy.ts`**

Add the import near the top:

```ts
import { MEMBER_COOKIE } from "@/lib/member/session";
```

Immediately after `const proceed = NextResponse.next({ request: { headers } });`
(and before the admin `/admin/login` line), insert:

```ts
  // Member portal (spec §5.6): its own isolated cookie + login. A UX redirect only;
  // the authoritative check is requireMember() on each guarded page.
  if (pathname.startsWith("/member")) {
    if (pathname === "/member/login" || pathname === "/member/accept-invite") return proceed;
    if (!req.cookies.has(MEMBER_COOKIE)) {
      const url = req.nextUrl.clone();
      url.pathname = "/member/login";
      return NextResponse.redirect(url);
    }
    return proceed;
  }
```

Change the matcher at the bottom:

```ts
export const config = {
  matcher: ["/admin/:path*", "/member/:path*"],
};
```

- [ ] **Step 2: Drop public chrome on `/member` in `src/app/layout.tsx`**

Replace the `isAdmin` line and its use:

```ts
  // Admin AND member areas bring their own chrome (proxy sets x-pathname).
  const path = (await headers()).get("x-pathname") ?? "";
  const bespokeChrome = path.startsWith("/admin") || path.startsWith("/member");
```

and change `{isAdmin ? (` to `{bespokeChrome ? (`.

- [ ] **Step 3: Verify build + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS (the ESLint auth-guard rule only covers `app/api/admin/**`, so it
won't flag these).

```bash
git add src/proxy.ts src/app/layout.tsx
git commit -m "feat(member-portal): guard /member/* in proxy; drop public chrome there"
```

---

### Task 8: Member form gains email + phone; provisioning on create

**Files:**
- Modify: `src/components/admin/MemberForm.tsx`
- Modify: `src/app/admin/(app)/attendance/actions.ts`
- Modify: `src/lib/admin/members.ts` (add email/phone to `MemberForEdit`)

**Interfaces:**
- Consumes: `ensureAuthRow` (`src/lib/member/auth.ts`).

- [ ] **Step 1: Add fields to `MemberForm.tsx`**

In `MemberInitial`, add `email: string;` and `phone: string;`. Add two fields after
the `rollNo` field:

```tsx
      <div className="field">
        <label htmlFor="email">Email (needed for a member login)</label>
        <input id="email" name="email" type="email" maxLength={200} defaultValue={initial?.email} />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone (optional)</label>
        <input id="phone" name="phone" maxLength={20} defaultValue={initial?.phone} />
      </div>
```

- [ ] **Step 2: Add email/phone to the schema + writes in `actions.ts`**

In `MemberSchema` add:

```ts
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
```

In `parse()` add `email: formData.get("email") ?? "", phone: formData.get("phone") ?? "",`.

In `createMemberAction`, add `email` + `phone` to the insert (null when empty):

```ts
      email: parsed.data.email ? parsed.data.email : null,
      phone: parsed.data.phone ? parsed.data.phone : null,
```

After a successful insert (before `writeAudit`), provision the auth row when an email
was given:

```ts
  if (parsed.data.email) {
    const { ensureAuthRow } = await import("@/lib/member/auth");
    await ensureAuthRow(data.id);
  }
```

In `updateMemberAction`, add `email` + `phone` to the `.update({...})` the same way.
Map a unique-violation (Postgres `23505`) on either action to a friendly error:

```ts
  if (error?.code === "23505") return { error: "That email is already used by another member." };
```

- [ ] **Step 3: Surface email/phone to the edit page via `members.ts`**

In `MemberForEdit` add `email: string | null; phone: string | null;`. In
`getMemberForEdit` add `email, phone` to the `.select(...)` and to the returned
object (`email: data.email, phone: data.phone`).

- [ ] **Step 4: Pass initial values in the edit page**

In `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx`, extend the `initial`
prop with `email: member.email ?? "", phone: member.phone ?? "",`.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/components/admin/MemberForm.tsx "src/app/admin/(app)/attendance/actions.ts" src/lib/admin/members.ts "src/app/admin/(app)/attendance/members/[id]/edit/page.tsx"
git commit -m "feat(member-portal): capture member email/phone; provision auth row on create"
```

---

### Task 9: Generate-login-link + reset-access actions and edit-page UI

**Files:**
- Modify: `src/lib/admin/form-state.ts` (add member states)
- Modify: `src/app/admin/(app)/attendance/actions.ts` (add two actions)
- Create: `src/components/admin/MemberLoginAccess.tsx`
- Modify: `src/app/admin/(app)/attendance/members/[id]/edit/page.tsx` (render it)

**Interfaces:**
- Consumes: `createMemberInvite` (invites.ts), `resetMemberAccess`, `ensureAuthRow`
  (auth.ts), `getMemberForEdit` (members.ts), `canManage` (capabilities), `writeAudit`.
- Produces: `MemberInviteState { error?: string; inviteUrl?: string }`.

- [ ] **Step 1: Add the state type to `form-state.ts`**

```ts
export interface MemberInviteState {
  error?: string;
  /** The generated accept-invite URL, shown once so the head can share it. */
  inviteUrl?: string;
}
```

- [ ] **Step 2: Add the two server actions to `attendance/actions.ts`**

```ts
import { createMemberInvite } from "@/lib/member/invites";
import { resetMemberAccess, ensureAuthRow } from "@/lib/member/auth";
import type { MemberInviteState } from "@/lib/admin/form-state";

/** Own-club-scoped guard shared by both actions below. */
async function requireOwnClubMember(memberId: string) {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." as string };
  if (!z.string().uuid().safeParse(memberId).success) return { error: "Missing member reference." };
  const member = await getMemberForEdit(memberId);
  if (!member) return { error: "That member no longer exists." };
  if (!member.email) return { error: "Add an email for this member first." };
  if (!canManage(session, "manage:members", member.clubId)) return { error: "You can't manage that member." };
  return { session, member };
}

export async function generateMemberLinkAction(
  _prev: MemberInviteState,
  formData: FormData,
): Promise<MemberInviteState> {
  const memberId = String(formData.get("memberId") ?? "");
  const gate = await requireOwnClubMember(memberId);
  if ("error" in gate) return { error: gate.error };

  await ensureAuthRow(memberId);
  const { token } = await createMemberInvite({ memberId, createdBy: gate.session.id });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await writeAudit({
    actorId: gate.session.id, action: "invite", entity: "club_member", entityId: memberId,
    after: { action: "login-link" },
  });
  return { inviteUrl: `${base}/member/accept-invite?token=${token}` };
}

export async function resetMemberAccessAction(
  _prev: MemberInviteState,
  formData: FormData,
): Promise<MemberInviteState> {
  const memberId = String(formData.get("memberId") ?? "");
  const gate = await requireOwnClubMember(memberId);
  if ("error" in gate) return { error: gate.error };

  await resetMemberAccess(memberId); // clears creds + bumps epoch (logs them out)
  const { token } = await createMemberInvite({ memberId, createdBy: gate.session.id });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await writeAudit({
    actorId: gate.session.id, action: "reset", entity: "club_member", entityId: memberId,
    after: { action: "reset-access" },
  });
  return { inviteUrl: `${base}/member/accept-invite?token=${token}` };
}
```

- [ ] **Step 3: Create the client UI `MemberLoginAccess.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { MemberInviteState } from "@/lib/admin/form-state";

type Action = (prev: MemberInviteState, formData: FormData) => Promise<MemberInviteState>;
const initial: MemberInviteState = {};

export function MemberLoginAccess({
  memberId, activated, generate, reset,
}: {
  memberId: string;
  activated: boolean;
  generate: Action;
  reset: Action;
}) {
  const [gen, genAction, genPending] = useActionState(generate, initial);
  const [res, resAction, resPending] = useActionState(reset, initial);
  const url = gen.inviteUrl ?? res.inviteUrl;
  const error = gen.error ?? res.error;

  return (
    <div>
      <p className="body-text" style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 10px" }}>
        {activated
          ? "This member has set up their login. Use Reset access if they lost their device."
          : "Generate a one-time link and send it to the member to set up their login."}
      </p>
      {error ? <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 12 }}>{error}</div> : null}
      {url ? (
        <div className="note" style={{ marginBottom: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>Send this link (shown once)</div>
          <code style={{ wordBreak: "break-all" }}>{url}</code>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <form action={genAction}>
          <input type="hidden" name="memberId" value={memberId} />
          <button type="submit" className="btn" disabled={genPending}>
            {genPending ? "Generating…" : activated ? "New login link" : "Generate login link"}
          </button>
        </form>
        {activated ? (
          <form action={resAction}>
            <input type="hidden" name="memberId" value={memberId} />
            <button type="submit" className="btn" style={{ color: "var(--rust)" }} disabled={resPending}>
              {resPending ? "Resetting…" : "Reset access"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render it on the edit page (only when the member has an email)**

In `members/[id]/edit/page.tsx`, import both actions + the component + `getMemberAuthStatus`.
Add a helper to `members.ts`:

```ts
export async function isMemberActivated(id: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("club_member_auth")
    .select("activated_at").eq("member_id", id).maybeSingle();
  return !!data?.activated_at;
}
```

Then in the edit page, after the QR-card section, add:

```tsx
      {member.email ? (
        <section className="rule" style={{ marginTop: 24, paddingTop: 24 }}>
          <h2 style={{ font: "400 18px var(--serif)", margin: "0 0 12px" }}>Login access</h2>
          <MemberLoginAccess
            memberId={member.id}
            activated={await isMemberActivated(member.id)}
            generate={generateMemberLinkAction}
            reset={resetMemberAccessAction}
          />
        </section>
      ) : null}
```

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/lib/admin/form-state.ts "src/app/admin/(app)/attendance/actions.ts" src/components/admin/MemberLoginAccess.tsx src/lib/admin/members.ts "src/app/admin/(app)/attendance/members/[id]/edit/page.tsx"
git commit -m "feat(member-portal): head generate-login-link + reset-access (own-club scoped)"
```

---

### Task 10: Member first-time setup page (`/member/accept-invite`)

Mirrors `src/app/admin/accept-invite/*`, but sets a PIN (6 digits) instead of a
password and issues a member session.

**Files:**
- Create: `src/app/member/accept-invite/page.tsx`
- Create: `src/app/member/accept-invite/actions.ts`
- Create: `src/components/member/MemberSetupForm.tsx`
- Modify: `src/lib/admin/form-state.ts` (add `MemberSetupState`)

**Interfaces:**
- Consumes: `validateMemberInvite`, `consumeMemberInvite` (invites.ts); `commitSetup`
  (auth.ts); `newTotpSecret`, `totpKeyUri`, `encryptSecret`, `decryptSecret`,
  `verifyTotp` (totp.ts); `makeMemberSession`, `MEMBER_COOKIE` (session.ts).
- Produces: `MemberSetupState { error?: string }`.

- [ ] **Step 1: Add the state type**

In `form-state.ts`: `export interface MemberSetupState { error?: string; }`

- [ ] **Step 2: Create the page**

Create `src/app/member/accept-invite/page.tsx`:

```tsx
import type { Metadata } from "next";
import QRCode from "qrcode";
import { validateMemberInvite } from "@/lib/member/invites";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";
import { createAdminClient } from "@/lib/supabase/admin";
import { MemberSetupForm } from "@/components/member/MemberSetupForm";

export const metadata: Metadata = { title: "Set up your member login", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberAcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await validateMemberInvite(token) : null;

  if (!invite) {
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <div className="label" style={{ color: "var(--rust)" }}>Link invalid</div>
          <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>This link won&rsquo;t work</h1>
          <p className="body-text">It may have expired or already been used. Ask your club head for a new one.</p>
        </div>
      </main>
    );
  }

  // Fetch the member's email to label the authenticator entry.
  const admin = createAdminClient();
  const { data: m } = await admin.from("club_members").select("email").eq("id", invite.memberId).maybeSingle();
  const label = m?.email ?? "member";

  const secret = newTotpSecret();
  const qr = await QRCode.toDataURL(totpKeyUri(secret, label), { margin: 1, width: 200 });

  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 440 }}>
        <MemberSetupForm token={token!} qr={qr} manualKey={secret} encSecret={encryptSecret(secret)} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the action**

Create `src/app/member/accept-invite/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateMemberInvite, consumeMemberInvite } from "@/lib/member/invites";
import { commitSetup } from "@/lib/member/auth";
import { verifyTotp, decryptSecret } from "@/lib/auth/totp";
import { makeMemberSession, MEMBER_COOKIE } from "@/lib/member/session";
import { writeAudit } from "@/lib/admin/audit";
import type { MemberSetupState } from "@/lib/admin/form-state";

const Schema = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "Your PIN must be 6 digits."),
  totp: z.string().trim().min(1),
  secret: z.string().min(1),
});

const useSecure = process.env.NODE_ENV === "production";

export async function memberSetupAction(
  _prev: MemberSetupState,
  formData: FormData,
): Promise<MemberSetupState> {
  const parsed = Schema.safeParse({
    token: formData.get("token"), pin: formData.get("pin"),
    totp: formData.get("totp"), secret: formData.get("secret"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { token, pin, totp, secret: encSecret } = parsed.data;

  const invite = await validateMemberInvite(token);
  if (!invite) return { error: "This link is invalid or has expired. Ask for a new one." };

  let secret: string;
  try { secret = decryptSecret(encSecret); } catch { return { error: "Enrollment expired — reload and scan again." }; }
  if (!verifyTotp(secret, totp)) return { error: "That authenticator code didn't match. Use the current one." };

  await commitSetup({ memberId: invite.memberId, pin, encSecret });
  const consumed = await consumeMemberInvite(invite.id);
  if (!consumed) return { error: "This link was already used. Ask for a new one." };

  await writeAudit({ actorId: invite.memberId, action: "setup", entity: "club_member", entityId: invite.memberId });

  (await cookies()).set({
    name: MEMBER_COOKIE,
    value: makeMemberSession({ memberId: invite.memberId, clubId: invite.clubId, epoch: 0 }),
    httpOnly: true, sameSite: "lax", path: "/", secure: useSecure, maxAge: 30 * 24 * 60 * 60,
  });
  redirect("/member");
}
```

> NOTE: `epoch: 0` matches a freshly-provisioned/committed auth row (`commitSetup`
> never bumps the epoch; `session_epoch` defaults to 0 and only "Reset access"
> increments it). `getMemberSession` compares against the DB value, so this is
> correct for the first session.

- [ ] **Step 4: Create the form component**

Create `src/components/member/MemberSetupForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { memberSetupAction } from "@/app/member/accept-invite/actions";
import type { MemberSetupState } from "@/lib/admin/form-state";

const initial: MemberSetupState = {};

export function MemberSetupForm({
  token, qr, manualKey, encSecret,
}: { token: string; qr: string; manualKey: string; encSecret: string }) {
  const [state, action, pending] = useActionState(memberSetupAction, initial);
  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>CSE Council · Member</div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 2px" }}>Set up your login</h1>
      <p className="body-text" style={{ marginBottom: 18 }}>Choose a PIN and add an authenticator app.</p>

      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div> : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="secret" value={encSecret} />

      <div className="field">
        <label htmlFor="pin">6-digit PIN</label>
        <input id="pin" name="pin" inputMode="numeric" autoComplete="off" maxLength={6} required />
        <span className="hint">You&rsquo;ll enter this each time you sign in.</span>
      </div>

      <div className="enroll">
        <div className="label" style={{ marginBottom: 8 }}>Authenticator app</div>
        <p className="body-text" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Scan with Google Authenticator, Authy, 1Password…
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Authenticator QR code" width={180} height={180} className="enroll-qr" />
        <div className="hint" style={{ marginTop: 8 }}>Can&rsquo;t scan? Enter this key: <code>{manualKey}</code></div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="totp">6-digit code from the app</label>
        <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Setting up…" : "Finish setup"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/app/member/accept-invite src/components/member/MemberSetupForm.tsx src/lib/admin/form-state.ts
git commit -m "feat(member-portal): first-time setup via login link (PIN + TOTP enroll)"
```

---

### Task 11: Member login page (`/member/login`)

**Files:**
- Create: `src/app/member/login/page.tsx`
- Create: `src/app/member/login/actions.ts`
- Create: `src/components/member/MemberLoginForm.tsx`
- Modify: `src/lib/admin/form-state.ts` (add `MemberLoginState`)

**Interfaces:**
- Consumes: `findMemberForLogin`, `verifyMemberLogin`, `recordLoginFailure`,
  `resetLoginFailures` (auth.ts); `checkLoginLimits` (rate-limit.ts);
  `makeMemberSession`, `MEMBER_COOKIE` (session.ts).
- Produces: `MemberLoginState { error?: string }`.

- [ ] **Step 1: Add the state type**

In `form-state.ts`: `export interface MemberLoginState { error?: string; }`

- [ ] **Step 2: Create the action**

Create `src/app/member/login/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findMemberForLogin, verifyMemberLogin, recordLoginFailure, resetLoginFailures } from "@/lib/member/auth";
import { checkLoginLimits } from "@/lib/rate-limit";
import { makeMemberSession, MEMBER_COOKIE } from "@/lib/member/session";
import type { MemberLoginState } from "@/lib/admin/form-state";

const Schema = z.object({
  email: z.string().trim().email(),
  pin: z.string().regex(/^\d{6}$/),
  totp: z.string().trim().min(1),
});

const GENERIC = "Wrong email, PIN, or code.";
const useSecure = process.env.NODE_ENV === "production";

export async function memberLoginAction(
  _prev: MemberLoginState,
  formData: FormData,
): Promise<MemberLoginState> {
  const parsed = Schema.safeParse({
    email: formData.get("email"), pin: formData.get("pin"), totp: formData.get("totp"),
  });
  if (!parsed.success) return { error: GENERIC };
  const { email, pin, totp } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkLoginLimits({ ip, email }).ok) return { error: GENERIC };

  const row = await findMemberForLogin(email);
  if (!row) return { error: GENERIC };

  if (await verifyMemberLogin(row, pin, totp)) {
    await resetLoginFailures(row.memberId);
    (await cookies()).set({
      name: MEMBER_COOKIE,
      value: makeMemberSession({ memberId: row.memberId, clubId: row.clubId, epoch: row.sessionEpoch }),
      httpOnly: true, sameSite: "lax", path: "/", secure: useSecure, maxAge: 30 * 24 * 60 * 60,
    });
    redirect("/member");
  }

  // Only count a failure when the account exists + isn't already locked, mirroring
  // the admin generic-failure contract.
  await recordLoginFailure(row.memberId, row.failedAttempts);
  return { error: GENERIC };
}
```

- [ ] **Step 3: Create the form + page**

Create `src/components/member/MemberLoginForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { memberLoginAction } from "@/app/member/login/actions";
import type { MemberLoginState } from "@/lib/admin/form-state";

const initial: MemberLoginState = {};

export function MemberLoginForm() {
  const [state, action, pending] = useActionState(memberLoginAction, initial);
  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>CSE Council · Member</div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>Sign in</h1>
      <p className="body-text" style={{ marginBottom: 18 }}>Use the login your club head set you up with.</p>
      {state.error ? <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>{state.error}</div> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="pin">6-digit PIN</label>
        <input id="pin" name="pin" inputMode="numeric" autoComplete="off" maxLength={6} required />
      </div>
      <div className="field">
        <label htmlFor="totp">Authenticator code</label>
        <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

Create `src/app/member/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { MemberLoginForm } from "@/components/member/MemberLoginForm";

export const metadata: Metadata = { title: "Member sign in", robots: { index: false } };

export default function MemberLoginPage() {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 400 }}>
        <MemberLoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/app/member/login src/components/member/MemberLoginForm.tsx src/lib/admin/form-state.ts
git commit -m "feat(member-portal): member sign-in (email + PIN + TOTP, rate-limited)"
```

---

### Task 12: Member portal home + layout + logout (`/member`)

> Builds the portal with the **static** personal QR. **Part B / Task 17 replaces that
> `<img>` with the rotating `RotatingMemberQr` component** (anti-proxy option 2). If
> you are implementing Part B, you may skip straight to the rotating version here.

**Files:**
- Create: `src/app/member/layout.tsx`
- Create: `src/app/member/page.tsx`
- Create: `src/app/member/actions.ts` (logout)

**Interfaces:**
- Consumes: `requireMember` (guards.ts); `memberToken` (attendance.ts); `qrDataUrl`
  (qr.ts); `getMemberAttendance` (attendance-club.ts); `istNumericDate` (datetime);
  `MEMBER_COOKIE` (session.ts).

- [ ] **Step 1: Create the member layout (slim chrome)**

Create `src/app/member/layout.tsx`:

```tsx
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--paper)" }}>
      <header style={{ borderBottom: "1px solid var(--rule)", padding: "14px 20px" }}>
        <div className="label" style={{ color: "var(--forest)" }}>CSE Club Council · Member</div>
      </header>
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 64px" }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create the logout action**

Create `src/app/member/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MEMBER_COOKIE } from "@/lib/member/session";

const useSecure = process.env.NODE_ENV === "production";

export async function memberLogoutAction(): Promise<void> {
  (await cookies()).set({
    name: MEMBER_COOKIE, value: "", httpOnly: true, sameSite: "lax",
    path: "/", secure: useSecure, maxAge: 0,
  });
  redirect("/member/login");
}
```

- [ ] **Step 3: Create the portal home**

Create `src/app/member/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireMember } from "@/lib/member/guards";
import { memberToken } from "@/lib/attendance";
import { qrDataUrl } from "@/lib/qr";
import { getMemberAttendance } from "@/lib/admin/attendance-club";
import { istNumericDate } from "@/lib/datetime";
import { memberLogoutAction } from "./actions";

export const metadata: Metadata = { title: "My attendance", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberHome() {
  const session = await requireMember();
  const [qr, view] = await Promise.all([
    qrDataUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/m/${memberToken(session.memberId)}`),
    getMemberAttendance(session.memberId),
  ]);

  return (
    <section>
      <div className="eyebrow">{view?.clubName ?? "Club"}</div>
      <h1 style={{ margin: "10px 0 4px" }}>{session.name}</h1>
      <p className="lead" style={{ marginTop: 0 }}>Show this QR to your club head to mark attendance.</p>

      <div style={{ textAlign: "center", margin: "20px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Your attendance QR" width={240} height={240}
             style={{ width: 240, height: 240, border: "1px solid var(--rule)", borderRadius: 12, padding: 12 }} />
      </div>

      <div className="att-count" style={{ marginTop: 8 }}>
        <strong>{view?.pct ?? 0}%</strong>
        <span>{view?.attended ?? 0} of {view?.eligible ?? 0} sessions</span>
      </div>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>History</h2>
      {!view || view.history.length === 0 ? (
        <p className="body-text" style={{ color: "var(--ink-3)" }}>No sessions yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
          {view.history.map((h, i) => (
            <li key={i} className="rule" style={{ paddingBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>{h.title} · <span className="label" style={{ color: "var(--ink-3)" }}>{istNumericDate(h.at)}</span></span>
              <span style={{ color: h.present ? "var(--forest)" : "var(--rust)" }}>{h.present ? "Present" : "Absent"}</span>
            </li>
          ))}
        </ul>
      )}

      <form action={memberLogoutAction} style={{ marginTop: 32 }}>
        <button type="submit" className="btn">Log out</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/app/member/layout.tsx src/app/member/page.tsx src/app/member/actions.ts
git commit -m "feat(member-portal): member home — QR + attendance + history + logout"
```

---

### Task 13: Full verify gate + owner walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: typecheck clean; lint clean; all tests pass (78 existing + 9 new from Tasks
2–3); build ✓.

- [ ] **Step 2: Owner browser walkthrough (mutations can't be curled)**

Drive these in a browser against `npm run dev` (writes the LIVE DB — clean up any test
member afterward):
1. Log in as a **club_head**. Attendance → Members → **Add member** with a name +
   **email** → Save. Open the member's Edit page → **Login access** block appears →
   **Generate login link** → copy the URL.
2. In a private window (or phone), open the link → set a 6-digit PIN → scan the TOTP
   QR into an authenticator → enter the code → **Finish setup** → lands on `/member`
   showing the QR + 0%.
3. As the head: open a session → `/admin/attendance/scan` → scan the member's on-screen
   QR → "✓ Name"; the member's `/member` now shows the mark after the session closes.
4. On `/member`: **Log out** → sign back in with **email + PIN + TOTP** → success.
5. **Reset access** from the head's edit page → the member's existing session is
   killed (next `/member` load bounces to `/member/login`) and a fresh link is shown.
6. **Club-scope check:** as a club_head of club A, confirm you cannot reach or invite
   a member of club B (the member isn't listed; a forged `memberId` returns the
   "can't manage" error).

- [ ] **Step 3: Clean up + update STATUS**

Delete any throwaway test member from the live DB (Supabase MCP). Add a note to
`docs/STATUS.md` under "What's DONE" summarizing the member portal, and move it out of
the TODO. Commit.

```bash
git add docs/STATUS.md
git commit -m "docs: STATUS — member portal (login link + PIN/TOTP) built"
```

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to decide merge/PR. Do NOT push to
`main` without the owner's go-ahead (auto-deploys to production).

---

## Part B — Anti-proxy rotating member QR (spec §6a)

The portal QR becomes **time-boxed**: it refreshes every N seconds (head-set per
session) and a stale screenshot won't scan. The DB column `qr_ttl_seconds` was already
added in Task 1. Static printed cards keep working. Do Part B after Tasks 0–12 (Task
13's gate can run once, after Task 18).

---

### Task 14: Expiring member token (`src/lib/attendance.ts`)

**Files:**
- Modify: `src/lib/attendance.ts` (append new helpers)
- Test: `src/lib/attendance.test.ts` (append cases)

**Interfaces:**
- Produces:
  - `memberExpiringToken(memberId: string, ttlSeconds: number, nowMs?): string` → `e.<id>.<exp>.<sig>`
  - `verifyMemberExpiringToken(token: string, nowMs?): string | null`

- [ ] **Step 1: Write the failing tests** — append to `src/lib/attendance.test.ts`:

```ts
import { memberExpiringToken, verifyMemberExpiringToken } from "./attendance";

describe("expiring member token", () => {
  it("verifies within its window and returns the memberId", () => {
    const t = memberExpiringToken("mem-1", 60, 1_000_000);
    expect(verifyMemberExpiringToken(t, 1_030_000)).toBe("mem-1"); // 30s later
  });
  it("rejects after expiry", () => {
    const t = memberExpiringToken("mem-1", 60, 1_000_000); // exp = 1_060_000
    expect(verifyMemberExpiringToken(t, 1_060_001)).toBeNull();
  });
  it("rejects a tampered signature", () => {
    const t = memberExpiringToken("mem-1", 60, 1_000_000);
    expect(verifyMemberExpiringToken(t.slice(0, -2) + "zz", 1_010_000)).toBeNull();
  });
  it("rejects a wrong shape / static token", () => {
    expect(verifyMemberExpiringToken("mem-1.somesig", 1_010_000)).toBeNull();
    expect(verifyMemberExpiringToken("e.mem-1.notanumber.sig", 1_010_000)).toBeNull();
  });
});
```

> The test file already sets `ATTENDANCE_HMAC_SECRET` for the existing member-token
> tests; reuse that setup (don't add a second `beforeAll` that clobbers it).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/attendance.test.ts`
Expected: FAIL ("memberExpiringToken is not a function").

- [ ] **Step 3: Append the implementation to `src/lib/attendance.ts`**

```ts
// ── time-boxed member QR (anti-proxy portal display, spec §6a) ────────────────
// The portal shows a QR that expires after a head-set window; a screenshot is stale
// once `exp` passes. Distinguished from the static token by an `e.` prefix.

function memberExpSig(memberId: string, exp: number): string {
  return createHmac("sha256", hmacSecret())
    .update(`member-exp:v1|${memberId}|${exp}`)
    .digest("base64url");
}

/** A member token that is valid only until `now + ttlSeconds`. */
export function memberExpiringToken(
  memberId: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  const exp = nowMs + Math.max(1, Math.floor(ttlSeconds)) * 1000;
  return `e.${memberId}.${exp}.${memberExpSig(memberId, exp)}`;
}

/** The member id iff the signature is valid AND the token has not expired. */
export function verifyMemberExpiringToken(
  token: string,
  nowMs: number = Date.now(),
): string | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "e") return null;
  const [, memberId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!memberId || !sig || !Number.isInteger(exp)) return null;
  const expected = Buffer.from(memberExpSig(memberId, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return nowMs <= exp ? memberId : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/attendance.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat(member-portal): expiring (anti-proxy) member QR token"
```

---

### Task 15: Head sets the QR window on the Open-session form

**Files:**
- Modify: `src/components/admin/OpenSessionForm.tsx`
- Modify: `src/app/admin/(app)/attendance/actions.ts` (`SessionSchema`, `openSessionAction`)

**Interfaces:**
- Produces: sessions persisted with `qr_ttl_seconds`.

- [ ] **Step 1: Add the input to `OpenSessionForm.tsx`**

Add before the submit button:

```tsx
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="qrTtlSeconds">QR refresh (seconds)</label>
        <input id="qrTtlSeconds" name="qrTtlSeconds" type="number" min={5} max={600}
               defaultValue={60} style={{ maxWidth: 120 }} />
      </div>
```

- [ ] **Step 2: Accept + persist it in `actions.ts`**

Extend `SessionSchema`:

```ts
const SessionSchema = z.object({
  title: z.string().trim().min(2).max(140),
  clubId: z.union([z.literal(""), z.string().uuid()]),
  qrTtlSeconds: z.coerce.number().int().min(5).max(600).optional(),
});
```

Add to the `safeParse` input: `qrTtlSeconds: formData.get("qrTtlSeconds") ?? undefined,`.
Add to the `.insert({...})` in `openSessionAction`:
`qr_ttl_seconds: parsed.data.qrTtlSeconds ?? 60,`.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/components/admin/OpenSessionForm.tsx "src/app/admin/(app)/attendance/actions.ts"
git commit -m "feat(member-portal): head sets per-session QR refresh window"
```

---

### Task 16: Member QR endpoint (`/api/member/qr`)

**Files:**
- Create: `src/app/api/member/qr/route.ts`

**Interfaces:**
- Consumes: `getMemberSession` (guards.ts); `memberExpiringToken` (attendance.ts);
  `qrDataUrl` (qr.ts); `createAdminClient`.
- Produces: `GET → { qr: string; ttlSeconds: number }` (401 when not a member).

- [ ] **Step 1: Write the route**

Create `src/app/api/member/qr/route.ts`:

```ts
import { getMemberSession } from "@/lib/member/guards";
import { memberExpiringToken } from "@/lib/attendance";
import { qrDataUrl } from "@/lib/qr";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_TTL = 60;

/** A fresh, time-boxed QR for the signed-in member (spec §6a). */
export async function GET() {
  const session = await getMemberSession();
  if (!session) return Response.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: open } = await admin
    .from("club_attendance_sessions")
    .select("qr_ttl_seconds")
    .eq("club_id", session.clubId)
    .eq("status", "open")
    .maybeSingle();

  const ttlSeconds = open?.qr_ttl_seconds ?? DEFAULT_TTL;
  const token = memberExpiringToken(session.memberId, ttlSeconds);
  const qr = await qrDataUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/m/${token}`);
  return Response.json({ qr, ttlSeconds });
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (The auth-guard lint rule only covers `app/api/admin/**`, so a
member route is fine; the guard here is `getMemberSession`.)

```bash
git add src/app/api/member/qr/route.ts
git commit -m "feat(member-portal): /api/member/qr — fresh expiring QR per poll"
```

---

### Task 17: Rotating QR component + wire into the portal + `/m/[token]`

**Files:**
- Create: `src/components/member/RotatingMemberQr.tsx`
- Modify: `src/app/member/page.tsx` (use the component)
- Modify: `src/app/m/[token]/page.tsx` (accept the expiring token too)

**Interfaces:**
- Consumes: `GET /api/member/qr`.

- [ ] **Step 1: Create `RotatingMemberQr.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

/** Shows the member's QR and silently refreshes it before it expires (spec §6a). */
export function RotatingMemberQr({ initialQr, initialTtl }: { initialQr: string; initialTtl: number }) {
  const [qr, setQr] = useState(initialQr);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Refresh a couple of seconds BEFORE expiry so the on-screen QR is always live.
    const schedule = (ttl: number) => {
      const delay = Math.max(3, ttl - 2) * 1000;
      timer.current = setTimeout(async () => {
        try {
          const r = await fetch("/api/member/qr", { cache: "no-store" });
          const j = await r.json();
          if (!cancelled && j.qr) { setQr(j.qr); schedule(j.ttlSeconds ?? ttl); return; }
        } catch { /* transient — retry on the same cadence */ }
        if (!cancelled) schedule(ttl);
      }, delay);
    };
    schedule(initialTtl);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [initialTtl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={qr} alt="Your attendance QR" width={240} height={240}
         style={{ width: 240, height: 240, border: "1px solid var(--rule)", borderRadius: 12, padding: 12 }} />
  );
}
```

- [ ] **Step 2: Use it in `src/app/member/page.tsx`**

Replace the `qrDataUrl(...)` call + the `<img src={qr} …>` with an initial fetch of
the session's ttl and the component. Change the imports + the top of the component:

```tsx
import { RotatingMemberQr } from "@/components/member/RotatingMemberQr";
import { memberExpiringToken } from "@/lib/attendance";
import { createAdminClient } from "@/lib/supabase/admin";
// ...
  const session = await requireMember();
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("club_attendance_sessions")
    .select("qr_ttl_seconds").eq("club_id", session.clubId).eq("status", "open").maybeSingle();
  const ttl = open?.qr_ttl_seconds ?? 60;
  const [qr, view] = await Promise.all([
    qrDataUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/m/${memberExpiringToken(session.memberId, ttl)}`),
    getMemberAttendance(session.memberId),
  ]);
```

and replace the QR `<div style={{ textAlign: "center" … }}>…<img …/></div>` with:

```tsx
      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <RotatingMemberQr initialQr={qr} initialTtl={ttl} />
      </div>
```

(Remove the now-unused `memberToken` import.)

- [ ] **Step 3: Accept the expiring token in `src/app/m/[token]/page.tsx`**

Change the verify line so a portal QR opened in a browser still resolves:

```ts
import { verifyMemberToken, verifyMemberExpiringToken } from "@/lib/attendance";
// ...
    const decoded = decodeURIComponent(token);
    memberId = decoded.startsWith("e.")
      ? verifyMemberExpiringToken(decoded)
      : verifyMemberToken(decoded);
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/components/member/RotatingMemberQr.tsx src/app/member/page.tsx "src/app/m/[token]/page.tsx"
git commit -m "feat(member-portal): rotating on-screen QR that refreshes before expiry"
```

---

### Task 18: Scanner accepts the expiring token + Part B verification

**Files:**
- Modify: `src/app/api/admin/attendance/club/scan/route.ts`

- [ ] **Step 1: Accept either token in the scan route**

Change the import and the token-resolution line:

```ts
import { verifyMemberToken, verifyMemberExpiringToken } from "@/lib/attendance";
// ...
  const rawToken = String(body.token ?? "");
  const memberId = rawToken.startsWith("e.")
    ? verifyMemberExpiringToken(rawToken)
    : verifyMemberToken(rawToken);
```

(Everything after — session lookup, club-match, idempotent insert — is unchanged.)

- [ ] **Step 2: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green (78 existing + Tasks 2/3/14 unit tests; build ✓).

- [ ] **Step 3: Rotating-QR walkthrough (browser + a phone)**

1. Head opens a session with **QR refresh = 15 seconds**.
2. Member's `/member` shows a QR that visibly **refreshes ~every 15s** (watch the
   image swap; confirm via DevTools that `/api/member/qr` is polled).
3. Head scans the live QR → "✓ Name". **Screenshot the QR, wait > 15s, scan the
   screenshot → rejected** ("Invalid QR"), while a fresh on-screen scan still works.
4. Printed **static** card still scans (backward-compatible).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/admin/attendance/club/scan/route.ts"
git commit -m "feat(member-portal): scanner accepts expiring member QR (anti-proxy)"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §4 data model → Task 1; §5.5 session → Task 2; §5.4 lockout →
  Task 3; §5.1 invites → Tasks 4, 9; §5.2 setup → Task 10; §5.3 login → Task 11; §5.6
  proxy/guard → Tasks 6, 7; §6 pages → Tasks 10–12; §6a rotating QR → Tasks 14–18
  (column in Task 1); §7 admin changes → Tasks 8, 9; §8 PII lockdown → Task 1; §10
  tests → Tasks 2, 3, 14 + Task 13/18 walkthroughs. All covered.
- **Type consistency:** `MemberSessionPayload {memberId, clubId, epoch}` is produced
  in Task 2 and consumed unchanged in Tasks 5, 6, 10, 11; `MemberInviteState` defined
  in Task 9 and reused in Task 9 UI; `createMemberInvite`/`validateMemberInvite`/
  `consumeMemberInvite` signatures match across Tasks 4, 9, 10.
- **Known limitation:** invites.ts / auth.ts / guards.ts are DB-backed and not
  unit-tested (consistent with the existing untested `admin/invites.ts`); they are
  covered by typecheck + the Task 13 walkthrough. The pure, security-critical pieces
  (session signing, lockout) ARE unit-tested.
