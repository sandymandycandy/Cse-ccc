# Security Specification — CSE Club Council Platform

**Companion to** `BUILD_PLAN.md` v2.1 · **Date:** 20 August 2026
**Reconciled against** PRD v1.1 — nine roles, two certificate types, invite-based admin onboarding, rich text editor hardening.

This is the checklist the build is held to. Every item is implementable, testable, and mapped to a real attack. Nothing here is aspirational.

---

## 1. Threat model

| # | Who | What they want | Realistic route in |
|---|---|---|---|
| T1 | A student | A certificate they didn't earn | Forge a PDF; register and skip the event; replay someone's QR |
| T2 | A student | Sabotage a rival club's event | Mass-register fake roll numbers to exhaust seats |
| T3 | A curious student | Other students' phone numbers and emails | Scrape a public API; enumerate `/my-events`; guess an admin URL |
| T4 | An ex-club-head | Edit or delete content after leaving | Old session or credentials still valid |
| T5 | A random bot | Spam, SEO injection, resource abuse | Contact/join forms, unbounded uploads |
| T6 | Someone with real skill | Full database access | SQL injection, XSS→session theft, exposed service key, dependency CVE |
| T7 | An insider club head | Read a different club's registrations | Change a club_id in a request |
| T8 | A cross-club content role | Act outside their content type | Docs Head or Social Media Head reaching event or registration endpoints their role has no business touching |

Each control below names the threat it closes.

---

## 2. Transport and browser hardening

Set in `next.config.ts` headers + middleware. **[T6]**

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-{{random}}' 'strict-dynamic';
  style-src 'self' 'nonce-{{random}}';
  img-src 'self' data: blob: {{supabase-storage-host}};
  font-src 'self';
  connect-src 'self' {{supabase-host}} {{sentry-host}};
  frame-ancestors 'none'; base-uri 'self'; form-action 'self';
  object-src 'none'; upgrade-insecure-requests
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

`camera=(self)` is deliberate — the kiosk QR scanner needs it. Everything else is off.

**Test:** securityheaders.com grade A+ before launch; a CI test asserts each header is present.

---

## 3. Authentication and session — admin

**[T4, T6]**

| Control | Implementation |
|---|---|
| Password storage | Argon2id, memory 19 MiB, iterations 2, parallelism 1 |
| Password policy | ≥12 chars, checked against the k-anonymity HaveIBeenPwned range API |
| **Onboarding** | **Invite link, never an emailed password.** PRD v1.1 Template 7 specified mailing credentials to new admins — passwords in inboxes and mail-server logs persist forever and are a standing compromise. Replaced with a single-use 32-byte token (stored hashed, 48-hour expiry, consumed atomically) that walks the new admin through setting a password and enrolling TOTP in one flow |
| First login | No default password ever ships; the account has no usable hash until the invite is consumed |
| Second factor | TOTP (RFC 6238), mandatory for Tech Head / President, optional for others; 10 single-use recovery codes stored hashed |
| Session | Auth.js v5 JWT in an httpOnly + Secure + SameSite=Lax cookie, `__Host-` prefix |
| Lifetime | 8 h absolute, 30 min idle, token rotated on each refresh |
| Revocation | `admin_users.session_epoch` — bumping it invalidates every existing session for that user instantly (used on deactivate, role change, password reset) |
| Login rate limit | 5 attempts / 15 min per IP **and** per account; lockout at 10 with an email alert to the account |
| Error messages | Identical text for wrong user, wrong password, and locked account |
| Secrets | Missing `NEXTAUTH_SECRET`, Supabase keys, or `CRON_SECRET` throws at module load. No `|| 'dev-secret'` fallbacks anywhere |

---

## 4. Authorisation — three independent layers

**[T7]** A single missed check must not be enough to leak data.

**Layer 1 — middleware.** Guards `/admin/*` *pages* only. Redirects unauthenticated users. Explicitly not trusted for APIs.

**Layer 2 — route handlers.** Every file under `app/api/admin/` begins:

```ts
const session = await requireRole(req, ['tech_head', 'president', 'vice_president', 'events_head']);
// club-scoped routes:
const session = await requireClubAccess(req, params.clubId);
// cross-club but content-type-scoped (Docs Head, Social Media Head):
const session = await requireCapability(req, 'manage:announcements');
```

`requireClubAccess` compares the *session's* `club_id` against the resource's owning club, read fresh from the database. It never trusts a `club_id` from the request body. A lint rule fails the build if a file in `app/api/admin/` lacks a `require*` call.

**Nine roles, not five.** The matrix in the build plan (§2.2) covers Faculty Advisor, President, Vice President, Tech Head, Events Head, Documentation Head, Social Media Head, Club Head, Vice Head. Docs Head and Social Media Head are the awkward ones: cross-club but narrow, so role-only checks are insufficient. Permissions are therefore expressed as **capabilities** (`manage:announcements`, `manage:resources`, `approve:events`, …) mapped from role, and `requireCapability` is the check. Faculty Advisor maps to read-only capabilities exclusively — the write path is unreachable for that role by construction, not by UI hiding.

**Layer 3 — RLS.** Default deny on every table. Public tables get read-only policies for the anon role. PII tables get **no** anon policy at all — reads and writes happen only through the service role in validated server code.

```sql
alter table registrations enable row level security;
-- deliberately no policy for anon/authenticated: default deny
revoke all on registrations from anon, authenticated;
```

---

## 5. Input validation

**[T5, T6]** Zod schema at the top of every handler. Representative:

```ts
const RegistrationSchema = z.object({
  eventId:    z.string().uuid(),
  studentName:z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M} .'-]+$/u),
  rollNo:     z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,15}$/),
  department: z.enum(DEPARTMENTS),
  year:       z.coerce.number().int().min(1).max(5),
  email:      z.string().trim().toLowerCase().email().max(120),
  phone:      z.string().trim().regex(/^[6-9]\d{9}$/),
  teamMembers:z.array(TeamMemberSchema).max(5).optional(),
  turnstile:  z.string().min(1),
  website:    z.string().max(0),          // honeypot: must be empty
});
```

Rules: never trust a client-supplied id, price, capacity, role, or status. Body size capped at 100 KB for JSON routes. Unknown keys stripped (`.strict()`), not ignored. Rejections return a generic 400 — validation detail goes to the log, not the response.

**SQL injection [T6]:** parameterised queries only, via the Supabase client. No string-built SQL anywhere. Raw SQL exists only inside reviewed, `search_path`-pinned migrations.

**XSS [T6]:** React escapes by default. `dangerouslySetInnerHTML` is banned by an ESLint rule.

The **announcement rich text editor** deserves its own paragraph, because it is the single most likely XSS vector in this application and v1 never got as far as building it. Rules: the editor stores **Markdown, not HTML** — so there is no round-trip of attacker-controlled markup. Rendering happens server-side through a fixed allowlist (no `<script>`, no `<iframe>`, no `on*` attributes, no `javascript:` or `data:` URLs, no `style` attributes). Embedded images must resolve to the Supabase Storage host. Sanitisation runs on **write and on read**, so a payload stored before a sanitiser bug was fixed still cannot render afterwards. CSP nonces mean an injected inline script would not execute even if all of that failed.

---

## 6. Rate limiting

Upstash Redis sliding window, with an in-memory fallback for local dev. Keyed by IP **and** by a semantic identifier so one bad actor rotating IPs still gets caught. **[T2, T5]**

| Endpoint | Limit |
|---|---|
| `POST /api/registrations` | 5 / 10 min per IP · 3 / hour per roll no · 10 / hour per email |
| `POST /api/contact` | 3 / hour per IP |
| `POST /api/join` | 3 / day per roll no |
| `POST /api/admin/login` | 5 / 15 min per IP and per account |
| `POST /api/student/registrations` (lookup) | 10 / 10 min per IP |
| `GET /api/events` | 120 / min per IP |
| Any admin mutation | 60 / min per session |

Plus **Cloudflare Turnstile** (free, privacy-preserving, no puzzle for real users) on registration, contact, and join, verified server-side.

---

## 7. CSRF

**[T6]** SameSite=Lax already blocks the classic cross-site form post. On top of that, every state-changing admin request carries a double-submit token (cookie + `X-CSRF-Token` header), and every mutating handler verifies the `Origin` header matches the site origin. Requests with no `Origin` and no token are rejected.

---

## 8. QR check-in tokens

**[T1]**

```
token = base64url( registrationId + "." + eventId + "." + expUnix + "." +
                   HMAC-SHA256(secret, registrationId|eventId|expUnix) )
```

- Secret is `CHECKIN_HMAC_SECRET`, server-only, rotatable.
- `exp` = event date 23:59 local. Expired tokens are refused.
- The database stores **only** `checkin_token_hash` (SHA-256), never the token.
- Redemption is atomic: `UPDATE registrations SET attended = true, checked_in_at = now(), checked_in_by = :admin WHERE id = :id AND attended = false RETURNING id`. Zero rows returned means "already checked in" — a replayed screenshot fails.
- Every scan writes an audit row.
- The scanner UI shows the student's name and photo-less details so the volunteer at the door can sanity-check identity.

---

## 8a. Attendance sessions — rotating broadcast QR

**[T1]** The door-scan token above assumes a staffed gate. Small events have none, and their real threat is **proxy attendance**: a student marking an absent friend present. The rotating-broadcast mode (`BUILD_PLAN.md` §13.8) inverts the scan — the organiser displays one QR, present students scan it from their own phones inside a short window — and layers four independent controls.

```
displayed code = HMAC-SHA256(ATTENDANCE_HMAC_SECRET, session_id | floor(unix / 5))
```

rotated every ~5 s, TTL ~10 s, accepted only while the session is open (default 60 s).

| Layer | Defeats | Strength |
|---|---|---|
| Rotating code (5 s) + 60 s window | Screenshot forwarded to an absent friend | Strong — stale before it arrives |
| Device binding: 1 roll ⇄ 1 phone | "Logging in" as a friend; one person marking many | Strong — this is the identity control |
| One scan per device per session | A single phone submitting many roll numbers | Strong |
| Network / IP allowlist *(optional)* | Scans from off the campus network | Coarse — proves "on network", not "in room" |
| GPS geofence, venue + ~75 m *(optional)* | Scans from elsewhere on campus | Medium — better presence proof; indoor GPS is flaky |

**Device binding without accounts.** The no-login rule stands. A device credential is minted only when the student taps the existing one-tap email-confirmation link (§12.4 of the build plan) *on their phone*: a signed, httpOnly, `__Host-` cookie whose id is stored as `student_devices.device_hash`. Attendance for a roll is accepted only from its enrolled device; re-enrolment on a new phone revokes the previous one — one active phone per roll. IP is **not** used for this: campus NAT collapses every phone to one egress address and mobile data rotates addresses, so IP cannot tell devices apart. It serves only as an optional coarse "on the campus network" gate.

**Redemption is atomic and audited**, exactly like the door-scan path: `UPDATE registrations SET attended = true, checked_in_at = now(), checkin_method = 'self' WHERE id = :id AND attended = false RETURNING id`, one audit row per scan, the submitted code verified server-side against the current rotation slot. Rate-limited per device and per session.

**Honest limit.** No control defeats a present student physically holding an *absent* friend's unlocked, already-enrolled phone. Rotation and device binding raise the cost from "text me the code" to "hand me your phone"; beyond that the audit trail and the organiser reconciling the live checked-in count against the room are the backstop. Stated plainly so the mode is never believed to be stronger than it is.

---

## 9. Certificates

**[T1]**

- Two types, per PRD v1.1: **participation** issues automatically to `attended = true` registrations; **winner** is issued manually by an authorised role picking placements from the attendee list. Winner issuance is a separate capability (`issue:winner_certificate`) and every issuance writes an audit row naming the actor — a fake award is the highest-value forgery on this platform, so it must never be attributable to "the system".
- An admin override to issue participation certificates to "all registrants" rather than attendees exists, but is logged loudly.
- Serial: 128 bits from `crypto.randomBytes`, rendered as `CSE-2026-XXXX-XXXX`.
- Each PDF prints the serial plus a QR pointing to `https://<site>/verify/<serial>`.
- `/verify/[serial]` is public and rate-limited; it shows student name, event, date, issuing club, **certificate type**, and issue date — and nothing else. Unknown or revoked serials return a clear "not valid" page. Responses are timing-uniform.
- Storage: a dedicated bucket path, served via **signed URLs with a 15-minute TTL** rather than public links, so a certificate URL can't be enumerated or shared indefinitely.
- Revocation: setting `revoked_at` flips the verify page to "revoked" immediately.

---

## 10. Uploads

**[T5, T6]**

Admin-only. Validated by **magic bytes**, not by extension or client MIME. Allowlist: JPEG, PNG, WebP, AVIF. Max 8 MB. Every image is re-encoded through `sharp` — which strips EXIF, kills any polyglot payload, and produces predictable output. Filenames are replaced with a UUID; the original name is stored as metadata only. SVG upload is **disallowed** (SVG is an XSS vector). Storage bucket serves with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

---

## 11. PII and enumeration resistance

**[T3]**

- No public endpoint ever returns a registration row. Seat counts come from a `SECURITY DEFINER` RPC that returns a bare integer.
- `/my-events` requires roll **and** matching email. Comparison uses `crypto.timingSafeEqual`. A wrong email and a nonexistent roll number produce byte-identical responses and identical timing. Rate-limited at 10/10 min.
- Admin CSV exports are audit-logged with row counts.
- Sentry is configured with `sendDefaultPii: false` and a `beforeSend` scrubber for email, phone, and roll-number patterns.
- Retention: registrations for completed events older than 3 years are anonymised by a scheduled job (name and certificate retained, phone and email nulled).

---

## 12. CSV export safety

**[T6]** Any cell whose first character is `= + - @ \t \r` is prefixed with a single quote and the whole field is quoted. Newlines and quotes inside values are escaped. Exported with a UTF-8 BOM so Excel reads Indian names correctly. A unit test asserts `=cmd|'/c calc'!A1` round-trips inert.

---

## 13. Cron endpoints

`app/api/cron/*` verifies `Authorization: Bearer ${CRON_SECRET}` in constant time before doing anything, and additionally checks Vercel's cron signature header. Jobs are idempotent — a double fire cannot send two reminder emails, guarded by `reminder_sent`.

---

## 14. Audit log

Append-only. `INSERT` granted to the service role; `UPDATE` and `DELETE` granted to nobody, enforced by RLS and by revoking table privileges. Records actor, action, entity, entity id, before/after JSON diff, IP, user agent, timestamp. Written for: login success and failure, role change, user create/deactivate, event approve/reject, attendance change, certificate issue/revoke, CSV export, upload, delete of any content, and any settings change. Viewable by Tech Head, filterable, exportable.

---

## 15. Dependencies and CI

Every push runs: `tsc --noEmit` · ESLint (with the custom auth-check and no-`dangerouslySetInnerHTML` rules) · `vitest` · `npm audit --audit-level=high` · `next build`. Dependabot weekly. Lockfile committed. No `postinstall` scripts from unvetted packages. A CI step regenerates Supabase types and fails if the committed types differ from the schema.

**Security-specific tests:**

- An unauthenticated request to each `/api/admin/*` route returns 401.
- A club-head session requesting another club's registrations returns 403.
- A Social Media Head session hitting an event-approval or registration route returns 403 **[T8]**.
- A Faculty Advisor session returns 403 on every write route in the app.
- A consumed or expired admin invite token cannot be reused.
- Markdown containing `<script>`, `onerror=`, and a `javascript:` link renders inert.
- The anon Supabase key cannot select from `registrations`.
- Rate limiter blocks the 6th login attempt.
- CSV formula injection is neutralised.
- A replayed QR token fails the second time.
- A rotating attendance code from an earlier slot fails, and a scan from a device not enrolled to that roll is rejected.
- A second phone enrolling for a roll revokes the first; the old device can no longer mark attendance.
- Event results are not publicly readable until published.
- A tampered certificate serial fails verification.
- Student lookup with a wrong email returns the same body as a nonexistent roll number.

---

## 16. Pre-launch checklist

- [ ] All secrets rotated from any development values
- [ ] `NEXTAUTH_SECRET`, `CHECKIN_HMAC_SECRET`, `ATTENDANCE_HMAC_SECRET`, `CERT_HMAC_SECRET`, `CRON_SECRET` are ≥32 random bytes and distinct
- [ ] Service-role key confirmed absent from the client bundle (`grep` the `.next` output in CI)
- [ ] RLS verified enabled on every table (`select * from pg_tables where rowsecurity = false`)
- [ ] Supabase point-in-time recovery enabled
- [ ] securityheaders.com grade A+
- [ ] Every admin account has 2FA enrolled and has rotated its initial password
- [ ] Sentry receiving events, PII scrubber verified
- [ ] Domain SPF, DKIM, DMARC configured for Resend
- [ ] An external review pass — a good live exercise for CyberSentinel
