# Mumbai region migration — design

**Status:** approved in brainstorming 2026-09-05, not yet executed.
**Scope:** move the platform's two runtime halves from Seoul + Washington to
Mumbai — the Supabase project from `ap-northeast-2` to `ap-south-1`, and the
Vercel functions from the default `iad1` to `bom1`.
**No application code changes.** No migration files are written or applied.
This is an infrastructure move; the schema that arrives in Mumbai is a byte
copy of the schema that is live in Seoul today.

## Goal

Every student who uses this platform is in India. Today a single page render
travels Chennai → Washington (`iad1`, Vercel's default) → Seoul
(`ap-northeast-2`, Supabase) and back, twice, for a dozen queries. Both hops
are wrong and the second one is invisible in every metric the owner can see.

The goal is to put compute and data in the same city.

## Recorded decisions

- **D1 — Both halves move, or the exercise is pointless.** Moving the database
  to Mumbai while functions stay in Washington buys close to nothing:
  Virginia→Seoul and Virginia→Mumbai are comparable round trips. The win comes
  from co-location, not from the database's address. Owner chose both.
- **D2 — A fresh `ap-south-1` project, not the paused one.** The org is on the
  **free plan**, which caps it at two projects, and both slots are taken:
  `svkbleeibbrjryeovvjw` ("ccc new", Seoul, live) and `qsyfbbhrrqoskpxljtrf`
  ("sandymandycandy's Project", already `ap-south-1`, paused since 2025-09-06,
  default name, apparently an abandoned first attempt). Owner chose to **delete
  the paused project** and provision a clean one on current Postgres 17.6
  rather than unpause and wipe a schema nobody can inspect while it is paused.
  **This delete is irreversible, and it is the only genuinely destructive act
  in the whole plan.** So it is not performed blind: the paused project is
  restored, inventoried, and **backed up to disk with the same tooling used on
  the live database** before anything is deleted. If it turns out to hold
  nothing, the backup costs a minute. If it holds something the owner forgot
  about, that minute is the difference between a migration and a loss.
- **D3 — One window tonight, after ~01:00 IST.** Owner declined the staged
  "rehearse today, flip later" option. The consequence, stated and accepted:
  the first real run is the only run. Timing substitutes for a rehearsal, so
  the verification gates below are what stands in for one.
- **D4 — `pg_dump` / `pg_restore`, not migration replay.** The decisive finding
  is that **the repo's 37 migration files do not reproduce the live database.**
  Three files were never applied, and two of those are the DROP migrations the
  owner deliberately held back:
  `20260828010000_drop_member_portal.sql` (drops `member_invites` — 3 live
  rows — and `club_member_auth` — 15 live rows) and
  `20260831000000_drop_event_self_scan.sql` (drops `attendance_scans`,
  `attendance_sessions`, `student_devices` — 3 live rows). Four ledger entries
  also have no matching file. Replaying the files would silently destroy live
  data. A dump copies what is *actually there* and makes the entire drift
  question moot.
  Cost of this choice: PostgreSQL 17 client tools must be installed on the
  Windows box (no `pg_dump`, `psql`, Docker, or Supabase CLI is present — only
  Node 22), and the owner must fetch a DB password per project.
- **D5 — Seoul is not touched, and is not deleted tonight.** It stays running
  and current for at least a week as the rollback path. Rollback is putting
  three environment variables back and rebuilding.
- **D6 — Phase 0 held.** The `bom1` probe could have been run early and free to
  confirm the Hobby plan permits pinning a region. Owner chose to hold
  everything for the single window. Consequence accepted: if `bom1` turns out
  to be unavailable, we discover it mid-window.
- **D7 — No data may be lost. This is a hard requirement, stated by the owner,
  and it outranks the schedule.** It is met by construction, not by timing:
  a post-cutover row-level reconciliation sweep, proven complete by gate 8,
  over a database where all 41 tables have UUID primary keys. See "The
  zero-loss protocol". Two consequences follow and are binding:
  **(a)** if gate 8 cannot be made to return empty, the migration does not
  complete — we roll back to Seoul rather than accept an unexplained
  difference, however small; **(b)** Seoul is retained intact regardless of
  outcome, so recovery stays possible for as long as the owner wants it.

## What actually has to move

Measured on the live database 2026-09-05 ~20:10 IST, not assumed. Row counts
are still moving — `feedback_responses` grew from 209 to 229 during the hour
this design was written — so treat them as a shape, not as the reconciliation
target. Gate 2 re-measures both ends at cutover.

| | Count | Note |
|---|---|---|
| Tables / columns | 41 / 392 | `public` schema |
| Enums | 15 | carried by a `--schema=public` dump |
| Functions | 199 | includes every RPC the anon key calls |
| RLS policies | 13 | all in `public`; **zero in `storage`** |
| Triggers / indexes / constraints | 4 / 110 / 132 | |
| Rows | ~4,800 | 1,782 attendance · 1,599 audit · 844 members · 229 feedback |
| Tables with a primary key | **41 / 41** | every key a UUID — see the zero-loss protocol |
| Storage | 6 buckets, 9 objects, 2.7 MB | 5 public, `member-photos` private |
| Database size | 16 MB | |

Two properties make this far easier than a typical production move, and both
were verified rather than hoped for:

- **Zero sequences.** Every primary key is a UUID, so there are no sequence
  values to re-seed after a data load — the classic silent corruption in
  dump-and-restore migrations simply cannot happen here.
- **Zero `auth.users`.** Identity belongs to Auth.js and `admin_users`, not to
  Supabase Auth, so the hardest part of most Supabase-to-Supabase moves does
  not apply.

## Sequence

Each phase is gated on the one before it.

**Phase 0 — de-risk (~5 min).** Set `"regions": ["bom1"]` in `vercel.json`,
deploy, and confirm the region landed by reading the `x-vercel-id` response
header. Data-free and reversible. It answers the one question that could
invalidate the plan — whether the Hobby plan permits pinning `bom1` — before
any data is in motion. `bom1`→Seoul is a shorter hop than `iad1`→Seoul, so
even with the database still in Korea, nothing regresses.

**Phase 1 — provision (~10 min).** Delete `qsyfbbhrrqoskpxljtrf`. Create a
fresh `ap-south-1` project, set its database password. Pre-create
`btree_gist` in `public` — it is the one installed extension a
`--schema=public` dump will not carry, and `pgcrypto` / `uuid-ossp` /
`pg_stat_statements` / `supabase_vault` ship with every new project.

**Phase 2 — database (~15 min).** `pg_dump` Seoul with `--schema=public
--no-owner`, **keeping privileges**, and restore into Mumbai.

> ⚠️ Do **not** pass `--no-privileges`. The GRANTs to `anon`, `authenticated`
> and `service_role` live in that dump. Strip them and the publishable key
> loses access to every table and RPC, and all public pages 500 — with a
> database that looks perfectly correct in the dashboard.

> ⚠️ Connect over the **session pooler** host, not `db.<ref>.supabase.co`.
> Direct connections on the free plan are IPv6-only.

**Phase 3 — storage (~5 min).** A Node script over service-role keys on both
ends: create the 6 buckets with their exact `public` / `file_size_limit` /
`allowed_mime_types` configuration, then copy the 9 objects **path for path**.
The restored rows store literal `image_path` / `poster_path` strings, so a
renamed path is a broken image on a live page. No storage RLS policies need
recreating — there are none.

**Phase 4 — cutover (~15 min).** Owner sets three environment variables in
Vercel (Production **and** Preview). Repo configuration is updated and pushed,
which triggers a **fresh build** — `NEXT_PUBLIC_*` values are inlined at build
time, so an env change followed by a cache reuse or a promotion of an older
build ships the old Seoul URL.

**Phase 5 — reconciliation (~10 min).** The step that makes the migration
lossless rather than merely careful. Runs *after* the writer has moved. See
below.

## The zero-loss protocol

**This is the owner's hard requirement: no data may be lost.** Timing alone
does not deliver that — "01:00 is quiet" is a probability, not a guarantee,
and the feedback window is open. What follows is a guarantee, and it rests on
a property that was verified rather than assumed: **all 41 tables have a
primary key, every key is a UUID, and there are no sequences.**

That gives three things at once. Every row is addressable by an identifier
that is *the same value in both databases*. Re-copying any row is idempotent
(`ON CONFLICT (pk)`), so the repair step can be run as many times as needed
without creating duplicates. And a row-by-row comparison between the two
databases is well-defined, because there is no ambiguity about which row over
here corresponds to which row over there.

### The gap this closes

Between the dump (T1) and the cutover (T2), the live site is still writing to
Seoul. Those rows exist in Seoul and not in Mumbai. Without a repair step they
are stranded the moment traffic moves — present in a database nobody reads,
absent from the one everybody does. Row *counts* do not reliably reveal this
either: an insert here and a delete there leaves the totals matching while the
contents differ.

### The mechanism

For each of the 41 tables, take `primary key → md5(row::text)` from both
databases and compare the full sets. The comparison runs **twice**, and the
two runs have deliberately different rules. Collapsing them into one
post-cutover sweep is a data-destroying mistake, explained below.

**Sweep A — immediately before the flip.** Mumbai has taken no live writes at
all since the restore, so every difference between the two databases is
necessarily a Seoul-side change from during the window. Repair is therefore
unconditional and safe:

- **In Seoul, missing from Mumbai** → an insert that landed mid-window. Copy it.
- **In both, hashes differ** → an update that landed mid-window. Overwrite
  Mumbai's copy with Seoul's.
- **In Mumbai, missing from Seoul** → cannot legitimately happen yet.
  Investigate before going further; do not flip on an unexplained difference.

**Sweep B — after the flip.** This closes the seconds between Sweep A and
traffic moving. The rules are now **asymmetric, and must be**:

- **In Seoul, missing from Mumbai** → still safe to copy. An insert cannot
  conflict with anything.
- **In both, hashes differ** → **report, never auto-overwrite.** Mumbai is now
  the live database, so a difference here has two possible causes: a late
  Seoul write we missed, or a *new Mumbai write made since the cutover*.
  Blindly overwriting with Seoul's copy would destroy the second kind —
  silently reverting somebody's real edit to a stale value. Each such row is
  listed with both versions and judged, not automated.
- **In Mumbai, missing from Seoul** → expected; these are post-cutover writes.
  Left alone.

After Sweep A the differing set in Sweep B should be empty or close to it,
because Sweep A ran moments earlier. Most of this schema is append-only
anyway — attendance marks, audit rows, feedback responses and registrations
are inserted and never updated — so the genuinely update-prone tables are few
(`events`, `club_members`, the session tables) and easy to adjudicate by hand.

Both sides run with `SET TimeZone='UTC'` and `extra_float_digits=3` so the
text rendering of a timestamp or float can't manufacture a false difference.
At ~4,800 rows the whole comparison is a single cheap pass per table.

**Storage files are swept in the same phase, and this is not optional.** The
bucket copy happens in Phase 3, before the flip; a poster or gallery image
uploaded between Phase 3 and the cutover would otherwise be missed in a
uniquely nasty way. Its *database row* would be repaired by the sweep above —
so `poster_path` would point confidently at a file that does not exist in
Mumbai, and the failure would surface later as a broken image on a live page
rather than as an error anyone sees on the night. So Phase 5 re-lists both
buckets, copies anything present in Seoul and absent in Mumbai, and re-checks
all objects by size and hash. Nine files today; the check costs seconds.

### Why this is a proof and not a hope

Sweep B runs **after** traffic has moved to Mumbai. From that moment Seoul
receives no further writes, so the set of rows needing repair is **closed and
finite** — it cannot grow while we work on it. We sweep it, then re-run the
comparison and require it to come back empty. Every row written before the
flip is captured by Sweep A or Sweep B; every row written after it goes to
Mumbai directly. There is no window in between.

The two sweeps also fail in opposite, non-overlapping directions, which is the
point of having both. Sweep A can repair aggressively because Mumbai holds
nothing worth protecting yet. Sweep B must not, because by then it does. Any
design with a single post-cutover sweep has to choose one rule for both
situations, and either choice loses data in one of them.

The two conditions are both independently checked: that Seoul has genuinely
stopped receiving writes (its `max(created_at)` / `max(at)` / `max(marked_at)`
stop advancing across two readings), and that the comparison returns empty.

### Backstops beyond the protocol

- **Seoul is kept, intact and running.** Not deleted, not paused, for at least
  a week. It remains a complete copy of everything up to the cutover.
- **Two dump files are archived** — one at T1, one of Seoul's final state at
  the end of the window — and kept until the owner is satisfied.
- ⚠️ **Those dumps contain roll numbers, student emails, Argon2 password
  hashes and encrypted TOTP secrets.** They are written **outside the repo**,
  never committed, and never pasted into a chat, an issue or a log.
- **Storage objects are verified by size and content hash** after copying, not
  just by a successful upload call.
- **An offline backup already exists, taken before any migration work began**
  (2026-09-05 16:42 UTC): 5,006 rows across all 41 tables and all 9 storage
  objects, written to `~/Desktop/ccc-backups/` by `scripts/backup-supabase.mjs`
  and verified by `scripts/verify-backup.mjs` — which re-counts every row from
  disk, re-hashes every file, re-parses every line as JSON, checks primary-key
  uniqueness to prove the paginated export neither skipped nor duplicated a
  row, and cross-checks the totals against SQL counts obtained through a
  different code path. It is re-taken immediately before the window so the
  snapshot is fresh.

### Seoul is read-only for the entire operation

The single most common way a migration destroys production is an operator
pointing a restore at the source instead of the target. Three rules, and they
are absolute:

1. **The only command ever aimed at Seoul is `pg_dump`**, which cannot write.
   No `psql -f`, no `pg_restore`, no `--clean` — not once, not "just to check".
2. **`--clean` and `--if-exists` are never used at all.** The target is a
   brand-new empty database, so they buy nothing and their only possible
   effect is to drop things.
3. **Every connection string is echoed and its project ref confirmed against
   the intended target before the command runs.** `svkbleeibbrjryeovvjw` is
   Seoul and is read-only; anything else is the new Mumbai project.

## The three secrets that must not change

`NEXTAUTH_SECRET`, `TOTP_ENC_KEY` and `ATTENDANCE_HMAC_SECRET` carry over
**byte-identical**. Only the three Supabase values change
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`).

`TOTP_ENC_KEY` is the dangerous one: it decrypts the TOTP secrets of 33 admin
accounts, and `tech_head` and `president` are in `TOTP_REQUIRED_ROLES`. Rotate
it and those accounts cannot complete a login that *requires* a TOTP code —
locking the owner out of the admin panel of the system being migrated, at
02:00, with no second route in.

## Verification gates

Each one blocks the next phase. None is optional.

1. **Structural diff** — tables, columns, enums, policies, triggers, indexes,
   constraints and functions compared **by name**, not by count, between Seoul
   and Mumbai. Must be zero-diff. (Counts alone would pass a dump that lost one
   function and gained another.)
2. **Row-count diff** — all 41 tables, both projects, immediately after the
   restore. A first sanity check only; it is *not* the data-integrity gate.
3. **Read paths** — `/`, `/clubs`, `/events`, `/feedback` served from Mumbai.
4. **Auth** — headless login as `head@cse.test`. That account has no TOTP and
   is the only one drivable over curl; `tech@cse.test` correctly rejects
   password-only login and is not a valid smoke test.
5. **Region** — `x-vercel-id` reports `bom1`.
6. **Storage** — every one of the 9 objects matches by size and content hash,
   and one public image per bucket resolves over HTTP.
7. **Seoul has quiesced** — its newest-row timestamps stop advancing across
   two readings taken minutes apart. Proves traffic has actually moved and the
   repair set is closed.
8. **Row-level hash diff returns empty** — the real data gate. Primary key →
   `md5(row::text)` compared across all 41 tables, repaired, re-run, and
   required to come back with zero differences in both directions. Re-run
   *after* the storage re-sweep, so both halves are proven in the same pass.

**Gate 8 is the one that decides whether the migration succeeded.** Gates 1–2
can pass on a database that is quietly missing an evening's feedback
responses; gate 8 cannot.

## Rollback

Restore the three previous environment variable values in Vercel and rebuild.
Seoul is untouched, running and current throughout.

**Rollback carries its own reconciliation.** Rolling back strands anything
written to Mumbai after the cutover, in exactly the mirror image of the
problem Phase 5 solves. So the same hash-diff tool is run in reverse —
Mumbai → Seoul — before the rollback is called done. The tool must therefore
be written to take source and target as arguments rather than hardcoding a
direction. Rolling back is not an escape from the data obligation; it is the
same obligation pointing the other way.

## What only the owner can do

The auto-mode classifier blocks the assistant from writing secrets to Vercel
(it reads as exfiltration), so **the owner sets the three environment variables
by hand** in the dashboard at Phase 4. This is the one point where the window
waits on a human. The owner must also supply the Seoul database password
(Dashboard → Settings → Database) and confirm the Phase 1 delete.

## Repo changes this migration requires

The old project ref `svkbleeibbrjryeovvjw` is hardcoded in `.mcp.json`,
`package.json` (the `types:gen` script), `README.md` and `.env.example`; all
four need the new ref. `vercel.json` gains the `regions` key. `.env.local`
needs the three new values locally. `docs/STATUS.md` and the project memory
file both record the project ref and must be updated — the memory file is how
the next cold session finds the right database at all.

The nine plan documents under `docs/superpowers/plans/` also mention the old
ref. Those are historical records of work already done and are **left alone**.

## Risks

- **Deleting `qsyfbbhrrqoskpxljtrf` is irreversible.** Owner has approved it;
  its contents will be shown before the delete unless the owner waives that.
- **Writes during the window — mitigated, not merely accepted.** A feedback
  period is open and took 139 responses in the six hours before this design was
  written, the most recent one minute before. The zero-loss protocol above
  exists specifically for these rows: they are captured by the Phase 5 sweep
  and proven captured by gate 8. This is no longer carried as a live risk.
- **Residual risk: the reconciliation tool itself.** The guarantee is only as
  good as the tool that checks it — a bug could report "no differences" over a
  comparison it never really made. Two things blunt this: the comparison is
  deliberately trivial (primary key, row hash, set difference — no clever
  logic to get wrong), and **Seoul is retained intact**, so any row proven
  missing later can still be recovered days afterwards. The tool is also
  sanity-checked before it is trusted, by pointing it at two databases known
  to differ and confirming it reports the difference.
- **Deletes in Seoul mid-window resurrect.** A row deleted in Seoul between
  dump and cutover appears to the sweep as "in Mumbai, not in Seoul" — the
  same shape as a legitimate post-flip write — so it is kept rather than
  re-deleted. This errs toward retaining data, which is the correct direction
  for this requirement, and such rows are listed for the owner rather than
  actioned silently.
- **`bom1` on the Hobby plan is unverified** until Phase 0 runs, and per D6
  Phase 0 now runs inside the window rather than ahead of it.
- **No rehearsal** (D3). The verification gates are what stand in for one.
