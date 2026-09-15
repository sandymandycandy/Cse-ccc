# Broadcast email, event reminders and `.ics` feeds — design

**Status:** approved in chat 2026-09-15. Not implemented.
**Scope:** three related pieces of the Phase 2 backlog, designed together
because two of them share the email queue:

1. **Event reminder** — a one-press prefill on the existing participant-email
   page, *not* a cron job. The owner asked for a button they press themselves.
2. **`.ics` calendar feeds** — a per-event "Add to calendar" download plus
   subscribable feeds for all events and for one club.
3. **Broadcast composer + Outbox** — a general "write a mail and pick who gets
   it" surface covering club heads, council members, club members and an
   event's registrants, with the queue work needed to send to 908 people
   without melting.

## Goal

The owner asked for:

> also i want a separate button so that i can send email as i want to so i can
> do the customization for the events and separate for club heads and vice
> heads also maybe member for separate

and, on reminder timing:

> i need to do it i want it as a button

That second quote is the whole reason there is no reminder cron in this
design. The backlog listed "reminder cron"; the owner wants the timing in a
human's hands instead.

## What exists today

- **`email_log`** is a real queue: `template`, `to_email`, `to_name`,
  `subject`, `payload` (jsonb), `priority`, `status`, `sent_at`, `error`.
- **`enqueueEmail`** (`src/lib/email.ts`) inserts one `pending` row then
  attempts an immediate best-effort delivery, swallowing send errors so the row
  survives for retry.
- **`deliverPending(limit = 25)`** (`src/lib/email/send.ts`) drains pending rows,
  `priority` ascending then `created_at` ascending.
- **`/api/cron/send-email`** runs that drain, guarded by `CRON_SECRET`.
  `vercel.json` schedules it `0 3 * * *` — once a day, 08:30 IST.
- **`renderEmail`** (`src/lib/email/templates.ts`) **ignores the template
  name**. There is one branded wrapper driven entirely by the payload
  (`details` rows, `body` text, `url` + `linkLabel` button). A new kind of mail
  therefore needs no new template code — only a new payload.
- **`/admin/events/[id]/email`** already composes and sends to an event's
  registrants: audience `confirmed` | `all`, team-member fan-out via
  `teamRecipients`, dedupe by address, `isSafeHttpUrl` on the link, and an
  audit row. `broadcastAction` is the model this design generalises.

## The constraint that shapes everything

**Production sends over Gmail SMTP, not Resend.** `transport.ts` prefers
`GMAIL_USER`/`GMAIL_APP_PASSWORD` and only falls back to Resend, and both are
configured — so Gmail always wins. `sendViaGmail` opens a **fresh nodemailer
connection per message**, sequentially awaited.

Measured on the live Mumbai project (`jisahccdnthzgibszwnq`, 2026-09-15):

| Audience | Rows | With an address |
|---|---:|---:|
| `admin_users` — `club_head` + `vice_head` | 26 | 26 |
| `admin_users` — all active | 33 | 33 |
| `council_members` — active + approved | 32 | **26** |
| `club_members` | **908** | 908 |
| `registrations` (1 event exists) | 24 | 24 |

Club members are lopsided across the 14 clubs that have any: Coding 236,
Ai Forge 188, CyberSentinel 92, Short Film 79, AppNova 75, Fusion & Fashion 51,
Game development club 33, Nature 28, AspireX 27, Animatrix 25, Magazine 25,
Innovation 23, Yoga 18, Social Media Team 8.

Three consequences, all of which the design has to answer rather than dodge:

1. **Inline sending does not scale.** 236 sequential SMTP connections inside
   one server action will approach the 300 s function ceiling; 908 will pass it.
2. **A free Gmail app-password account caps near 500 recipients/day.** An
   all-members send physically cannot clear in one day.
3. **The existing drain is 25 rows once a day.** Left alone it would take over
   a month to clear a single all-members blast.

So bulk sending needs: queue-without-sending, a batch insert, a way to drain on
demand, and a UI that tells the truth about the daily ceiling.

## 1. Event reminder — a prefill, not a cron

The send path already exists and is correct. What is missing is that a club
head has to compose the reminder from scratch every time.

- A **"Remind them it's coming up"** button on `/admin/events/[id]/email` fills
  the existing `subject` and `message` fields and selects the *Confirmed*
  audience. The head reads it, edits if they like, presses the normal Send.
- It goes through **`broadcastAction` unchanged** — no new server action, no new
  audit action, no new template, no new send path to get wrong.
- **`src/lib/admin/reminder-text.ts`** (pure, TDD) builds subject and body from
  the event: `Reminder: <title> is on <date>`, and a body naming the IST date,
  start time and venue. All-day events say so instead of printing a time.
- A **"Last emailed …"** line on the page, from the newest `email_log` row for
  that event, so nobody blasts the same people twice in an hour.

**Why a prefill rather than true one-click:** a mass mail cannot be recalled. A
button that sends on press, with no preview, is one misclick from an apology.
The prefill is still one press to compose and one to send.

Biggest event on record is 24 registrations, so reminders stay on the inline
path and never touch the Outbox.

### Files

- new `src/lib/admin/reminder-text.ts` + test
- `src/components/admin/BroadcastForm.tsx` — the preset button, new optional props
- `src/app/admin/(app)/events/[id]/email/page.tsx` — pass event date/venue + last-sent
- `src/lib/admin/attendance.ts` — `getEventForAttendance` also selects
  `venue_text`, `is_all_day`, `ends_at`

## 2. `.ics` calendar feeds

`.ics` (RFC 5545) is what Google, Apple, Outlook and Samsung calendars read.
Two distinct uses: a **download** ("Add to calendar", one event, most people
use this) and a **subscription** (a URL the calendar app re-polls, so new and
edited events appear on their own).

### `src/lib/ics.ts` — pure renderer, TDD

Takes plain event records, returns a `VCALENDAR` string.

- **CRLF** line endings and **75-octet line folding** — both are mandatory in
  the spec and both are what broken `.ics` output usually gets wrong.
- Escape `\` `;` `,` and newlines in every text value.
- Timed events: `DTSTART`/`DTEND` as UTC (`…Z`) — `starts_at` is `timestamptz`,
  so no timezone table is needed. All-day events: `VALUE=DATE` on the IST day.
- **`UID` = `<eventId>@<site host>`**, stable forever, so a re-poll *updates* an
  entry instead of duplicating it. `LAST-MODIFIED`/`DTSTAMP` from `updated_at`.
- Cancelled events are emitted with **`STATUS:CANCELLED`**, not dropped — a
  subscriber must see the cancellation, not watch the entry silently vanish.
  `events_public_read` already keeps a cancelled event readable for 7 days
  after `cancelled_at`, which is exactly the window this needs.
- `SUMMARY` title, `DESCRIPTION` blurb, `LOCATION` venue, `URL` event page.

### Routes

| Route | Contents |
|---|---|
| `/events/<id>/event.ics` | one event, `Content-Disposition: attachment` |
| `/calendar.ics` | every event, upcoming + last 60 days |
| `/clubs/<slug>/events.ics` | one club, same window |

All three are route handlers reading through `createPublicClient()`, so RLS
enforces "approved, and not long-cancelled" — the feeds cannot leak a pending
or rejected event. `Content-Type: text/calendar; charset=utf-8`,
`Cache-Control: public, max-age=300`. They sit behind the public maintenance
gate in `proxy.ts`, which is correct: maintenance means the public site is down.

A new `getIcsEvents()` in `src/lib/queries.ts` returns the raw columns —
`EventSummary` is lossy (pre-formatted labels, no `updated_at`, no status).

**UI:** an "Add to calendar" link on the event page; a "Subscribe" link on
`/calendar` and on each club page, with the feed URL shown so it can be copied
into a calendar app.

## 3. Broadcast composer

### Capability

New `"manage:broadcast"` in `src/lib/auth/capabilities.ts`:

```
"manage:broadcast": {
  faculty_advisor: "all", president: "all", vice_president: "all",
  tech_head: "all", club_head: "own", vice_head: "own",
},
```

`events_head` and `social_media_head` get nothing here for now — deliberately
decided, and a one-line change if the council wants it later.

### Audiences

```ts
type Audience =
  | { kind: "heads" }                      // admin_users, club_head + vice_head
  | { kind: "council" }                    // council_members, active + approved
  | { kind: "club_members"; clubId: string }
  | { kind: "all_members" }                // every club_members row
  | { kind: "event"; eventId: string; scope: "confirmed" | "all" };
```

The `event` kind carries the same `confirmed` / `all` choice the per-event page
already offers, so the composer is not a weaker version of it.

An **`own`** holder may only pick `club_members` for their own club and `event`
for an event their club hosts. `heads`, `council` and `all_members` require
`all`. **The check runs server-side against the session and the resource's real
club, never against anything the form posted** — the same rule
`broadcastAction` already follows.

### Modules

- **`src/lib/admin/broadcast-audience.ts`** — pure: parse an audience out of
  form data, `audienceLabel()`, `isAudienceAllowed(identity, audience, ownClubId)`,
  and the inline-vs-queue threshold. TDD.
- **`src/lib/admin/broadcast-recipients.ts`** — server-only: one query per
  audience kind, returning `{ email, name }`. Deduped case-insensitively on the
  address, first name wins. Reuses `teamRecipients` for the event kind so team
  events still reach every member.

### Page

**`/admin/email`** — audience picker (with the live count beside each option,
and for council the honest *"26 of 32 have an address on file"*), subject,
message, optional link + button label. Reuses the existing field markup and the
`isSafeHttpUrl` check.

**Sending over 50 recipients requires a confirmation step** naming the exact
count and audience before anything is queued. Audited as `broadcast_send` with
the audience kind, recipient count and subject.

## 4. Queue changes and the Outbox

### `enqueueEmail`

- New `deferred?: boolean` — insert the row and **skip** the inline delivery.
- New `enqueueEmailBatch(rows)` — one multi-row insert. 908 individual inserts
  would be their own timeout even without any sending.
- Bulk mail is queued at **`priority: 8`**, below transactional mail (3–5).
  `deliverPending` sorts on priority, so a password reset never waits behind
  900 newsletters.

### Threshold

`INLINE_MAX = 50`. At or below, send inline exactly as today — a 26-person
heads mail just goes. Above it, queue deferred and tell the sender it is queued
and how to drain it.

### `/admin/outbox`

**Readable by any `manage:broadcast` holder; draining requires `all`.** This
resolves a dead end that a simpler rule creates: a club head with `own` can
queue a 236-person send to their own club, which is over `INLINE_MAX` and so
never sends inline. If the Outbox were council-only they would press Send, see
"queued", and have no way to find out what happened to it. So a head can *see*
their send sitting in the queue and where it is in line; only the council can
*drain* it, because the ~500/day Gmail quota is shared org-wide and spending it
is a council decision. A head's queued mail otherwise clears on the nightly
cron at 100/day.

- Pending / failed counts, and **sent today** against the ~500/day Gmail
  ceiling, so the ceiling is visible rather than a mystery failure.
- **"Send next batch"** — drains 40 (≈40 s of sequential SMTP, comfortably
  inside the 300 s limit). Press it again for the next 40.
- **"Retry failed"** — flips `failed` rows back to `pending`.
- The 20 most recent rows with status and error text.

### Cron

`deliverPending` limit in `/api/cron/send-email` goes **25 → 100** so the
nightly backstop actually chips at a backlog. Schedule unchanged.

### `List-Unsubscribe`

Bulk sends carry `List-Unsubscribe: mailto:<EMAIL_FROM>?subject=unsubscribe`.
Cheap, and the decent thing when mailing 908 students who never opted in. Real
per-recipient email preferences stay on the backlog as their own feature.

## Data model

**No migration.** Every audience reads a table that already exists, and
last-sent is derived from `email_log`. The only schema-adjacent change is
widening one `select` in `getEventForAttendance`.

## Testing

TDD on the four pure modules:

- `ics.ts` — folding at 75 octets, escaping, CRLF, all-day vs timed, UID
  stability, `STATUS:CANCELLED`, empty calendar.
- `reminder-text.ts` — timed vs all-day, missing venue, long titles.
- `broadcast-audience.ts` — every audience × `all`/`own`/`none`, cross-club
  refusal, threshold boundary at exactly 50.
- Recipient dedupe — case-insensitive, team fan-out, rows with no address.

Then the full gate: typecheck, lint, the whole suite, build.

## Out of scope

- **Co-hosted events** — `event_clubs` already supports several clubs per event
  with a partial unique index on the primary; the event form writes one row and
  ~20 read sites collapse to `find(is_primary) ?? [0]`. Separate piece of work.
- Per-recipient email preferences / unsubscribe tracking.
- Moving bulk mail to Resend with a verified domain — the real fix for the
  500/day ceiling, and the thing to do when the ceiling starts hurting.
- Scheduled or recurring sends. The owner asked for a button.

## Verification when built

Browser walkthrough, signed in as `sandy` (tech_head):

1. Open an event's email page, press the reminder preset, confirm the prefilled
   text reads correctly, send to yourself, check the inbox.
2. Download `/events/<id>/event.ics` and open it on a phone — the event should
   land in the calendar with the right time in IST.
3. Subscribe a calendar app to `/calendar.ics`, add an event in admin, confirm
   it appears; cancel it, confirm the entry goes cancelled rather than missing.
4. `/admin/email` → heads (26) → send → 26 arrive inline.
5. `/admin/email` → all members (908) → confirm step → queued, nothing sent
   inline → `/admin/outbox` shows 908 pending → one batch drains 40.
6. Sign in as a club head: `/admin/email` offers only their own club's members.
