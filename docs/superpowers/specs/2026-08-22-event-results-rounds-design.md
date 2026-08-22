# Event Results & Rounds (§13.9) — Design

**Status:** approved design, pre-implementation
**Date:** 2026-08-22
**Spec ref:** BUILD_PLAN §13.9, SECURITY_SPEC §4 (capabilities)

## Goal

Give an event ordered **rounds**, each with per-student **rank / score / `advanced`**
standings that go **draft → publish**. Published standings render on the event
page and `/events/[id]/results`; advancing students seed the next round; the
final round's ranked results stay *data-ready* to feed winner certificates later
(§12.6, currently parked). New capability `manage:results`.

The guiding test (§13.9): "the standings students actually refresh for."

## What already exists (no change needed)

- **Tables** `event_rounds` and `results`, and the `round_status` enum
  (`pending | active | completed`) — all present since migration `…0002_events`.
- **Publish-gating RLS** (migration `…0005_rls`):
  - `event_rounds_public_read`: rounds readable for approved, non-cancelled events.
  - `results_public_read`: rows readable by anon/authenticated **only when
    `published_at IS NOT NULL`** and the event is approved. Draft rows are
    invisible to the public at the database layer — no app-side gate required.
- Admin writes use the **service-role client** (`createAdminClient`) behind a
  `requireCapability` guard + audit log — same pattern as attendance/registrations.

## Schema change (one additive migration)

Public standings must show **student names**, but names live in `registrations`,
which is RLS-private. Denormalize the name onto the result row so a name only
becomes public when the round is published (existing `published_at` RLS gates it);
the `registrations` table itself is never exposed.

```sql
-- migration: results_display_name
alter table public.results add column display_name text;
```

Nullable, additive. No RLS change (the existing `results_public_read` policy
covers all columns of the row). Regenerate `src/lib/database.types.ts` after.

`results` row after change: `event_id, round_id?, registration_id?, roll_no,
display_name?, rank?, score?, advanced, remarks?, published_at?`.

## Capability

Add `manage:results` to the `Capability` union and this MATRIX row (mirrors the
winner-certificate roles, plus `vice_head` on their own club since vice heads run
attendance):

| Role | Grant |
|---|---|
| faculty_advisor | read |
| president, vice_president, tech_head, events_head | all |
| club_head, vice_head | own |

Public read needs **no capability** (RLS handles it).

## Components / files

| Layer | File | Responsibility |
|---|---|---|
| Capability | `src/lib/auth/capabilities.ts` | union member + MATRIX row |
| Pure logic | `src/lib/results.ts` | `rankByScore`, `orderStandings` (no I/O) |
| Admin data | `src/lib/admin/results.ts` | rounds CRUD, roster seed, save, publish; service-role + guard + audit |
| Public data | `src/lib/queries.ts` (extend) | `getPublishedResults(eventId)` via anon client |
| Admin UI | `src/app/admin/(app)/events/[id]/results/` | page + components |
| Public UI | `src/app/events/[id]/results/page.tsx` + event-page section | standings |

### Pure logic (`src/lib/results.ts`)

- `rankByScore(rows)` — sort by `score` descending; assign **standard competition
  ranking** (equal scores share a rank, the next rank skips accordingly). Rows
  with `score == null` sort last and get `rank == null`. Pure, deterministic.
- `orderStandings(rows)` — display order: `rank` ascending (nulls last), then
  `score` descending, then `roll_no`.

### Admin data (`src/lib/admin/results.ts`)

Every mutation: resolve the event's `clubId`, `requireCapability("manage:results",
clubId)`, write via service-role client, append an `audit_log` entry.

- `listRounds(eventId)`, `createRound(eventId, {name, startsAt?})` (next `sort`),
  `updateRound(roundId, {name?, status?, sort?, startsAt?})`, `deleteRound(roundId)`
  (blocked if the round has published rows).
- `getRoundRoster(roundId)` → existing `results` rows for the round; if none, the
  **seed candidates**:
  - first round (lowest `sort`): `registrations` where `event_id = ? and attended
    = true` → `{roll_no, display_name: student_name, registration_id}`.
  - later rounds: the previous round's rows where `advanced = true`, carrying
    `roll_no, display_name, registration_id` forward.
- `saveResults(roundId, rows[])` — **replace** the round's rows in one transaction
  (delete the round's existing rows, insert the provided set as draft with
  `published_at = null`); fields `roll_no, display_name, score, rank, advanced,
  remarks`. Best-effort (re)link `registration_id` by matching `roll_no` to a
  registration. Replace-not-upsert avoids needing a unique constraint on the table.
  **Blocked if the round is already published** — unpublish first, so the public
  view never changes silently under a save.
- `publishRound(roundId)` — set `published_at = now()` on the round's rows
  (requires ≥1 row); audited. `unpublishRound(roundId)` — clear it; audited.
  Editing a published round is therefore: unpublish → edit → save → publish.

### Admin UI (`/admin/events/[id]/results`)

- **Rounds** column: list (name, `status` badge, published indicator), add round,
  reorder, set status.
- **Selected round** table: editable rows pre-filled from `getRoundRoster` —
  columns roll_no, name, score, rank, `advanced` (checkbox), remarks. A **"Rank by
  score"** button applies `rankByScore` to the current rows (overridable). **Save**
  (draft) and **Publish / Unpublish**. A hint shows the seed source ("seeded from N
  attended students" / "from N advancing in <prev round>").
- Matches existing `events/[id]/attendance` and `events/[id]/registrations` pages.

### Public UI

- **`/events/[id]/results`** — full standings via `getPublishedResults`: each
  published round as a ranked table (**rank · name · roll · score**, with an
  "advanced" marker). Unpublished rounds don't appear (RLS). Anon client.
- **Event detail page** — a "Results" section + link, rendered only when the event
  has published results.

## Data flow

1. Organiser opens `/admin/events/[id]/results`, creates rounds.
2. Selects a round → roster auto-seeds (round 1: attended; round N: prior
   `advanced`).
3. Enters scores → "Rank by score" → overrides → ticks `advanced` → Save (draft).
4. Publish round → `published_at` set → RLS exposes it to the public.
5. Public reads standings on the event page and `/events/[id]/results`.
6. (Later, when certs are unparked) final-round ranked rows + `registration_id`
   feed winner-certificate issuance with no re-keying.

## Error handling

- Non-capable admin / cross-club (grant `own`, other club) → guard returns 403.
- Publish with zero rows → validation error, no state change.
- `deleteRound` on a round with published rows → blocked with a clear message.
- Anon/unauthenticated hitting admin routes → 401 (existing middleware/guards).
- Malformed input (empty roll, non-numeric score) → Zod validation in the action.

## Testing

- **Unit (vitest):** `rankByScore` (ties, null scores, ordering), `orderStandings`,
  the `manage:results` grants (each role → expected grant; `own` cross-club denied),
  and publish gating (empty round can't publish; published rows carry
  `published_at`).
- **Integration:** anon `select` on `results` returns only published rows; draft
  rows invisible to anon; service-role sees drafts. Per the known
  server-action-over-curl gotcha, mutations are driven via the actions / direct DB
  writes and the **read** paths are asserted.

## Out of scope (YAGNI)

- Winner-certificate issuance UI (certs parked on user's logos + faculty signature)
  — data stays ready (`registration_id`, final-round ranks).
- CSV import of results (auto-seed + manual edit covers entry).
- Realtime / live standings (that is the §13.10 live wall).

## Open decisions — resolved

- Roster seeding: **auto-seed by round** (round 1 = attended; later = prior
  `advanced`).
- Ranking: **enter score → auto-rank by score (overridable)**.
- Public display: **name + roll_no** (name denormalized to `results.display_name`).
- `manage:results` for `vice_head`: **yes, own club**.
