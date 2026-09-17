# Co-hosted events — design

**Status:** approved in chat 2026-09-15. Not implemented.
**Scope:** let an event list secondary clubs alongside its primary host, so two
clubs can run something together — and make the permission model agree with
itself, which today it does not.

## Goal

The owner picked this off the backlog with three decisions already made:

- **A co-host can do everything except cancel or delete.** Edit details, take
  attendance, manage registrations, enter results. The irreversible action stays
  with whoever owns the event.
- **Both names show publicly, primary first** — "Coding × Ai Forge".
- **No consent step.** Whoever manages the event picks co-hosts directly; the
  audit log records who added whom. Eleven clubs who already talk to each other
  do not need an invitation workflow, and a wrong co-host is one edit away from
  fixed.

## What exists today

`event_clubs` has been ready for this since the first migration
(`20260820120002_events.sql:64`):

```sql
create table public.event_clubs (
  event_id uuid not null references events(id) on delete cascade,
  club_id  uuid not null references clubs(id)  on delete cascade,
  is_primary boolean not null default false,
  primary key (event_id, club_id)
);
-- exactly one primary club per event
create unique index event_clubs_one_primary_idx on event_clubs (event_id) where is_primary;
```

The app never writes a second row. `createEventAction` inserts one link with
`is_primary: true` (`events/actions.ts:184`), edit moves that row
(`actions.ts:371`), and about a dozen read sites collapse the list with
`find(is_primary) ?? [0]`.

Live data as of 2026-09-15 (`jisahccdnthzgibszwnq`): **1 link row, 1 primary,
0 secondary.** So nothing below is a live bug yet.

### ⚠️ The latent asymmetry this feature activates

**The event list and the permission checks already disagree about what "your
club's event" means.**

- `listEventsForAdmin` scopes a club admin with an inner join on the link table
  and `\`.eq("event_clubs.club_id", session.clubId)\`` (`admin/queries.ts:62,74`).
  That matches **any** link row — primary or not.
- Every permission check is `canManage(session, cap, ev.clubId)` where `ev.clubId`
  came from `find(is_primary) ?? [0]` — the **primary only**.

The moment a secondary row exists, that club's head **sees the event in their
dashboard and is refused on every action**: edit, cancel, registrations,
attendance, results, certificates. A dead end with no explanation.

Co-hosting does not introduce that bug. It *activates* one that is already in
the code, and fixing it is the substance of this work — not the second club
name on a card.

## §1 Authorisation

New pure module **`src/lib/admin/event-hosts.ts`**:

```ts
export interface EventHosts {
  /** The club that owns the event. Null only for legacy rows with no link. */
  primaryClubId: string | null;
  /** Every hosting club, primary first. */
  clubIds: string[];
}

/** True when the identity may act on the event through ANY of its hosting clubs. */
export function canManageEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean;

/** Cancel/delete: an `own` grant matches the PRIMARY club only. `all` is unaffected. */
export function canCancelEvent(id: AdminIdentity, hosts: EventHosts): boolean;

/** Reassigning the primary needs `all`, or being the CURRENT primary club's own head. */
export function canSetPrimary(id: AdminIdentity, hosts: EventHosts): boolean;
```

Every `canManage(session, cap, ev.clubId)` on an event becomes
`canManageEvent(session, cap, ev.hosts)`. Cancel keeps today's behaviour by
construction — `cancelEventAction` already resolves the primary club
(`actions.ts:544`) and checks `cancel:events` against it, so it changes least.

**The escalation this blocks.** Without `canSetPrimary`, a co-host could edit
the event, make *their* club primary, and lock the original club out of
cancelling its own event. A co-host may add and remove other co-hosts, and
remove itself; it may not reassign the primary.

Council roles (`all` on these capabilities) are unaffected throughout — they
could already act on any club's events.

## §2 Setting co-hosts

The event form (`EventForm.tsx`) gains a co-host multi-select beside the
existing hosting-club field, which keeps its current split: a hidden fixed input
for club heads (`EventForm.tsx:87`), a dropdown for council roles.

Rules, enforced server-side in `createEventAction` and `updateEventAction`:

- The primary club is never also a co-host — deduped before writing.
- A club-scoped creator's own club is always the primary; they cannot create an
  event primarily hosted by someone else.
- On update, the link rows are reconciled: insert the added, delete the removed,
  never touch the primary row unless `canSetPrimary` passes.
- Audited as **`event_cohosts_changed`** with before/after club ids, so the
  council can see who added whom — the accountability that stands in for consent.

Approval is unchanged: a co-hosted event goes through exactly the same
`AUTO_APPROVE` path as any other (`actions.ts:24,153`), and approvers are
notified once. Adding a co-host does **not** re-trigger approval, matching the
existing rule that editing an approved event never sends it back to the queue.

## §3 Public display

One pure helper: `hostLabel(names: string[]): string` → `"Coding × Ai Forge"`,
primary first, joined with `×`.

`EventSummary.club` and `CalendarEvent.club` become that label. **No consumer
changes** — all eleven call sites render those fields as a plain string
(`UpcomingCarousel.tsx:122`, `WeekStrip.tsx:48`, `AgendaView.tsx:78`,
`DaySheet.tsx:99`, `events/[id]/page.tsx:69`, the admin tables, and so on).
Neither field is used for filtering or logic, which is what makes this safe.

The event detail page gets an explicit line — "Hosted by Coding with Ai Forge" —
rather than leaving a reader to interpret the `×`.

**Calendar filtering must follow the co-host.** `CalendarEvent` gains
`clubSlugs: string[]`, and `Calendar.tsx:113` changes from
`active.has(e.clubSlug)` to `e.clubSlugs.some((s) => active.has(s))`. Without
this, filtering the calendar by the club that co-ran an event would hide it —
the opposite of the point.

## §4 What stays single-valued, deliberately

- **The calendar dot colour** (`CalendarEvent.clubColor`) — a dot can only be one
  colour, so it stays the primary club's. `clubSlug` is retained alongside the
  new `clubSlugs` for the colour rail.
- **Certificate branding** (`admin/certificates.ts:81,556`) — a certificate
  carries one club name. Co-hosting a certificate design is a separate question
  and is not in this scope.
- **Cancel and delete** — §1.

## Data model

**No migration.** `event_clubs` already supports several clubs per event with a
partial unique index guaranteeing exactly one primary. The only schema-adjacent
changes are widening `select` strings that already read the link table.

## Testing

TDD on the two pure modules.

`event-hosts.ts` — the whole point, so it gets the coverage:
- each of `manage:events`, `manage:registrations`, `manage:results`,
  `issue:participation_certificate` × primary club / co-host club / unrelated
  club / no club.
- `canCancelEvent`: the primary club's head yes, a co-host head **no**, council yes.
- `canSetPrimary`: the current primary's head yes, a co-host **no**, council yes.
- A club-scoped identity with `clubId: null` is refused everywhere (fail closed).
- **The asymmetry regression, named as such:** an event whose `clubIds` include a
  head's club but whose `primaryClubId` does not — they see it in their list, so
  they must be able to act on it.

`hostLabel` — one club, two clubs, three, empty list, order preserved.

Then the full gate: typecheck, lint, the suite, build.

## Out of scope

- **Consent / invitations** — decided against; see Goal.
- **Co-hosted certificates** — one club's name on the certificate, unchanged.
- **Per-club registration splits** (which club a registrant "belongs to" on a
  shared event) — no one has asked, and the registration model has no club column.
- **Co-hosting for anything but events** — announcements, achievements and
  resources stay single-club.

## Verification when built

Needs a signed-in browser and an authenticator; every admin has TOTP.

1. As `sandy` (tech_head), edit an event and add a second club. Confirm the
   public event page, an event card, and the calendar all read "A × B".
2. Filter the calendar by the **secondary** club — the event must still appear.
3. Sign in as the **secondary** club's head: the event appears in their list
   **and** they can open, edit and take attendance on it. This is the asymmetry
   fix; before this work they would have been refused.
4. As that same secondary head, confirm there is **no** cancel affordance, and
   that they cannot reassign the primary club.
5. As the primary club's head, confirm cancel still works.
6. Remove the co-host and confirm the event reads as single-club again.
