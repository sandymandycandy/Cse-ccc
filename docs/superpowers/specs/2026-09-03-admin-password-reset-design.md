# Admin password reset — design

**Date:** 2026-09-03 · **Status:** approved, not yet implemented
**Spec touched:** `docs/SECURITY_SPEC.md` §3 (authentication), §6 (rate limits)

## Goal

An admin who has forgotten their password recovers their own account from the
login page, without another admin doing anything. The same flow **also re-enrols
their authenticator**, so an admin who lost their phone *and* their recovery
codes is not permanently locked out.

## Recorded decisions

These two were decided by the owner on 2026-09-03 after the trade-offs were put
to them. They are written down so nobody re-derives them later and quietly
"fixes" them.

> **D1 — the reset re-enrols TOTP in the same flow.** The alternative (link sets
> the password, existing authenticator still demanded at next login) was offered
> and declined, because it leaves the lost-phone-and-codes admin stuck.
>
> **⚠️ Consequence, accepted:** an admin's **inbox becomes a single factor for
> full account takeover.** Whoever reads that mailbox can set a new password AND
> enrol their own authenticator. There is no second credential anywhere in the
> flow. This holds for every role.

> **D2 — every role may self-reset, with no exceptions.** Restricting Faculty
> Advisor / Vice President / Tech Head / President (the four roles §3 singles out
> as holding every capability) to the existing invite path was offered and
> declined.
>
> **⚠️ Consequence, accepted:** a compromised Faculty Advisor or VP mailbox is a
> complete platform takeover — every club, every event, and the registration PII
> that §4 protects.

Because prevention was traded away twice, **this design leans on containment and
detection instead**: a short window, single use, every live session killed, old
recovery codes burned, hard rate limits, and an unconditional completion notice.
Those are the compensating controls, and none of them are optional extras.

## Architecture

### Why a new table, not a `kind` column on `admin_invites`

An invite and a reset look similar and grant different things:

| | `admin_invites` | `admin_password_resets` |
|---|---|---|
| Carries `role` / `club_id` | yes | **no** |
| May create an account | yes | **no** |
| Target account | may not exist yet | must already exist |
| TTL | 48 h | 1 h |

Overloading one table means every consumer branches on `kind`, and the
account-creating branch has to be *proven* unreachable for resets — a
correctness argument that must be re-made on every future edit. A separate table
with its own validator makes "a reset cannot change a role" true **by
construction**. Given D1 makes this the most powerful token in the system, that
is worth one small migration.

### Migration

`supabase/migrations/20260903020000_admin_password_resets.sql`:

```sql
create table public.admin_password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index admin_password_resets_email_idx on public.admin_password_resets (email);
alter table public.admin_password_resets enable row level security;
```

**RLS on, and deliberately no policies** — service-role only, matching
`admin_invites`. The anon and authenticated roles must never read this table; a
readable `token_hash` column plus a known email is a takeover. Verify the
`admin_invites` policy shape before writing this, and match it exactly.

No IP column. It was considered for abuse forensics and dropped: `email_log`
already records that a reset mail was sent and to whom, which is the fact that
matters, and storing request IPs adds PII with a retention question attached.

### Modules

**`src/lib/admin/resets.ts`** — mirrors `invites.ts` deliberately, so the two
read the same way:

```ts
const RESET_TTL_MS = 60 * 60 * 1000;                 // 1 hour, not the invite's 48

createReset(email: string): Promise<{ token: string; expiresAt: string }>
validateReset(rawToken: string): Promise<{ id: string; email: string } | null>
consumeReset(resetId: string): Promise<boolean>      // atomic, single-use
```

Reuses `generateConfirmToken()` and `hashToken()` from `src/lib/tokens.ts`
unchanged — 32 random bytes, only the SHA-256 hash stored.

**`isResetLive(row, now)`** is split out as a **pure** function (expired?
consumed?) so the expiry rule is unit-testable without a database.
`invites.ts` has no tests precisely because its logic is welded to Supabase
calls; this module should not repeat that.

**`src/lib/rate-limit.ts`** gains:

```ts
checkPasswordResetLimits({ ip, email }): RateResult   // 3 / hour per email, 5 / hour per IP
```

Built on the existing `rateLimit` primitive, in the same shape as
`checkContactLimits`. The per-email cap is the one that matters: it bounds how
many live reset tokens an attacker can cause to be mailed.

### Surfaces

**`/admin/forgot`** — one email field. Server action `requestResetAction`:

1. Parse + normalise the email (`.trim().toLowerCase()`, as `LoginSchema` does).
2. Rate-limit check → on trip, the neutral message (below), never a lockout hint.
3. Look up an admin with that email that is `is_active` and has a
   `password_hash`. **No match → return the neutral message and send nothing.**
4. Match → `createReset`, then `enqueueEmail` with `payload.url` pointing at
   `/admin/reset/<token>`.
5. Return the neutral message.

The response is **byte-identical in all four cases** — unknown address, inactive
account, rate-limited, and success:

> *"If that address belongs to an admin account, a reset link is on its way. It
> expires in an hour."*

That sameness is the §3 anti-enumeration rule applied to a new surface. It is
also why the rate-limit trip must not surface its own wording here.

**`/admin/reset/[token]`** — validates the token server-side on load; an
invalid, expired or consumed token renders "This link is invalid or has expired"
and a link back to `/admin/forgot`. Otherwise it renders the **same
password + TOTP-enrolment form component as `/admin/accept-invite`**, which
already does exactly this job. Extracting that shared component is part of the
work; writing it twice is not.

Server action `resetPasswordAction`, in this order:

1. Re-validate the token (never trust the page's copy).
2. Verify the submitted TOTP against the freshly generated secret, so a broken
   authenticator enrolment can't lock them out *after* the password changed.
3. `validatePassword` (≥12 chars + HIBP), then `hashPassword`.
4. **`consumeReset` FIRST, and abort if it returns false.**
5. Update `admin_users`: `password_hash`, and `session_epoch = current + 1`.
   **Touches nothing else — not `role`, not `club_id`, not `is_active`.**
6. Upsert `admin_totp`: new encrypted secret, `confirmed_at`, and **10 freshly
   generated recovery codes replacing the old ones**.
7. `enqueueEmail` the completion notice to the account's own address.
8. Return the new recovery codes, shown once.

**Step 4 is deliberately before the writes, and differs from
`accept-invite`,** which consumes its invite last. Consume-first means a
double-submitted link cannot apply twice. It also picks the safe failure
direction: a crash between 4 and 5 leaves the admin with a burned token and an
*unchanged* password, so they simply request another link — the opposite
ordering could leave a live token beside a changed password.

**`/admin/login`** gains a "Forgot password?" link. This is the same file the
in-flight `feat/login-lockout-feedback` branch edits, which is why this work
stacks on that branch rather than running beside it.

### Email

No new template code — `renderEmail` already renders any `payload.url` as the
primary button (`URL_KEYS` in `templates.ts`). Two new `template` values:

- `admin_password_reset` — the link, the 1-hour expiry, and an explicit *"if you
  didn't ask for this, tell the Tech Head"*.
- `admin_password_reset_done` — sent unconditionally on completion. **Under D1
  this is the primary way an unauthorised reset is ever noticed**, so it is not
  optional and must not be suppressed for self-service resets.

### Session invalidation

`session_epoch + 1` follows the existing pattern in
`src/app/admin/setup-totp/actions.ts:74-79` (read, then increment).
`getAdminSession` already rejects a stale epoch (`guards.ts:46`), so every live
session for that admin dies the moment the reset lands. §3 already lists
password reset as a trigger for this; the row is being honoured, not invented.

## Testing

| What | How |
|---|---|
| `isResetLive` — fresh / expired / consumed | pure unit tests, no DB |
| `checkPasswordResetLimits` — per-email and per-IP caps | unit, unique ids per test (module-level `Map`) |
| Neutral response is identical across all four branches | unit test on the action's returned string |
| Token lifecycle (validate rejects unknown/expired/used; consume is atomic) | integration, against a local Supabase |
| Password policy | already covered by `password.ts` tests |

**Known gap, stated up front:** as with `accept-invite`, the DB-touching action
has no unit test worth writing — mocking Supabase would only test the mock. The
end-to-end sequence is therefore a **required manual verification**, not an
optional one, and must include: a reset that completes; the same link used
twice (second must fail); an expired link; and confirmation that an existing
session is dead afterwards.

## Out of scope

- Rotating the limiter to Upstash. The in-memory `Map` is per-instance on Vercel,
  so the reset rate limit is weaker in production than it reads here. That is a
  pre-existing property of every limit in §6 and is tracked separately.
- Any change to how login itself works.
- Admin-initiated resets — another admin can already re-invite.
