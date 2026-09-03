# Login Lockout Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell a locked-out admin that they are locked out and how many seconds remain, instead of showing the same "Wrong email, password, or code." forever.

**Architecture:** The 3-attempt / 1-minute lockout already exists and works — it is enforced inside the Credentials `authorize` callback. Nothing about the enforcement changes. We add a **read-only** `peekLoginLimits()` that reports the current lock state *without recording an attempt*, call it from the login server action before and after `signIn`, carry `retryAfterSeconds` back through `LoginState`, and tick it down in the login page.

**Tech Stack:** Next 16 (App Router, server actions), React 19, Auth.js v5 (`next-auth@beta`), Zod 4, Vitest 4 (`environment: "node"`). No new dependencies.

**Spec:** `docs/SECURITY_SPEC.md` — §3 (authentication) and §6 (rate limits). There is no separate design doc: this was scoped as a bounded change in conversation, and the reasoning that would have gone in a spec is captured in **Background** below. Task 4 corrects three SECURITY_SPEC lines that already contradict the shipped code.

## Global Constraints

- **The lockout contract is 3 attempts, then 60 seconds** — per IP **and** per account. Do not change these numbers; Task 1 makes them shared constants so check and peek cannot drift apart.
- **`peekLoginLimits` must never write to the limiter store.** If peeking consumes an attempt, three chances silently become two. This is the single most important invariant in this plan.
- **Credential failures keep the exact string `"Wrong email, password, or code."`** Wrong email, wrong password and wrong TOTP must stay indistinguishable from each other (SECURITY_SPEC §3, anti-enumeration).
- **`src/lib/auth/lockout.ts` must NOT import `"server-only"`** — the login page is a client component and imports the same formatter, so the ticking message matches the server's wording exactly.
- **Rate-limit keys use the Zod-normalised email** (`LoginSchema` applies `.trim().toLowerCase()`). Peeking with the raw form field would consult a different key than `authorize` incremented.
- Vitest runs with `environment: "node"`; the limiter keeps state in a module-level `Map`, so **every test must use a unique ip/email** to avoid cross-test contamination (the existing tests already do this).
- Buttons inside forms need `type="button"` unless they submit.
- Run the gate before every commit: `npx tsc --noEmit && npx eslint && npx vitest run`.

---

## Background — read this before Task 1

**The behaviour the owner asked for already exists.** `checkLoginLimits` (`src/lib/rate-limit.ts:95`) allows 3 attempts then locks for 60 seconds, keyed on both `login:ip:<ip>` and `login:acct:<email>`. It is called at `src/lib/auth/index.ts:66`, inside `authorize`, so a direct POST to `/api/auth/callback/credentials` is limited too.

**The defect is that the lockout is invisible.** When the limit trips, `authorize` returns `null` — exactly what a wrong password returns. `loginAction` maps every `AuthError` to `"Wrong email, password, or code."` So a locked-out admin retries, sees the identical message each time, and never learns they must wait.

**Why revealing the lockout does not leak account existence.** `checkLoginLimits` runs at `auth/index.ts:66` **before** the `admin_users` lookup at line 69, and increments `login:acct:<email>` for *any* email string. A made-up address locks after 3 tries exactly like a real one, so a lockout message carries no signal about who exists. Only the *rate-limit* condition becomes distinguishable; wrong-email and wrong-password stay identical to each other.

**Known pre-existing quirk, deliberately not changed:** a *successful* login also consumes a slot, because the limiter runs before credentials are verified. Logging in 3 times inside one minute blocks the 4th. Out of scope here.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/rate-limit.ts` | Sliding-window limiter. Gains a read-only `peek` twin of `rateLimit`, plus shared `LOGIN_MAX` / `LOGIN_WINDOW` constants. | Modify |
| `src/lib/rate-limit.test.ts` | Proves peek is non-consuming and agrees with check. | Modify |
| `src/lib/auth/lockout.ts` | Pure message formatter, shared by server action and client page. No `server-only`. | **Create** |
| `src/lib/auth/lockout.test.ts` | Covers singular/plural/rounding/floor. | **Create** |
| `src/lib/admin/form-state.ts` | `LoginState` gains `retryAfterSeconds?`. | Modify |
| `src/app/admin/login/actions.ts` | Peeks before `signIn`; on failure peeks again so the 3rd wrong try reports the lock immediately. | Modify |
| `src/app/admin/login/page.tsx` | Countdown, disabled submit, re-enable at zero. | Modify |
| `docs/SECURITY_SPEC.md` | Correct 3 lines that say 5/15min. | Modify |
| `docs/STATUS.md` | Record the change. | Modify |

`src/lib/auth/index.ts` is **not modified.** Enforcement stays exactly where it is.

---

### Task 1: Non-consuming `peekLoginLimits`

**Files:**
- Modify: `src/lib/rate-limit.ts` (add constants + `peek` + `peekLoginLimits`; refactor `checkLoginLimits` to use the constants)
- Test: `src/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `peekLoginLimits(input: { ip: string; email: string }): RateResult` — the existing `RateResult` shape `{ ok: boolean; remaining: number; retryAfterSeconds: number }`. Read-only.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/rate-limit.test.ts`:

```ts
import { checkLoginLimits, checkContactLimits, peekLoginLimits } from "./rate-limit";

describe("peekLoginLimits — reports the lock without spending an attempt", () => {
  it("does not consume: peeking many times still leaves all 3 chances", () => {
    const id = { ip: "203.0.113.40", email: "peek-a@example.test" };
    for (let i = 0; i < 10; i++) expect(peekLoginLimits(id).ok).toBe(true);

    // All three real attempts must still be available after that peeking.
    expect(checkLoginLimits(id).ok).toBe(true); // 1
    expect(checkLoginLimits(id).ok).toBe(true); // 2
    expect(checkLoginLimits(id).ok).toBe(true); // 3
    expect(checkLoginLimits(id).ok).toBe(false); // 4 → locked
  });

  it("is ok before any attempt has been made", () => {
    expect(peekLoginLimits({ ip: "203.0.113.41", email: "peek-b@example.test" }).ok).toBe(true);
  });

  it("reports locked with a retry-after once the 3 attempts are spent", () => {
    const id = { ip: "203.0.113.42", email: "peek-c@example.test" };
    checkLoginLimits(id);
    checkLoginLimits(id);
    checkLoginLimits(id);

    const peeked = peekLoginLimits(id);
    expect(peeked.ok).toBe(false);
    expect(peeked.retryAfterSeconds).toBeGreaterThan(0);
    expect(peeked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("agrees with checkLoginLimits at every point in the window", () => {
    const id = { ip: "203.0.113.43", email: "peek-d@example.test" };
    for (let i = 0; i < 3; i++) {
      expect(peekLoginLimits(id).ok).toBe(true);
      expect(checkLoginLimits(id).ok).toBe(true);
    }
    expect(peekLoginLimits(id).ok).toBe(false);
    expect(checkLoginLimits(id).ok).toBe(false);
  });

  it("locks on the account key even from a fresh IP", () => {
    const email = "peek-e@example.test";
    checkLoginLimits({ ip: "198.51.100.20", email });
    checkLoginLimits({ ip: "198.51.100.21", email });
    checkLoginLimits({ ip: "198.51.100.22", email });
    expect(peekLoginLimits({ ip: "198.51.100.99", email }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: FAIL — `peekLoginLimits is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/rate-limit.ts`, add below the existing `rateLimit` function:

```ts
/**
 * Read-only twin of `rateLimit`: reports whether a key is currently locked and
 * for how long, WITHOUT recording a hit.
 *
 * This exists so the login form can tell the user they are locked out. Calling
 * `rateLimit` for that would count the check itself as an attempt, turning
 * three chances into two — so this function must never write to `store`.
 */
function peek(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
    };
  }
  return { ok: true, remaining: max - hits.length, retryAfterSeconds: 0 };
}
```

Then replace the existing `checkLoginLimits` block at the bottom of the file with:

```ts
/** The admin login contract: 3 attempts, then a 1-minute lockout. Shared by the
 *  consuming check and the read-only peek so the two can never disagree. */
const LOGIN_MAX = 3;
const LOGIN_WINDOW = MIN;

/**
 * Admin login limits: 3 attempts, then a 1-minute lockout — enforced per IP
 * **and** per account, so the lock survives an attacker rotating IPs. The 4th
 * attempt within the minute returns `ok: false` with `retryAfterSeconds` (≤ 60).
 */
export function checkLoginLimits(input: { ip: string; email: string }): RateResult {
  const checks: RateResult[] = [
    rateLimit(`login:ip:${input.ip}`, LOGIN_MAX, LOGIN_WINDOW),
    rateLimit(`login:acct:${input.email}`, LOGIN_MAX, LOGIN_WINDOW),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}

/**
 * The same question as `checkLoginLimits`, asked without spending an attempt.
 * The login form uses this to show a countdown; `authorize` remains the only
 * place that actually consumes attempts.
 */
export function peekLoginLimits(input: { ip: string; email: string }): RateResult {
  const checks: RateResult[] = [
    peek(`login:ip:${input.ip}`, LOGIN_MAX, LOGIN_WINDOW),
    peek(`login:acct:${input.email}`, LOGIN_MAX, LOGIN_WINDOW),
  ];
  return checks.find((c) => !c.ok) ?? { ok: true, remaining: 0, retryAfterSeconds: 0 };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: PASS, including the pre-existing `checkLoginLimits` tests (the constants refactor must not change behaviour).

- [ ] **Step 5: Prove the non-consuming test has teeth**

Temporarily change `peek(` to `rateLimit(` inside `peekLoginLimits`, re-run, and confirm **"does not consume"** and **"agrees with checkLoginLimits"** now FAIL. Revert.

Run: `npx vitest run src/lib/rate-limit.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "feat(auth): add a read-only peek at the login lockout"
```

---

### Task 2: Lockout message + `LoginState.retryAfterSeconds`

**Files:**
- Create: `src/lib/auth/lockout.ts`
- Create: `src/lib/auth/lockout.test.ts`
- Modify: `src/lib/admin/form-state.ts:4-6`

**Interfaces:**
- Consumes: nothing from Task 1 at compile time.
- Produces: `lockoutMessage(retryAfterSeconds: number): string`; `LoginState.retryAfterSeconds?: number`.

**Why its own file:** the login page is a client component and renders this same message while counting down. `src/lib/rate-limit.ts` starts with `import "server-only"`, so the formatter cannot live there. **Do not add `server-only` to `lockout.ts`.**

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/lockout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lockoutMessage } from "./lockout";

describe("lockoutMessage", () => {
  it("pluralises seconds", () => {
    expect(lockoutMessage(45)).toBe("Too many attempts. Try again in 45 seconds.");
  });

  it("uses the singular at one second", () => {
    expect(lockoutMessage(1)).toBe("Too many attempts. Try again in 1 second.");
  });

  it("rounds a partial second up, so the message never expires early", () => {
    expect(lockoutMessage(2.1)).toBe("Too many attempts. Try again in 3 seconds.");
  });

  it("never says zero or a negative", () => {
    expect(lockoutMessage(0)).toBe("Too many attempts. Try again in 1 second.");
    expect(lockoutMessage(-5)).toBe("Too many attempts. Try again in 1 second.");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/auth/lockout.test.ts`
Expected: FAIL — cannot resolve `./lockout`.

- [ ] **Step 3: Implement**

Create `src/lib/auth/lockout.ts`:

```ts
/**
 * Wording for the admin login lockout, shared by the server action and the
 * login page's countdown so the two never disagree.
 *
 * Deliberately NOT `server-only`: the page is a client component and re-renders
 * this string every second as the timer ticks down.
 */
export function lockoutMessage(retryAfterSeconds: number): string {
  const s = Math.max(1, Math.ceil(retryAfterSeconds));
  return `Too many attempts. Try again in ${s} second${s === 1 ? "" : "s"}.`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/auth/lockout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Widen `LoginState`**

In `src/lib/admin/form-state.ts`, replace:

```ts
export interface LoginState {
  error?: string;
}
```

with:

```ts
export interface LoginState {
  error?: string;
  /** Seconds until the lockout lifts. Present only when rate-limited, and used
   *  by the login page to count down and re-enable the form. */
  retryAfterSeconds?: number;
}
```

- [ ] **Step 6: Run the gate and commit**

```bash
npx tsc --noEmit && npx eslint && npx vitest run
git add src/lib/auth/lockout.ts src/lib/auth/lockout.test.ts src/lib/admin/form-state.ts
git commit -m "feat(auth): add the lockout message and carry retry seconds in LoginState"
```

---

### Task 3: Report the lockout from the login action

**Files:**
- Modify: `src/app/admin/login/actions.ts` (whole file)

**Interfaces:**
- Consumes: `peekLoginLimits` (Task 1), `lockoutMessage` and `LoginState.retryAfterSeconds` (Task 2).
- Produces: a `LoginState` carrying `retryAfterSeconds` whenever the caller is locked.

There is no unit test for this task: `signIn` requires the Auth.js runtime, and mocking it would only test the mock. The logic it depends on is covered by Tasks 1 and 2; this file is thin glue, verified by the gate and by the manual check in Task 5.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/app/admin/login/actions.ts` with:

```ts
"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { LoginSchema } from "@/lib/validation/admin";
import { peekLoginLimits } from "@/lib/rate-limit";
import { lockoutMessage } from "@/lib/auth/lockout";
import type { LoginState } from "@/lib/admin/form-state";

/**
 * Admin login (SECURITY_SPEC §3). Credential verification, rate limiting (§6)
 * and 2FA all happen inside the Credentials `authorize` — a direct POST to the
 * endpoint is protected too, and `authorize` stays the only place that spends
 * an attempt.
 *
 * Wrong email, wrong password and wrong TOTP all surface the SAME generic
 * message, so none of them can be told apart. The lockout is the one exception,
 * and it leaks nothing: the limiter runs before the `admin_users` lookup and
 * counts a made-up address exactly like a real one.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    totp: formData.get("totp") || undefined,
    recoveryCode: formData.get("recoveryCode") || undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  // Key on the SCHEMA-NORMALISED email: LoginSchema trims and lowercases, and
  // `authorize` keys the limiter on that value. Peeking with the raw field
  // would consult a different bucket than the one being filled.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const id = { ip, email: parsed.data.email };

  // Read-only — peeking must not spend an attempt, or three chances become two.
  const before = peekLoginLimits(id);
  if (!before.ok) {
    return {
      error: lockoutMessage(before.retryAfterSeconds),
      retryAfterSeconds: before.retryAfterSeconds,
    };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/admin" });
  } catch (err) {
    // Credential failures → generic message; the redirect "error" thrown on
    // success and any other control-flow signal must propagate untouched.
    if (err instanceof AuthError) {
      // `authorize` just spent this attempt. If it was the last one, say so now
      // instead of making them submit again to discover they are locked.
      const after = peekLoginLimits(id);
      if (!after.ok) {
        return {
          error: lockoutMessage(after.retryAfterSeconds),
          retryAfterSeconds: after.retryAfterSeconds,
        };
      }
      return { error: "Wrong email, password, or code." };
    }
    throw err;
  }
  return {};
}
```

- [ ] **Step 2: Verify the success path still redirects**

`signIn` with `redirectTo` throws a Next redirect signal on success. Confirm the `throw err` for non-`AuthError` is still present and unreachable code was not introduced.

Run: `npx tsc --noEmit && npx eslint`
Expected: both clean.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login/actions.ts
git commit -m "feat(auth): tell the user when the login lockout is in force"
```

---

### Task 4: Countdown on the login form

**Files:**
- Modify: `src/app/admin/login/page.tsx`

**Interfaces:**
- Consumes: `LoginState.retryAfterSeconds` (Task 2), `lockoutMessage` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the imports and countdown state**

In `src/app/admin/login/page.tsx`, change the import line:

```tsx
import { useActionState, useEffect, useState } from "react";
import { loginAction } from "./actions";
import { lockoutMessage } from "@/lib/auth/lockout";
import type { LoginState } from "@/lib/admin/form-state";
```

Then, immediately after the existing `const [useRecovery, setUseRecovery] = useState(false);`, add:

```tsx
  const [lockedFor, setLockedFor] = useState(0);

  // `state` is a fresh object on every submit, so this re-syncs even when two
  // consecutive lockouts report the same number of seconds.
  useEffect(() => {
    if (!state.retryAfterSeconds) {
      setLockedFor(0);
      return;
    }
    setLockedFor(state.retryAfterSeconds);
    const timer = setInterval(() => {
      setLockedFor((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  const locked = lockedFor > 0;
```

- [ ] **Step 2: Show the ticking message**

Replace the existing error block:

```tsx
        {state.error ? (
          <div
            role="alert"
            className="note"
            style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}
          >
            {state.error}
          </div>
        ) : null}
```

with:

```tsx
        {locked || state.error ? (
          <div
            role="alert"
            aria-live="polite"
            className="note"
            style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}
          >
            {locked ? lockoutMessage(lockedFor) : state.error}
          </div>
        ) : null}
```

- [ ] **Step 3: Disable the submit while locked**

Replace the submit button:

```tsx
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
```

with:

```tsx
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending || locked}
        >
          {locked ? `Locked — ${lockedFor}s` : pending ? "Signing in…" : "Sign in"}
        </button>
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npx next build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/login/page.tsx
git commit -m "feat(auth): count the lockout down on the login form"
```

---

### Task 5: Manual verification + correct the contradicting spec lines

**Files:**
- Modify: `docs/SECURITY_SPEC.md:69`, `:145`, `:269`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: the running app.
- Produces: nothing.

**This task must not be skipped.** Tasks 1–4 have no automated coverage of the end-to-end flow, and the admin login is the one surface where getting the count wrong locks real staff out.

- [ ] **Step 1: Verify the three-chances contract by hand**

Start the app (`npm run dev`), open `/admin/login`, and with a **deliberately wrong password**:

1. Submit once → `"Wrong email, password, or code."`
2. Submit twice → same message.
3. Submit a third time → the message must switch to **"Too many attempts. Try again in N seconds."** and the button must read **"Locked — Ns"** and be disabled.
4. Watch it count to zero → the button re-enables and reads "Sign in".
5. Submit with the **correct** password → signs in.

**If the lock appears on the 2nd submit, `peekLoginLimits` is consuming an attempt — stop and fix Task 1.**

- [ ] **Step 2: Confirm a nonexistent email behaves identically**

Repeat with an address that has no account. It must lock on the 3rd attempt with the same wording — that sameness is what stops the lockout leaking which accounts exist.

- [ ] **Step 3: Correct SECURITY_SPEC line 69**

The spec and the code have contradicted each other since the lockout shipped. The code is what the owner wants; the doc is stale.

Replace:

```
| Login rate limit | 5 attempts / 15 min per IP **and** per account; lockout at 10 with an email alert to the account |
```

with:

```
| Login rate limit | 3 attempts / 1 min per IP **and** per account (`checkLoginLimits`); the 4th is refused and the form shows the seconds remaining. An email alert on repeated lockout is specified but NOT implemented. |
```

- [ ] **Step 4: Correct SECURITY_SPEC line 145**

Replace:

```
| `POST /api/admin/login` | 5 / 15 min per IP and per account |
```

with:

```
| `POST /api/admin/login` | 3 / 1 min per IP and per account |
```

- [ ] **Step 5: Correct SECURITY_SPEC line 269**

Replace:

```
- Rate limiter blocks the 6th login attempt.
```

with:

```
- Rate limiter blocks the 4th login attempt inside a minute, and the form says how long is left.
```

- [ ] **Step 6: Record it in STATUS.md**

Add a block directly above the newest `### ✅ MERGED & PUSHED TO PROD` entry in the START HERE section, and bump the commit roll-up count. Keep every line prefixed with `> ` — the whole section is one blockquote.

```markdown
> ### ✅ MERGED & PUSHED TO PROD — The login lockout now says it is a lockout (2026-09-03)
> **No migration.** Owner asked: "if they have entered wrong password or email or totp it should
> be locked for 1 minute… only 3 chances."
> - **The lockout already existed and worked** — 3 attempts / 60s, per IP and per account, enforced
>   in `authorize`. **It was simply invisible:** a locked-out admin got the same
>   "Wrong email, password, or code." as a typo, forever, with no hint to wait. Enforcement was
>   NOT changed; `src/lib/auth/index.ts` is untouched.
> - **⚠️ `peekLoginLimits` must never write to the limiter store.** The action peeks before and
>   after `signIn`; if that peek consumed a slot, three chances would become two. A test pins this
>   ("does not consume") and it is mutation-checked.
> - **Keys use the Zod-normalised email** — `LoginSchema` lowercases, and `authorize` keys on that,
>   so peeking with the raw form field would read a different bucket.
> - **Why showing the lock leaks nothing:** the limiter runs BEFORE the `admin_users` lookup and
>   counts a made-up address exactly like a real one, so the message says nothing about who exists.
>   Wrong-email / wrong-password / wrong-TOTP remain identical to each other.
> - `src/lib/auth/lockout.ts` is deliberately free of `server-only` — the client page renders the
>   same string as it ticks down.
> - **Corrected `docs/SECURITY_SPEC.md` lines 69/145/269**, which said 5 attempts / 15 min and had
>   contradicted the shipped code since the lockout landed. The specified "email alert at 10
>   lockouts" is recorded as NOT implemented.
```

- [ ] **Step 7: Commit**

```bash
git add docs/SECURITY_SPEC.md docs/STATUS.md
git commit -m "docs(security): correct the login rate limit to the shipped 3 / 1 min"
```

---

## Self-Review

**Spec coverage.** The owner's requirement — "only 3 chances", "locked for 1 minute", "they can enter the details" afterwards — maps to: the 3/60s contract pinned by Task 1's constants and tests; the message and countdown in Tasks 2–4; the re-enable at zero in Task 4 Step 3; and hand-verification of the whole sequence in Task 5 Step 1. SECURITY_SPEC §3's anti-enumeration requirement is preserved by keeping the credential message byte-identical (Global Constraints) and is argued in Background. §6's numbers are corrected in Task 5.

**Placeholders.** None. Every code step carries the literal code; every doc step carries the literal replacement text.

**Type consistency.** `peekLoginLimits` returns the existing `RateResult` and is named identically in Tasks 1, 3 and the STATUS block. `lockoutMessage(retryAfterSeconds: number): string` is named identically in Tasks 2, 3, 4. `LoginState.retryAfterSeconds` is the same property name in Tasks 2, 3, 4. `LOGIN_MAX` / `LOGIN_WINDOW` appear only inside Task 1.

**Known gap, stated deliberately.** `loginAction` has no unit test (Task 3 explains why), and there is no automated end-to-end test of the login form — which is why Task 5 Step 1 is a required manual sequence with an explicit failure signal for the double-counting bug.
