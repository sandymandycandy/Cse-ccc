# Held migrations — written, reviewed, deliberately NOT applied

These are real migrations that were written alongside a feature and then held
back on purpose. They live here rather than in `supabase/migrations/` for one
reason: **anything in the migrations directory can be run by a tool, and running
these would delete live data.**

| File | Would drop | Live rows at the time of writing |
|---|---|---|
| `20260828010000_drop_member_portal.sql` | `member_invites`, `club_member_auth`, `club_attendance_sessions.qr_ttl_seconds`, index `club_sessions_one_open` | 3 + 15 |
| `20260831000000_drop_event_self_scan.sql` | `attendance_scans`, `attendance_sessions`, `student_devices` | 0 + 0 + 3 |

Each was the destructive half of a two-part change: ship the replacement code
first, keep the old tables so a `git revert` of the deploy still has something to
land on, and drop them later once the new code has proven itself. The owner chose
to keep that revert-safety indefinitely.

## Why this directory exists at all

The database's migration ledger and these filenames **do not share version
numbers**. Migrations here were applied through the Supabase MCP
`apply_migration` tool, which stamps its own timestamp, while the files carry
hand-written ones:

```
file versions   20260820120001, 20260820120002, ... 20260905010000
ledger versions 20260820171713, 20260820171751, ... 20260905082523
```

There is **zero overlap**. So `supabase db push` considers every local migration
unapplied and would run all of them — including, while they still sat in
`supabase/migrations/`, both files above.

> ### ⚠️ Do not run `supabase db push` against this project.
> Apply migrations through the Supabase MCP `apply_migration` tool, which is how
> every migration in the ledger was applied. `db push` would attempt to replay
> the entire history against a schema that already has all of it.

## If you ever do want to apply one

Apply it deliberately, by hand, via `apply_migration` — and take a backup first:

```
node --env-file-if-exists=.env.local scripts/backup-supabase.mjs
node scripts/verify-backup.mjs <the-new-backup-dir>
```

Then confirm the tables really are unused by current code before dropping them.
