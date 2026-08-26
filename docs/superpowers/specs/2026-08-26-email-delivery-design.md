# Email Delivery (Resend) — Design Spec

> **Status:** approved-in-chat 2026-08-26. Implements the *delivery half* of the
> existing queue-based email system (BUILD_PLAN §11). Plan:
> `docs/superpowers/plans/2026-08-26-email-delivery.md`.

## Problem

The app **enqueues** email into `email_log` (`enqueueEmail` in `src/lib/email.ts`)
but **nothing sends it**. Verified on the live DB: 8 rows, all `status='pending'`,
**0 ever `sent`**. There is no processor/cron in the repo that reads `email_log`.
So registration confirmations (the 8 stuck rows) and the planned member login-link
emails never actually arrive. The comment in `email.ts` ("a processor (Resend,
cron-triggered) sends it later") describes a component that was never built.

## Goal

Actually **deliver** queued email via Resend — immediately for interactive mail,
with a cron backstop for the rest — behind the existing, unchanged
`enqueueEmail` / `email_log` interface. As the first concrete payoff, the member
login link is emailed automatically (still shown on-screen as a copy fallback).

## Non-goals (YAGNI)

- Pixel-perfect per-template designs — one branded generic renderer now; specialize later.
- A verified sending domain — start in Resend **test mode** (`onboarding@resend.dev`,
  which only delivers to the Resend account owner's address). Real members come after
  a domain is verified (a one-line `EMAIL_FROM` change).
- Retry/attempt caps or backoff beyond "re-drain anything still `pending`". A dedicated
  `attempts` column can be added later if bounce/loop behavior demands it.
- Provider SDK — call the Resend HTTP API with `fetch` (no `resend` npm dep; keeps the
  bundle small and serverless-clean).

## Architecture — the delivery half, behind a stable interface

The queue stays the source of truth. `email_log` already carries everything a sender
needs (`template`, `to_email`, `to_name`, `subject`, `payload` jsonb, `status`,
`sent_at`, `error`). We add four small, isolated units:

1. **`src/lib/email/resend.ts`** — `sendViaResend({ to, subject, html, text })`.
   Thin wrapper over `POST https://api.resend.com/emails` with
   `Authorization: Bearer ${RESEND_API_KEY}`, `from = EMAIL_FROM`. Returns
   `{ ok: true, id }` or `{ ok: false, error }` (never throws on a non-2xx — maps the
   Resend error body to a string). Reads env via `@/lib/env`.

2. **`src/lib/email/templates.ts`** — pure
   `renderEmail(template, subject, toName, payload) → { html, text }`.
   A branded wrapper (inline "paper" styles) that greets `toName`, states the
   `subject`, and — when the payload carries a known action URL
   (`inviteUrl` | `confirmUrl` | `url`, first match wins) — renders a primary button +
   the raw URL in the text part. Unknown templates use the same wrapper and never
   throw. All interpolation is HTML-escaped (no `dangerouslySetInnerHTML`; SECURITY_SPEC
   §5). **Unit-tested.**

3. **`src/lib/email/send.ts`** — `deliverEmail(row) → 'sent' | 'failed'`.
   Renders → `sendViaResend` → updates the `email_log` row: success ⇒
   `status='sent', sent_at=now()`; failure ⇒ `status='failed', error=<message>`.
   Also exports `deliverPending(limit)` used by the cron. Service-role DB writes only.

4. **`src/app/api/cron/send-email/route.ts`** — `GET`, gated by
   `Authorization: Bearer ${CRON_SECRET}` (401 otherwise; the ESLint admin-guard rule
   only covers `app/api/admin/**`, so this route is exempt). Calls
   `deliverPending(25)` — oldest `pending` first, ordered by `priority` then
   `created_at` — and returns a `{ sent, failed }` summary. This is the retry/backstop
   and what flushes the 8 stuck rows. Scheduled via `vercel.json` `crons`.

**Immediate delivery:** `enqueueEmail` keeps its signature and still inserts the row,
then makes a **best-effort inline `deliverEmail`** in a `try/catch`. A transient Resend
failure just leaves the row `pending` for the cron — the enqueue call never throws for a
send error. This gives interactive mail (member link, registration confirmation)
same-request delivery without needing a minute-granularity cron.

**Member login-link enqueue** (the original ask): `generateMemberLinkAction` and
`resetMemberAccessAction` (in `attendance/actions.ts`) enqueue
`{ template: "member_login_link", toEmail: member.email, toName: member.name,
subject: "Set up your CSE Council member login", payload: { inviteUrl, name } }`.
`MemberLoginAccess.tsx` copy updates to "Link emailed to the member — you can also copy
it below."

## Data flow

```
enqueueEmail(args)
  └─ insert email_log row (status=pending)
  └─ try deliverEmail(row) inline ──► renderEmail ──► sendViaResend ──► Resend API
        success ► row = sent (+sent_at)          │
        failure ► row stays pending / failed     │
                                                  ▼
GET /api/cron/send-email (Bearer CRON_SECRET, on schedule)
  └─ deliverPending(25): re-drain pending ► deliverEmail each  (retry + backstop)
```

## Config

- **`.env.local`** (done): `RESEND_API_KEY` (send-only key), `EMAIL_FROM="CSE Club
  Council <onboarding@resend.dev>"`. **To add:** `CRON_SECRET` (32-byte random).
- **Vercel prod env** (owner/agent to add): the same three. Until a domain is verified,
  delivery is limited to the Resend account owner's email (test-mode behavior).
- **`vercel.json`**: a `crons` entry pointing at `/api/cron/send-email`. Cadence depends
  on the Vercel plan (per-minute on Pro, daily on Hobby); inline send covers immediacy
  regardless, so the cron is purely the retry/backstop.

## Testing / verification

- **Unit** (`templates.test.ts`): action-URL detection across payload key variants;
  HTML-escaping of `toName`/`subject` (XSS guard); text fallback present; unknown
  template doesn't throw.
- **Gate:** `npm run typecheck && npm run lint && npm test && npm run build` green.
- **Live (test mode):** trigger a `member_login_link` to `anithashankar08@gmail.com`
  (and/or hit the cron to drain the 8 `registration_received`) → assert the row flips to
  `sent` in the DB **and** the email lands in the owner's inbox. Non-owner recipients
  will legitimately go `failed` (Resend test-mode restriction) until a domain is
  verified — that is expected, not a bug.

## Risks & mitigations

- **Test mode only reaches the owner.** Real members need a verified domain — deferred
  by choice; upgrade path is one `EMAIL_FROM` line.
- **Inline send adds ~100–300 ms** to enqueueing requests — negligible at club scale,
  and it's `try/catch`-isolated so it can never fail the enqueue.
- **Resend free-tier limits** (~3k/mo, 100/day) — ample for this audience.
- **Restricted key can only send** (can't list domains) — fine; least-privilege.
