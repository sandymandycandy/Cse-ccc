# Admin Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin who forgot their password recovers their own account from the login page, setting a new password and re-enrolling their authenticator in one flow.

**Architecture:** A new `admin_password_resets` table holds single-use, 1-hour, SHA-256-hashed tokens — deliberately separate from `admin_invites` so a reset can never carry a role or create an account. `/admin/forgot` issues a token and mails a link; `/admin/reset/[token]` consumes it, then rewrites `password_hash`, bumps `session_epoch`, and replaces the TOTP secret and all 10 recovery codes. The TOTP-enrolment UI and the recovery-codes panel are extracted from the existing invite form and shared by both flows.

**Tech Stack:** Next 16 (App Router, server actions), React 19, TypeScript strict, Supabase (Postgres + RLS, service-role client), Auth.js v5, Zod 4, Vitest 4 (`environment: "node"`), `qrcode`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-admin-password-reset-design.md` — read it, especially **D1 and D2**.

## Global Constraints

- **⚠️ D1/D2 are owner decisions with accepted consequences. Do not "improve" them.** The reset re-enrols TOTP, and every role may self-reset. Together they make an admin's inbox a single factor for full account takeover. Both alternatives were offered and declined on 2026-09-03. If you think this is a bug, re-read the spec's Recorded Decisions and ask the owner — do not change it in code.
- **The compensating controls are not optional.** 1-hour TTL, single-use, `session_epoch` bump, old recovery codes burned, rate limits, and the completion email are what stand in for the prevention that was traded away.
- **`/admin/forgot` must return one identical message on every path** — unknown address, inactive account, rate-limited, and success. Task 6 makes this structural (exactly one `return` expression), not a matter of remembering.
- **A reset must never write `role`, `club_id`, or `is_active`.** Only `password_hash` and `session_epoch` on `admin_users`, and the `admin_totp` row.
- **`consumeReset` runs BEFORE the writes** (unlike `accept-invite`, which consumes last), so a double-submitted link cannot apply twice.
- **Rate-limit keys use the normalised email** (`.trim().toLowerCase()`), matching how `LoginSchema` and `checkLoginLimits` key.
- Vitest runs with `environment: "node"`; the limiter keeps state in a module-level `Map`, so **every limiter test must use a unique ip/email**.
- Migrations are named `YYYYMMDDHHMMSS_name.sql`. `20260903000000` is already used twice — do not reuse it.
- Run the gate before every commit: `npx tsc --noEmit && npx eslint && npx vitest run`.

---

## Background — read this before Task 1

**The invite flow is the model, not the vehicle.** `src/lib/admin/invites.ts` already does token generation (`generateConfirmToken` → 32 random bytes, only the SHA-256 hash stored), expiry, and atomic single-use consumption. `src/app/admin/accept-invite/` already does "set a password and enrol TOTP in one submit". This plan mirrors both rather than extending them, for the reason in the spec: an invite may create an account and carries `role`/`club_id`; a reset must be structurally incapable of either.

**`admin_invites` has RLS enabled and zero policies** (`supabase/migrations/20260820120005_rls.sql:15`) — service-role only. The new table must match exactly. A readable `token_hash` plus a known email is a full takeover.

**`renderEmail` needs no changes.** `src/lib/email/templates.ts` renders any `payload.url` as the primary button (`URL_KEYS = ["inviteUrl", "confirmUrl", "url"]`), so both new emails work with `payload.url`.

**`enqueueEmail` delivers immediately against the LIVE database.** Testing this flow sends real mail. Use an address you control.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/migrations/20260903020000_admin_password_resets.sql` | The table + index + RLS. | **Create** |
| `src/lib/database.types.ts` | Hand-add the `admin_password_resets` types. | Modify |
| `src/lib/admin/reset-token.ts` | `isResetLive` — the pure expiry/consumed rule. No DB, no `server-only`. | **Create** |
| `src/lib/admin/reset-token.test.ts` | Covers fresh / expired / consumed / boundary. | **Create** |
| `src/lib/admin/resets.ts` | `createReset` / `validateReset` / `consumeReset`. Mirrors `invites.ts`. | **Create** |
| `src/lib/rate-limit.ts` | `checkPasswordResetLimits`. | Modify |
| `src/lib/rate-limit.test.ts` | Covers the new caps. | Modify |
| `src/components/admin/TotpEnrollFields.tsx` | QR + manual key + 6-digit input. Presentational. | **Create** |
| `src/components/admin/RecoveryCodesPanel.tsx` | The "save your codes" success view. | **Create** |
| `src/components/admin/AcceptInviteForm.tsx` | Refactored to compose the two above. Behaviour unchanged. | Modify |
| `src/components/admin/ResetPasswordForm.tsx` | The reset form. | **Create** |
| `src/lib/admin/form-state.ts` | `ForgotState`, `ResetPasswordState`. | Modify |
| `src/app/admin/forgot/page.tsx` + `actions.ts` | Request a link. One return. | **Create** |
| `src/app/admin/reset/[token]/page.tsx` + `actions.ts` | Consume + rewrite credentials. | **Create** |
| `src/app/admin/login/page.tsx` | "Forgot password?" link. | Modify |
| `docs/SECURITY_SPEC.md`, `docs/STATUS.md` | Record the new surface. | Modify |

---

### Task 1: The table, its types, and the migration applied

**Files:**
- Create: `supabase/migrations/20260903020000_admin_password_resets.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `admin_password_resets` relation, and its `Row`/`Insert`/`Update` types so `.from("admin_password_resets")` typechecks.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260903020000_admin_password_resets.sql`:

```sql
-- Single-use, 1-hour password-reset tokens for admin accounts.
-- Deliberately NOT a `kind` column on admin_invites: an invite carries role +
-- club_id and may create an account, a reset may do neither. Separate tables
-- make "a reset cannot change a role" true by construction.
create table public.admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_password_resets_email_idx on public.admin_password_resets (email);

-- RLS on with NO policies: service-role only, exactly like admin_invites.
-- A readable token_hash plus a known email is a full account takeover.
alter table public.admin_password_resets enable row level security;
```

- [ ] **Step 2: Apply it to the live database**

Apply via the Supabase MCP `apply_migration` tool (project_ref `svkbleeibbrjryeovvjw`), name `admin_password_resets`, with the SQL above.

**The migration must land before any code that selects from the table deploys**, or the page 500s — the same ordering trap the gallery-masonry change hit.

- [ ] **Step 3: Verify it landed and is not publicly readable**

Run via MCP `execute_sql`:

```sql
select relrowsecurity from pg_class where relname = 'admin_password_resets';
select count(*) from pg_policies where tablename = 'admin_password_resets';
```

Expected: `relrowsecurity` = `true`, policy count = `0`.

- [ ] **Step 4: Add the generated types**

In `src/lib/database.types.ts`, add this entry to `Database.public.Tables`, keeping the file's alphabetical order (immediately after the `admin_invites` block, before `admin_totp`):

```ts
      admin_password_resets: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
        }
        Relationships: []
      }
```

- [ ] **Step 5: Run the gate and commit**

```bash
npx tsc --noEmit && npx eslint && npx vitest run
git add supabase/migrations/20260903020000_admin_password_resets.sql src/lib/database.types.ts
git commit -m "feat(auth): add the admin_password_resets table"
```

---

### Task 2: `isResetLive` — the expiry rule, as a pure function

**Files:**
- Create: `src/lib/admin/reset-token.ts`
- Test: `src/lib/admin/reset-token.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isResetLive(row: { expiresAt: string; consumedAt: string | null }, now: Date): boolean`.

**Why its own file:** `invites.ts` has no tests because its rules are welded to Supabase calls. Pulling the one real decision out means it can be tested without a database, and `resets.ts` stays thin glue.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/admin/reset-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isResetLive } from "./reset-token";

const now = new Date("2026-09-03T12:00:00.000Z");
const iso = (msFromNow: number) => new Date(now.getTime() + msFromNow).toISOString();

describe("isResetLive", () => {
  it("is live when unconsumed and not yet expired", () => {
    expect(isResetLive({ expiresAt: iso(60_000), consumedAt: null }, now)).toBe(true);
  });

  it("is dead once expired", () => {
    expect(isResetLive({ expiresAt: iso(-1), consumedAt: null }, now)).toBe(false);
  });

  it("is dead once consumed, even well before expiry", () => {
    expect(
      isResetLive({ expiresAt: iso(3_600_000), consumedAt: iso(-5_000) }, now),
    ).toBe(false);
  });

  it("is dead exactly at the expiry instant — the window is half-open", () => {
    expect(isResetLive({ expiresAt: iso(0), consumedAt: null }, now)).toBe(false);
  });

  it("treats an unparseable expiry as dead, never as live", () => {
    expect(isResetLive({ expiresAt: "not a date", consumedAt: null }, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/admin/reset-token.test.ts`
Expected: FAIL — cannot resolve `./reset-token`.

- [ ] **Step 3: Implement**

Create `src/lib/admin/reset-token.ts`:

```ts
/**
 * Whether a password-reset token row is still usable.
 *
 * Pure and DB-free so the rule that decides account recovery can be tested
 * directly. Deliberately NOT `server-only`: nothing here touches a secret.
 *
 * Fails CLOSED — an expiry we cannot parse is treated as dead, never as live.
 */
export function isResetLive(
  row: { expiresAt: string; consumedAt: string | null },
  now: Date,
): boolean {
  if (row.consumedAt) return false;
  const expires = new Date(row.expiresAt).getTime();
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/lib/admin/reset-token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Prove the tests have teeth**

Temporarily change `if (row.consumedAt) return false;` to `if (false) return false;`, re-run, confirm **"is dead once consumed"** FAILS. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/reset-token.ts src/lib/admin/reset-token.test.ts
git commit -m "feat(auth): add the pure reset-token liveness rule"
```

---

### Task 3: `resets.ts` — create, validate, consume

**Files:**
- Create: `src/lib/admin/resets.ts`

**Interfaces:**
- Consumes: `isResetLive` (Task 2); `generateConfirmToken`, `hashToken` from `@/lib/tokens`.
- Produces:
  - `createReset(email: string): Promise<{ token: string; expiresAt: string }>`
  - `validateReset(rawToken: string): Promise<{ id: string; email: string } | null>`
  - `consumeReset(resetId: string): Promise<boolean>`

No unit tests: every function is a Supabase round-trip, and mocking the client would only test the mock. The one real rule lives in Task 2, which is tested. The lifecycle is covered by the manual verification in Task 8.

- [ ] **Step 1: Implement**

Create `src/lib/admin/resets.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateConfirmToken, hashToken } from "@/lib/tokens";
import { isResetLive } from "./reset-token";

/**
 * Admin password-reset tokens (SECURITY_SPEC §3). A single-use 32-byte token is
 * generated, stored only as its SHA-256 hash, and expires in ONE HOUR — far
 * shorter than the 48h invite, because per the design's D1 this link alone is
 * sufficient to take over an account: it sets the password AND re-enrols TOTP.
 *
 * Deliberately separate from `invites.ts`: a reset carries no role and no
 * club, and can never create an account.
 */

const RESET_TTL_MS = 60 * 60 * 1000;

export async function createReset(
  email: string,
): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  const { raw, hash } = generateConfirmToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  const { error } = await admin.from("admin_password_resets").insert({
    email: email.trim().toLowerCase(),
    token_hash: hash,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token: raw, expiresAt };
}

/** A live reset for `rawToken`, or null if unknown / expired / already used. */
export async function validateReset(
  rawToken: string,
): Promise<{ id: string; email: string } | null> {
  if (!rawToken) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_password_resets")
    .select("id, email, expires_at, consumed_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return null;
  if (!isResetLive({ expiresAt: data.expires_at, consumedAt: data.consumed_at }, new Date())) {
    return null;
  }
  return { id: data.id, email: data.email };
}

/**
 * Atomically mark a reset consumed. Returns false if it was already used —
 * the `.is("consumed_at", null)` filter is what makes a double-submitted link
 * apply exactly once.
 */
export async function consumeReset(resetId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_password_resets")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", resetId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  return !!data;
}
```

- [ ] **Step 2: Run the gate and commit**

```bash
npx tsc --noEmit && npx eslint && npx vitest run
git add src/lib/admin/resets.ts
git commit -m "feat(auth): add password-reset token create/validate/consume"
```

---

### Task 4: `checkPasswordResetLimits`

**Files:**
- Modify: `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: the existing `rateLimit` primitive and `RateResult`.
- Produces: `checkPasswordResetLimits(input: { ip: string; email: string }): RateResult`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/rate-limit.test.ts` (and add `checkPasswordResetLimits` to the existing import on line 2 — do not add a second import statement):

```ts
describe("checkPasswordResetLimits — bounds how many live reset links exist", () => {
  it("allows 3 per email, then trips with a retry-after", () => {
    const id = { ip: "203.0.113.70", email: "reset-a@example.test" };
    expect(checkPasswordResetLimits(id).ok).toBe(true); // 1
    expect(checkPasswordResetLimits(id).ok).toBe(true); // 2
    expect(checkPasswordResetLimits(id).ok).toBe(true); // 3

    const fourth = checkPasswordResetLimits(id);
    expect(fourth.ok).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("caps one email even from rotating IPs — the cap that actually matters", () => {
    const email = "reset-b@example.test";
    checkPasswordResetLimits({ ip: "198.51.100.30", email });
    checkPasswordResetLimits({ ip: "198.51.100.31", email });
    checkPasswordResetLimits({ ip: "198.51.100.32", email });
    expect(checkPasswordResetLimits({ ip: "198.51.100.33", email }).ok).toBe(false);
  });

  it("caps one IP spraying many different addresses", () => {
    const ip = "203.0.113.71";
    let last = checkPasswordResetLimits({ ip, email: "spray-0@example.test" });
    for (let i = 1; i < 10 && last.ok; i++) {
      last = checkPasswordResetLimits({ ip, email: `spray-${i}@example.test` });
    }
    expect(last.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: FAIL — `checkPasswordResetLimits is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/rate-limit.ts`, add below `checkLoginLimits` / `peekLoginLimits`:

```ts
/**
 * Password-reset requests: 3 per email / hour, 5 per IP / hour.
 *
 * The per-EMAIL cap is the one that matters — per the design's D1 each mailed
 * link is on its own sufficient to take over that account, so this bounds how
 * many live tokens an attacker can cause to be sent to a mailbox they are
 * waiting on. The per-IP cap only slows spraying across many addresses.
 */
export function checkPasswordResetLimits(input: {
  ip: string;
  email: string;
}): RateResult {
  const checks: RateResult[] = [
    rateLimit(`reset:email:${input.email}`, 3, HOUR),
    rateLimit(`reset:ip:${input.ip}`, 5, HOUR),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat(auth): rate-limit password-reset requests"
```

---

### Task 5: Extract the shared enrolment UI

**Files:**
- Create: `src/components/admin/TotpEnrollFields.tsx`
- Create: `src/components/admin/RecoveryCodesPanel.tsx`
- Modify: `src/components/admin/AcceptInviteForm.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `<TotpEnrollFields qr={string} manualKey={string} />`
  - `<RecoveryCodesPanel codes={string[]} heading={string} intro={string} />`

**This task changes no behaviour.** `/admin/accept-invite` must look and work exactly as before; the two new components are lifted from it verbatim so Task 7 doesn't duplicate them.

- [ ] **Step 1: Create `TotpEnrollFields`**

Create `src/components/admin/TotpEnrollFields.tsx` — the QR, the manual key, and the 6-digit input, lifted unchanged from `AcceptInviteForm`:

```tsx
/**
 * The authenticator-enrolment block, shared by the invite flow and the password
 * reset. Purely presentational — the caller owns the form, the hidden encrypted
 * secret, and the submit.
 */
export function TotpEnrollFields({ qr, manualKey }: { qr: string; manualKey: string }) {
  return (
    <>
      <div className="enroll">
        <div className="label" style={{ marginBottom: 8 }}>
          Two-factor authentication
        </div>
        <p className="body-text" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Scan this with an authenticator app (Google Authenticator, Authy, 1Password…).
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Authenticator QR code" width={180} height={180} className="enroll-qr" />
        <div className="hint" style={{ marginTop: 8 }}>
          Can&rsquo;t scan? Enter this key: <code>{manualKey}</code>
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="totp">6-digit code from the app</label>
        <input
          id="totp"
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="6-digit code"
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `RecoveryCodesPanel`**

Create `src/components/admin/RecoveryCodesPanel.tsx`:

```tsx
/**
 * The one-time "save these codes" screen. Shown after an invite is accepted and
 * after a password reset — in both cases these 10 codes are the ONLY copy the
 * admin will ever see, and any previous set has just been invalidated.
 */
export function RecoveryCodesPanel({
  codes,
  heading,
  intro,
}: {
  codes: string[];
  heading: string;
  intro: string;
}) {
  return (
    <div>
      <div className="label" style={{ color: "var(--forest)" }}>
        {heading}
      </div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
        Save your recovery codes
      </h1>
      <p className="body-text" style={{ marginBottom: 14 }}>
        {intro}
      </p>
      <ul className="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <a href="/admin/login" className="btn btn-primary w-full" style={{ marginTop: 16 }}>
        Go to sign in
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Refactor `AcceptInviteForm` to use them**

In `src/components/admin/AcceptInviteForm.tsx`:

Add to the imports:

```tsx
import { TotpEnrollFields } from "./TotpEnrollFields";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
```

Replace the whole `if (state.recoveryCodes) { ... }` block with:

```tsx
  if (state.recoveryCodes) {
    return (
      <RecoveryCodesPanel
        codes={state.recoveryCodes}
        heading="You’re all set"
        intro="Each code works once if you lose your authenticator. Store them somewhere safe — you won’t see them again."
      />
    );
  }
```

Then replace the `<div className="enroll">…</div>` block **and** the `<div className="field" style={{ marginTop: 14 }}>` TOTP block that follows it with:

```tsx
      <TotpEnrollFields qr={qr} manualKey={manualKey} />
```

- [ ] **Step 4: Verify the invite page is unchanged**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build`
Expected: all clean.

Then, with `npm run dev` running, confirm the page still renders:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/admin/accept-invite?token=nope"
```

Expected: `200` (the invalid-token panel — this proves the module graph still resolves).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TotpEnrollFields.tsx src/components/admin/RecoveryCodesPanel.tsx src/components/admin/AcceptInviteForm.tsx
git commit -m "refactor(admin): extract the shared TOTP enrolment and recovery-code UI"
```

---

### Task 6: `/admin/forgot` — request a link

**Files:**
- Modify: `src/lib/admin/form-state.ts`
- Create: `src/app/admin/forgot/actions.ts`
- Create: `src/app/admin/forgot/page.tsx`

**Interfaces:**
- Consumes: `createReset` (Task 3), `checkPasswordResetLimits` (Task 4).
- Produces: `ForgotState { error?: string; message?: string }`; `requestResetAction(prev, formData)`.

- [ ] **Step 1: Add `ForgotState`**

In `src/lib/admin/form-state.ts`, add beside the other form states:

```ts
export interface ForgotState {
  error?: string;
  /** The neutral acknowledgement. Identical whether or not the address exists. */
  message?: string;
}
```

- [ ] **Step 2: Write the action**

Create `src/app/admin/forgot/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createReset } from "@/lib/admin/resets";
import { checkPasswordResetLimits } from "@/lib/rate-limit";
import { enqueueEmail } from "@/lib/email";
import type { ForgotState } from "@/lib/admin/form-state";

const Schema = z.object({ email: z.string().trim().toLowerCase().email() });

/**
 * The ONE thing this action ever says. Unknown address, deactivated account,
 * rate-limited, and success all return exactly this — SECURITY_SPEC §3's
 * anti-enumeration rule applied to a new surface. If you are adding a branch
 * that returns different text, you are opening an account-enumeration oracle.
 */
const NEUTRAL =
  "If that address belongs to an admin account, a reset link is on its way. It expires in an hour.";

/**
 * Issue a reset link if — and only if — the address is a live admin account.
 * Returns nothing in every case, so no caller can learn which branch ran.
 */
async function issueResetIfEligible(
  email: string,
  ip: string,
  origin: string,
): Promise<void> {
  if (!checkPasswordResetLimits({ ip, email }).ok) return;

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("admin_users")
    .select("id, email, full_name, is_active, password_hash")
    .eq("email", email)
    .maybeSingle();

  // No account, deactivated, or invite never consumed → send nothing.
  if (!user || !user.is_active || !user.password_hash) return;

  const { token } = await createReset(user.email);
  await enqueueEmail({
    template: "admin_password_reset",
    toEmail: user.email,
    toName: user.full_name,
    subject: "Reset your CSE Council admin password",
    priority: 1,
    payload: {
      url: `${origin}/admin/reset/${token}`,
      linkLabel: "Choose a new password",
      body:
        "This link works once and expires in an hour. It will also ask you to set up your authenticator again. " +
        "If you didn't ask for this, ignore this email and tell the Tech Head.",
    },
  });
}

export async function requestResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = Schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter your admin email address." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Same origin pattern the invite send uses (users/actions.ts:42-44) — there is
  // no siteUrl() helper in this repo.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? `http://${h.get("host") ?? "localhost:3000"}`;

  // Never let a failure here change what we say — a thrown DB or mail error
  // would otherwise distinguish "real account" from "no account".
  try {
    await issueResetIfEligible(parsed.data.email, ip, origin);
  } catch (err) {
    console.error("password reset request failed:", err);
  }

  // EXACTLY ONE success return, by construction.
  return { message: NEUTRAL };
}
```

**Note the origin pattern.** This repo has no `siteUrl()` helper — every absolute link is built as `process.env.NEXT_PUBLIC_SITE_URL ?? \`http://${host}\``, exactly as the invite send does at `src/app/admin/(app)/users/actions.ts:42-44`. `NEXT_PUBLIC_SITE_URL` is a required env var (`src/lib/env.ts:31`), so the fallback only ever fires locally.

- [ ] **Step 3: Write the page**

Create `src/app/admin/forgot/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { requestResetAction } from "./actions";
import type { ForgotState } from "@/lib/admin/form-state";

const initial: ForgotState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestResetAction, initial);

  return (
    <main className="admin-auth">
      <form action={action} className="admin-auth-card">
        <div className="label" style={{ color: "var(--forest)" }}>
          CSE Council · Admin
        </div>
        <h1 style={{ font: "400 30px var(--serif)", margin: "8px 0 4px" }}>
          Forgot your password
        </h1>
        <p className="body-text" style={{ marginBottom: 20 }}>
          We&rsquo;ll email you a link to set a new one. It also re-enrols your
          authenticator, so have your phone nearby.
        </p>

        {state.message ? (
          <div role="alert" aria-live="polite" className="note" style={{ marginBottom: 16 }}>
            {state.message}
          </div>
        ) : null}

        {state.error ? (
          <div
            role="alert"
            className="note"
            style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}
          >
            {state.error}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="vtuxxxxx@veltech.edu.in"
          />
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a link"}
        </button>

        <a href="/admin/login" className="admin-auth-alt">
          Back to sign in
        </a>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/form-state.ts src/app/admin/forgot
git commit -m "feat(auth): request a password-reset link from /admin/forgot"
```

---

### Task 7: `/admin/reset/[token]` — consume the link and rewrite the credentials

**Files:**
- Modify: `src/lib/admin/form-state.ts`
- Create: `src/components/admin/ResetPasswordForm.tsx`
- Create: `src/app/admin/reset/[token]/actions.ts`
- Create: `src/app/admin/reset/[token]/page.tsx`

**Interfaces:**
- Consumes: `validateReset`, `consumeReset` (Task 3); `TotpEnrollFields`, `RecoveryCodesPanel` (Task 5).
- Produces: `ResetPasswordState { error?: string; recoveryCodes?: string[] }`; `resetPasswordAction(prev, formData)`.

- [ ] **Step 1: Add `ResetPasswordState`**

In `src/lib/admin/form-state.ts`:

```ts
export interface ResetPasswordState {
  error?: string;
  /** Shown once on success — the replacement recovery codes. */
  recoveryCodes?: string[];
}
```

- [ ] **Step 2: Write the action**

Create `src/app/admin/reset/[token]/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateReset, consumeReset } from "@/lib/admin/resets";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import {
  verifyTotp,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/auth/totp";
import { enqueueEmail } from "@/lib/email";
import type { ResetPasswordState } from "@/lib/admin/form-state";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1).max(200),
  totp: z.string().trim().min(1),
  secret: z.string().min(1),
});

/**
 * Complete a password reset (design D1: this also re-enrols TOTP).
 *
 * ⚠️ ORDER MATTERS. The token is consumed BEFORE anything is written — unlike
 * `accept-invite`, which consumes last. Consume-first means a double-submitted
 * link cannot apply twice, and it picks the safe failure direction: a crash
 * after the consume leaves a burned token and an UNCHANGED password, so the
 * admin simply asks for another link.
 *
 * ⚠️ This must never write `role`, `club_id`, or `is_active`. A reset recovers
 * an account; it does not re-grant it.
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = Schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    totp: formData.get("totp"),
    secret: formData.get("secret"),
  });
  if (!parsed.success) return { error: "Fill in every field." };
  const { token, password, totp, secret: encSecret } = parsed.data;

  // Never trust the page's copy of the token.
  const reset = await validateReset(token);
  if (!reset) {
    return { error: "This link is invalid or has expired. Ask for a new one." };
  }

  // Confirm the new authenticator works BEFORE the password changes, so a
  // failed enrolment can't leave them locked out of an account they just reset.
  let secret: string;
  try {
    secret = decryptSecret(encSecret);
  } catch {
    return { error: "Enrollment expired — reload the page and scan again." };
  }
  if (!verifyTotp(secret, totp)) {
    return { error: "That authenticator code didn't match. Use the current one." };
  }

  const policy = await validatePassword(password);
  if (!policy.ok) return { error: policy.reason };

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("admin_users")
    .select("id, email, full_name, session_epoch")
    .eq("email", reset.email)
    .maybeSingle();
  if (!user) return { error: "This account no longer exists." };

  // Single-use gate. Everything below happens at most once per link.
  if (!(await consumeReset(reset.id))) {
    return { error: "This link has already been used. Ask for a new one." };
  }

  const passwordHash = await hashPassword(password);
  const recovery = generateRecoveryCodes();

  // password_hash + session_epoch ONLY. Bumping the epoch kills every live
  // session for this admin (guards.ts rejects a stale epoch), which is what
  // makes a reset evict an attacker who is already signed in.
  const { error: userErr } = await admin
    .from("admin_users")
    .update({ password_hash: passwordHash, session_epoch: (user.session_epoch ?? 0) + 1 })
    .eq("id", user.id);
  if (userErr) return { error: "Couldn't update your password. Ask for a new link." };

  // Replaces the secret AND all 10 old recovery codes — the previous set stops
  // working the moment this lands.
  const { error: totpErr } = await admin.from("admin_totp").upsert({
    admin_id: user.id,
    secret_encrypted: encSecret,
    confirmed_at: new Date().toISOString(),
    recovery_codes_hashed: recovery.map(hashRecoveryCode),
  });
  if (totpErr) return { error: "Couldn't save your two-factor setup. Ask for a new link." };

  // ⚠️ NOT optional. Per design D1 the emailed link alone is enough to take
  // this account over, so this notice is the only way an admin ever finds out
  // that someone else reset it. Never gate this behind a preference.
  await enqueueEmail({
    template: "admin_password_reset_done",
    toEmail: user.email,
    toName: user.full_name,
    subject: "Your CSE Council admin password was reset",
    priority: 1,
    payload: {
      body:
        "Your admin password and authenticator were just reset, and every signed-in session was ended. " +
        "If this wasn't you, tell the Tech Head immediately — whoever did it can now sign in as you.",
    },
  });

  return { recoveryCodes: recovery };
}
```

- [ ] **Step 3: Write the form**

Create `src/components/admin/ResetPasswordForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/app/admin/reset/[token]/actions";
import { TotpEnrollFields } from "./TotpEnrollFields";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import type { ResetPasswordState } from "@/lib/admin/form-state";

const initial: ResetPasswordState = {};

export function ResetPasswordForm({
  token,
  email,
  qr,
  manualKey,
  encSecret,
}: {
  token: string;
  email: string;
  qr: string;
  manualKey: string;
  encSecret: string;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (state.recoveryCodes) {
    return (
      <RecoveryCodesPanel
        codes={state.recoveryCodes}
        heading="Password reset"
        intro="Your old codes no longer work. Each of these works once if you lose your authenticator — store them somewhere safe, you won't see them again."
      />
    );
  }

  return (
    <form action={action}>
      <div className="label" style={{ color: "var(--forest)" }}>
        CSE Council · Admin
      </div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 2px" }}>
        Choose a new password
      </h1>
      <p className="body-text" style={{ marginBottom: 18 }}>
        {email}
      </p>

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="secret" value={encSecret} />

      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 12 characters"
        />
        <span className="hint">At least 12 characters, not a known-breached password.</span>
      </div>

      <TotpEnrollFields qr={qr} manualKey={manualKey} />

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password and finish"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/admin/reset/[token]/page.tsx`, mirroring `accept-invite/page.tsx`:

```tsx
import type { Metadata } from "next";
import QRCode from "qrcode";
import { validateReset } from "@/lib/admin/resets";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset your admin password" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await validateReset(token);

  if (!reset) {
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <div className="label" style={{ color: "var(--rust)" }}>
            Link invalid
          </div>
          <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
            This link won&rsquo;t work
          </h1>
          <p className="body-text">
            Reset links last one hour and work once. Ask for a fresh one.
          </p>
          <a href="/admin/forgot" className="btn btn-primary w-full" style={{ marginTop: 16 }}>
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  // A fresh secret per page load; the QR shows it and the encrypted copy travels
  // in a hidden field so the submit can verify the code just enrolled.
  const secret = newTotpSecret();
  const qr = await QRCode.toDataURL(totpKeyUri(secret, reset.email), {
    margin: 1,
    width: 200,
  });

  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 440 }}>
        <ResetPasswordForm
          token={token}
          email={reset.email}
          qr={qr}
          manualKey={secret}
          encSecret={encryptSecret(secret)}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the gate**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/form-state.ts src/components/admin/ResetPasswordForm.tsx "src/app/admin/reset"
git commit -m "feat(auth): complete a password reset and re-enrol the authenticator"
```

---

### Task 8: The login link, the docs, and the required manual verification

**Files:**
- Modify: `src/app/admin/login/page.tsx`
- Modify: `docs/SECURITY_SPEC.md`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: the running app.
- Produces: nothing.

**This task must not be skipped.** Tasks 3, 6 and 7 have no automated coverage of the DB round-trip, and this is the account-recovery path for real staff.

- [ ] **Step 1: Add the link to the login form**

In `src/app/admin/login/page.tsx`, directly after the existing "Use a recovery code" button, add:

```tsx
        <a href="/admin/forgot" className="admin-auth-alt">
          Forgot your password?
        </a>
```

- [ ] **Step 2: Verify the whole flow by hand**

With `npm run dev` running, and **using an email address you control** (`enqueueEmail` delivers immediately against the live database — this sends real mail):

1. `/admin/login` → click "Forgot your password?" → `/admin/forgot`.
2. Submit **an address that is not an admin**. Note the exact message.
3. Submit **your real admin address**. **The message must be byte-identical to step 2.** If it differs, the enumeration guard is broken — stop and fix Task 6.
4. Open the emailed link. Set a new password, scan the QR, enter the code, submit.
5. **Save the recovery codes shown.**
6. **Open the same link a second time** → must refuse ("invalid or has expired" or "already been used"). If it lets you through, `consumeReset` is not gating — stop and fix Task 7.
7. Sign in with the **new** password and the **new** authenticator.
8. Confirm an **old** recovery code no longer works.

- [ ] **Step 3: Verify sessions were actually revoked**

Sign in as the admin in one browser. In another, run the reset to completion. Reload the first browser: it must be signed out. That proves the `session_epoch` bump reached `guards.ts`.

- [ ] **Step 4: Update SECURITY_SPEC §3**

In `docs/SECURITY_SPEC.md`, add a row to the §3 table directly below the **Onboarding** row:

```
| **Password reset** | Self-service from `/admin/forgot`, open to **every role**. A single-use 32-byte token (stored hashed, **1-hour** expiry, consumed before any write) mails a link that sets a new password **and re-enrols TOTP**, replacing all 10 recovery codes and bumping `session_epoch`. ⚠️ **Accepted consequence (owner decision, 2026-09-03): an admin's inbox is therefore a single factor for full account takeover.** Compensating controls: 1-hour window, single use, 3 requests/hour per address, and an unconditional completion email. |
```

Then add to the §6 rate-limit table:

```
| `POST /admin/forgot` | 3 / hour per email, 5 / hour per IP |
```

- [ ] **Step 5: Record it in STATUS.md**

Replace the `### 📐 SPEC ONLY, NOT BUILT — Admin self-service password reset (2026-09-03)` block in the START HERE section with a `### ✅ MERGED & PUSHED TO PROD` block. Keep every line prefixed with `> `. Carry forward the D1/D2 warning verbatim — it is the single most important thing a future reader needs — and add:
- the migration name, and that it was applied and verified **before** the code deployed;
- that `consumeReset` runs before the writes, and why;
- the results of the Step 2 and Step 3 checks.

- [ ] **Step 6: Run the gate and commit**

```bash
npx tsc --noEmit && npx eslint && npx vitest run && npx next build
git add src/app/admin/login/page.tsx docs/SECURITY_SPEC.md docs/STATUS.md
git commit -m "feat(auth): link the reset flow from login; record it in the specs"
```

---

## Self-Review

**Spec coverage.** Separate table (Task 1) · pure `isResetLive` (Task 2) · `createReset`/`validateReset`/`consumeReset` with the 1-hour TTL (Task 3) · `checkPasswordResetLimits` at 3/hour per email and 5/hour per IP (Task 4) · shared enrolment UI rather than a second copy (Task 5) · `/admin/forgot` with the identical-response guarantee (Task 6) · `/admin/reset/[token]` with consume-first, `session_epoch` bump, recovery-code replacement, and the unconditional completion email (Task 7) · login link, both spec tables, and the manual sequence (Task 8). D1 and D2 are carried into the Global Constraints, the module docstrings, and the SECURITY_SPEC row, so they survive out-of-order reading.

**Placeholders.** None. Every code step carries literal code. An earlier draft referenced a `siteUrl()` helper that does not exist in this repo; Task 6 now carries the real `NEXT_PUBLIC_SITE_URL ?? host` pattern with the file and line it was copied from.

**Type consistency.** `isResetLive({ expiresAt, consumedAt }, now)` is called with exactly those property names in Task 3. `validateReset` returns `{ id, email }` and Task 7 reads `reset.id` and `reset.email`. `consumeReset(resetId)` returns `boolean` and is checked as such. `ResetPasswordState`/`ForgotState` property names match between `form-state.ts`, the actions, the pages, and the forms. `TotpEnrollFields` takes `qr`/`manualKey` and `RecoveryCodesPanel` takes `codes`/`heading`/`intro` at both call sites.

**Known gaps, stated deliberately.** (1) `resets.ts` and both actions have no unit tests — every path is a Supabase round-trip, and mocking would only test the mock; this is why Task 8's manual sequence is mandatory and has explicit failure signals. (2) The neutral response is guaranteed structurally, not by a test. (3) A timing side-channel remains: issuing a token and sending mail takes measurably longer than returning early, so a determined attacker could still distinguish a real address. Closing it needs a fixed-delay or fire-and-forget send, which is out of scope here and worth revisiting if enumeration ever matters more than latency.
