# Project Status & TODO — CSE Club Council Platform

> **For any agent/developer picking this up:** read this first, then
> `docs/BUILD_PLAN.md` (v2.1, the product/engineering spec) and
> `docs/SECURITY_SPEC.md`. Per-feature designs live in
> `docs/superpowers/specs/` and their plans in `docs/superpowers/plans/`.
> Last updated: 2026-08-22.

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

## TODO — remaining work (ordered)

1. **Certificates (§12.6) + `/verify/:serial`** — ⛔ **PARKED, blocked on assets
   the org must provide: club logos + a faculty signature image** for the PDF.
   The *logic* is unblocked: winner certs consume final-round standings
   (§13.9 data is ready), participation certs consume `attended` rows. A
   placeholder screen holds the slot at `/admin/certificates`. Tables
   (`certificates`) + HMAC serials already exist. Build issuance + verify now,
   PDF rendering when assets arrive.
2. **Auth/security follow-ups** (all unblocked): CSRF double-submit token
   (Origin check already exists via `sameOrigin`); 30-min idle session expiry
   (only 8h absolute today); enforce **mandatory-TOTP** for `tech_head` /
   `president` at login (the seeded bootstrap Tech Head has no TOTP); an ESLint
   rule that fails the build if an `app/api/admin/*` handler lacks a `require*`
   guard call.
3. **Next 16 deprecation:** rename `src/middleware.ts` → `src/proxy.ts`
   (build warns "middleware is deprecated, use proxy"). Non-blocking.
4. **Remaining Phase 1 admin surfaces:**
   - **4a. Event edit** — ⭐ **designed & ready to build (bounded).** Approvals
     exist but an event can't be edited yet. Agreed design:
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
   - event **duplicate** and **cancel / reschedule** (still unbuilt);
     `/admin/scan` kiosk; `/admin/audit` log viewer; real `/admin/certificates`;
     public `/verify`.
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
     - **Agreed fix for `/join` + `/team`:** ship minimal real stub pages (match
       the `.section` / `.eyebrow` / `.lead` conventions, e.g. `src/app/clubs/
       page.tsx`; `ButtonLink` is `@/components/ui/Button`) so header, footer,
       and the homepage CTAs all resolve — `/join` = "how to join, browse the
       clubs", `/team` = "the council, roster coming". Preferred over hiding the
       links because `/join` is a load-bearing CTA.
     - **Footer's other 7 dead links** are a separate decision: prune them (guts
       two footer columns) vs. stub them as they're built out in Phase 2. Leave
       as-is until those pages land, or hide per-link.
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
npm test           # vitest unit tests (results logic, capabilities)
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
