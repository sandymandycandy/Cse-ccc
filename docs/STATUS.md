# Project Status & TODO — CSE Club Council Platform

> **For any agent/developer picking this up:** read this first, then
> `docs/BUILD_PLAN.md` (v2.1, the product/engineering spec) and
> `docs/SECURITY_SPEC.md`. Per-feature designs live in
> `docs/superpowers/specs/` and their plans in `docs/superpowers/plans/`.
> Last updated: 2026-08-23.

## What this is

A platform for a college **CSE Club Council** — 11 clubs, a 3-layer org
hierarchy, 9 admin roles. Public site (clubs, events, calendar, registration)
+ an admin panel (events, approvals, attendance, registrations, results) +
student attendance via rotating-QR self-scan. **Live in production** at
https://cse-ccc.vercel.app (Vercel, auto-deploys from `main`).

Guiding principle from the build plan: every phase gate is a **journey someone
completes end-to-end**, not a checklist of components.

## Status

- **Phase 0** ✅ — design system ("paper"), public shell, home.
- **Phase 1** ✅ **and deployed to production.** The full journey works live:
  clubs → events → **register → email-confirm → attend (QR self-scan) →
  results/standings**. Admin auth (Auth.js v5, invite + TOTP), events +
  approvals, attendance, registrations + CSV, and **event results & rounds
  (§13.9)** are all live.
- **Certificates (§12.6)** — the last leg of the journey — is **parked** (see TODO #1).

### ⚠️ Committed to local `main` but NOT pushed / deployed (as of 2026-08-23)
The 2026-08-23 work below is **committed locally, ~10 commits ahead of
`origin/main`, and not yet deployed** (only the ESLint guard rule, `5dec862`,
is on `origin`). Commits are stacked, so `git push origin main` ships them all
at once → prod. Full suite (47 tests) + typecheck + lint + build all green.
- **§3** middleware→proxy rename · **§5** all 9 dead nav links stubbed
  (`/join`, `/team` + the 7 footer routes) · **§4a** event edit · **§4b**
  `/admin/audit` log viewer · **§4c** event duplicate + cancel · **§2** login
  lockout (3 tries → 1 min), 2-min idle timeout (+ stripped-clock bypass fix from
  the commit security review), mandatory-TOTP (forced enrollment for
  `tech_head`/`president`).
- **Pushed to prod so far:** the first 13 commits (through the audit viewer).
  Event duplicate/cancel (§4c) and the 7 footer stubs (§5) are **committed but
  not yet pushed.**
- **Before trusting in prod, two things need a human (can't be driven headless):**
  1. **Event-edit** — browser pass: log in → Events → Edit → change time → Save.
  2. **TOTP enrollment POST** — log in as the bootstrap Tech Head (routed to
     `/admin/setup-totp`), scan + enter a code to confirm the write + 2FA
     re-login. (The gate + page render are verified; only the code round-trip
     isn't.)
- **Also queue for the out-of-repo email processor:** two new templates it must
  render — **`event_updated`** (event-edit, on a time/venue change) and
  **`event_cancelled`** (event cancel). Until added, those queued mails won't send.

### Live feature detail
- Public: `/`, `/clubs` + `/clubs/[slug]`, `/events` (+`/upcoming`,`/past`) +
  `/events/[id]`, `/calendar` (month/week/day/agenda), `/events/[id]/results`.
- Registration: `POST /api/registrations` (Zod + rate-limit + honeypot +
  Turnstile-ready), email confirm flow, device-bound QR attendance.
- Admin (`/admin/*`, capability-gated, audited): login, dashboard, events
  list/create, approvals, users (invite + TOTP onboarding), attendance,
  registrations (+ injection-safe CSV export), **results editor**.
- Results & rounds (§13.9): ordered rounds, per-student score/rank/advanced,
  draft→publish with per-column public visibility, score-gated advancement,
  "Proceed to next round" button. Standings public only once published (RLS).
- **Pending push (built 2026-08-23, see the ⚠️ block above):** admin **event
  edit** (`/admin/events/[id]/edit`), **forced TOTP enrollment**
  (`/admin/setup-totp`), and the login-lockout / idle-timeout / mandatory-TOTP
  auth controls. Not live until `main` is pushed.

## TODO — remaining work (ordered)

1. **Certificates (§12.6) + `/verify/:serial`** — ⛔ **PARKED, blocked on assets
   the org must provide: club logos + a faculty signature image** for the PDF.
   The *logic* is unblocked: winner certs consume final-round standings
   (§13.9 data is ready), participation certs consume `attended` rows. A
   placeholder screen holds the slot at `/admin/certificates`. Tables
   (`certificates`) + HMAC serials already exist. Build issuance + verify now,
   PDF rendering when assets arrive.
2. **Auth/security follow-ups.** Only item left: **CSRF double-submit token** —
   ⏸️ **assessed, recommend deferring.** Next.js server actions already carry
   framework CSRF protection, `requireSameOrigin` is the Origin backstop, the one
   admin API route is a GET, and the public POST routes are session-less
   (rate-limit + honeypot + Turnstile-ready). No clear mutating surface a
   double-submit token would protect that isn't already covered — build only if
   a new non-action mutating admin route appears.
   - ✅ **Mandatory-TOTP — DONE** (forced enrollment, never a lockout). A
     TOTP-required role (`roleRequiresTotp`: `tech_head`, `president`) with no
     confirmed factor logs in but is flagged `mustSetupTotp` in the JWT and
     confined by the proxy to `/admin/setup-totp` (covers pages + server-action
     POSTs in one place; fails open on decode error). Enrollment reuses the
     accept-invite primitives, then bumps `session_epoch` to force a 2FA
     re-login. Verified on the dev server with minted sessions (true → gated,
     setup page exempt/no-loop, false → free) and rendered the setup page for
     the **real** bootstrap Tech Head session (HTTP 200 + QR). ⚠️ The
     enrollment POST round-trip + subsequent 2FA login need a live authenticator
     to confirm (mirrors accept-invite).
   - ✅ **Idle-session timeout — DONE.** 2 minutes of inactivity (per user),
     on top of the 8h absolute JWT cap. Enforced in `src/proxy.ts` via a
     separate HMAC-signed httpOnly `idle` cookie (`src/lib/auth/idle.ts`) it
     check-then-slides each `/admin` request; on expiry it clears the session
     cookie too (stateless JWT → dropping the cookie is the logout).
     - **Hardened against a stripped-clock bypass** (found by the commit
       security review): a missing/forged clock cookie no longer counts as a
       fresh login — the proxy falls back to the session JWT's issued-at
       (`getToken`), so an aged session with no clock is expired, while a
       genuine fresh login still proceeds. Fails **open** if the JWT can't be
       decoded (never bricks admin). Decision logic in `idleAction()`.
     - Verified end-to-end on the dev server with minted JWEs: aged-session +
       no clock → 307 + both cookies cleared; fresh → proceeds + clock
       refreshed; stale clock → expires; undecodable → fail-open. 13-case unit
       test.
   - ✅ **Login lockout — DONE.** `checkLoginLimits` tightened to **3 attempts
     then a 1-minute lockout** (per user), per-IP and per-account. Login still
     surfaces one generic failure, so lockout is indistinguishable from a wrong
     password (§3). 2-case test; `server-only` now aliased to a no-op stub in
     `vitest.config.mts` so server modules are testable.
   - ✅ **ESLint guard rule — DONE.** `local/admin-route-requires-guard`
     (`eslint-rules/admin-route-requires-guard.mjs`, wired in
     `eslint.config.mjs`, scoped to `src/app/api/admin/**/route.{ts,tsx}`) fails
     the build if any exported HTTP handler lacks an auth-guard call
     (`requireSession` / `requireRole` / `requireCapability` — CSRF-only
     `requireSameOrigin` and the redirecting page guards deliberately don't
     count). Covered by `src/lib/eslint/admin-route-requires-guard.test.ts`
     (RuleTester, 10 cases). Verified end-to-end: an unguarded admin route
     makes `npm run lint` exit 1.
3. ✅ **Next 16 deprecation — DONE.** Renamed `src/middleware.ts` →
   `src/proxy.ts` and the exported `middleware()` → `proxy()` (per
   `node_modules/next/dist/docs/.../proxy.md`); `config`/`matcher` and the
   `x-pathname` header wiring unchanged. Build now reports "ƒ Proxy
   (Middleware)" with no deprecation warning.
4. **Remaining Phase 1 admin surfaces:**
   - **4a. Event edit** — ✅ **BUILT.** `updateEventAction` +
     `getEventForEdit` + reusable `EventForm` + `[id]/edit` page + Edit link on
     the events list + `istLocalToUTC`/`istLocalInput`/`istNumericDate` helpers
     (11-case datetime unit test). typecheck + lint + full suite (30 tests) +
     production build all pass; the new route compiles as `ƒ
     /admin/events/[id]/edit`. Every DB column the action reads/writes was
     schema-verified against the live DB (21/21), and the prefill round-trip
     checks out on real event data.
     - ⚠️ **Not yet driven end-to-end in a browser:** server-action POSTs can't
       be curled and the admin flow needs TOTP login, so the live submit
       (form → `updateEventAction` → write → redirect) is **unverified by
       execution**. Do a manual pass before trusting it in prod: log in →
       Events → Edit → change the time/venue → Save → confirm the row updated
       and approval status is unchanged.
     - ⚠️ **External email processor needs an `event_updated` template.** The
       action enqueues `event_updated` (payload `{eventId, title, timeChanged,
       venueChanged}`) to confirmed registrants on a material change; the
       out-of-repo processor that renders `event_*` templates must learn this
       one or those queued mails won't render.

     As-built design (matches the code):
     - **New `updateEventAction`** in `src/app/admin/(app)/events/actions.ts`,
       mirroring `createEventAction`: same Zod schema **+ hidden `eventId`
       (uuid)**, `getAdminSession` + `canManage(session, "manage:events",
       clubId)` guard, IST→UTC conversion, end-after-start, blackout check, and
       venue-clash check **excluding the event's own row** (`.neq("id",
       eventId)`). `UPDATE events` for title/description/times/venue/capacity
       **only — never touch `approval_status`/`approved_by`** (editing does NOT
       re-trigger approval; approved stays approved, pending stays pending).
       Update the `event_clubs` primary link if the club changed. Write an audit
       row `action: "update"` with before/after. Redirect to `/admin/events`.
       - **Notify registrants on material change:** if `starts_at`, `ends_at`,
         or `venue_id` actually changed **and** the event is published with
         confirmed registrations, enqueue an "event updated" email to those
         registrants (compare before/after; skip pure title/description/capacity
         edits and unpublished events). Add the email template alongside the
         existing `event_*` templates in `src/lib/email`.
     - **`getEventForEdit(session, eventId)`** in `src/lib/admin/queries.ts` —
       returns event fields + primary `clubId`; **fail-closed** for club-scoped
       admins (only their own club's event loads, else `null` → 404).
     - **`EventForm`** (`src/components/admin/EventForm.tsx`) — take the server
       action + `submitLabel` + optional `initial` values + `eventId` as props
       (both actions share the `(prev, formData) => state` signature); prefill
       via `defaultValue`; keep the club locked for club-scoped roles as create
       does. **Keep the native `datetime-local` picker** (its display already
       follows the viewer's locale, dd/mm/yyyy in India/en-GB; its value must
       stay ISO `YYYY-MM-DDTHH:mm`).
     - **New page** `src/app/admin/(app)/events/[id]/edit/page.tsx` —
       `requireViewPage("manage:events")`, load event + clubs + venues,
       `notFound()` if the event doesn't load, render `EventForm` in edit mode.
     - **Events list** (`.../events/page.tsx`) — add an **Edit** action link per
       row.
     - **Datetime helpers** in `src/lib/datetime.ts`: move `istLocalToUTC` here
       and export it (so it's testable), add its inverse `istLocalInput(utcIso)
       → "YYYY-MM-DDTHH:mm"` (IST) for prefilling the native inputs, and
       `istNumericDate(d) → "dd/mm/yyyy"` (en-GB) for **read-only admin tables**
       (switch the events list from `istFullDate` to this). Public/long-form
       date surfaces stay on `istFullDate` unless asked otherwise.
     - **Test:** vitest round-trip `istLocalToUTC ↔ istLocalInput` + a
       `istNumericDate` case (server-action POSTs can't be curled — verify the
       mutation itself in a real browser against the live DB).
   - **4b. Audit log viewer** — ✅ **BUILT.** `/admin/audit` (`view:audit` grant:
     faculty advisor / president / tech head), read-only, newest 100 entries,
     actor names + compact before/after summaries. `listAuditLog` in
     `queries.ts`; nav link gated by `canView`. Verified end-to-end on the dev
     server: authorized role → 200 with live rows, unauthorized real role → 307
     → `/admin`.
   - **4c. Event duplicate + cancel** — ✅ **BUILT** (on the edit page).
     `duplicateEventAction` (draft "Copy of …", nothing else copied → redirect to
     its edit page; skips clash on the draft insert), `cancelEventAction`
     (status→cancelled, `cancel:events`-gated, emails confirmed registrants
     `event_cancelled` + optional reason, audited) + `CancelEventForm` (confirm
     gate). **Reschedule = edit the time** (already notifies registrants), so no
     separate action. Verified: build + edit page renders both for President
     (200) and stays fail-closed for an out-of-club head (404); enum writes
     schema-checked. ⚠️ Mutation POSTs need a browser pass; the external email
     processor needs an **`event_cancelled`** template too.
   - **Still unbuilt:** `/admin/scan` kiosk; real `/admin/certificates`; public
     `/verify`.
5. **Phase 2** (mostly schema-only today): schedules, gallery, `/achievements`
   page, announcements + richtext, `/resources`, recruitment, `/join`,
   `/contact`, `/my-events`, reminder cron, `.ics` feeds, waitlist
   auto-promote, venue booking, email prefs, `/about`, `/team`.
   - **Dead nav/CTA links (live-site polish, ready to build).** None of the
     Phase 2 routes exist yet, but several are already linked on the **live**
     site and 404:
     - **Header** (`src/components/SiteHeader.tsx`): `/team` and `/join`.
     - **Homepage** (`src/app/page.tsx`): two `/join` CTAs — the hero
       "Join a club" button and an "Apply to join" button. These are real
       recruitment CTAs, so **don't delete them** — give them a destination.
     - **Footer** (`src/components/SiteFooter.tsx`): also links `/achievements`,
       `/join`, `/team`, `/resources`, `/contact`, `/my-events`,
       `/announcements`, `/gallery`, `/about` — all currently dead.
     - ✅ **`/join` + `/team` — DONE.** Shipped minimal real stub pages
       (`src/app/join/page.tsx`, `src/app/team/page.tsx`) so header, footer, and
       the homepage CTAs all resolve — `/join` = "how to join, browse the
       clubs", `/team` = "the council, roster coming". Both verified live in the
       dev server (HTTP 200, headings + CTAs render). Stubs, not hides, because
       `/join` is a load-bearing recruitment CTA.
     - ✅ **Footer's other 7 links — DONE (stubbed).** `/about`, `/achievements`,
       `/gallery`, `/announcements`, `/resources`, `/contact`, `/my-events` now
       have minimal real pages (same pattern). **Every header + footer link on
       the site resolves — zero dead nav.** All 7 verified HTTP 200 on the dev
       server. These are placeholders; the real Phase-2 features replace them.
6. **Phase 3:** feedback, leaderboard, ⌘K palette, SEO/JSON-LD, PWA, live wall
   (§13.10), scheduling heatmap. **Phase 4:** launch.
7. **Phase 0 leftovers:** real club taglines/descriptions (still placeholders,
   §18 item 6); Sentry not wired; user's visual sign-off of the home page.
8. **DB advisories (low priority, not bugs):** `btree_gist` installed in
   `public` schema (best-practice: move to `extensions`);
   `get_registration_count(s)` are **intentional** `SECURITY DEFINER` anon-safe
   count RPCs (bare integers, no PII) — advisor flags them but they are by design.

## Stack & infrastructure

- **Next 16.3.1** (App Router, Turbopack) · React 19 · TypeScript strict ·
  Tailwind v4. Dark mode = server-side cookie. Design tokens in
  `src/app/globals.css`; locked design system in `docs/style-guide.html`.
- **Supabase** (Postgres + RLS + Storage), project_ref `svkbleeibbrjryeovvjw`,
  ~32 tables, **RLS on all**. Generated types: `src/lib/database.types.ts`.
- **Auth.js v5** (`next-auth@beta`, works on Next 16) for the ~9 admins:
  invite + TOTP, no emailed passwords. **Students have no login** (roll + email
  + device cookie for attendance).
- **Deploy:** Vercel. `git push origin main` → auto-deploys to production.
  Preview deploys build for branches/PRs. Required prod env: the 3 Supabase
  keys, `NEXTAUTH_SECRET`, `TOTP_ENC_KEY`, `ATTENDANCE_HMAC_SECRET` (all set).
- **Repo:** github.com/sandymandycandy/Cse-ccc (branch `main`).

## Run / test / deploy

```bash
npm run dev        # localhost:3000 (uses .env.local, which points at the LIVE DB)
npm test           # vitest (results, capabilities, datetime, rate-limit, idle, eslint rule) — 47 tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build
git push origin main   # deploy to production
```

- **Dev admin accounts** exist on the live DB — see `scripts/seed-admin.mjs`
  (credentials there / in `.env.local`; not duplicated here). They are
  dev/test accounts — replace with real invited admins before launch.
- **Regenerate DB types:** the Supabase **CLI is not installed**, so
  `npm run types:gen` will **truncate** `database.types.ts` (the `>` redirect
  empties the file before the missing command runs). Use the Supabase **MCP**
  `generate_typescript_types` and write its output to the file instead.

## Gotchas (learned the hard way)

- **Server-action POSTs can't be driven over curl** ("Failed to find Server
  Action"). Verify admin mutations in a real browser, or apply the DB effect
  directly (Supabase MCP) and assert the read path. Route-handler APIs curl fine.
- **The live DB is shared by dev and prod** — a local `npm run dev` writes real
  production data. Migrations applied via the Supabase MCP hit the live DB.
- **Vercel env once held blank placeholders** → prod 500s (`Missing
  NEXT_PUBLIC_SUPABASE_URL`, Auth.js `MissingSecret`). Values are correct now;
  `NEXT_PUBLIC_*` are inlined at build, so changing them needs a fresh build.
- **`AGENTS.md` is auto-rewritten by `next dev`** — don't hand-edit it; put
  durable notes here or in `CLAUDE.md` instead.
