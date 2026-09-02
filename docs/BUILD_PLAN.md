# CSE Club Council Platform — Complete Build Plan

**Prepared for:** Sandy · **Plan version:** 2.1 · **Date:** 20 August 2026
**Reconciles:** `CSE_Council_PRD_v2.md` · `CSE_Club_Council_PRD.md` v1.1 · `CSE Club Council.html` (design reference)
**v2.1 adds:** attendance sessions with rotating-QR self-scan and one-phone-per-student device binding (§13.8) · event results & rounds (§13.9) · live wall / fest display (§13.10).

---

## Contents

1. Decisions locked
2. What v1.1 restored · what v1 never finished
3. People, roles and permissions
4. Design system
5. **The calendar** — full specification
6. **The time model** — a correction both PRDs need
7. Sitemap
8. Data model
9. Event lifecycle
10. Admin dashboard
11. Email — 14 templates
12. Security
13. Feature set — complete
14. Cron jobs
15. Environment configuration
16. Testing strategy
17. Phases and timeline
18. What I need from you
19. Definition of done
20. Risks

---

## 1. Decisions locked

| Decision | Choice | Consequence |
|---|---|---|
| Stack | Next.js 15 (App Router) + Supabase + Vercel | Managed Postgres with RLS, free tier covers this scale, PITR backups |
| Language | TypeScript strict · types **generated** from Supabase | v1 hand-wrote types; CI now fails on drift |
| Styling | Tailwind v4 on a single `tokens.css` | Re-theme is one file |
| Delivery | Phased milestones with a gate at each | You approve before the next phase is built |
| Student identity | Roll no + email, no login | Lowest friction; compensating controls in §12.4 |
| Extras | All four packs | Sequenced so none delay the MVP |
| Visual direction | Warm editorial "paper" | Replaces v1's brutalist styling |
| v1 carry-over | Fresh start, no migration | Clean schema; seed via CSV import |
| Media hosting | Supabase Storage (not Cloudinary) | One vendor, RLS on buckets, signed URLs, `sharp` on upload |
| Calendar | Custom-built (not FullCalendar.js) | See §5 — the density requirements rule out stock styling |
| Icons | Lucide React | Carried from v1; stroke weight suits the design |
| Timezone | Asia/Kolkata, stored as `timestamptz` | See §6 |

---

## 2. What v1.1 restored · what v1 never finished

### 2.1 Restored (v2 had dropped these)

Documentation Head and Social Media Head roles · Vice President as distinct · **winner certificates** as a type · recruitment drives · `/resources` with admin-editable Drive links · email templates for "date request → Events Head" and "new admin account" · separate `/events/upcoming` and `/events/past` routes · `/admin/certificates` and `/admin/email-log` as first-class screens · canonical club names and categories · the three-layer org hierarchy.

### 2.2 The completion pattern in v1 — the most useful thing in that document

| Shipped in v1 | Never shipped in v1 |
|---|---|
| Clash detection backend | The clash warning UI, and the approve/reject flow |
| Certificate PDF generation | The email that delivers certificates to students |
| Registrations stored + deduplicated | CSV export |
| Calendar backend data | The calendar page itself |
| Email infrastructure + log | Templates 3 through 8 |
| Home, Clubs, Team, Join pages | Gallery, Achievements, Announcements, Contact, About |
| — | Deployment, DNS, SSL, council training |

**Every feature got its easy half.** The half that closes the loop — the part a student or club head actually touches — is the half that slipped. That single observation shapes this plan: every phase gate in §17 is a *journey someone can complete*, never a list of components that exist.

---

## 3. People, roles and permissions

### 3.1 Hierarchy (drives `/team`)

```
Layer 1   Faculty Advisor / Coordinator
                    │
                President
                    │
Layer 2       Vice President
      ┌───────────┬─┴─────────┬──────────────┐
  Tech Head   Docs Head    SM Head      Events Head
                    │
Layer 3     11 Club Cards — Club Head → Vice Head → Members
```

### 3.2 Role matrix — nine roles

| Capability | Faculty | Pres | VP | Tech | Events | Docs | Social | Head | Vice |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Manage any club / event | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | own | own |
| Approve / reject events | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Cancel / reschedule an event | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | own | — |
| Blackout dates | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Manage schedules | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | own | own |
| Registrations / attendance | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | own | own |
| Issue participation certificates | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | own | — |
| **Issue winner certificates** | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | own | — |
| Revoke a certificate | ✅ | — | ✅ | ✅ | — | — | — | — | — |
| Announcements / Gallery / Achievements | ✅ | ✅ | ✅ | ✅ | — | — | **✅ all** | own | own |
| Resources & Drive links | ✅ | ✅ | ✅ | ✅ | — | **✅ all** | — | own | — |
| Recruitment drives | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | own | own |
| Venues & bookings | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | request | request |
| Manage admin users | ✅ | — | ✅ | ✅ | — | — | — | — | — |
| Audit log | ✅ | read | ✅ | ✅ | — | — | — | — | — |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | own | own |

**Three roles now hold full access: Faculty Advisor, Vice President, Tech Head** — every capability at `all`, `manage:admins` and `revoke:certificate` included. The Faculty Advisor additionally supplies the name and signature on every certificate.

*(Changed 2026-09-02 by owner decision, in two steps. The Faculty Advisor was originally read-only — "oversight without the ability to break anything" — and the Vice President was short of `revoke:certificate`, `manage:admins` and `view:audit`. Both were widened to `all` across the board, and both joined `TOTP_REQUIRED_ROLES` because the mandatory-2FA rule keys off blast radius. **The President was deliberately left alone**: still `read` on the audit log, still no `manage:admins`, still no certificate revoke — that was not part of the ask, so President is now narrower than the VP. Source of truth: `src/lib/auth/capabilities.ts`.)*

Docs Head and Social Media Head broke the five-role model: they are **cross-club but narrow**, touching one content type across all 11 clubs and nothing else. Permissions are therefore expressed as **capabilities** (`manage:announcements`, `manage:resources`, `approve:events`, `issue:winner_certificate`, …) derived from role + club, and the server check is `requireCapability`. Role-name checks alone cannot express this.

### 3.3 The 11 clubs

| # | Club | Category | | # | Club | Category |
|---|---|---|---|---|---|---|
| 1 | Coding Club | Tech | | 7 | Nature Club | Wellness |
| 2 | Innovation Club | Tech | | 8 | Yoga Club | Wellness |
| 3 | CyberSentinel Club | Tech | | 9 | AspireX Club | Career |
| 4 | Animatrix Club | Media | | 10 | AppNova Club | Tech |
| 5 | Magazine Club | Media | | 11 | Short Film & Movie Appreciation Club | Media |
| 6 | Fusion & Fashion Club | Cultural | | | | |

Filters: **Tech · Media · Cultural · Wellness · Career**. Each club carries a colour used **only** for calendar coding — never UI chrome.

---

## 4. Design system

Extracted verbatim from your HTML reference. Replaces v1's brutalist styling entirely.

**Colour** — `--paper #FAF9F5` · `--paper-2 #FDFDFA` · `--sand #F1F0E7` · `--card #FFFFFF` · `--ink #22241F` · `--ink-2 #5D6157` · `--ink-3 #8A8F80` · `--ink-4 #9D9B8E` · `--line #ECE9DE` · `--line-2 #E2E0D6` · `--line-3 #D8D5C8` · `--forest #3F5E4C` / `--forest-deep #2F4739` / `--forest-tint #E6EDE7` · `--clay #8C5A2B` / `--clay-tint #F5EDDD` · `--rust #8C3B2B` / `--rust-tint #F3E4E0`.

Alternate accents supported: clay `#8C5A2B` · slate `#3B5675` · plum `#6B4A6B`.

**Club colours** (calendar only) — Coding `#3F5E4C` · Innovation `#6B8E4E` · CyberSentinel `#3B5675` · Animatrix `#6B4A6B` · Magazine `#8C5A2B` · Fusion & Fashion `#A85751` · Nature `#4F7A5B` · Yoga `#7A8C5A` · AspireX `#2F6B6B` · AppNova `#4A5E8C` · Short Film `#6E5A3F`. All muted to sit on paper; all AA against `--card`.

**Type** — DM Serif Display 400 headings only (h1 70px/1.02, h2 38px, h3 24px, stats 34px, tracking −0.015 to −0.02em, italic as accent voice). Space Grotesk 400/500/600 body (17px/1.65) and UI. IBM Plex Mono 500 eyebrows and meta only (9.5–11px, tracking .14–.22em, uppercase).

**Shape** — radii 12/16/18/20/24/999px. Padding 56px → 20px. Hairlines, not shadows. Progress bars 4px.

**Responsive** — ≥1200px as designed · 900–1199 hero stacks, event row 2-col, clubs 3-col · 600–899 clubs 2-col, week strip scroll-snaps, h1 44px · <600 single column, h1 34px, sheet menu, event row becomes a card, tables scroll in their own container.

**Dark mode** — same tokens remapped in one block. Zero component changes.

**Accessibility** — WCAG AA contrast throughout, visible focus rings, labels on every input, `aria-current` on nav, reduced-motion respected, 44px minimum touch targets.

---

## 5. The calendar — full specification

You asked for multiple events per day. That requirement, taken seriously, drives four views, an overlap algorithm, and the time-model correction in §6. It is also why FullCalendar is the wrong tool: its density behaviour is opinionated and restyling it to the paper design costs more than writing the grid.

### 5.1 Four views, each earning its place

| View | Answers | Density strategy |
|---|---|---|
| **Month** | "What's on this month?" | Grid cell shows the first 3 events + `+N more`; today tinted; blackout days hatched |
| **Week** | "What clashes with what?" | Time grid 6 AM–11 PM, concurrent events packed side by side, now-line |
| **Day** | "What's happening today?" | Same time grid, one wide column — the fest-day view |
| **Agenda** | "What's next?" | Chronological list grouped by date, seat status inline — **the mobile default** |

Views are URL state (`/calendar?view=week&d=2026-08-20`) so any view is linkable and shareable.

### 5.2 Multiple events on one day — month view

- Each cell renders up to **3** event chips at ≥1100px, **2** at 900–1099px.
- Overflow becomes a `+N more` button. It does **not** truncate silently.
- Each chip: a 3px left border in the club's colour, mono start time, title on one line with ellipsis.
- A per-cell count badge (`5`) sits beside the day number so density is visible before you read anything.
- Clicking a cell — anywhere, not just `+N more` — opens the **day sheet**: a side panel (desktop) or bottom sheet (mobile) listing every event for that day in full, with time range, club, venue and seat status. This is the honest answer to overflow: the grid summarises, the sheet is complete.
- **Below 640px the grid stops pretending.** Cells collapse to coloured dots — one per event, capped at 6 — and all reading happens in the day sheet. A month grid cannot show five events in a 50px-wide cell truthfully, so it doesn't try.

### 5.3 Concurrent events — week and day views

Three events between 5 and 7 PM on the same evening is normal here. Standard interval packing:

1. Sort the day's events by start time, longest first on ties.
2. Walk them, accumulating a **cluster** — a run of events where each starts before the running maximum end time.
3. Within a cluster, assign each event the first **lane** whose previous event has already ended (greedy colouring).
4. Render each event at `width = 100% / lanes`, offset by its lane index.

Result: nothing is hidden behind anything else, and a day with two overlapping events wastes no width. Events shorter than 30 minutes are floored to a 30-minute visual height so the title stays readable.

### 5.4 Multi-day events

HackCSE 24h starts Friday 9 AM and ends Saturday 9 AM. Handling:

- **Month:** appears in every cell it touches — labelled `starts 9:00 AM` on the first day, `continues` on the rest — with a tinted background so it reads as a span rather than two separate events.
- **Week/Day:** lifts into an **all-day band** above the time grid rather than drawing a 24-hour-tall block that swamps the column. `▶` marks the starting day, `↳` a continuation.
- **Agenda:** first day shows `9:00 AM → Sat 9:00 AM`; subsequent days show `continues`.
- An event ending at exactly midnight does **not** occupy the following day.

### 5.5 Filtering, navigation, interaction

- **Club filter chips** with colour dots, horizontally scrollable. "All clubs" resets. Clicking a single club when all are on switches to *only* that club — the common intent, one tap instead of ten.
- Prev / next / **Today**, plus keyboard: `←` `→` step, `M` `W` `D` `A` switch view, `T` today, `Esc` closes the sheet.
- Arrow-key roving focus across day cells; each cell has an `aria-label` reading date, event count and blackout status. `aria-live` on the period label announces navigation.
- **Blackout dates** (§13.2) render hatched with the reason inline.
- **Subscribe** — `.ics` feeds per event, per club, and council-wide, plus "Add to Google / Apple / Outlook" on every event page.

### 5.6 Where the calendar data comes from

Only `approval_status = 'approved'` and `status != 'cancelled'` events are public. Club weekly schedules (class timings) are a **separate toggleable overlay, off by default** — they'd otherwise bury actual events under 40 recurring rows. Cancelled events remain visible for 7 days struck through, so students who registered see what happened rather than finding a hole.

---

## 6. The time model — a correction both PRDs need

Both PRDs store `date` and `time` as separate fields with **no end time**. That cannot represent:

- a 24-hour hackathon crossing midnight,
- a 3-hour workshop versus a 30-minute meeting rendered at the same size,
- overlap detection of any kind — which means the v1 clash detection compared *dates and venue strings*, not actual time ranges.

**Correction:**

```
events.starts_at   timestamptz   NOT NULL
events.ends_at     timestamptz   NOT NULL   CHECK (ends_at > starts_at)
events.is_all_day  boolean       DEFAULT false
```

Everything derives from those two columns: calendar rendering, `.ics` generation, reminder scheduling, the "upcoming vs past" split, and clash detection. Stored as `timestamptz`, rendered in Asia/Kolkata.

**Clash detection becomes a real overlap query**, and the same interval logic serves both the calendar and the clash check — one source of truth, so what the calendar draws and what the validator blocks can never disagree:

```sql
-- a clash is: same venue, overlapping half-open interval, not cancelled
WHERE venue_id = :venue
  AND tstzrange(starts_at, ends_at, '[)') && tstzrange(:start, :end, '[)')
  AND status <> 'cancelled'
  AND id <> :editing_id
```

Backed by a **Postgres exclusion constraint** on `venue_bookings`, so the database refuses a double-booking even if application code is bypassed:

```sql
EXCLUDE USING gist (venue_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
```

Recurring club schedules keep a separate shape — `day_of_week + start_time + end_time + valid_from/valid_until` — expanded to concrete intervals at query time.

---

## 7. Sitemap

```
PUBLIC
/                          home — hero, next event, ticker, week strip, clubs, achievements
/about                     mission, vision, history
/team                      org chart, all three layers
/clubs                     directory + category filter
/clubs/:slug               club profile ×11 + Resources + .ics feed
/achievements              wall of fame + filter
/events                    hub — upcoming + past, all filters
/events/upcoming           stable linkable view
/events/past               archive
/events/:id                detail, register inline, add-to-calendar, certificate lookup
/events/:id/certificate    certificate download by roll no
/events/:id/ics            single-event calendar file
/calendar                  month · week · day · agenda  (§5)
/calendar/feed.ics         council-wide subscribe feed
/schedule                  club class timings, activities, meetings
/resources                 all clubs + Drive links + council docs
/gallery                   masonry + lightbox + filter
/announcements             blog listing
/announcements/:slug       post detail
/join                      recruitment — pick up to 3 clubs
/contact                   form → admin inbox
/my-events                 lookup by roll no + matching email
/verify/:serial            public certificate verification
/preferences/:token        email preferences + unsubscribe

ADMIN (login-protected, capability-scoped)
/admin                     dashboard — stats, recent activity, quick actions
/admin/events              CRUD, drafts, duplicate, clash check, scheduling heatmap
/admin/events/approvals    approval queue
/admin/registrations       list, attendance toggle, QR print, CSV export
/admin/scan                kiosk QR check-in
/admin/certificates        participation + winner, bulk re-issue, revoke
/admin/clubs               club CMS + Drive links + branding
/admin/schedules           class timings, activities, meetings
/admin/venues              venues + booking calendar
/admin/blackouts           academic blackout dates
/admin/team                members, roles, photos, socials
/admin/achievements        CRUD
/admin/announcements       CRUD + rich text editor
/admin/gallery             CRUD + uploads
/admin/recruitment         drives — open/close, waitlist
/admin/join                applications review
/admin/contact             inbox
/admin/media               upload library
/admin/email-log           queue + audit + manual process
/admin/analytics           trends, popular events, per-club engagement
/admin/audit               audit log viewer (Tech Head)
/admin/users               create, assign role + club, deactivate, 2FA
```

---

## 8. Data model

**Core:** `clubs` · `club_members` · `events` · `registrations` · `club_schedules` · `achievements` · `announcements` · `gallery` · `join_requests` · `contact_messages` · `email_log` · `admin_users`

**Restored from v1.1:**

- `certificates` — registration_id, event_id, **`type` participation | winner**, placement, serial, hmac, issued_at, issued_by, revoked_at, revoked_reason, download_path
- `recruitment_drives` — club_id, status open | closed | waitlist, start_date, end_date, slots, description
- `resources` — club_id nullable, title, url, kind drive | doc | template, updated_by

**New:**

- `venues` — name, capacity, building, is_bookable
- `venue_bookings` — venue_id, event_id, starts_at, ends_at + **exclusion constraint** (§6)
- `blackout_dates` — starts_on, ends_on, reason, created_by
- `event_clubs` — event_id, club_id, is_primary → **co-hosted events** (§13.1)
- `waitlist` — event_id, roll_no, email, position, promoted_at
- `audit_log` — actor_id, action, entity, entity_id, before, after, ip, ua, at *(append-only)*
- `event_feedback` — event_id, rating, comment, submitted_via_token
- `admin_totp` — admin_id, secret_encrypted, confirmed_at, recovery_codes_hashed
- `admin_invites` — email, role, club_id, token_hash, expires_at, consumed_at
- `email_preferences` — email, roll_no, reminders_opt_in, digest_opt_in, unsubscribed_at, token_hash
- `attendance_sessions` — event_id, round_id nullable, opened_by, opened_at, window_seconds, rotate_seconds, status open | closed, allowed_cidr nullable, require_geo, venue_lat, venue_lng, geo_radius_m → **rotating-QR self-scan** (§13.8)
- `student_devices` — roll_no, email, device_hash, enrolled_at, last_seen_at, user_agent, revoked_at → **one phone per student** (§13.8)
- `event_rounds` — event_id, name, sort, status, starts_at nullable → **rounds** (§13.9)
- `results` — event_id, round_id nullable, registration_id nullable, roll_no, rank nullable, score nullable, advanced, remarks, published_at → **standings** (§13.9)

**Changed:**

- `events` — `starts_at` / `ends_at` / `is_all_day` **replacing date+time** (§6); `approval_status` pending | approved | rejected; `approved_by`; `rejection_reason`; `venue_id`; `registration_opens_at`; `registration_closes_at`; `waitlist_enabled`; `certificate_template`; `reminder_sent`; `cancelled_at`; `cancellation_reason`; `rescheduled_from`; `status` gains **`draft`** and **`cancelled`**
- `registrations` — `attended`, `checkin_token_hash`, `checked_in_at`, `checked_in_by`, `checkin_method` door | self | manual, `confirmed_at`; UNIQUE(event_id, roll_no)
- `admin_users` — `is_active`, `session_epoch`; **no password is ever set by another admin** (§11)
- `email_log` — keeps v1's `priority`; adds `status` pending | sent | failed, `sent_at`, `error`

**RPCs** (`SECURITY DEFINER`, `search_path` pinned): `check_event_clash`, `get_registration_count`, `promote_from_waitlist`, `day_load_heatmap`, `redeem_attendance_scan` *(atomic, one row per scan, verifies the current rotation slot)*.

---

## 9. Event lifecycle

```
Club Head creates event  (can save as DRAFT)
   ├─ blackout check      → blocked, with the reason shown
   ├─ clash check (§6)    → blocked on venue+time overlap
   └─ load heatmap        → advisory: "4 events already that evening"
        ↓
   approval_status = pending      (auto-approved if creator is Events Head / President / VP / Tech Head)
        ↓  email → Events Head
   Events Head reviews queue → Approve / Reject (with reason) → email to submitter
        ↓
   Approved → public, open for registration, appears on the calendar
        ↓
   Students register → capacity + dedup enforced → confirm email (one tap) → QR token
        ↓  (full? → waitlist; seat frees → auto-promote + email)
   Event day → admin scans QR at the door → attended = true
        ↓
   "Mark completed" → participation certificates per attendee → stored → emailed
                    → winner certificates issued manually by placement
        ↓
   Student downloads / verifies at /verify/:serial
        ↓
   Post-event feedback link in the certificate email
   Cron auto-expires past events; reminders fire 24h before
```

**Cancel** and **reschedule** are first-class (§13.3), not a delete.

---

## 10. Admin dashboard

**Technical Head is unrestricted:** every club, every event, every registration, user management, audit log, email queue, plus a maintenance panel — reprocess emails, regenerate a certificate, re-run any cron manually, export the whole database.

Everyone else is scoped by §3.2, enforced in three independent places:

1. **Middleware** — guards `/admin/*` pages.
2. **Every route handler** — re-checks session and capability itself. Middleware does not cover API routes; that was v1's hole. A lint rule fails the build if a handler under `app/api/admin/` lacks a `require*` call.
3. **Database RLS** — default-deny, so even a compromised route cannot read another club's PII.

---

## 11. Email — 14 templates

Queue-based: side effects insert an `email_log` row (`pending`); a processor sends via Resend from a verified domain, admin-triggered and by cron.

| # | Trigger | To | Source |
|---|---|---|---|
| 1 | Registration received — confirm your seat | student | v1 + §12.4 |
| 2 | Registration confirmed | student | v1 |
| 3 | Join request received | applicant + club head | v1 |
| 4 | Event date request submitted | Events Head | v1.1 |
| 5 | Event approved | submitter | v2 |
| 6 | Event rejected, with reason | submitter | v2 |
| 7 | Certificate ready, with link | attendee | v1 + v2 |
| 8 | Event reminder ~24h before | registrants | v2 |
| 9 | Welcome to the club | new member | v1 |
| 10 | Admin account invitation | new admin | v1.1, redesigned below |
| 11 | Recruitment drive open / closed | students | v1 |
| 12 | Waitlist promoted — a seat opened | waitlisted student | new |
| 13 | **Event cancelled** | registrants | new |
| 14 | **Event rescheduled** | registrants | new |

Phase 3 adds a weekly "what's on" digest. Every non-transactional email carries a one-click unsubscribe honouring `email_preferences`; transactional mail (confirmation, certificate, cancellation) is always sent.

> **Correction to v1.1's Template 7.** It mailed *login credentials* to new admins. Passwords persist in inboxes and mail-server logs indefinitely — a standing compromise. Replaced with a **single-use invitation link** (32-byte token, hashed at rest, 48-hour expiry, consumed atomically) that walks the new admin through setting their own password and enrolling TOTP in one flow.

---

## 12. Security

Full detail in `SECURITY_SPEC.md` — threat model, 16 control areas, test list, launch checklist. Headlines:

**12.1 Browser & transport** — HSTS preload, strict CSP with per-request nonces, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` allowing `camera=(self)` only, for the kiosk scanner.

**12.2 Admin auth** — Argon2id, invite-link onboarding, mandatory TOTP for Tech Head and President, `__Host-` httpOnly + Secure + SameSite=Lax cookies, 8h absolute / 30min idle, `session_epoch` for instant global revocation, rate-limited login, generic error text.

**12.3 Input** — Zod at the top of every handler; output escaped by default; `dangerouslySetInnerHTML` banned by lint. The announcement editor stores **Markdown, not HTML**, sanitised on write *and* read — it is the likeliest XSS vector here and v1 never built it.

**12.4 Open registration** — with no student login anyone can submit any roll number. Layered: Turnstile + honeypot, per-IP and per-roll-number rate limits, `UNIQUE(event_id, roll_no)`, and a **one-tap email confirmation** holding the seat 30 minutes. Proves the email without an account, and makes `/my-events` safe.

**12.5 QR check-in** — HMAC-SHA256 bound to (registration, event), valid only on the event date, **single-use** via atomic conditional update, only the hash stored. A photographed QR cannot be replayed.

**12.6 Certificates** — participation issues only to `attended = true`; **winner** requires a separate capability and names the issuing actor in the audit log, because a fake award is the highest-value forgery here. 128-bit serial + printed QR → `/verify/:serial`. Signed 15-minute URLs. Revocable.

**12.7 Data protection** — RLS default-deny; `registrations`, `join_requests`, `contact_messages` have no public read and no public insert. Student lookup requires roll **and** matching email, constant-time, rate-limited, byte-identical responses for wrong-email and no-such-student.

**12.8 Operations** — no hardcoded secret fallbacks, secrets in Vercel env only, `npm audit` + Dependabot in CI, Sentry with PII scrubbing, append-only audit log, PITR backups.

**Honest note:** nothing is unhackable. This delivers a system with no *known* class of vulnerability — every OWASP Top 10 category has a named control — plus the audit trail and revocation to contain what does go wrong. Worth one external review before launch; CyberSentinel could run it as a live exercise.

---

## 13. Feature set — complete

### 13.1 Co-hosted events *(new)*

Two clubs running one event is common and neither PRD supports it — v1 would have forced a duplicate listing, which then double-counts registrations and produces two clashing calendar entries. `event_clubs` gives an event a primary club plus co-hosts. Both club pages list it, both heads can edit it, the calendar draws it once with the primary club's colour, certificates carry both logos.

### 13.2 Blackout dates *(new)*

Events Head defines periods when no events may be scheduled — internal exams, semester exams, institutional holidays. Event creation is **blocked** inside a blackout with the reason shown, and the calendar hatches those days. Without this, "eliminate clashes" only solves club-versus-club and ignores club-versus-exams, which is the collision students actually care about.

### 13.3 Cancel and reschedule *(new)*

Both PRDs let an event be deleted; neither handles the 112 students already registered. Cancelling requires a reason, emails every registrant (template 13), frees the venue booking, and leaves the event visible struck-through for 7 days. Rescheduling re-runs clash and blackout checks, emails registrants the new time (template 14), keeps registrations intact, and records `rescheduled_from`.

### 13.4 Draft and duplicate events *(new)*

Save a half-written event without submitting it for approval. Duplicate last term's event — copies title, description, rules, capacity, venue and poster, clears the date. The single biggest time saver for club heads running recurring formats.

### 13.5 Scheduling heatmap *(new)*

When a club head picks a date, show how loaded each nearby day already is. Hard clashes are blocked; *clustering* is merely bad — five events on one evening splits attendance across all five. Advisory, not blocking.

### 13.6 Waitlist with auto-promotion

Full event → join the waitlist with a position. A cancellation promotes the next person automatically and emails them (template 12), with a hold window before the seat passes on.

### 13.7 Email preferences and unsubscribe *(new)*

Bulk email without an unsubscribe is how a sending domain gets blocked — and once Resend's domain reputation is damaged, *certificate* emails stop arriving too. `/preferences/:token` lets a student opt out of reminders and digests. Transactional mail always sends.

### 13.8 Attendance sessions — rotating-QR self-scan *(new)*

The door-scan model (§12.5) works when volunteers stand at a gate, but a 40-person club meeting has no gate and no volunteers, and the real threat there is **proxy attendance** — a student marking an absent friend present. This mode flips the scan direction: the organiser **broadcasts** one QR on a screen, and every present student scans it from their own phone inside a short window.

- **The club head opens a session** on the event (or on one round of it — §13.9). It runs for a **window** — default **60 seconds**, configurable — during which the displayed QR **rotates every ~5 seconds**: a fresh `HMAC(ATTENDANCE_HMAC_SECRET, session_id | floor(now/5s))` code with a ~10s TTL. A screenshot forwarded to someone off-site is stale before they can scan it, and the window is shut inside a minute.
- **One roll number is bound to one phone** — the answer to "a student logs in and shows their friend's ID". Binding reuses the one-tap email confirmation already in §12.4: tapping that link *on the phone* silently sets a signed, httpOnly device credential recorded in `student_devices`. That phone is now the student's identity; re-enrolling on a new phone revokes the old one. No password, no account — the no-login rule (§3) holds.
- **One scan per device per session**, so a single phone can't rack up multiple roll numbers.
- **Location is an optional gate, not the identity mechanism.** IP cannot enforce one-phone-per-student — campus Wi-Fi NATs every phone behind a single address, and mobile data rotates addresses — so IP is used only as a coarse "on the campus network" check when a venue has stable Wi-Fi. An optional GPS geofence (venue coordinates + ~75 m) is the stronger "physically here" signal; off by default because indoor GPS is unreliable and needs permission.
- **Both modes coexist**, chosen per event: rotating-QR self-scan is the default for club meetings and classroom-style events; volunteer door-scan (§12.5) stays for large fests where everyone scanning one screen at once would be slower than a staffed gate. Manual/CSV entry remains the fallback for walk-ins and dead phones.

The honest limit: no attendance system defeats a student physically holding an *absent* friend's unlocked, already-enrolled phone. Rotation plus device binding raise the cost sharply — you now need the friend's actual phone, not a forwarded screenshot — but the audit log and the organiser comparing the live checked-in count against heads in the room are the backstop. Full detail and the anti-proxy layer table live in `SECURITY_SPEC.md` §8a.

### 13.9 Event results and rounds *(new)*

Certificates issue winners, but neither PRD models the **standings students actually refresh for** — and the mockup's own "Tech Trivia: prelims → finals" needs exactly that. `event_rounds` + `results` give an event ordered rounds, each with per-student rank, score and an `advanced` flag. Draft → publish; published standings show on the event page and `/events/:id/results`. Advancing students form the next round's shortlist, and the **final round's ranked results feed winner-certificate issuance directly** (§12.6) instead of an admin re-keying placements. New capability `manage:results`, held by the roles that already run attendance and certificates; public read only once published.

### 13.10 Live wall — fest display *(new)*

The calendar was built for fest-day density (§5); this surfaces it on the projector at the venue entrance. `/live` (council-wide) and `/live/:venue` show **happening now + next** per venue in large type, dark by default, auto-refreshing over Supabase realtime — same tokens, denser scale, read-only. No new tables: it is a view over approved events, optionally showing the live checked-in count from an open attendance session (§13.8).

### 13.11 Already planned

Certificate verification page · audit log · admin 2FA · Turnstile · QR kiosk scanner · venue booking calendar · feedback and ratings · club leaderboard · ⌘K search · weekly digest · SEO with `schema.org/Event` JSON-LD, sitemap and per-event OG images · PWA with offline calendar · dark mode · analytics dashboard · CSV export · `.ics` feeds · media library · rich text editor · recruitment drives · resources CMS.

### 13.12 Still optional — say the word

1. **Team events as first-class** — both PRDs store team members as loose JSON. Real teams mean team certificates, team leaderboards, a captain who edits the roster.
2. **Auto-generated event posters** — render a poster PNG from event data in the paper style, for clubs without a designer.
3. **Participation points** — attendance accrues points per student and club, feeding the leaderboard and an end-of-year award.
4. **Council budget tracker** — per-event budget vs spend, visible to President and Faculty Advisor only.

**Staying out:** in-app payments. If paid events happen, hand off to Razorpay and keep the platform away from card data.

---

## 14. Cron jobs

All secured by `CRON_SECRET` in constant time plus Vercel's cron signature. All idempotent — a double fire cannot double-send.

| Job | Schedule (IST) | Does |
|---|---|---|
| `reminders` | 09:00 daily | Template 8 to registrants of events ~24h out; sets `reminder_sent` |
| `expire-events` | 00:15 daily | upcoming → past; closes registration |
| `process-email-queue` | every 10 min | Sends `pending` rows in `email_log`, retries failures with backoff |
| `waitlist-sweep` | every 15 min | Promotes where seats freed; expires unclaimed holds |
| `confirm-expiry` | every 10 min | Releases unconfirmed registration holds past 30 min |
| `weekly-digest` | Mon 08:00 | "What's on this week" to opted-in students *(Phase 3)* |
| `anonymise` | 03:00 Sundays | Nulls phone/email on registrations older than 3 years |

---

## 15. Environment configuration

`.env.example` is committed; **every one of these throws at module load if missing** — no `|| 'dev-secret'` fallbacks anywhere.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client, RLS-enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — guarded by `import 'server-only'` |
| `NEXTAUTH_SECRET` · `NEXTAUTH_URL` | Session signing |
| `CHECKIN_HMAC_SECRET` | Door-scan QR tokens (§12.5) |
| `ATTENDANCE_HMAC_SECRET` | Rotating attendance-session codes (§13.8) |
| `CERT_HMAC_SECRET` | Certificate serials (§12.6) |
| `INVITE_HMAC_SECRET` | Admin invite tokens |
| `PREFS_HMAC_SECRET` | Unsubscribe links |
| `CRON_SECRET` | Cron authorisation |
| `RESEND_API_KEY` · `EMAIL_FROM` | Transactional email |
| `UPSTASH_REDIS_REST_URL` · `_TOKEN` | Rate limiting |
| `TURNSTILE_SITE_KEY` · `TURNSTILE_SECRET_KEY` | Bot protection |
| `SENTRY_DSN` | Error monitoring |
| `NEXT_PUBLIC_SITE_URL` | Absolute URLs in emails, OG tags, `.ics` |

All six HMAC secrets are distinct 32-byte random values. Reusing one across purposes lets a token minted for one system be replayed against another.

---

## 16. Testing strategy

**Unit (vitest)** — validation schemas, rate limiter, CSV sanitiser, HMAC mint/verify, **calendar interval packing** (overlap clusters, lane assignment, multi-day spans, midnight boundaries), clash detection, capability resolution, certificate serial generation, **rotating attendance-code mint/verify** (rotation expiry, one-scan-per-device-per-session), device binding (one phone per roll, re-enrol revokes prior), results publish gating.

**Integration** — every `/api/admin/*` route returns 401 unauthenticated; club-head cross-club access returns 403; Social Media Head on event routes returns 403; (a Faculty Advisor write no longer 403s — see §3.2); anon Supabase key cannot select `registrations`; consumed invite cannot be reused; replayed QR fails; an attendance scan outside the window or from an unenrolled device fails; unpublished results are not publicly readable.

**End-to-end (Playwright)** — the Phase 1 journey: create event → clash blocked → approve → register → confirm → scan → certificate → verify. Plus: cancel an event with registrants and assert emails queue; calendar renders a day with 5 events and a multi-day span correctly at 1440px and 390px.

**Accessibility** — axe on every public page; keyboard-only pass through registration and the calendar.

**CI on every push** — `tsc --noEmit` · ESLint (custom auth-check and no-`dangerouslySetInnerHTML` rules) · vitest · Playwright · `npm audit --audit-level=high` · Supabase type-drift check · `next build`. Lockfile committed, Dependabot weekly.

---

## 17. Phases and timeline

Estimates assume steady focused work; the gates matter more than the dates.

### Phase 0 — Foundation · ~1 week *(gate: you approve the look)*

Repo, TypeScript strict, Tailwind on `tokens.css`, Supabase project, full schema + RLS + generated types, CSV seed import for 11 clubs and members, `.env.example`, CI green, Sentry, **home page built for real** — pixel-matched and fully responsive.

**Exit:** you look at the home page on a phone and a laptop and say yes.

### Phase 1 — MVP · ~3 weeks *(gate: one full journey works)*

Clubs directory + profile · Events hub, upcoming, past, detail · Registration with capacity, dedup, confirmation · Clash detection **with warning UI** · Blackout dates · Approval workflow end-to-end · **The calendar, all four views (§5)** · QR check-in + kiosk scanner · **Attendance sessions — rotating-QR self-scan + device binding (§13.8)** · **Event results & rounds (§13.9)** · Participation **and winner** certificates · `/verify/:serial` · Admin panel (events, drafts, duplicate, approvals, registrations, certificates, CSV export, users, email log) · Auth.js + capabilities across nine roles · Resend queue, templates 1–8 and 10.

**Exit:** register → confirm → scan at the door → certificate arrives → it verifies publicly. And a Club Head submits an event the Events Head approves.

### Phase 2 — Self-service & content · ~2 weeks

Schedules · Gallery · Achievements · Announcements + rich text · `/resources` with admin-editable Drive links · Recruitment drives · Join · Contact inbox · `/my-events` · Reminder cron · `.ics` feeds · Media library · Waitlist auto-promotion · Venue booking calendar · Co-hosted events · Cancel/reschedule flows · Email preferences · Templates 9, 11–14 · About · Team org chart.

**Exit:** a club head runs their club end-to-end without messaging you; Docs Head updates a Drive link without a deploy.

### Phase 3 — Engagement & polish · ~2 weeks

Feedback + ratings · Leaderboard · ⌘K search · Weekly digest · SEO + JSON-LD + sitemap + OG images · PWA + offline calendar · Dark mode · Analytics · Scheduling heatmap · **Live wall / fest display (§13.10)**.

### Phase 4 — Launch · ~1 week

Domain, SSL, secrets rotated, PITR on, real accounts seeded, council training doc, security pass. *(Every one of these was unchecked in v1.)*

---

## 18. What I need from you

| # | Item | Why | Blocking |
|---|---|---|---|
| 1 | Supabase project URL + anon key + service role key | database, storage, RLS | no |
| 2 | Vercel account | hosting + cron | Phase 4 |
| 3 | Resend API key + a domain you control DNS for | all 14 templates | Phase 1 |
| 4 | Upstash Redis URL + token *(free)* | rate limiting | no |
| 5 | Cloudflare Turnstile keys *(free)* | bot protection | Phase 1 |
| 6 | Real club taglines, descriptions, heads, vice heads, members | §3.3 has names only | Phase 0 seed |
| 7 | Council + department logos, faculty advisor name + signature image | certificate PDF | Phase 1 |
| 8 | Venue list — rooms, labs, halls, capacities | clash detection (§6) | Phase 1 |
| 9 | Academic calendar — exam periods, holidays | blackout dates (§13.2) | Phase 1 |
| 10 | Drive folder links per club | `/resources` | Phase 2 |
| 11 | Domain name | SSL, sending domain, OG tags | Phase 4 |

Items 1–5 are all free tiers. **Phase 0 starts without any of them** — I build against a local Postgres and swap your credentials in later.

---

## 19. Definition of done, per feature

1. UI complete, responsive, WCAG AA.
2. API validated, rate-limited, capability-checked.
3. Data persists correctly under RLS.
4. Side effects fire — email and audit.
5. An admin can manage it with no code.
6. Type-checks, builds, has a test.
7. **A student or club head can complete a real task with it** — "the component exists" does not count.
8. A council member signed off.

---

## 20. Risks

| Risk | Mitigation |
|---|---|
| **The v1 pattern repeats — features half-built** | Phase gates are journeys, not component lists (§19.7) |
| Scope creep, endless redesigns | Design system locked in Phase 0 before pages are built |
| Hand-written DB types drift | Types generated in CI; build fails on drift |
| PII exposure | RLS default-deny + server-only writes + no public reads on PII |
| Certificate forgery | Attendance-gated issuance + verification page + revocation |
| Admin account compromise | Rate-limited login, invite-link onboarding, mandatory 2FA, instant session revocation |
| Low attendance data quality | QR check-in as the default path, kiosk mode for speed |
| Sending domain reputation damaged by bulk mail | Unsubscribe + preferences (§13.7); transactional mail separated |
| Calendar unusable during fest week | Four views, overlap packing, day sheet, agenda default on mobile (§5) |
| Club heads change every year | Self-service CMS + invite-link onboarding + written training doc at launch |
