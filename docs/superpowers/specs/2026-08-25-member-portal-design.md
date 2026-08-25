# Member Portal & Member Login — Design Spec

> **Status:** DRAFT for owner review · **Date:** 2026-08-25
> Sibling docs: `docs/BUILD_PLAN.md` (v2.1), `docs/SECURITY_SPEC.md`,
> `docs/superpowers/specs/2026-08-24-qr-attendance-design.md`.
> Implementation plan: `docs/superpowers/plans/2026-08-25-member-portal.md`.

## 1. Summary

Give club members a **login of their own** on the public site — separate from the
9-admin panel — where a signed-in member can:

- **Show their personal QR** full-screen so a head scans it to mark attendance
  (no printed card needed).
- **See their attendance** (% + present/absent history).
- **See their participation history** for their club.

Members are added by their own club's **head / vice-head** (existing
`manage:members` capability), who also record the member's **email and phone**, then
**generate a one-time login link** to hand over. Each member belongs to **exactly one
club** — one membership, one login.

This is the first **student-facing authentication** in the app. Until now the rule was
"students have no login" (`STATUS.md`, `SECURITY_SPEC §3`); this spec deliberately
introduces a *narrow, low-privilege* member login and treats it — and the new PII it
touches — with the same care as admin auth.

## 2. Decisions locked with the owner

- **Onboarding = a generated one-time login link, exactly like the admin invite
  flow** (`/admin/accept-invite`). The head clicks "Generate login link" on the
  member's edit page; the app mints a single-use, hashed, expiring token and shows
  the **full URL** to copy and send to the member (WhatsApp / print / read out — the
  app does **not** auto-email it). No spoken codes, no email/SMS dependency to log in.
- **The link is one-time setup, not the everyday login.** It establishes the member's
  PIN + TOTP; after that, repeat sign-in is **email + PIN + authenticator code**.
- **Second factor = authenticator-app TOTP, exactly like the admin login** (Option 2).
- **No backup / recovery codes for members.** Lost authenticator → head-driven
  recovery only ("Reset access" → fresh login link → member re-enrolls).
- **Login identifier = email.** A member needs an email to get a portal. `roll_no`
  stays an optional, admin-only PII field (not used for login).
- **One student = one club.** No multi-club membership, no club switcher.
- **Anti-proxy rotating QR (owner picked option 2).** The QR shown in the member
  portal is **time-boxed**: it refreshes every N seconds and a stale screenshot won't
  scan. The head sets N when opening a session (`club_attendance_sessions.qr_ttl_seconds`,
  minutes/seconds). See §6a. The **printed admin card keeps its static token**
  (physical cards are a separate, accepted channel); only the on-screen portal QR
  rotates.
- **Strict club scope.** A club head / vice-head can add, edit, delete, invite, and
  reset **only their own club's** members — bound to `session.clubId`, enforced
  server-side (owning club read fresh from the DB, never from the request body).
  Council roles (president / VP / tech-head / social-media) act across all clubs;
  faculty is read-only.

## 3. Scope (YAGNI)

**In scope**
- Member auth: generated login link → set PIN + enroll TOTP → login (email + PIN +
  TOTP) → logout; head-initiated reset (re-issue link).
- Member portal: home (QR + attendance summary + history). Three portal pages total.
- Admin: member form gains **email + phone**; edit page gains **generate-login-link /
  reset-access**; all member mutations stay own-club-scoped.
- Locking down the new PII (email, phone) and all credential data.

**Explicitly out of scope (later, if wanted)**
- Members editing their own profile / socials / photo.
- Event (not club-session) participation in the history feed — v1 shows club
  attendance only (reuses `getMemberAttendance`); events can be folded in later.
- Notifications, auto-emailing the login link, member self-signup.
- Backup / recovery codes for members — deliberately omitted (head re-issues the link).

## 4. Data model

### 4.1 New columns on `club_members`
| column | type | notes |
|---|---|---|
| `email` | `text null` | **PII + the login identifier.** Locked out of anon (§8). |
| `phone` | `text null` | **PII.** Contact only in v1. Locked out of anon (§8). |

**Login identifier = `email`.** Add a **case-insensitive partial unique index**:
`CREATE UNIQUE INDEX club_members_email_unique ON club_members (lower(email)) WHERE
email IS NOT NULL`. A member without an email is roster-only (no portal). `roll_no`
remains optional admin-only PII, **not** used for login.

### 4.2 New table `club_member_auth` (credentials, isolated from the roster row)
Secrets live in their own table so the roster row (`club_members`) carries no hashes.

| column | type | notes |
|---|---|---|
| `member_id` | `uuid pk` → `club_members(id) on delete cascade` | one-to-one |
| `pin_hash` | `text null` | Argon2id hash of the PIN — **reuses `hashPassword`** |
| `totp_secret_enc` | `text null` | TOTP secret, **AES-256-GCM** under `TOTP_ENC_KEY` (reuses `encryptSecret`) |
| `totp_enrolled_at` | `timestamptz null` | set when TOTP is confirmed during setup |
| `failed_attempts` | `int not null default 0` | PIN/TOTP brute-force counter |
| `locked_until` | `timestamptz null` | lockout window after too many bad attempts |
| `session_epoch` | `int not null default 0` | bump to revoke all member sessions (mirrors admin) |
| `activated_at` | `timestamptz null` | set when PIN + TOTP are first established |
| `created_at` / `updated_at` | `timestamptz` | |

*No `backup_codes` column (owner decision). The one-time onboarding token lives in
`member_invites` (§4.3), mirroring `admin_invites`.*

### 4.3 New table `member_invites` (one-time login link — mirrors `admin_invites`)
| column | type | notes |
|---|---|---|
| `id` | `uuid pk` | |
| `member_id` | `uuid` → `club_members(id) on delete cascade` | which member this link sets up |
| `token_hash` | `text not null` | SHA-256 of the raw token (`hashToken`); raw is only ever in the URL |
| `expires_at` | `timestamptz not null` | TTL (mirror admin 48h; 7 days is friendlier without email) |
| `consumed_at` | `timestamptz null` | set atomically on use → single-use |
| `created_by` | `uuid` → `admin_users(id)` | the head/vice-head who generated it |
| `created_at` | `timestamptz` | |

**RLS/grants:** `club_member_auth` and `member_invites` grant **nothing** to `anon`
or `authenticated` — touched **only via the service role** (default-deny, like
`registrations` / `admin_invites`).

### 4.4 Migration
`..._member_portal.sql` — add `email`, `phone`; the `lower(email)` partial-unique
index; create `club_member_auth` + `member_invites`; RLS enable + default-deny on
both; **revoke `email` + `phone` from the anon column grant on `club_members`**
(extend `20260825000000_club_members_rollno_privacy.sql` — anon may read only the
public columns: name, role, photo_path, socials, sort, club_id, is_active).
Applied to the live/shared DB via Supabase MCP (CLI not installed — STATUS gotcha),
then `database.types.ts` regenerated via MCP `generate_typescript_types`.

## 5. Authentication design

### 5.1 Onboarding (generate login link — mirrors admin invite)
- The member's edit page gains a **"Login access"** block with a **"Generate login
  link"** button, enabled once the member has an **email**. It calls
  `createMemberInvite` (mirror of `createInvite`): mint a token via
  `generateConfirmToken()`, store `hashToken(raw)` in a `member_invites` row
  (`expires_at`, `created_by = session.id`), return the **raw token once**. The page
  shows the copy-able URL `<SITE_URL>/member/accept-invite?token=<raw>`.
- The block also shows status ("Activated on <date>" once set up). A **"Reset
  access"** button clears `pin_hash` + `totp_secret_enc` + bumps `session_epoch`
  (logs them out) and issues a fresh link.
- **Both actions are `manage:members`-gated and own-club-scoped**: the target
  member's `club_id` is read from the DB and checked with `canManage(session,
  "manage:members", member.clubId)` — a head can never invite/reset another club's
  member.

### 5.2 First-time setup (`/member/accept-invite?token=…`, mirrors admin accept-invite)
- The member opens the link. The page runs `validateMemberInvite(token)` (mirror of
  `validateInvite`): unknown / expired / consumed → friendly "ask for a new link".
  Valid → load a fresh **TOTP secret** (`newTotpSecret`), render its QR
  (`totpKeyUri`, labelled with the member's email), round-trip the **encrypted**
  secret in a hidden field (exactly like `AcceptInvitePage`).
- The member picks a **6-digit PIN**, scans the QR, and enters the current 6-digit
  code. On submit: re-validate the invite, `verifyTotp` the code, hash the PIN
  (`hashPassword`), then in one write store `pin_hash` + `encryptSecret(secret)` →
  `totp_secret_enc`, set `totp_enrolled_at` + `activated_at`, **`consumeMemberInvite`**
  (single-use), and issue the member session. No backup codes shown.

### 5.3 Sign in (`/member/login`)
- **email + PIN + 6-digit TOTP code** → look up the member by `lower(email)` (must
  have `activated_at`) → verify `pin_hash` (constant-time) **and**
  `verifyTotp(decryptSecret(totp_secret_enc), code)` → both must pass → issue the
  member session (§5.5). Generic failure text either way.

### 5.4 Brute-force & rate limiting
- Reuse `checkLoginLimits({ ip, email })` (`SECURITY_SPEC §6`) as-is — it already
  keys per-IP **and** per-email. Generic failure text ("Wrong email, PIN, or code").
- Per-account lockout via `failed_attempts` / `locked_until` (5 bad attempts →
  15-min lock; reset on a fully successful PIN + TOTP sign in).

### 5.5 Session
- A **separate** signed, httpOnly cookie from the admin session — never shared.
  Name `__Host-ccc.member` (prod) / `ccc.member` (dev). Implemented in a small
  `src/lib/member/session.ts` mirroring the proven `idle.ts` HMAC pattern: the value
  is `base64url(JSON{memberId, clubId, epoch, exp}).hmac`, signed with an HMAC over
  `NEXTAUTH_SECRET` **domain-separated** with a `member-session:v1|` prefix so it can
  never collide with the admin token. Verified constant-time; `exp` enforced.
- Payload re-validated server-side against `club_member_auth.session_epoch` and the
  member still being active (bumping the epoch or deactivating revokes instantly).
- **No 2-minute idle timeout** (that admin control guards council data; a student's
  own attendance doesn't warrant it). Absolute lifetime ~30 days; **Logout** clears
  the cookie.

### 5.6 Proxy guard
- `src/proxy.ts` gains a `/member/:path*` matcher. Layer-1 UX redirect only:
  `/member/login` and `/member/accept-invite` are open; every other `/member/*` needs
  the member cookie, else redirect to `/member/login`. The authoritative check is the
  per-page/route server guard `requireMember()`, which re-validates against the DB
  (epoch, still-active). No idle-cookie logic on `/member/*`.

## 6. Member portal UX

Minimal, phone-first, its own light chrome (`src/app/member/layout.tsx`; no public
marketing nav, no admin nav).

- **`/member/login`** — Sign in: **email + PIN + 6-digit authenticator code**.
- **`/member/accept-invite?token=…`** — first-time setup from the head's login link:
  set PIN → scan TOTP QR + confirm code (mirrors `/admin/accept-invite`).
- **`/member`** (home, guarded) —
  - **Big QR** at the top: the member's static `memberToken` QR (reuses `memberToken`
    + `qrDataUrl`) — the *same* token the head's scanner already reads, so **zero
    scanner changes**. "Show this to your club head."
  - **Attendance card**: `%` + `attended of eligible` (reuses `getMemberAttendance` /
    `summarizeAttendance` — the same math the head's dashboard uses).
  - **History list**: session title · date · Present/Absent.
  - **Logout**.

The existing login-less `/m/[token]` page stays (printed-card / share path); the
portal is the logged-in equivalent. Both read the same data.

### 6a. Anti-proxy rotating QR (option 2)

- `club_attendance_sessions` gains **`qr_ttl_seconds int null`** — the head sets it on
  the Open-session form (default 60s when unset). It controls how long each on-screen
  member QR is valid.
- New **expiring** member token in `src/lib/attendance.ts`:
  `memberExpiringToken(memberId, ttlSeconds, now)` → `e.<memberId>.<exp>.<sig>` (HMAC,
  domain-separated `member-exp:v1|`); `verifyMemberExpiringToken(token, now)` → memberId
  only if the signature is valid **and** `now ≤ exp`. The `e.` prefix distinguishes it
  from the static 2-part token.
- The portal QR is rendered by a client **`RotatingMemberQr`** that polls
  `GET /api/member/qr` (member-session-guarded) every `ttlSeconds`; the endpoint mints
  a fresh expiring token (ttl = the open session's `qr_ttl_seconds`, else 60) and
  returns its QR image. So the on-screen QR silently refreshes; a screenshot dies at
  `exp`.
- The **scan endpoint** (`POST /api/admin/attendance/club/scan`) accepts **either**
  token: `token.startsWith("e.") ? verifyMemberExpiringToken(token) : verifyMemberToken(token)`.
  Static (printed cards) and expiring (portal) both resolve to a memberId; everything
  downstream (club match, idempotency) is unchanged.
- `/m/[token]` self-view is extended to try both verifiers so a portal QR opened in a
  browser still shows attendance (until it expires).

## 7. Admin / head-side changes

- **`MemberForm`** gains **Email** and **Phone** fields (email format-validated,
  phone digits; both optional but email is required for a login). Stored on
  `club_members`. A duplicate email surfaces a friendly error (unique index).
- **`createMemberAction`** provisions a `club_member_auth` row when the member has an
  email (no credentials yet). Unchanged: `resolveOwningClub` + `canManage` keep
  creation own-club-scoped.
- **Edit page** — new "Login access" block: **Generate login link** (shows the URL
  once) / activated status / **Reset access** — all `manage:members`-gated and
  own-club-scoped.
- **Capabilities unchanged**: head/vice-head = own club (permanent, bound to
  `session.clubId`); council = all clubs; faculty = read-only. No new capability.
- **Audit** (`SECURITY_SPEC §11`): rows for login-link generation, reset-access, and
  member self-service setup (actor = member for the last).

## 8. Security considerations

- **T3 (curious student wants others' emails/phones)** — `email`/`phone` are
  **removed from the anon grant** on `club_members`; readable only server-side via
  service role. No public endpoint returns them.
- **Credentials never leave the server** — `club_member_auth` + `member_invites` are
  service-role only; the PIN and link token are stored **hashed** (constant-time
  compare); the TOTP secret is **encrypted at rest** (AES-256-GCM, `TOTP_ENC_KEY`).
- **T4 (ex-member still has access)** — deactivating (`is_active = false`) or "Reset
  access" bumps `session_epoch`, instantly killing live sessions; the guard rejects
  inactive members.
- **Isolation** — member and admin sessions use different cookies, secrets
  (domain-separated), and guards. A member token can never satisfy an admin guard.
- **Blast radius** — a member session reads **only that member's own** attendance and
  displays **their own** QR. It cannot mutate attendance, read the roster, or see
  anyone else's data.
- **Two factors** — 6-digit PIN (know) + authenticator TOTP (have), plus per-account
  lockout + per-IP/email rate limit. Proportionate for low-value data.
- **Club-scope** — every head-side member mutation checks `canManage(session,
  "manage:members", member.clubId)` with the club read fresh from the DB.
- **`dangerouslySetInnerHTML` ban / CSP** unchanged — the portal renders plain React.

## 9. Reuse map (what already exists)

| Need | Reuse |
|---|---|
| Member QR token + verify | `memberToken` / `verifyMemberToken` (`src/lib/attendance.ts`) — **unchanged** |
| QR image | `qrDataUrl` (`src/lib/qr.ts`) / `QRCode.toDataURL` |
| Head scanner + scan API | `QrScanner`, `POST /api/admin/attendance/club/scan` — **no change** |
| Attendance math + member view | `getMemberAttendance` (`src/lib/admin/attendance-club.ts`), `summarizeAttendance` |
| PIN hashing + policy | `hashPassword` / `verifyPassword` / `validatePassword` (`src/lib/auth/password.ts`) |
| One-time token mint + hash | `generateConfirmToken` / `hashToken` (`src/lib/tokens.ts`) |
| Invite create/validate/consume | mirror `createInvite` / `validateInvite` / `consumeInvite` (`src/lib/admin/invites.ts`) |
| First-time setup flow (token→TOTP enroll→commit→consume) | mirror `AcceptInvitePage` + `AcceptInviteForm` + `acceptInviteAction` (`src/app/admin/accept-invite/*`) |
| TOTP enroll/verify/encrypt | `newTotpSecret` / `totpKeyUri` / `verifyTotp` / `encryptSecret` / `decryptSecret` (`src/lib/auth/totp.ts`) — skip `generateRecoveryCodes` |
| Rate limiting | `checkLoginLimits({ ip, email })` (`src/lib/rate-limit.ts`) |
| Signed-cookie pattern | `idle.ts` HMAC token → new `src/lib/member/session.ts` |
| Same-origin guard | `requireSameOrigin` (`src/lib/auth/guards.ts`) |
| Proxy pattern | `src/proxy.ts` admin layer-1 → add `/member/*` matcher |
| Club-scope on mutations | `resolveOwningClub` / `canManage` / `grantFor` (`src/lib/admin/club-scope.ts`, `capabilities.ts`) |
| Layout chrome switch | `src/app/layout.tsx` `x-pathname` check → also treat `/member` as bespoke |

## 10. Testing plan

Pure/unit (vitest, headless — matches the 78-test suite style):
- **Member session** (`session.ts`): sign→verify round-trip; tampered payload/sig
  rejected; expired `exp` rejected; a value signed with the admin secret/prefix fails.
- **Member invite**: `validateMemberInvite` rejects unknown/expired/consumed;
  `consumeMemberInvite` is single-use (second call returns false).
- **Auth helpers**: PIN verify (constant-time), lockout after N failures, epoch-bump
  revocation.
- **TOTP**: reuse `verifyTotp` / encrypt↔decrypt round-trip (covered by admin totp
  tests; add a member-flow enroll→verify case).
- **Email uniqueness / login lookup** (case-insensitive).
- **Expiring QR token** (§6a): `verifyMemberExpiringToken` accepts within window,
  rejects after `exp`, rejects tampered/wrong-shape tokens.
- Reuse existing `getMemberAttendance` / `summarizeAttendance` tests (unchanged).

Browser-only (owner walkthrough — server-action POSTs can't be curled, STATUS
gotcha): head adds a member with email/phone → **Generate login link** → open the
link → set PIN + scan TOTP QR + confirm → land on `/member` showing the QR → head
`/admin/attendance/scan` scans the phone → present-count ticks → member's attendance
updates → Logout → sign back in with **email + PIN + TOTP** → **Reset access**
invalidates the old link + logs them out. Also confirm a **club_head cannot** invite
or reset a member of another club (403 / not-shown).

## 11. Build order (feeds the implementation plan)

1. Migration + regenerated types (columns, unique index, `club_member_auth`,
   `member_invites`, grants).
2. `src/lib/member/session.ts` (sign/verify) + `src/lib/member/invites.ts`
   (create/validate/consume) + `src/lib/member/auth.ts` (PIN/TOTP/lockout helpers) +
   tests — pure first (TDD).
3. `requireMember()` guard + `/member/*` proxy matcher + layout chrome.
4. Admin side: `MemberForm` email/phone; `createMemberAction` provisioning;
   generate-login-link + reset-access actions on the edit page (own-club-scoped);
   audit.
5. Member pages: `/member/accept-invite`, `/member/login`, `/member` (QR + attendance
   + history) + member layout.
6. **Anti-proxy rotating QR (§6a):** `qr_ttl_seconds` column; `memberExpiringToken` /
   `verifyMemberExpiringToken` (+ tests); Open-session duration input;
   `GET /api/member/qr`; `RotatingMemberQr` in the portal; scanner accepts the
   expiring token; `/m/[token]` accepts both.
7. Verify gate (typecheck/lint/tests/build) + owner browser walkthrough (incl. the
   screenshot-goes-stale check).

## 12. Assumptions & confirmations

All confirmed with the owner:
- Onboarding via a **generated one-time login link** (mirrors admin invite); the app
  only **shows the head the URL to copy** (no auto-email yet).
- The link is **one-time setup**, not a per-login link; repeat sign-in is email + PIN
  + TOTP.
- Second factor = **authenticator-app TOTP**; **no backup codes** (lost device →
  head re-issues the link).
- Login identifier = **email**; a member needs an email for a portal.
- **One club per student**; club heads/vice-heads are **permanently bound to their
  own club** with full CRUD (+ invite + reset) over its members only.
- Tunables (defaults): link TTL 7 days, PIN 6 digits, lockout 5→15 min, session 30 days.
