# Achievements podium — design

**Status:** approved in chat 2026-09-07. Not implemented.
**Scope:** turn `/achievements` from an empty free-form list into a board that
announces top 1/2/3 prize winners from two sources — published event results
(read live) and hand-entered outside wins. Ties are first-class: `1, 2, 3, 3`
is the shape the owner asked for, and it is what the live data already holds.

## Goal

The owner asked for "top 1 2 3 prize winners to be announced ... maybe 1 2 3 3
prizes also" on the achievements portal.

Most of that machinery already exists, in the wrong place:

- `src/lib/results.ts` does **standard competition ranking** — equal scores
  share a rank and the next rank skips by the number tied.
- `src/lib/podium.ts` (`podiumOf`) returns everyone ranked 1-3 and is
  **deliberately uncapped**. Its comment already names this exact case: *"Ties
  are common — the published PITCH DESK standings have two students sharing
  third."*
- PITCH DESK is live and published with precisely that shape:

  | Rank | Name | Score |
  | --- | --- | --- |
  | 1 | Mohanrao Adduri | 87.5 |
  | 2 | HITESH BALAJI S U | 81.75 |
  | 3 | GNANESHWARAN P | 80 |
  | 3 | P.KISHORE | 80 |

So ranking is **not** what needs building. What is missing is the connection:
that podium renders only on `/events/<id>/results`. The achievements table holds
**zero rows**, so `/achievements` shows an empty state that points readers back
at events. Meanwhile `AchievementForm`'s title placeholder reads
`"e.g. 1st place — Smart India Hackathon 2026"` — evidence that placement was
always meant to be here, expressed as free text because there was no field for it.

The goal is one board, two sources, one renderer.

## Recorded decisions

- **D1 — Both sources, merged into one list.** Owner rejected auto-only and
  manual-only. Automatic entries cover events run on the platform; manual
  entries cover wins that happen elsewhere (an external hackathon), which the
  platform will never have results rows for.
- **D2 — Automatic podiums are read live, with a per-event hide switch.** Not
  copied into `achievements` on publish. A snapshot would drift the moment a
  rank was corrected, and would need re-sync logic nobody would remember to run.
  Reading live means the board can never disagree with the event's own results
  page. The cost, accepted: an automatic podium cannot be hand-reworded — to
  change it you change the result. A council admin gets one toggle per event to
  keep a podium off the public board.
- **D3 — A manual winner row is `rank + name + optional roll`.** Mirrors what a
  results row carries, so both halves render through one component. Roll is
  optional because an outside win may involve people whose roll numbers the
  council does not hold. Full parity with results (team name + members) was
  offered and declined as more form than the case needs.
- **D4 — Manual winners live in a `jsonb` column, not a second table.** There is
  direct precedent: `results.team_members` is already `jsonb` in this schema.
  Winners are always read with their achievement and never queried on their own,
  so a join buys nothing. One migration, and — decisive on a fresh project with
  the RLS trap recorded in STATUS — **no new RLS surface to get wrong**. The
  cost, accepted: "every win by roll VTU28001" is not a query this design can
  answer.
- **D5 — An event's podium is its highest-`sort` round with published results.**
  Events have rounds; "the podium" has to mean one of them. STATUS already
  establishes final-round standings as the convention for winner certificates,
  so this follows the rule already in the building rather than inventing a
  second one.

## Data model

Two columns. No new tables.

```sql
alter table public.achievements add column winners jsonb;
alter table public.events add column show_on_achievements boolean not null default true;
```

`winners` shape (validated on read, never trusted):

```json
[{"rank": 1, "name": "Rahul K",  "roll": "VTU28001"},
 {"rank": 3, "name": "Arun M",   "roll": null},
 {"rank": 3, "name": "Divya R",  "roll": "VTU30288"}]
```

`show_on_achievements` defaults to `true`, so PITCH DESK's podium appears the
moment this ships with no back-filling. The consequence is stated in Risks.

**Both migrations are applied through the Supabase MCP `apply_migration` tool.**
`supabase db push` is banned on this project — the migration ledger and the
migration filenames share no version numbers, so a push would replay all 35
local migrations against a schema that already has every one of them.
`src/lib/database.types.ts` gets both fields hand-added, exactly as `venue_text`
was on 2026-08-27.

## The pure core — `src/lib/achievements-board.ts`

No DB imports, no `server-only`, so it is unit-testable under vitest's node
environment. This is where the tests live.

| Export | Responsibility |
| --- | --- |
| `Winner` | `{ rank: 1 or 2 or 3; name: string; roll: string or null }` |
| `parseWinners(json)` | Normalise untyped JSONB into `Winner[]`. Malformed rows are **dropped, never thrown** — a bad hand-edit must not 500 the public page. |
| `winnersFromResults(results)` | Wrap the existing `podiumOf`, then expand each standing through `entrantsOf`, so automatic entries inherit both its tie handling and its team flattening rather than re-deriving either. |
| `groupByRank(winners)` | 1st/2nd/3rd buckets, ties sharing a bucket. |
| `mergeBoard(auto, manual)` | One list, newest first. Key on the event's start date for automatic entries and `happened_on` for manual ones; a manual entry with a null `happened_on` falls back to `created_at`, matching what `getPublicAchievements` already does. |

**A team win keeps its whole team.** `Winner` carries one person, so a team
standing becomes several `Winner` rows sharing one rank — which is exactly how
`entrantsOf` already flattens a team on the results page, and why D3's
name-and-roll shape loses nothing. The team *name* is not carried; D3 declined it.

`podiumOf` and `rankByScore` are **not** reimplemented. They are correct, tested,
and live; this module composes them.

## Queries — `getAchievementsBoard()`

Added to `src/lib/queries.ts` alongside `getPublicAchievements`.

- **Manual half:** the existing achievements select, plus `winners`.
- **Automatic half:** `events -> event_rounds -> results` where
  `results.published_at is not null`, `rank <= 3`, and
  `events.show_on_achievements`. Per event, keep the highest-`sort` round *that
  has published results* — not simply the highest-`sort` round, which may be an
  unplayed final (D5).
- Merge via `mergeBoard`, ordered newest first.

A failed automatic query logs and yields an empty list rather than taking the
page down — the pattern `getPublishedResults` already uses, and for the same
reason: a query failure must not masquerade as "no winners yet".

## Admin

- **`WinnersEditor.tsx`** (new client component): repeatable rows of
  rank / name / optional roll, add and remove. Ranks are 1-3; ties allowed, so
  no uniqueness constraint across rows.
- **`AchievementForm.tsx`** embeds it. The `"1st place — ..."` title placeholder
  is retired: placement is a field now, so the title goes back to naming the
  event.
- **`achievements/actions.ts`**: the Zod schema grows a `winners` array — rank
  coerced and bounded to 1-3, name required and trimmed, roll optional and
  nullable-on-empty. Capability is unchanged: `manage:content`, club-scoped.
- **`EventForm.tsx`**: one "Show on achievements board" checkbox.

## Public display

`<Podium>` is a **new component used only by the achievements board**. The
event results page is not touched.

> **D6 — amended 2026-09-07, during execution. This reverses the "one renderer"
> half of D3.** The original design extracted `<Podium>` out of
> `/events/[id]/results` so the board and the event page could not drift. On
> review the owner chose not to touch the results page at all: it is live,
> correct, and carries score and team name on its podium cards, none of which a
> manual achievement entry has. Extracting would have meant either dropping the
> score from a working production page or widening `Winner` to carry fields half
> the board can never populate.
>
> The cost, stated and accepted: **two podium components now exist and can drift
> apart.** The mitigation is that both render from the same `podiumOf` /
> `entrantsOf` pair, so the *standings* they show cannot disagree — only their
> presentation can. D3's "rank + name + optional roll" shape is unchanged and
> still the right one; it is only the shared-component claim that is withdrawn.

Each board entry shows title, club and date, then its podium. Automatic entries
link through to the full event results; manual entries have nowhere to link and
do not pretend otherwise.

## Testing

TDD on `achievements-board.ts` — the test file is written and watched to fail
before the module exists. Cases:

- a tied third yields two rank-3 winners, and both survive `groupByRank`
- `parseWinners` drops a malformed row and keeps the good ones
- `parseWinners` on `null` / `[]` / a non-array returns `[]`
- `winnersFromResults` preserves the tie that `podiumOf` returns
- `winnersFromResults` expands a team standing into one row per member, all
  sharing the team's rank
- `mergeBoard` orders newest first and interleaves the two sources
- `mergeBoard` falls back to `created_at` for a manual entry with no
  `happened_on`, rather than sorting it last
- a rank outside 1-3 is rejected

Verification gate: `npx tsc --noEmit`, `npx eslint`, `npm test`, `npm run build`.

**Acceptance is live data, not a fixture:** `/achievements` must render PITCH
DESK as **1 / 2 / 3 / 3** with both third places visible, matching
`/events/4f6a6f19-7435-4c14-947f-fdce1cfec8d1/results` exactly.

## Files

| File | Change |
| --- | --- |
| `src/lib/achievements-board.ts` | **new** — the pure core |
| `src/lib/achievements-board.test.ts` | **new** — written first |
| `src/lib/queries.ts` | `getAchievementsBoard()` |
| `src/lib/database.types.ts` | hand-add `winners`, `show_on_achievements` |
| `src/components/admin/WinnersEditor.tsx` | **new** |
| `src/components/admin/AchievementForm.tsx` | embed the editor, retire the placeholder |
| `src/app/admin/(app)/achievements/actions.ts` | validate `winners` |
| `src/components/admin/EventForm.tsx` | board toggle |
| `src/components/Podium.tsx` | **new** — extracted from the results page |
| `src/app/events/[id]/results/page.tsx` | use the extracted component |
| `src/app/achievements/page.tsx` | render the board |
| `src/app/globals.css` | podium styles, shared |
| `supabase/migrations/` | 2 migrations, applied via MCP |

## Risks and gotchas

- **`show_on_achievements` defaults to `true`.** Any event that publishes
  results is on the public board unless someone unticks it. That is the right
  default for a council that wants wins announced, but it is opt-out, not
  opt-in, and should be said out loud when handing this over.
- **The JSONB is schema-less.** `parseWinners` is the only guard between a bad
  hand-edit and the public page. It drops rather than throws, on purpose.
- **Migrations are manual by necessity.** MCP `apply_migration` only; never
  `supabase db push`. `database.types.ts` must be hand-edited to match, and the
  build will not catch a mismatch that the live schema does.
- **LF endings.** Write files with a Bash heredoc, or Python with an explicit
  newline of `\n` — a Python text-mode write turns a small change into a
  4500-line diff in this repo.

## Out of scope

- Winner **certificates** (`issue:winner_certificate`, `certificates.placement`)
  — parked by the owner and blocked on org assets. Unrelated to this board.
- Backfilling `achievements` rows for past wins. The table is empty; the
  automatic half fills the page on day one and manual entries are added as they
  happen.
- Querying wins by student. Ruled out by D4, and nothing asks for it today.
