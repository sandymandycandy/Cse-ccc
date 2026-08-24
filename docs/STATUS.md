# Project Status & TODO — CSE Club Council Platform

> **Picking this up cold? Read this whole file first**, then `docs/BUILD_PLAN.md`
> (v2.1, product/engineering spec) and `docs/SECURITY_SPEC.md` as needed.
> Per-feature designs live in `docs/superpowers/specs/` + plans in
> `docs/superpowers/plans/`. **Last updated: 2026-08-24.**

## What this is

A platform for a college **CSE Club Council** — 11 clubs, a 3-layer org
hierarchy, 9 admin roles. Public site (clubs, events, calendar, registration) +
an admin panel (events, approvals, attendance, registrations, results,
announcements) + student attendance via rotating-QR self-scan. **Live in
production** at https://cse-ccc.vercel.app (Vercel, auto-deploys from `main`).

Guiding principle: every phase gate is a **journey someone completes
end-to-end**, not a checklist of components.

---

## 🚦 START HERE — current git/deploy state (2026-08-24)

**Everything through announcements is pushed & deployed** — `HEAD ==
origin/main == ab82a38` (0 ahead / 0 behind). §4c event duplicate/cancel, the 7
footer stubs, and the announcements vertical are all live in prod.

**Uncommitted/unpushed right now:** the **`/resources` vertical** (see Phase 2
below). Green on typecheck / lint / **61 tests** / build; public read path
browser-verified; admin **create/update/delete POSTs still need a browser pass**
(server actions can't be curled — see Gotchas).

**Still browser-unverified in prod** (deployed, but the mutation was never
executed by a human — POSTs can't be curled): §4c duplicate/cancel, announcements
create/update, and now resources create/update/delete. Read paths for all are ✅.

### ✅ Manual-verification checklist (do these in a browser before trusting in prod)
Server-action POSTs can't be curled (see Gotchas), so these were verified by
build + render + schema-check but **not by executing the mutation**:
1. **Event edit** (§4a): log in → Events → Edit → change time → Save → row updates, approval status unchanged.
2. **Event duplicate/cancel** (§4c): from an event's Edit page → Duplicate as draft (lands on the copy) / Cancel event (row → cancelled, registrants emailed).
3. **TOTP enrollment** (§2): log in as the **bootstrap Tech Head** → you're forced to `/admin/setup-totp` → scan + enter code → save recovery codes → re-login with 2FA. (While logged in you can also confirm the **2-min idle timeout**: idle 2 min → next click bounces to login.)
4. **Announcements** (P2): `/admin/announcements` → New → write Markdown + upload an image + Publish → confirm it appears at `/announcements` and the detail renders.
5. **Resources** (P2): `/admin/resources` → Add resource → title + `https://…` link + type (+ club, if org-wide) → Save → confirm it appears grouped at `/resources`; Edit changes it; Delete removes it. As a **club_head**, confirm you only see/manage your own club's rows and get no club picker.

### 📧 Out-of-repo follow-up (email processor)
The external processor that renders `event_*` templates must learn **3 new
templates**, or their queued mail won't send:
`event_updated` (event-edit time/venue change), `event_cancelled` (event cancel),
and there's an existing announcement flow that does **not** email (no template
needed there).

---

## What's DONE

### Phase 0 ✅ (deployed) — design system ("paper"), public shell, home.

### Phase 1 ✅ (deployed) — the full journey works live:
clubs → events → **register → email-confirm → attend (QR self-scan) →
results/standings**. Includes: clubs directory + profiles; events hub
(upcoming/past/detail); registration (Zod + rate-limit + honeypot +
Turnstile-ready) → email confirm → device-bound QR attendance; clash + blackout
checks; approval workflow; calendar (month/week/day/agenda); event **results &
rounds** (§13.9 — ordered rounds, per-student score/rank/advanced, draft→publish
with per-column visibility, score-gated advancement); admin panel (login,
dashboard, events list/create, approvals, attendance, registrations + CSV,
results editor); Auth.js v5 + capabilities across 9 roles.

### Phase 1 additions built 2026-08-23 (⚠️ mostly UNPUSHED — see START HERE)
- **§4a Event edit** — `/admin/events/[id]/edit`; `updateEventAction` mirrors
  create, **never touches approval status**, clash-check excludes own row, emails
  registrants (`event_updated`) on a time/venue change. `getEventForEdit`
  (fail-closed for club-scoped admins), reusable `EventForm`, datetime helpers
  (`istLocalToUTC`/`istLocalInput`/`istNumericDate`). *(pushed)*
- **§4b Audit viewer** — `/admin/audit`, `view:audit`-gated, 100 newest, actor
  names + change summaries. *(pushed — last deployed commit)*
- **§4c Event duplicate + cancel** — on the edit page. Duplicate = draft "Copy
  of…" (nothing else copied). Cancel = status→cancelled, `cancel:events`-gated,
  emails registrants (`event_cancelled`). Reschedule = just edit the time.
  *(unpushed)*
- **§2 Auth hardening** *(pushed except where noted)*:
  - **ESLint guard rule** `local/admin-route-requires-guard` — build fails if an
    `app/api/admin/**/route.ts` handler lacks `requireSession`/`requireRole`/
    `requireCapability`. *(pushed)*
  - **Login lockout** — `checkLoginLimits` = 3 attempts / 1-min lockout, per-IP
    and per-account; generic failure message unchanged. *(pushed)*
  - **2-min idle timeout** — `src/proxy.ts` + `src/lib/auth/idle.ts`; signed
    httpOnly `idle` cookie, check-then-slide; on expiry clears the session cookie
    too. **Hardened against a stripped-clock bypass** (a missing clock falls back
    to the JWT `iat`; fails open on decode error). *(pushed)*
  - **Mandatory-TOTP** — `roleRequiresTotp` (`tech_head`, `president`); no factor
    → `mustSetupTotp` JWT flag → proxy confines to `/admin/setup-totp` (forced
    enrollment, never lockout; bumps `session_epoch` after). *(pushed)*
- **§3 Next 16** — renamed `middleware.ts`→`proxy.ts` (+ `middleware()`→`proxy()`).
  *(pushed)*
- **§5 Dead nav links** — all 9 (`/join`, `/team` + 7 footer routes) now have
  minimal stub pages. **Zero dead nav links site-wide.** *(join/team pushed; the
  7 footer stubs unpushed)*

### Phase 2 started 2026-08-24
- **Resources** — 2nd vertical *(UNPUSHED)*. Titled links (Drive/doc/template)
  on a public `/resources` page, grouped **council-wide first, then per club**.
  Admin CRUD at `/admin/resources` (`manage:resources`: docs_head/president/vp/
  tech = all, **club_head = own**, faculty = read). No draft state — a row is
  public the moment it's saved (RLS = anon read; all writes via service-role,
  like announcements). Club scope resolved server-side: org-wide managers pick a
  club or "council-wide"; a club_head's rows are **pinned to their own club** (no
  picker, submitted club ignored). **Reusable bits born here:**
  `src/lib/url.ts` (`isSafeHttpUrl`/`isSafeLinkHref` — now also backs the markdown
  link check; use for gallery/achievements) and `src/lib/resources.ts` (pure,
  client-safe kind labels). The `resources` table + `resource_kind` enum already
  existed; **no migration needed**.
- **Announcements + rich text + image** — first Phase-2 vertical *(deployed)*. Council-wide
  (`manage:content`, org-wide roles only), draft/publish, public
  `/announcements` feed + `/announcements/[slug]` detail (replaced the stub),
  admin CRUD `/admin/announcements`.
  - **Safe rich text:** zero-dependency Markdown renderer `src/lib/markdown.tsx`
    — parses an allowlisted subset straight to React elements (no HTML string, so
    the SECURITY_SPEC §5 `dangerouslySetInnerHTML` ban holds natively; link hrefs
    scheme-checked). 9-case test incl. XSS. **Reuse this for gallery/achievements
    /any future rich text.**
  - **Images:** public Supabase Storage bucket `announcements`, uploads only via
    the service-role action (least privilege; ≤5 MB, image mimes only). **Reuse
    this Storage pattern for gallery/media.** Migration
    `supabase/migrations/20260824000000_announcements_image.sql`.

---

## TODO — remaining work (ordered; pick the top unblocked item)

1. **PUSH + browser-verify `/resources`.** Do the resources item on the
   manual-verification checklist above (in a browser — the CRUD POSTs can't be
   curled); then `git commit` + `git push origin main`. While there, close out
   the older browser-unverified mutations (§4c, announcements) too.

2. **Phase 2 — next verticals** (Storage + safe-markdown + `isSafeHttpUrl`
   foundations now exist, so these are faster). Suggested order:
   - **Gallery / media** — admin uploads images to a Storage bucket (reuse the
     announcements pattern), public `/gallery`. Table `gallery` exists.
   - **`/achievements`** — reuse safe-markdown + Storage. Table `achievements`
     exists (has `image_path`).
   - **`/contact` inbox**, **recruitment drives + `/join` form**, **`/my-events`**
     (needs a student-lookup model — no student login today), **waitlist
     auto-promote** (server/cron), **reminder cron**, **`.ics` feeds**, **venue
     booking**, **co-hosted events**, **email prefs**, **`/about` + `/team` org
     chart**, **schedules**.
   - NOTE: the 9 stub pages (§5) are placeholders these real features replace.
   - **Phase-2 exit gate:** a club head runs their club end-to-end without
     messaging anyone; Docs Head updates a Drive link without a deploy.

3. **Certificates (§12.6) + `/verify/:serial`** — ⛔ **PARKED per owner ("keep it
   locked"), and also blocked on org assets** (club logos + a faculty signature
   image for the PDF). Logic is unblocked (winner certs ← final-round standings;
   participation ← `attended` rows; `certificates` table + HMAC serials exist),
   but **do not start without the owner unlocking it.**

4. **Remaining Phase-1 admin surfaces (unbuilt):** `/admin/scan` kiosk (needs a
   camera — hard to verify headless); real `/admin/certificates` (see #3).

5. **CSRF double-submit token** — ⏸️ **assessed, deferred.** Server actions carry
   framework CSRF protection, `requireSameOrigin` is the Origin backstop, the one
   admin API route is a GET, public POSTs are session-less. Build only if a new
   non-action mutating admin route appears.

6. **Phase 3:** feedback + ratings, leaderboard, ⌘K search, weekly digest,
   SEO/JSON-LD/sitemap/OG, PWA + offline calendar, analytics, scheduling heatmap,
   live wall (§13.10). **Phase 4:** launch (domain, secrets rotation, PITR, real
   accounts, training doc, security pass).

7. **Phase 0 leftovers:** real club taglines/descriptions (still placeholders);
   Sentry not wired; owner's visual sign-off of the home page.

8. **DB advisories (low priority, by-design):** `btree_gist` in `public` (could
   move to `extensions`); `get_registration_count(s)` are intentional anon-safe
   `SECURITY DEFINER` count RPCs.

---

## Stack & infrastructure

- **Next 16.3.1** (App Router, Turbopack) · React 19 · TypeScript strict ·
  Tailwind v4. Dark mode = server-side cookie. Tokens in `src/app/globals.css`;
  locked design system in `docs/style-guide.html`.
- **Supabase** (Postgres + RLS + Storage), project_ref `svkbleeibbrjryeovvjw`,
  **RLS on all tables**. Generated types: `src/lib/database.types.ts`. Storage
  buckets: `announcements` (public).
- **Auth.js v5** (`next-auth@beta`) for ~9 admins: invite + TOTP, no emailed
  passwords. **Students have no login** (roll + email + device cookie for
  attendance). Session = JWT in httpOnly cookie; `session_epoch` revokes.
- **Deploy:** Vercel. `git push origin main` → auto-deploys to production. Req.
  prod env: 3 Supabase keys, `NEXTAUTH_SECRET`, `TOTP_ENC_KEY`,
  `ATTENDANCE_HMAC_SECRET` (all set).
- **Repo:** github.com/sandymandycandy/Cse-ccc (branch `main`).

## Run / test / deploy

```bash
npm run dev        # localhost:3000 (uses .env.local → the LIVE DB)
npm test           # vitest — 61 tests (results, capabilities, datetime, rate-limit, idle, markdown, url, eslint rule)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # production build
git push origin main   # deploy to production
```

- **Dev admin accounts** exist on the live DB — see `scripts/seed-admin.mjs` /
  `.env.local`. Dev/test only; replace with real invited admins before launch.
- **Regenerate DB types:** the Supabase **CLI is not installed**, so
  `npm run types:gen` will **truncate** `database.types.ts`. Instead use the
  Supabase **MCP** `generate_typescript_types` and write its output to the file.
- **Verifying admin flows headless:** you can mint a valid session JWE with `jose`
  + `NEXTAUTH_SECRET` (salt = cookie name `ccc.session`, HKDF-SHA256, enc
  `A256CBC-HS512`) and drive read/redirect paths with curl. This session-forging
  trick verified idle-timeout, mandatory-TOTP, and page authz this session. It
  does **not** work for server-action POSTs (see Gotchas).

## Gotchas (learned the hard way)

- **Server-action POSTs can't be driven over curl** ("Failed to find Server
  Action"). Verify admin mutations in a real browser, or apply the DB effect
  directly (Supabase MCP) and assert the read path. Route-handler APIs curl fine.
- **The live DB is shared by dev and prod** — a local `npm run dev` writes real
  production data; MCP migrations hit the live DB. When seeding test rows to
  verify, delete them after (this session seeded + deleted `zzz-verify-tmp`).
- **Vercel env once held blank placeholders** → prod 500s. Values are correct
  now; `NEXT_PUBLIC_*` are inlined at build, so changing them needs a fresh build.
- **`AGENTS.md` is auto-rewritten by `next dev`** — don't hand-edit it; put
  durable notes here or in `CLAUDE.md`.
- **`dangerouslySetInnerHTML` is ESLint-banned** (§5). For rich text, reuse
  `src/lib/markdown.tsx` (renders to React elements, never an HTML string).
