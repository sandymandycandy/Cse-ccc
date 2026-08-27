# Project Status & TODO — CSE Club Council Platform

> **Picking this up cold? Read this whole file first**, then `docs/BUILD_PLAN.md`
> (v2.1, product/engineering spec) and `docs/SECURITY_SPEC.md` as needed.
> Per-feature designs live in `docs/superpowers/specs/` + plans in
> `docs/superpowers/plans/`. **Last updated: 2026-08-27.**

## What this is

A platform for a college **CSE Club Council** — 11 clubs, a 3-layer org
hierarchy, 9 admin roles. Public site (clubs, events, calendar, registration) +
an admin panel (events, approvals, attendance, registrations, results,
announcements) + student attendance via rotating-QR self-scan. **Live in
production** at https://cse-ccc.vercel.app (Vercel, auto-deploys from `main`).

Guiding principle: every phase gate is a **journey someone completes
end-to-end**, not a checklist of components.

---

## 🚦 START HERE — current git/deploy state (2026-08-27)

> ### ✅ CURRENT STATE — `main == origin/main @ 50857aa`, clean (2026-08-27)
> Everything below is **merged to `main` and live in prod** — there are **no unmerged
> feature branches**. Shipped since the member-portal/email blocks below:
> - **Clubs editor + public contact inbox** (`2d025a3`) — self-editable club
>   name/tagline/description (`manage:clubs`) + `/contact` → `contact_messages` inbox
>   (`manage:contact`). Schema-free (no migration). *(the block further down still said
>   "NOT yet merged" — that's now corrected.)*
> - **Mobile-responsive admin nav** (`99fbe7a`) — hamburger drawer + table horizontal
>   scroll affordance in the **admin panel**. ⚠️ The **public site** has NOT had a
>   dedicated mobile-responsiveness pass yet (in progress 2026-08-27).
> - **Members-only attendance roster** (`50857aa`) — Role picker removed from the
>   add/edit member form; `create`+`update` force `role="member"` server-side; Role
>   column dropped from the list. The 2 pre-existing "head" rows were migrated on the
>   live DB. Prod deploy `● Ready`; `/`,`/clubs` → 200, `/admin/attendance/members` →
>   307 (guard). Gate green (typecheck/lint/109 tests/build).
>
> **⚠️ Owed human-only walkthroughs** (server-action POSTs can't be curled; camera/PIN
> can't be driven headless — all shipped ahead of them at the owner's direction):
> 1. **Members roster** — log into `/admin/attendance/members`, confirm the add/edit
>    form has no Role field and a save lands as `member`.
> 2. **Clubs editor** — club-edit save as council + as a club_head (own-club-only).
> 3. **Contact inbox** — mark-handled toggle; faculty sees read-only (no toggle).
> 4. **Member portal** — the club_head→add-member→link→PIN/TOTP→login→scan→reset walk,
>    and the **rotating-QR phone test** (stale screenshot rejected, live scan works,
>    printed card still scans).
> 5. **QR attendance** — real-phone camera test of `/admin/attendance/scan`.
> 6. **Content verticals** — announcements/resources/gallery/achievements CRUD (+ image
>    upload) and §4c event duplicate/cancel — read paths ✅, mutations never executed.
> 7. **Email** — confirm a Gmail login-link email actually lands for a non-owner inbox.

> ### ✅ SHIPPED & LIVE — Member Portal (merged to `main`, deployed to prod 2026-08-26)
> The **member-login portal** (spec + plan `2026-08-25-member-portal*`) is **merged and
> live in production** (`main` @ `a65065c`, https://cse-ccc.vercel.app). All 18 plan
> tasks done; the `feat/member-portal` branch (19 commits) was **fast-forward-merged and
> deleted** (local; it was never pushed as a branch). **Verify gate green: typecheck ✓,
> lint ✓, 91/91 tests ✓, build ✓.**
> - **Prod smoke-tested post-deploy:** `/member/login` + `/member/accept-invite` → 200
>   (public), `/member` (no cookie) → 307→`/member/login` (proxy guard), `/api/member/qr`
>   → 401 (member-session guard), `/m/<bad-token>` → 404 (HMAC tamper guard), `/clubs` →
>   200 (no regression). **Read/redirect/guard paths all confirmed.**
> - **What it is:** a second, isolated auth surface for club members (separate from the
>   9-admin panel). Head generates a one-time login link → member sets a **6-digit PIN +
>   TOTP** → signs in with email+PIN+TOTP → sees their **attendance QR + %/history**.
>   Bespoke signed cookie `__Host-ccc.member` (NOT Auth.js), `requireMember()` guard,
>   `/member/*` guarded in `proxy.ts`. Credentials in service-role-only tables
>   (`club_member_auth`, `member_invites`); email/phone/roll_no kept off the anon grant.
> - **Anti-proxy rotating QR (spec §6a):** the portal shows a **time-boxed** QR that
>   silently refreshes before expiry (head sets the window per session, default 60s);
>   `/api/member/qr` mints a fresh `e.`-prefixed expiring token each poll; the scanner
>   and `/m/[token]` accept **both** the expiring token AND the static printed card.
> - ⚠️ **STILL OWED — two human-only walkthroughs** (mutations + camera can't be driven
>   headless; shipped ahead of them at the owner's direction): (a) the **club_head → add
>   member w/ email → generate link → member PIN/TOTP setup → login → scan →
>   reset-access → club-scope** walk (plan Task 13 Step 2), and (b) the **rotating-QR
>   phone test** — a stale screenshot scanned after the window must be **rejected** while
>   a live on-screen scan works, and a printed static card still scans (plan Task 18 Step
>   3). Code gate + prod guard-paths are green; these exercise the write/camera paths.
> - 📧 **Out-of-repo:** no email yet *delivers* a member their `/member/accept-invite`
>   link — the head copies it manually from the member edit page.
> - ✅ **Migration applied to the live DB** — `20260825120000_member_portal.sql`
>   (member auth + invites tables, `club_members.email/phone`, `qr_ttl_seconds` on
>   sessions, anon-grant lockdown).
> - **Plan:** `docs/superpowers/plans/2026-08-25-member-portal.md` · **Spec:**
>   `docs/superpowers/specs/2026-08-25-member-portal-design.md`

> ### ✅ SHIPPED & LIVE — QR attendance Phase 1 (merged to `main`, deployed to prod 2026-08-25)
> The **club-member QR attendance** system is **merged and live in production**
> (`main` @ `7fe7c01`, deployed to https://cse-ccc.vercel.app). All 12 plan tasks
> done, whole-branch review done (0 Critical; both Important findings fixed), verify
> gate green (**typecheck/lint clean, 78/78 tests, build ✓**). The
> `feat/qr-attendance-phase1` branch was fast-forward-merged and deleted (local +
> remote). SDD ledger (gitignored, local):
> `.superpowers/sdd/2026-08-24-qr-attendance-phase1/progress.md`.
> - **Prod smoke-tested post-deploy:** `/m/<bad-token>` + `/m/%25` → 404 (token +
>   malformed-encoding guards), `/admin/attendance` → 307→login (guard), `/clubs` →
>   200 (no regression). **PII verified on the live anon endpoint:** `club_members?
>   select=roll_no` → 401 permission-denied, `select=name` → 200.
> - **Plan:** `docs/superpowers/plans/2026-08-24-qr-attendance-phase1.md` ·
>   **Spec:** `docs/superpowers/specs/2026-08-24-qr-attendance-design.md`
> - ✅ **Both** Phase-1 DB migrations are applied to the live/shared DB (additive):
>   the schema migration (nullable cols on `club_members` + new
>   `club_attendance_sessions`/`club_attendance` tables) AND
>   `20260825000000_club_members_rollno_privacy.sql` (roll_no locked out of anon).
> - ⚠️ **STILL OWED — a real-phone camera test** of the html5-qrcode scanner at
>   `/admin/attendance/scan` (getUserMedia + live decode — not verifiable headless),
>   plus the browser CRUD/scan walk-through in manual-verification item #8 below.
>   Everything else is verified; this is the one human-only gap.

**All four Phase-2 content verticals are pushed & deployed** — `HEAD ==
origin/main == b33286f` (0 ahead / 0 behind). §4c event duplicate/cancel, the 7
footer stubs, and the announcements / resources / gallery / **achievements**
verticals are all live in prod.

**Still browser-unverified in prod** (deployed, but the mutation was never
executed by a human — POSTs can't be curled): §4c duplicate/cancel, announcements
create/update, resources CRUD, gallery CRUD, and **achievements CRUD** (incl.
image upload). Read paths for all are ✅.

### ✅ Manual-verification checklist (do these in a browser before trusting in prod)
Server-action POSTs can't be curled (see Gotchas), so these were verified by
build + render + schema-check but **not by executing the mutation**:
1. **Event edit** (§4a): log in → Events → Edit → change time → Save → row updates, approval status unchanged.
2. **Event duplicate/cancel** (§4c): from an event's Edit page → Duplicate as draft (lands on the copy) / Cancel event (row → cancelled, registrants emailed).
3. **TOTP enrollment** (§2): log in as the **bootstrap Tech Head** → you're forced to `/admin/setup-totp` → scan + enter code → save recovery codes → re-login with 2FA. (While logged in you can also confirm the **2-min idle timeout**: idle 2 min → next click bounces to login.)
4. **Announcements** (P2): `/admin/announcements` → New → write Markdown + upload an image + Publish → confirm it appears at `/announcements` and the detail renders.
5. **Resources** (P2): `/admin/resources` → Add resource → title + `https://…` link + type (+ club, if org-wide) → Save → confirm it appears grouped at `/resources`; Edit changes it; Delete removes it. As a **club_head**, confirm you only see/manage your own club's rows and get no club picker.
6. **Gallery** (P2): `/admin/gallery` → Add photo → upload an image + caption + sort (+ club, if org-wide) → Save → confirm it shows in the grid at `/gallery`; Edit (replace the image — old object should be gone) and Delete work. As a **club_head/vice_head**, confirm you see Gallery in the nav and manage only your own club's photos.
7. **Achievements** (P2): `/admin/achievements` → Add → title + Markdown description + date + optional image (+ club, if org-wide) → Save → confirm it renders at `/achievements` (markdown formatted, date + club shown); Edit/replace-image/Delete work. Club scope same as Gallery.
8. **Club-member QR attendance** (LIVE in prod — do this walk-through to confirm):
   `/admin/attendance` → add members (`/admin/attendance/members`) → **open a
   session** → on a phone open a member's `/m/<token>` QR (or a printed card) →
   `/admin/attendance/scan` scans it → dashboard present-count increments (live,
   3s poll) → the member's `/m/<token>` shows the new mark + %. As a **faculty
   advisor** (read grant), confirm the dashboard + live view are **viewable** but
   Scan/Close/Open-session controls are hidden. ⚠️ The **camera** step needs a
   real phone (getUserMedia can't be driven headless).

### 📧 Email delivery — NOW BUILT IN-REPO (was the "out-of-repo processor")
**Superseded.** There is no longer any external processor to maintain: the delivery
half now lives in the repo (branch `feat/email-delivery`, see START HERE + What's
DONE). `enqueueEmail` sends inline via Resend, a `CRON_SECRET`-gated
`/api/cron/send-email` route is the backstop, and a **single generic branded
renderer** handles every template (`event_*`, `registration_received`,
`member_login_link`) — so no per-template work is owed. Remaining email work is just
**(a) verify a sending domain** (until then, test mode only reaches the Resend account
owner) and **(b) set `RESEND_API_KEY`/`EMAIL_FROM`/`CRON_SECRET` in Vercel prod env**.

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

### Club-member QR attendance (Phase 1) — built 2026-08-24/25 *(deployed 2026-08-25)*
A club-roster attendance system **distinct from the event self-scan flow** (§13.8).
- **Members** — admin CRUD at `/admin/attendance/members`, gated on the new
  **`manage:members`** capability (president/vp/tech_head/social_media = all clubs,
  **club_head/vice_head = own**, faculty = read). `roll_no` is admin-only PII (card
  printing/disambiguation, read server-side via service-role only).
- **Per-member QR** — HMAC-signed member token (`memberToken`/`verifyMemberToken`
  in `attendance.ts`, constant-time verify, domain-separated `member:v1|`);
  printable QR card via `qrDataUrl`.
- **Sessions** — open/close with a one-open-per-club guard; scan a member's QR
  (`POST /api/admin/attendance/club/scan`, idempotent via `UNIQUE(session_id,
  member_id)` → 23505 → "already", club scope read fresh from the DB row) → live
  dashboard (`GET /api/admin/attendance/club/feed`, 3s poll) at `/admin/attendance`
  + `/admin/attendance/sessions/[id]`.
- **Camera scanner** — html5-qrcode at `/admin/attendance/scan` (⚠️ owes a
  real-phone test — can't be driven headless).
- **Member self-view** — no-login `/m/[token]` (HMAC token → `notFound` on
  tamper/malformed; `noindex`; service-role read only).
- **Faculty/council read-only** — `canViewClub` lets `read`/`all` grants view any
  club's dashboard + live view while every mutation stays behind `canManage`.
- **PII lockdown** — migration `20260825000000_club_members_rollno_privacy.sql`
  (**applied + verified on the live DB**) replaces the table-wide anon SELECT grant
  on `club_members` with a column-level grant excluding `roll_no`.
- **Attendance math** — pure `src/lib/admin/attendance-math.ts`
  (`summarizeAttendance`, unit-tested) shared by the dashboard roster and the
  member self-view so they can't disagree; `attended ≤ eligible` always
  (eligible = closed sessions opened on/after the member joined).
- 78 vitest tests (added `canViewClub`, `summarizeAttendance`, member-token, qr).
- **Out-of-repo:** emailing members their `/m/[token]` link needs a new email
  template (Phase-2 flavor; not built).

### Member Portal (member login) — built + deployed 2026-08-26 *(merged to `main`, LIVE)*
A member-facing login on the public site, **isolated from the 9-admin panel**. See the
✅ START HERE block above for the full state. In short:
- **Onboarding + login** — head-generated one-time link (`member_invites`, mirrors
  admin invites) → member sets a **6-digit PIN + TOTP** (`club_member_auth`,
  service-role only) → signs in with email + PIN + TOTP (rate-limited, 5-fail/15-min
  lockout). **Members never touch Auth.js** — a bespoke HMAC-signed cookie
  (`__Host-ccc.member`, domain-separated) + `requireMember()` re-validates the DB
  epoch + active + activated on every guarded page; `/member/*` guarded in `proxy.ts`.
- **Portal** — `/member` shows the member's attendance **QR + %/history**; head-side
  **Login access** block on the member edit page (generate link / **reset access**,
  own-club scoped, bumps epoch to kill live sessions).
- **Anti-proxy rotating QR (§6a)** — the portal QR is **time-boxed** (head sets the
  window per session, default 60s); it silently refreshes before expiry via
  `/api/member/qr` (fresh `e.`-prefixed expiring token per poll). The scanner and
  `/m/[token]` accept **both** the expiring token and the static printed card.
- **13 new unit tests** (member session signing, lockout math, expiring token) → 91
  total. Pure/security-critical pieces are unit-tested; DB-backed layers (invites,
  auth, guards) are typecheck + walkthrough-verified, like the admin equivalents.
- **Owes:** two human-only walkthroughs (see START HERE) — write/camera paths not yet
  human-exercised, though the code gate + prod guard-paths are green.
  ~~**Out-of-repo:** an email to deliver the login link~~ → **now built** (see below).

### Email delivery — built + deployed 2026-08-26 *(merged to `main`, LIVE — Gmail transport)*
Turns the dormant `email_log` queue into a real sender. Before this, **0 of 8 queued
emails had ever sent**; nothing delivered mail at all. Now merged + live in prod
(`main` @ `da5a048`). **Active transport = Gmail SMTP** (free, no domain, reaches ANY
recipient ~500/day); Resend is a built-in fallback.
- **`src/lib/email/`** — `transport.ts` (`sendEmail()` **dispatcher**: uses Gmail when
  `GMAIL_USER`/`GMAIL_APP_PASSWORD` are set, else Resend, else no-op fail), `gmail.ts`
  (nodemailer SMTP, app password, From = the Gmail address), `resend.ts` (HTTP API, no
  SDK — kept as fallback), `templates.ts` (pure, **6 unit tests**: branded wrapper +
  auto action-button from the payload's `inviteUrl`/`confirmUrl`/`url`, HTML-escaped —
  XSS-guarded), `send.ts` (`deliverEmail(row)` → `sendEmail` + flips `status`;
  `deliverPending(n)` drains). All read `process.env` directly, **never `@/lib/env`**
  (dormant validate-everything tripwire).
- **Immediate + backstop** — `enqueueEmail` keeps its signature but attempts a
  best-effort **inline send** (try/catch; a failure leaves the row `pending`). The
  `CRON_SECRET`-gated **`/api/cron/send-email`** route (daily `vercel.json` cron) is the
  retry/backstop. Verified in prod: 200 with the bearer secret, 401 without.
- **Member login link auto-emails** — `generateMemberLinkAction` /
  `resetMemberAccessAction` enqueue `member_login_link`; the URL still shows on screen
  as a copy fallback. (Resolves the member-portal "deliver the link" gap above.)
- **97 tests** (91 + 6). Gate green (typecheck/lint/test/build). Verified end-to-end:
  a live send flipped a row to `sent` (Resend, test mode) before the Gmail swap.
- **Prod env set:** `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CRON_SECRET` (+ Resend vars).
- **Owes:** an **in-app confirmation** that a Gmail email actually lands for a
  non-owner recipient (agent tools are sandbox-blocked from sending/DB-writes, so this
  is a human step — generate a member login link in the admin UI and check the inbox).
  Deliverability note: Gmail-as-sender may spam-fold at first (no domain SPF/DKIM); a
  verified domain later is the upgrade. **Spec/plan:**
  `docs/superpowers/{specs,plans}/2026-08-26-email-delivery*`.

### Clubs editor + Contact inbox — built 2026-08-26 *(merged to `main` @ `2d025a3`, LIVE)*
Two small Phase-2 verticals, both **schema-free** (`clubs` + `contact_messages`
tables already existed; all access is service-role so RLS is bypassed — **no
migration**). Verify gate green (**typecheck/lint clean, 109/109 tests, build ✓**).
- **Clubs editor** — `/admin/clubs` (list) + `/admin/clubs/[id]/edit`. Makes a
  club's **name / tagline / description** self-editable (closes the Phase-0
  placeholder gap). New capability **`manage:clubs`** (all: pres/vp/tech; **own:
  club_head/vice_head**; read: faculty) — a head edits only their own club,
  council edits any. NOT editable here: slug/category/colour/is_active (structural)
  — and no create/delete (the 11 clubs are fixed). `updateClubAction` (Zod +
  `canManage` guard + service-role update + `writeAudit`). Reuses the resources
  vertical's shape: `listClubsForAdmin`/`getClubForEdit` in `src/lib/admin/clubs.ts`,
  `ClubForm` client component.
- **Contact inbox** — public `/contact` placeholder replaced with a real
  `ContactForm` → **`POST /api/contact`** (mirrors the registrations route: 100 KB
  cap, Zod `.strict()` + `website` honeypot, new `checkContactLimits` per-IP+email,
  Turnstile-ready, **service-role insert** into `contact_messages`). Admin side:
  new **`manage:contact`** capability (council-wide, no club scope: all for
  pres/vp/tech/social_media, read faculty); `/admin/contact` inbox (unhandled
  highlighted) + `/admin/contact/[id]` detail (full message, `mailto:` reply,
  **mark-handled** toggle via `setContactHandledAction` on `handled_at`). No email
  fire on submit (owner's call — inbox only).
- **Tests (+12 → 109):** `manage:clubs`/`manage:contact` grants, `ContactSchema`
  (honeypot/`.strict()`/required), `checkContactLimits`.
- **Verified end-to-end:** `POST /api/contact` curl-smoked live — rejection paths
  (bad body/honeypot/short/unknown-key) → 400 no-write; one valid insert → 200,
  row landed with correct columns, **deleted after** (`zzz-verify-tmp`). Public
  `/contact` 200, `/clubs` 200 (no regression), `/admin/clubs` + `/admin/contact`
  (no cookie) → 307→login.
- **Owes (human-only, server-action POSTs can't be curled):** browser walk of
  the **club edit save** (as council + as a club_head confirming own-club-only)
  and the **mark-handled toggle** (+ faculty sees read-only, no toggle button).

### Phase 2 started 2026-08-24
- **Achievements** — 4th vertical *(deployed)*. Public `/achievements` list
  (optional image + title + date + **safe-markdown** description + club label,
  ordered by `happened_on` desc then newest); admin CRUD at `/admin/achievements`.
  Club-scoped via `manage:content` (same roles as gallery). The cleanest blend of
  the earlier verticals: markdown body (announcements' `renderMarkdown`) +
  optional image (`image-upload` → new `achievements` bucket) + club scope
  (`club-scope`) + an optional `happened_on` date. New date formatter
  `istDateMedium` ("21 Aug 2026", safe for plain YYYY-MM-DD). Migration
  `20260824020000_achievements_bucket.sql` (already applied to the live DB).
- **Gallery** — 3rd vertical *(deployed)*. Responsive image grid at public
  `/gallery` (image + caption + club label, ordered by `sort` then newest);
  admin CRUD at `/admin/gallery` (thumbnail grid). Club-scoped via
  `manage:content` (president/vp/tech/social_media = all, **club_head/vice_head =
  own**, faculty = read) — so club heads DO see Gallery in the nav (unlike
  Announcements, which is council-only). New public Storage bucket `gallery`
  (migration `20260824010000_gallery_bucket.sql`, already applied to the live DB
  via MCP). Image required on create, optional replace on edit; old object
  removed on replace/delete; orphan cleanup if the row insert fails.
  - **Reusables extracted here (use for achievements next):**
    `src/lib/admin/image-upload.ts` (`handleImageUpload({bucket,field})` — the
    announcements action now uses it too), `src/lib/admin/club-scope.ts`
    (`resolveOwningClub`/`canCreateForCapability` — resources now uses it too),
    and `src/lib/admin/clubs.ts` (`listClubsBrief`, moved out of resources).
- **Resources** — 2nd vertical *(deployed)*. Titled links (Drive/doc/template)
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

## 🔨 Active owner requests (batch opened 2026-08-27) — build these first

Direct owner asks from the 2026-08-27 admin-panel walkthrough. **All five
shipped to prod.** Each shipped on its own branch → merge to `main` → prod, same
flow as always.

- **A. Form placeholders** — ✅ **SHIPPED** (`927b51c`). Every text box has a
  placeholder: email → `vtuxxxxx@veltech.edu.in`, roll → `vtuxxxxx`, contextual
  hints elsewhere (public + admin).
- **B. Clubs CRUD** — ✅ **SHIPPED** (`6f1fd51`). Create new clubs
  (`/admin/clubs/new`, council-only) + edit ALL fields (slug/category/colour/
  is_active) beyond profile text; structural fields gated to grant=all, heads
  keep profile-only. No delete. New `src/lib/validation/club.ts` + 14 tests.
- **C. Member roster — roll + phone mandatory** — ✅ **SHIPPED** (`a6025bd`).
  `MemberSchema` requires `rollNo`/`phone` (min 1); labels + `required` updated;
  insert/update always set them.
- **D. Events — typed venue + notify-on-any-change + cover photo** — ✅ **SHIPPED**
  (`f04b134`). (1) venue is a typed `events.venue_text` field (clash-check via
  `ilike`); (2) confirmed registrants emailed on ANY material change (title/desc/
  time/venue/capacity) with a click-through link; (3) cover photo via the
  existing `poster_path` column + new `event-posters` bucket, shown on the event
  page. **Migration `20260827000000_event_venue_text_and_poster.sql` applied to
  the live DB via MCP** (venue_text column + backfill + event-posters bucket).
  Prod smoke green: `/events`,`/events/upcoming`,`/events/past`,`/calendar` → 200
  (all now SELECT venue_text). `database.types.ts` carries the hand-added
  `venue_text` (matches the live schema; verified by build + live reads).
- **E. Mobile-responsive pass** — ✅ **DONE / baseline shipped** (`3d4c5b0`). The
  "paper" system was already fluid (clamp() type, scaling `--pad`, grids stacking
  at 899/599/479, scrolling tables/calendars, 44px buttons; no fixed-width
  overflow found). Shipped the real gaps: `img { max-width:100% }`, 16px form
  controls on phones (kills iOS zoom-on-focus), `.btn-sm` 44px tap target. Deeper
  *visual* polish deferred by owner — revisit with phone-eyes (or Playwright)
  later.
- **Pending owner decision (not a build yet):** the member **static printable QR
  card** on the member edit page — keep / remove / move behind a "Print card"
  button. It's the fallback for members who don't log in (vs the portal's rotating
  QR). Awaiting the owner's call.

> ⚠️ **Human-only browser verification owed** for this batch (server-action POSTs
> can't be curled): clubs create + edit-all-fields save; member add with the new
> required roll/phone; and — once the migration lands and events deploys — an
> event create/edit with a typed venue + poster upload + the notify-on-change email.

---

## TODO — remaining work (ordered; pick the top unblocked item)

1. **Browser-verify the shipped content verticals.** Resources + gallery +
   achievements are pushed & live. Run their items on the manual-verification
   checklist in a browser (CRUD POSTs can't be curled), and close out the older
   browser-unverified mutations (§4c, announcements) too.

2. **Phase 2 — remaining verticals** (Storage, safe-markdown, `isSafeHttpUrl`,
   `image-upload`, `club-scope`, `clubs` foundations all exist now, so these are
   fast). The 4 content verticals (announcements/resources/gallery/achievements)
   are done. Remaining, roughly by size:
   - ~~**`/contact` inbox**~~ — ✅ **DONE** (see What's DONE below).
   - ~~**Clubs editor**~~ (name/tagline/description self-edit) — ✅ **DONE** (below).
   - **recruitment drives + `/join` form** (`recruitment_drives`, `join_requests`
     tables exist), **`/my-events`** (needs a student-lookup model — no student
     login today), **waitlist auto-promote** (server/cron), **reminder cron**,
     **`.ics` feeds**, **venue booking**, **co-hosted events**, **email prefs**,
     **`/about` + `/team` org chart**, **schedules**.
   - NOTE: the remaining stub pages (§5) are placeholders these real features
     replace — `/gallery`, `/resources`, `/achievements` are now REAL.
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

7. **Phase 0 leftovers:** ~~real club taglines/descriptions (still
   placeholders)~~ — now **self-editable** via the clubs editor (below); the
   real copy still needs to be *written* by each club. Sentry not wired; owner's
   visual sign-off of the home page.

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
npm test           # vitest — 109 tests (results, capabilities, datetime, rate-limit, idle, markdown, url, email, contact, member, eslint rule)
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
