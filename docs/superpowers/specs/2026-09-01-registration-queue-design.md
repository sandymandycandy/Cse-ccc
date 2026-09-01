# Scheduled Registration + Waiting Room + Manual Waitlist — Design

**Status:** approved design, pre-implementation
**Date:** 2026-09-01
**Spec ref:** BUILD_PLAN §6 (time model), §13.6 (waitlist); extends the event
registration form builder (`register_for_event` v2, spec 2026-08-29) and the manual
event attendance flow (spec 2026-08-31).
**Owner ask (2026-09-01, brainstorm):** "A queue system for event registration, because
~1000 students will try to register for a 60-seat event. There must be a registration
**start time** that can be set, students should **know when registration starts**, and
the event can be **posted before registration opens** so people can see it."

## The problem, restated after reading the code

Two of the three asks are already half-built at the database layer:

- **Overselling is already impossible.** `register_for_event` (v2,
  `20260829010000_register_for_event_v2.sql`) takes a per-event row lock
  (`select * from public.events where id = p_event_id for update`), counts confirmed
  rows, and only then inserts. 1,000 concurrent attempts for 60 seats are serialized;
  exactly 60 win. **This is kept, not rebuilt.**
- **`events.registration_opens_at` / `registration_closes_at` exist and are enforced**
  by the same RPC (it returns `closed` when `now() < opens_at` or `now() > closes_at`).

The real gaps:

1. **No way to set the open/close time.** The admin `EventForm` never renders these
   fields, and `CreateSchema` (`.strict()`) doesn't accept them — so an organiser
   cannot schedule an open time at all.
2. **No public countdown.** `/events/[id]` shows the register form unconditionally; a
   submit before the open time returns a bare `closed` error with no indication of
   *when* it opens. Students can't "see it before it opens" in any useful way.
3. **The rush is a raw race.** With no waiting-room UX, 1,000 near-simultaneous submits
   either succeed or bounce with a generic error, and there is no organiser-controlled
   waitlist surface for the ~940 who miss out.

**Fairness model chosen by the owner:** first-come-first-served (seat awarded at the
moment the POST reaches the DB), with a *waiting-room* submit experience — **not** a
numbered turnstile ("You are #342"), which the owner explicitly ruled out. When the 60
fill, latecomers land on a **waitlist with a position**, and the organiser **manually
promotes** from the registrations page (no automatic drop→promote→email chain).

The guiding test: "An organiser creates a 60-seat event, sets registration to open
Friday 5:00 PM IST, and publishes it Monday. All week the event page shows a live
countdown. At 5:00 PM the form appears; 1,000 students submit; exactly 60 are confirmed
in arrival order and the rest see 'You're #N on the waitlist' — no raw errors. The
organiser opens the registrations page, sees the waitlist, and clicks 'Promote' on three
students, who become confirmed and are emailed."

## What already exists (reused, not rebuilt)

- **The anti-oversell lock** in `register_for_event` — the single serialization point.
  Kept; extended (see §2).
- **`events.registration_opens_at` / `registration_closes_at` (timestamptz, nullable)**
  — columns already present (`20260820120002_events.sql`), already enforced by the RPC.
- **`events.waitlist_enabled` (boolean, default true)** — already read by the RPC's
  full branch. We surface it as a per-event checkbox.
- **`registrations.confirmed_at`** — since the form-builder rework, a successful submit
  sets `confirmed_at = now()` immediately (there is no longer any email-confirmation
  hold). So `confirmed_at IS NULL` is **free** to mean "waitlisted, not yet admitted."
- **`get_registration_counts`** (`20260820120007`) already counts only
  `confirmed_at IS NOT NULL`, so the public "X/60 seats" display **stays correct** once
  waitlisted rows (confirmed_at NULL) exist. No change needed there.
- **`(event_id, roll_no)` partial-unique index** — prevents a student being both
  registered and waitlisted, regardless of confirmed state.
- **`EventForm.tsx` / `events/actions.ts` / `getEventForEdit`** — the create/edit
  plumbing that the new fields slot into, using the existing `istLocalToUTC` /
  `istLocalInput` datetime helpers.
- **`enqueueEmail` + the generic branded renderer** — reused for the promotion email;
  no new template code (an `event_*`-style payload with a `url`).
- **`writeAudit`, `canManage`, `manage:registrations` capability** — the promote action
  is gated and audited exactly like `toggleAttendanceAction` / `shortlistAction`.

## What is added

### 1. Data model — fold the waitlist into `registrations`

**Decision (approved):** a waitlisted student is a **normal `registrations` row with
`confirmed_at = NULL`** plus a new `waitlist_position int`, rather than a row in the
separate legacy `waitlist` table. Rationale:

- The legacy `waitlist` table stores only `roll_no + email + position` — promoting from
  it would produce a registration missing the student's name, department, year, phone,
  and custom answers. Folding into `registrations` **captures the full submission** for
  every waitlisted student.
- The admin registrations table, CSV export, custom-answer columns, and dedup **already
  handle these rows.** Promotion is literally `set confirmed_at = now(), waitlist_position = null`.
- The public seat count already excludes `confirmed_at IS NULL`, so "X/60" is correct
  with zero extra work.

One additive migration `supabase/migrations/20260901000000_registration_waitlist_position.sql`:

```sql
alter table public.registrations
  add column if not exists waitlist_position int;

-- Order the waitlist for an event; only unconfirmed rows carry a position.
create index if not exists registrations_waitlist_idx
  on public.registrations (event_id, waitlist_position)
  where confirmed_at is null and waitlist_position is not null;
```

The legacy `public.waitlist` table is **left in place, unused** (no code will write to
it after this change). A held drop migration can retire it later, consistent with the
repo's other post-deploy drops — it is **not** dropped in this feature.

### 2. RPC — split `not_open` vs `closed`, insert waitlisted rows as unconfirmed registrations

A new revision of `register_for_event` (same 8-arg jsonb signature; `create or replace`,
additive migration `20260901010000_register_for_event_waitlist.sql`). Two changes:

**(a) Distinguish "not yet open" from "closed".** The single `closed` status becomes two,
so the client's waiting room knows whether to keep waiting (opening imminently, clock
skew) or stop (the window has passed):

```sql
if v_event.approval_status <> 'approved' or v_event.status <> 'published' then
  status := 'closed'; ... return;
end if;
if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
  status := 'not_open'; registration_id := null; return next; return;
end if;
if v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
  status := 'closed'; registration_id := null; return next; return;
end if;
```

**(b) Waitlist = an unconfirmed registration with a position** (replacing the write to
the legacy `waitlist` table). Still under the same per-event `FOR UPDATE` lock, so
positions are gap-free and strictly ordered by arrival:

```sql
-- seats mode, capacity reached:
elsif v_event.waitlist_enabled then
  select coalesce(max(waitlist_position), 0) + 1 into v_pos
    from public.registrations
    where event_id = p_event_id and confirmed_at is null;
  insert into public.registrations
    (event_id, student_name, roll_no, email, phone, department, year,
     custom_answers, confirmed_at, waitlist_position)
  values
    (p_event_id, p_student_name, p_roll_no, p_email, p_phone, p_department, p_year,
     p_custom_answers, null, v_pos)
  returning id into v_new_id;
  status := 'waitlisted'; registration_id := v_new_id; return next; return;
else
  status := 'full'; registration_id := null; return next; return;
end if;
```

Notes:
- The dedup check (roll, then email) runs **before** this branch and already covers
  both confirmed and waitlisted rows (they're all in `registrations`), so a student
  can't double-submit onto the waitlist. Returns `duplicate` with their existing row.
- Unlike the legacy path, the waitlist no longer **requires** a roll number — the full
  identity is optional and stored as given (identity columns are already nullable).
- `shortlist` mode is unchanged (ignores capacity; open/close window still applies).
- The `RETURNS TABLE (status text, registration_id uuid)` shape is unchanged, and the
  new `waitlisted` id lets the route return the student's position if we choose to
  (the position is read back from the returned row).

Grants unchanged (service_role only).

### 3. Scheduled open/close time (admin)

**`src/components/admin/EventForm.tsx`** — two new `datetime-local` inputs (IST), placed
next to the existing capacity/selection-mode block:

- "Registration opens (IST)" → `name="registrationOpensAt"`, optional.
- "Registration closes (IST)" → `name="registrationClosesAt"`, optional.
- A "Allow a waitlist when full" checkbox → `name="waitlistEnabled"`, default **checked**
  (maps to `events.waitlist_enabled`). Hint: "When the seats fill, extra students join a
  waitlist you can promote from later."

**`src/app/admin/(app)/events/actions.ts`** — extend `CreateSchema` (add the three
fields; it is `.strict()`, so they must be declared), `parseEvent`, and both the insert
(`createEventAction`) and the update object (`updateEventAction`). Conversion reuses
`istLocalToUTC`. Validation added to both actions:

- If both set, `opens_at <= closes_at` (else "Registration must open before it closes.").
- If open set, `opens_at <= starts_at` (recommend; else "Registration should open before
  the event starts.").
- Empty string → `null` (clears the schedule).

**`getEventForEdit`** (in the events edit page's data layer) + `EventFormState`/form-state
initial shape — return `registrationOpensAtLocal` / `registrationClosesAtLocal` (via
`istLocalInput`) and `waitlistEnabled` so edits round-trip.

### 4. Waiting room (public)

**`src/lib/queries.ts` (`getEventDetail`)** — additionally return
`registrationOpensAt` / `registrationClosesAt` (ISO strings or null). The
`EVENT_SELECT` for the detail query adds those two columns.

**`src/app/events/[id]/page.tsx`** — compute a registration phase and render
accordingly (all times server-rendered ISO, countdown ticked client-side):

- `now < opensAt` → render a **`<RegistrationCountdown opensAt=… />`** client component
  ("Registration opens in 2d 04h 12m" + the exact IST datetime) **in place of** the
  form. The event is already publicly listed (approved + published), so posting early
  "just works."
- `opensAt <= now <= closesAt` (or nulls) → render `<RegisterForm>` as today.
- `now > closesAt` → "Registration for this event has closed." (no form).
- Full is orthogonal: the form still renders (to join the waitlist) unless the window is
  closed.

**`src/lib/registration/countdown.ts`** (new, pure, unit-tested) — `formatCountdown(msLeft)`
→ `{ days, hours, minutes, seconds, done }` and label helpers. No DOM, fully testable.

**`src/components/RegisterForm.tsx`** — three additions:

1. **Auto-reveal at the tick.** When given `opensAt` in the future, it renders the
   countdown and flips to the form when the countdown reaches zero — **plus a random
   0–1500 ms jitter** before enabling submit, so 1,000 synchronized countdowns don't
   fire in the exact same millisecond.
2. **"Holding your place" submit state.** On submit, show a distinct waiting-room panel
   ("Holding your place… you're in line. Hang tight — this can take a moment when a lot
   of people register at once."). The POST **auto-retries** on transient outcomes —
   HTTP `429` (honoring `Retry-After`), `503`, network/timeout, and a `not_open` body
   (clock skew: keep waiting) — with capped exponential backoff + jitter (e.g. base
   400 ms, cap ~4 s, max ~8 attempts / ~30 s), preserving the form data across retries.
   It **stops** on any terminal outcome: `registered` / `submitted` / `waitlisted` /
   `duplicate` / `full` / `closed` (window passed).
3. **Position in the waitlist message.** The `waitlisted` result shows "You're #N on the
   waitlist" using the position returned by the route.

**`src/lib/registration/retry.ts`** (new, pure, unit-tested) — `nextDelay(attempt, retryAfter?)`
and `shouldRetry(outcome)` so the backoff/eligibility logic is testable without a
network. The component consumes these.

**`src/app/api/registrations/route.ts`** — pass the new statuses through:
`not_open` → `409 {status:"not_open"}` (client keeps waiting), `closed` unchanged
(`409`), and include the returned `waitlist_position` in the `waitlisted` response so
the form can show "#N".

### 5. Manual waitlist + promote (admin)

**`src/lib/admin/registrations.ts` (`listRegistrations`)** — already loads the event's
rows; expose `waitlistPosition` and `confirmed` per row so the page can split them. Add
a small `getWaitlist(eventId)` convenience (or derive client-side from the existing list)
ordered by `waitlist_position`.

**`src/app/admin/(app)/events/[id]/registrations/page.tsx`** — for seats-mode events,
render a **Waitlist** section beneath the confirmed table: the `confirmed_at IS NULL`
rows in `waitlist_position` order (name, roll, position, custom columns reused), each
with a **"Promote to registered"** button (shown only when `canEdit`).

**`src/app/admin/(app)/events/[id]/registrations/actions.ts`** — new
`promoteWaitlistAction(formData)`:

- Guarded by `getAdminSession` + `canManage(session, "manage:registrations", ev.clubId)`
  (own-club scoped), mirroring `toggleAttendanceAction`.
- Scopes the write to **both** `registration_id` **and** `event_id` (the IDOR lesson
  from `shortlistAction`).
- Sets `confirmed_at = now(), waitlist_position = null`. Promotion is **allowed past
  capacity** — a deliberate organiser override (documented in the button hint).
- Emails the promoted student via `enqueueEmail` (a `registration_promoted`-flavoured
  payload through the generic renderer, with the event URL) when they gave an email.
- `writeAudit({ action: "waitlist_promote", entity: "registration", entityId })` and
  `revalidatePath` the registrations page.

## Concurrency & scale notes

No new infrastructure. All registration attempts serialize on the existing per-event
`FOR UPDATE` lock (~1–3 ms each ⇒ ~1–3 s for 1,000), and PostgREST absorbs the HTTP-level
concurrency (the app never opens raw PG connections — it calls the RPC over HTTPS). The
waiting-room client's jitter + backoff spread the herd so the pool is never hammered and
no student sees a raw error. Waitlist positions are assigned under the same lock, so
they're contiguous and correctly ordered by arrival. This is precisely why the
lightest-path (FCFS + waiting room) choice is sufficient here and a heavyweight queue
service is unnecessary.

## Security

- New RPC keeps `security definer`, `search_path = ''`, and service_role-only grants.
- `promoteWaitlistAction` is capability-gated, own-club scoped, event-scoped on the
  write, and audited — matching the existing registration actions.
- The public route still enforces: 100 KB body cap, honeypot, Turnstile-ready, per-IP +
  roll/email rate limit (`checkRegistrationLimits`), and schema-authoritative answer
  validation. The waiting-room retry respects `429`/`Retry-After`, so a client cannot use
  retry to bypass the rate limiter (it backs off rather than hammering).
- No new PII surface: waitlisted rows live in `registrations` (already service-role-only
  for anon), and the public seat count RPC returns bare integers as before.

## Testing

Pure/security-critical logic is unit-tested (vitest), matching repo convention;
DB-backed RPC + server actions are typecheck + walkthrough-verified.

- `src/lib/registration/countdown.test.ts` — `formatCountdown` across boundaries
  (days/hours rollover, zero/`done`, sub-second).
- `src/lib/registration/retry.test.ts` — `shouldRetry` per outcome (retry on
  429/503/network/not_open; stop on registered/waitlisted/full/closed/duplicate);
  `nextDelay` honors `Retry-After`, caps, and is monotonic-with-jitter within bounds.
- `src/lib/admin/registrations` (or a small pure helper) — waitlist split + next-position
  math.
- Event action validation — opens≤closes, opens≤starts, empty→null (extend the events
  action test surface if present; otherwise a focused pure validator).
- **Gate:** typecheck ✓ / lint ✓ / all tests ✓ / build ✓.

## Migrations & rollout

Both migrations are **additive** and safe to apply before the code ships (live prod on
old code keeps working — the new RPC is a `create or replace` of the same signature that
still honors the old columns; the new `waitlist_position` column is nullable):

1. `20260901000000_registration_waitlist_position.sql` — add
   `registrations.waitlist_position` + partial index.
2. `20260901010000_register_for_event_waitlist.sql` — replace `register_for_event` with
   the `not_open`-splitting, registrations-based-waitlist revision.

Apply via Supabase MCP `apply_migration` (shared/live DB), as with prior features. No
drop migration in this feature; retiring the legacy `waitlist` table is a separate,
later, held drop.

## Owed human-only walkthrough (server-action POSTs / live rush can't be curled)

1. Create a seats event (small capacity, e.g. 2), set **Registration opens** a couple of
   minutes out, publish. Confirm `/events/[id]` shows the **countdown** and no form.
2. At the open moment, confirm the form appears without a refresh; register up to
   capacity → "You're registered ✓".
3. Submit past capacity from another browser → "You're #1 on the waitlist."
4. In `/admin/events/[id]/registrations`, confirm the **Waitlist** section lists that
   student with their full details; click **Promote** → they move to confirmed, and a
   `registration_promoted` row is queued in `email_log`.
5. Set **Registration closes** in the past on a test event → confirm the page shows
   "Registration has closed" and a direct POST returns `closed` (no write).

Delete test rows afterward (shared/live DB).

## Out of scope (YAGNI)

- Automatic drop→promote→email when a confirmed student cancels (owner chose manual).
- A numbered turnstile / server-issued admission tokens ("You are #342").
- Per-batch admission workers, Vercel Queues, or any external queue store.
- Retiring the legacy `waitlist` table (separate later drop).
