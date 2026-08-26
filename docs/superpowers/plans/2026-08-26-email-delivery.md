# Email Delivery (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actually deliver queued email via Resend — immediately on enqueue, with a cron backstop — so the member login link (and the 8 stuck registration confirmations) reach inboxes.

**Architecture:** Add the missing *delivery half* behind the existing, unchanged `email_log` / `enqueueEmail` interface: a Resend HTTP client, a pure branded template renderer, a `deliverEmail(row)` that sends + flips the row's status, a best-effort inline send inside `enqueueEmail`, and a `CRON_SECRET`-gated drain route as the retry/backstop.

**Tech Stack:** Next 16 (App Router, Turbopack), React 19, TypeScript strict, Supabase (service-role writes), Resend HTTP API via `fetch` (no SDK), vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-email-delivery-design.md` — read alongside this plan.

## Global Constraints

- **Read secrets from `process.env` directly — do NOT `import "@/lib/env"`.** That module eagerly validates the *whole* env at import; `.env.local` is intentionally partial, so importing it throws in dev. Follow the `src/lib/attendance.ts` pattern (`process.env.X` with a local guard). This is the single most important constraint here.
- **This is NOT stock Next.js** — read `node_modules/next/dist/docs/` before writing route/config code; the middleware file is `src/proxy.ts`.
- **All DB writes go through `createAdminClient()`** (service role) in `"use server"` / route handlers / `server-only` libs. `email_log` is service-role only.
- **`dangerouslySetInnerHTML` is ESLint-banned** — the renderer returns an HTML *string* used only as the Resend email body (never rendered in the app DOM), which is fine; still HTML-escape every interpolated value.
- **Branch:** work on `feat/email-delivery` (already created; the spec is committed there). Do NOT push to `main` (auto-deploys to prod) until the owner approves.
- **Test mode:** `EMAIL_FROM="CSE Club Council <onboarding@resend.dev>"` delivers ONLY to the Resend account owner (`anithashankar08@gmail.com`). Sends to any other address legitimately return `failed` until a domain is verified — expected.
- **Verify gate before "done":** `npm run typecheck && npm run lint && npm test && npm run build` all green.

---

### Task 1: Resend HTTP client + `CRON_SECRET`

**Files:**
- Create: `src/lib/email/resend.ts`
- Modify: `.env.local` (gitignored — add `CRON_SECRET`)

**Interfaces:**
- Produces: `sendViaResend(args: SendArgs): Promise<SendResult>` where
  `SendArgs = { to: string; subject: string; html: string; text: string }` and
  `SendResult = { ok: true; id: string } | { ok: false; error: string }`.

- [ ] **Step 1: Add `CRON_SECRET` to `.env.local`**

Append a 32-byte random value (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`):

```
CRON_SECRET=<generated-32-byte-base64>
```

- [ ] **Step 2: Create `src/lib/email/resend.ts`**

```ts
import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Send one email via the Resend HTTP API (spec §Architecture). Reads
 * RESEND_API_KEY + EMAIL_FROM from process.env directly (NOT @/lib/env — see the
 * global constraint). Never throws on a bad response; maps it to { ok: false }.
 */
export async function sendViaResend(args: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email not configured (RESEND_API_KEY/EMAIL_FROM)." };

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html, text: args.text }),
    });
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}` };
  }

  if (!res.ok) {
    let msg = `Resend HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.message) msg = String(b.message); } catch { /* keep status */ }
    return { ok: false, error: msg };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: true, id: typeof body?.id === "string" ? body.id : "" };
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/lib/email/resend.ts
git commit -m "feat(email): Resend HTTP client (no SDK, process.env directly)"
```

---

### Task 2: Branded template renderer (pure, TDD)

**Files:**
- Create: `src/lib/email/templates.ts`
- Test: `src/lib/email/templates.test.ts`

**Interfaces:**
- Produces: `renderEmail(template: string, subject: string, toName: string | null, payload: Record<string, unknown> | null): { html: string; text: string }`.

- [ ] **Step 1: Write the failing test** — `src/lib/email/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderEmail } from "./templates";

describe("renderEmail", () => {
  it("renders an action button from inviteUrl", () => {
    const { html, text } = renderEmail("member_login_link", "Set up your login", "Asha", {
      inviteUrl: "https://x.test/member/accept-invite?token=abc",
    });
    expect(html).toContain("https://x.test/member/accept-invite?token=abc");
    expect(text).toContain("https://x.test/member/accept-invite?token=abc");
  });

  it("also detects confirmUrl", () => {
    const { html } = renderEmail("registration_received", "Confirm your seat", "A", {
      confirmUrl: "https://x.test/registrations/confirm?t=1",
    });
    expect(html).toContain("https://x.test/registrations/confirm?t=1");
  });

  it("has no action link when the payload carries no url", () => {
    const { html } = renderEmail("event_updated", "Updated: Hackathon", "A", { title: "Hackathon" });
    expect(html).not.toContain("href=\"http");
  });

  it("HTML-escapes the name and subject (XSS guard)", () => {
    const { html } = renderEmail("t", "<script>alert(1)</script>", "<b>x</b>", null);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ignores a non-http(s) url (no javascript: scheme)", () => {
    const { html } = renderEmail("t", "s", "a", { url: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:");
  });

  it("never throws on an unknown template or null payload", () => {
    expect(() => renderEmail("totally-unknown", "s", null, null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/email/templates.test.ts`
Expected: FAIL ("Cannot find module './templates'").

- [ ] **Step 3: Implement `src/lib/email/templates.ts`**

```ts
/**
 * Pure email body renderer (spec §Architecture). A single branded wrapper for every
 * template: greets the recipient, states the subject, and — when the payload carries a
 * known action URL — renders a primary button. Every interpolated value is HTML-escaped.
 * The returned html is used ONLY as a Resend email body, never in the app DOM.
 */

const URL_KEYS = ["inviteUrl", "confirmUrl", "url"] as const;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** First http(s) URL found under a known payload key, else null. */
function actionUrl(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  for (const k of URL_KEYS) {
    const v = payload[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

export interface RenderedEmail { html: string; text: string; }

export function renderEmail(
  _template: string,
  subject: string,
  toName: string | null,
  payload: Record<string, unknown> | null,
): RenderedEmail {
  const url = actionUrl(payload);
  const greeting = toName ? `Hi ${esc(toName)},` : "Hi,";
  const button = url
    ? `<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#1f4d3a;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font:600 15px sans-serif">Open</a></p>
       <p style="color:#666;font-size:13px;word-break:break-all">Or paste this link into your browser:<br>${esc(url)}</p>`
    : "";

  const html = `<div style="max-width:520px;margin:0 auto;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
  <div style="font:600 12px sans-serif;color:#1f4d3a;letter-spacing:.06em;text-transform:uppercase">CSE Club Council</div>
  <h1 style="font:400 22px Georgia,'Times New Roman',serif;margin:8px 0 16px">${esc(subject)}</h1>
  <p style="margin:0 0 12px">${greeting}</p>
  ${button}
  <hr style="border:none;border-top:1px solid #e6e6e6;margin:28px 0" />
  <p style="color:#9a9a9a;font-size:12px;margin:0">CSE Club Council · automated message, please don't reply.</p>
</div>`;

  const text = [
    subject,
    "",
    toName ? `Hi ${toName},` : "Hi,",
    url ? `\nOpen: ${url}` : "",
    "",
    "— CSE Club Council",
  ].join("\n");

  return { html, text };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/email/templates.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates.ts src/lib/email/templates.test.ts
git commit -m "feat(email): pure branded template renderer (+ XSS-guard tests)"
```

---

### Task 3: `deliverEmail` + `deliverPending`

**Files:**
- Create: `src/lib/email/send.ts`

**Interfaces:**
- Consumes: `renderEmail` (templates.ts), `sendViaResend` (resend.ts), `createAdminClient`.
- Produces:
  - `interface EmailRow { id: string; template: string; to_email: string; to_name: string | null; subject: string; payload: Json }`
  - `deliverEmail(row: EmailRow): Promise<"sent" | "failed">`
  - `deliverPending(limit?: number): Promise<{ sent: number; failed: number }>`

- [ ] **Step 1: Create `src/lib/email/send.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { renderEmail } from "./templates";
import { sendViaResend } from "./resend";

export interface EmailRow {
  id: string;
  template: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  payload: Json;
}

/** Render + send one queued row, then flip its status. Returns the new status. */
export async function deliverEmail(row: EmailRow): Promise<"sent" | "failed"> {
  const admin = createAdminClient();
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : null;

  const { html, text } = renderEmail(row.template, row.subject, row.to_name, payload);
  const result = await sendViaResend({ to: row.to_email, subject: row.subject, html, text });

  if (result.ok) {
    await admin.from("email_log")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .eq("id", row.id);
    return "sent";
  }
  await admin.from("email_log")
    .update({ status: "failed", error: result.error.slice(0, 500) })
    .eq("id", row.id);
  return "failed";
}

/** Drain up to `limit` pending rows, highest priority (lowest number) + oldest first. */
export async function deliverPending(limit = 25): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_log")
    .select("id, template, to_email, to_name, subject, payload")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as EmailRow[]) {
    (await deliverEmail(row)) === "sent" ? sent++ : failed++;
  }
  return { sent, failed };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/lib/email/send.ts
git commit -m "feat(email): deliverEmail + deliverPending (send + status transitions)"
```

---

### Task 4: Best-effort inline send inside `enqueueEmail`

**Files:**
- Modify: `src/lib/email.ts`

**Interfaces:**
- Consumes: `deliverEmail` (send.ts).
- `enqueueEmail`'s signature is UNCHANGED — callers need no edits.

- [ ] **Step 1: Update `src/lib/email.ts`**

Replace the body of `enqueueEmail` so the insert returns the row, then attempt an inline delivery:

```ts
export async function enqueueEmail(args: EnqueueEmailArgs): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_log")
    .insert({
      template: args.template,
      to_email: args.toEmail,
      to_name: args.toName ?? null,
      subject: args.subject,
      payload: args.payload ?? {},
      priority: args.priority ?? 5,
      status: "pending",
    })
    .select("id, template, to_email, to_name, subject, payload")
    .single();
  if (error) throw error;

  // Best-effort immediate delivery (spec §Immediate delivery). A transient send
  // failure leaves the row 'pending'/'failed' for the cron backstop — enqueue itself
  // never throws for a delivery error.
  try {
    const { deliverEmail } = await import("./email/send");
    await deliverEmail(data);
  } catch {
    /* swallow — the row is persisted; the cron will retry pending rows */
  }
}
```

(Keep the existing file header comment; update it to note delivery is now attempted inline with a cron backstop, replacing "sends it later".)

- [ ] **Step 2: Typecheck + lint + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/lib/email.ts
git commit -m "feat(email): enqueueEmail attempts inline delivery (cron backstop unchanged contract)"
```

---

### Task 5: Cron drain route + `vercel.json`

**Files:**
- Create: `src/app/api/cron/send-email/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `deliverPending` (send.ts).

- [ ] **Step 1: Create `src/app/api/cron/send-email/route.ts`**

```ts
import { deliverPending } from "@/lib/email/send";

/**
 * Email backstop (spec §Architecture). Vercel Cron calls this with
 * `Authorization: Bearer ${CRON_SECRET}`; we reject anything else. Drains pending
 * rows (retry path + flushes anything inline delivery missed). Not under
 * app/api/admin/**, so the admin-guard ESLint rule doesn't apply; CRON_SECRET is the guard.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const summary = await deliverPending(25);
  return Response.json({ ok: true, ...summary });
}
```

- [ ] **Step 2: Create `vercel.json`**

Daily schedule (allowed on every Vercel plan incl. Hobby; inline send handles immediacy, so the cron is purely the retry/backstop):

```json
{
  "crons": [
    { "path": "/api/cron/send-email", "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 3: Typecheck + lint + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add "src/app/api/cron/send-email/route.ts" vercel.json
git commit -m "feat(email): CRON_SECRET-gated drain route + daily vercel cron"
```

---

### Task 6: Auto-email the member login link

**Files:**
- Modify: `src/app/admin/(app)/attendance/actions.ts` (both member-link actions)
- Modify: `src/components/admin/MemberLoginAccess.tsx` (copy)

**Interfaces:**
- Consumes: `enqueueEmail` (`@/lib/email`).
- Relies on `requireOwnClubMember` returning `gate.member` with `.name` + `.email` (both set; `.email` is guaranteed non-null because the gate errors when it's missing).

- [ ] **Step 1: Confirm `getMemberForEdit` returns `name`**

Open `src/lib/admin/members.ts` and confirm `MemberForEdit` includes `name: string` and `getMemberForEdit` selects it. It does (the form is seeded from it). If `name` is somehow absent, add it to the `.select(...)` and the returned object.

- [ ] **Step 2: Enqueue the email in both actions**

In `src/app/admin/(app)/attendance/actions.ts`, add the import near the other `@/lib/...` imports:

```ts
import { enqueueEmail } from "@/lib/email";
```

In BOTH `generateMemberLinkAction` and `resetMemberAccessAction`, immediately before `return { inviteUrl: ... }`, add:

```ts
  try {
    await enqueueEmail({
      template: "member_login_link",
      toEmail: gate.member.email!,
      toName: gate.member.name,
      subject: "Set up your CSE Council member login",
      payload: { inviteUrl, name: gate.member.name },
      priority: 1,
    });
  } catch {
    /* never lose the URL over an email hiccup — it's still returned + shown */
  }
```

(`inviteUrl` is the exact string already built for the return value — enqueue the same one.)

- [ ] **Step 3: Update the on-screen copy in `MemberLoginAccess.tsx`**

Change the helper `<p>` text so the head knows it was emailed, and relabel the shown URL as a fallback:

- Not-activated line → `"Generate a one-time link — we'll email it to the member, and you can also copy it below to share manually."`
- The `url` note heading → `"Emailed to the member · copy to share manually"`.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add "src/app/admin/(app)/attendance/actions.ts" src/components/admin/MemberLoginAccess.tsx
git commit -m "feat(email): auto-email the member login link (URL kept as copy fallback)"
```

---

### Task 7: Full gate + live verification + STATUS + finish

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green (existing 91 tests + Task 2's 6 = 97; build ✓).

- [ ] **Step 2: Live delivery test (test mode → owner inbox)**

Two independent checks against `npm run dev` (reads `.env.local`, which has the real key):

(a) **Drain the stuck queue** — call the cron route with the secret:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-email
```
The 8 `registration_received` rows go to real student addresses, so in test mode they legitimately return `failed`. Confirm the endpoint returns `{ ok: true, sent, failed }` and that the rows moved OFF `pending` (via Supabase MCP: `select status, count(*) from email_log group by status`).

(b) **Real inbox delivery** — in a browser as a club_head: add a member whose email is `anithashankar08@gmail.com`, open their edit page → **Generate login link**. Because that recipient IS the Resend account owner, it delivers: confirm the email arrives in that inbox AND the row is `sent` (`select status from email_log where to_email='anithashankar08@gmail.com' order by created_at desc limit 1`). Delete the throwaway member + its rows afterward (shared live DB).

- [ ] **Step 3: Update `docs/STATUS.md`**

Add an "Email delivery" entry under "What's DONE" (queue now actually sends via Resend; inline + daily cron backstop; test-mode caveat; the member login link auto-emails). Note the out-of-repo follow-ups are now resolved for delivery, but a **verified sending domain** is still owed before real members receive mail, and **prod env vars** (`RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`) must be set in Vercel.

- [ ] **Step 4: Commit + finish the branch**

```bash
git add docs/STATUS.md
git commit -m "docs: STATUS — email delivery (Resend) wired; test-mode + domain caveat"
```

Then use `superpowers:finishing-a-development-branch`. Do NOT merge to `main` (auto-deploys to prod) until: (1) the three env vars are set in Vercel prod, and (2) the owner gives the go-ahead. Setting prod env vars is the owner's step (the Vercel CLI is not installed).

---

## Self-Review (completed by plan author)

- **Spec coverage:** §Architecture unit 1 (Resend client) → Task 1; unit 2 (renderer) → Task 2; unit 3 (deliverEmail/deliverPending) → Task 3; §Immediate delivery → Task 4; unit 4 (cron route) + config (vercel.json) → Task 5; member login-link enqueue + copy → Task 6; §Testing/verification (unit + gate + live) → Tasks 2, 7. All covered.
- **Type consistency:** `SendArgs`/`SendResult` produced in Task 1, consumed in Task 3; `renderEmail(template, subject, toName, payload) → {html,text}` produced in Task 2, consumed in Task 3; `EmailRow` + `deliverEmail`/`deliverPending` produced in Task 3, consumed in Tasks 4 (deliverEmail) and 5 (deliverPending); `enqueueEmail` signature unchanged (Task 4) so Task 6's call matches the existing `EnqueueEmailArgs`.
- **Env constraint:** no task imports `@/lib/env`; all secrets read via `process.env` (Tasks 1, 5) — consistent with `attendance.ts`.
- **Placeholder scan:** every code step has concrete code; no TBD/"handle errors"/"similar to".
