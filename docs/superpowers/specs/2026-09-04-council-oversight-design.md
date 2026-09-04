# Council oversight — design

**Status:** approved in brainstorming 2026-09-04, not yet planned or built.
**Scope:** two new council-only admin surfaces under a new `/admin/oversight`
section — **Club health** (phase A) and **Admin activity** (phase B).
**No migration.** Both surfaces are read-only over data that already exists.

## Goal

The council oversees **14 active clubs** and **37 admin accounts** and has no
page that looks across either. Every analytics surface built so far is
single-subject: `/admin/attendance/analytics` reports on *one* club,
`/admin/feedback/[periodId]/analytics` on *one* collection window, `/admin/audit`
is a flat list of 1,497 rows. The questions the President actually has — *which
clubs are in trouble, and who still has keys to this thing* — are answerable from
data already in the database and are answered nowhere.

## Recorded decisions

- **D1 — Council only.** Full cross-club rankings are visible to the four
  council roles and to nobody else. Club heads continue to see only their own
  club. Ranking 14 clubs implicitly ranks their heads, and this repo already
  took that problem seriously once (feedback D2/D3). A league table visible to
  every head is a different product with different politics; it was declined.
- **D2 — `view:analytics` is the WRONG gate and must not be used.** Club heads
  and vice heads hold it at `own`, and `events_head` / `social_media_head` hold
  it at `all`. Phase A gates on **`manage:council`**, phase B on
  **`view:audit`**. Those two resolve to the same four roles today
  (faculty_advisor, president, vice_president, tech_head — president is `read`
  on audit), which is why the two pages can share a section.
- **D3 — Rolling 30-day window, with all-time beside it.** No term or semester
  concept exists anywhere in the schema (`council_settings` holds only a join
  token), and inventing one is a subsystem in its own right. A rolling window
  needs no migration, makes dormancy detectable, and ages correctly — an
  all-time-only page would let a club that stopped meeting in June still look
  healthy in November.
- **D4 — Read-only, plus deep links.** No new mutations, no new email. Every
  flag links to the surface where the council would actually act. An "email the
  head" button was declined for now: `enqueueEmail` delivers immediately against
  the live database and **no email has ever been sent through the current code**,
  so a dormancy nudge would be a poor first use of that path.
- **D5 — Phase B covers all four of its views**, sharing one query-and-shaping
  module rather than four. It is roughly the size of phase A on its own; it
  ships after A, in the order in "Rollout" below.

## What the probe of the live DB found (2026-09-04)

The numbers below drove the design and should be re-checked before build, since
several are the reason a given metric exists at all.

**This platform is a membership-and-attendance tool that happens to have an
events feature.** Row counts: `audit_log` 1,497 · `club_attendance` 1,379 ·
`club_members` 816 · `council_attendance` 127 · `email_log` 81 ·
`club_attendance_sessions` 54 · `admin_users` 37 · `registrations` 24 ·
`results` 21 · `clubs` 14 active · **`events` 1** · `announcements` 1 ·
`feedback_responses` 1 · `achievements` 0 · `resources` 0 · `join_requests` 0.

- **Event analytics are explicitly out of scope.** With one event and none
  upcoming, a registration funnel would render an empty page. Revisit when there
  are events.
- **The EVENT rotating-QR self-scan has never been used: `attendance_scans` is
  0.** Be precise about which scanner this means. The *club member* scanner has
  run — `audit_log` holds 4 `scan` / `club_attendance` rows — but the §13.8
  event-attendance flow that writes `attendance_scans` has never produced a
  single row in production. Neither has been camera-tested (open item in TODO).
  Not something these pages fix; recorded because it is the most surprising fact
  in the database.
- **Per-club spread is extreme.** Members range 0–235, sessions held 0–6:
  Coding 235 members / 5 sessions · Ai Forge **163 members / 2 sessions / 1
  attendance mark** · AppNova 73/6 · CyberSentinel 92/5 · Short Film 80/4 ·
  Fusion & Fashion 51/5 · Animatrix Game-dev 26/3 · Magazine 25/6 · AspireX 19/5
  · Yoga 18/6 · Animatrix Animation 17/4 · Innovation 17/3 · **Nature 0/0** ·
  **Animatrix E-Sports 0/0**.
- **Three clubs would be flagged on day one:** Nature and Animatrix (E-Sports)
  have no members and no sessions at all; Ai Forge is the second-largest club by
  membership and has effectively never met.
- **13 of 37 admin accounts have never performed a single audited action**, and
  3 (all `vice_head`) have never logged in.
- **No `TOTP_REQUIRED_ROLES` account is missing a confirmed second factor** —
  checked, and clean. Phase B should keep checking it rather than assume it.
- Audit actions are dominated by roster and attendance work: `update
  club_member` 872 · `close club_attendance_session` 175 · `open` 68 · `update`
  68 · `attend_manual registration` 48 · `reopen` 42 · `create club_member` 40 ·
  `delete club_member` 22 · `create gallery` 10. The 42 reopens against 68 opens
  is the friction signal phase B B3 exists for.
- **Sensitive actions, counted across ALL entities** (the allowlist in B2 must
  match these, and only these — the vocabulary was enumerated in full):
  `delete` **30** (club_member 22, achievement 5, gallery 3) · `csv_export`
  **12** (attendance 9, feedback_period 2, registrations 1) · `invite` 8
  (club_member only) · `cancel event` 1 · `reject event` 1 ·
  `results_unpublish` 1 · `totp_enrolled` 1.
- **⚠️ ADMIN ACCOUNT LIFECYCLE IS NOT AUDITED AT ALL.** The only `admin_user`
  row in the entire log is a single `totp_enrolled`. Creating an admin, changing
  a role, deactivating an account and issuing an admin invite write **nothing**
  — `invite` in the log is `club_member`, not admin. So B1 cannot reconstruct
  how any of the 37 accounts came to exist, and there is no "role change" action
  to put on B2's allowlist. B1 must therefore derive hygiene from
  `admin_users` + `admin_totp` state plus per-actor activity counts, **not** from
  account-lifecycle events. Making those writes audited is a real gap and a
  sensible follow-up, but it is out of scope here.

## Architecture

### Placement

A new nav group, **Oversight**, holding two pages:

| route | page | gate |
|---|---|---|
| `/admin/oversight/clubs` | Club health | `manage:council` |
| `/admin/oversight/activity` | Admin activity | `view:audit` |

Neither belongs on an existing surface. `/admin/council` is the **27-person
council attendance roster**, not the 14 clubs, so club vitality there would
mislead. `/admin/attendance` is gated on `manage:members`, which club heads
hold — grafting a council-only view onto it would mean a second, inner
capability check inside a page that already has one, which is how leaks start.

The nav group is free: `src/lib/admin/nav.ts` already groups links and only
renders headings past `GROUPING_THRESHOLD`. Adding `"oversight"` to the
`NavGroup` union and one entry to `GROUPS` is the whole change.

### Phase A — Club health

**Module:** `src/lib/admin/club-vitality.ts`, split the way the rest of the repo
splits analytics (compare `attendance-analytics.ts`, `feedback-analytics.ts`):
a pure shaping function plus one impure read.

```
computeClubVitality(input, now)  -> ClubVitality[]   // PURE, unit-tested
getClubVitalityData(session)     -> input            // the only DB call
```

**Per club:** active members · sessions in window · sessions all-time · days
since last session · attendance rate in window · flags.

**Attendance rate MUST reuse `summarizeAttendance` from `attendance-math.ts`.**
That function already implements the eligibility rule — a member is only counted
against sessions dated on or after they joined — and it is mutation-checked.
Recomputing a naive `marks / (members × sessions)` here would produce a
different, lower number than the per-club analytics page shows for the same
club, and two admin pages disagreeing about one club's attendance is worse than
having no second page.

**Flags** (each independently testable, thresholds as named constants):

| flag | rule | why |
|---|---|---|
| `empty` | 0 active members | Nature, Animatrix (E-Sports) |
| `dormant` | 0 sessions in the 30-day window | catches a club that stopped |
| `unmet-demand` | ≥ `LARGE_CLUB` (50) members and ≤ 1 session in window | Ai Forge: 163 members, 1 mark |
| `low-turnout` | attendance rate < `LOW_TURNOUT` (30%) **and** ≥ `MIN_SESSIONS` (2) sessions in window | the thin-sample guard |

**The `MIN_SESSIONS` guard is structural, not cosmetic — do not relax it.** It is
the same principle as `THIN_SAMPLE` in `feedback-analytics.ts`: a club that held
one session and had four people show up is not evidence of a turnout problem,
and flagging it puts a named head on a list on the strength of a single data
point. Every rate is displayed with the session count it was computed from, for
the same reason feedback never shows an average without its response count.

**Ordering is triage, not league table.** Default sort is most-concerning first
(flagged clubs, then ascending attendance rate), and the page is titled and
worded as a list of clubs needing attention rather than a ranking. Council-only
visibility (D1) makes ranking defensible; framing it as a scoreboard would still
be the wrong product.

**Deep links** per row use **`/admin/attendance?club=<id>`** and
`/admin/attendance/analytics?club=<id>`. `resolveAttendanceScope` already reads a
`?club=` param and resolves it **server-side** against `manage:members`, pinning
an own-scoped head to their own club whatever the query string says — so these
links cannot over-grant, and no new scoping code is needed. Note the asymmetry
and do not "fix" it: the four council roles hold `manage:council` (this page) and
`manage:members` at `all`/`read` (the target), so every link a council viewer
sees will resolve for them.

**Query cost.** Aggregation happens in JS over ~816 member rows, ~54 sessions and
~1,379 attendance rows, following the house pattern documented in
`feedback.ts` ("counted in JS rather than via a nested aggregate … cheap at this
scale, and it keeps the generated types straightforward"). That is far heavier
than the dashboard's `head`-only counts, and it is acceptable **only** because
this is a council-only page reached deliberately, not a landing page. If club
membership grows an order of magnitude, move the aggregation into SQL.

### Phase B — Admin activity

**Module:** `src/lib/admin/audit-insights.ts` — one shaping module over
`audit_log`, four views on one page.

- **B1 · Account hygiene.** Per account: role, last login, audited actions in
  window, active. Flags: never logged in (3 today), zero audited actions ever
  (13 today), and **a `TOTP_REQUIRED_ROLES` account without a confirmed second
  factor** (0 today — the check must stay even while it finds nothing, because
  finding nothing is the point).
- **B2 · Sensitive-action review.** A named allowlist of actions, with actor,
  target and time. The allowlist is exactly: `delete`, `csv_export`, `invite`,
  `cancel`, `reject`, `results_unpublish`, `totp_enrolled`. There is deliberately
  no "role change" entry — that action does not exist (see the probe findings).
  Today this surfaces **30 deletions and 12 CSV exports of student PII** that are
  invisible in a 1,497-row flat list.
- **B3 · Workflow friction.** Action/entity counts over the window, and the
  ratios that suggest awkwardness (reopen-to-open is 42:68). **This view is
  exploratory** — it reports what the log says without claiming a cause.
- **B4 · Entity history.** Given an `entity` + `entity_id`, a timeline built from
  the `before`/`after` jsonb. Reached by deep link, including from phase A's club
  rows, which is what ties the two phases together.

**⚠️ PII and surveillance boundaries — DECIDED, not deferred.**
`audit_log.before`/`after` for the 872 `update club_member` rows contain student
`roll_no`, `email` and `phone`. Rendering that jsonb raw would turn B4 into a
bulk PII browser reachable from a nav link, so:

- **B4 renders a field allowlist of VALUES:** `role`, `is_active`, `sort`,
  `club_id`, `name`, `status`, `approved_at`. For any field outside it, B4 shows
  that the field **changed** and by whom, and does not print the before/after
  value. "Phone changed" is the useful fact; the old phone number is not.
- The allowlist is an allowlist: an unrecognised field is hidden, never shown.
  A test pins this, so a new column added later fails closed.
- **`ip` and `ua` are excluded from all four views.** They exist on every row and
  would make B1 a staff-surveillance panel rather than an account-hygiene one.
  Excluding them costs nothing today; adding them needs a stated reason.

## Testing

Matching house style: pure modules, `node` environment, no DOM.

- `computeClubVitality` — each flag at its boundary; the `MIN_SESSIONS` guard
  proven to suppress a low rate on one session; a club with zero members
  producing `empty` and not a divide-by-zero; ordering is triage order.
- Attendance rate agrees with `summarizeAttendance` on the same fixture — a
  regression test against the two-pages-disagree failure above.
- `audit-insights` — the sensitive-action allowlist is an allowlist (an unknown
  action is excluded, not included); hygiene flags at their boundaries; the B4
  field allowlist drops a field not on it.
- Capability tests pinning D2: a `club_head` and an `events_head` are refused
  both pages, and `view:analytics` grants neither.

## Out of scope

Event analytics (one event). Any mutation, including follow-up tracking and
dormancy emails (D4). A club-head-visible ranking (D1). Terms/semesters (D3).
Fixing the unused QR self-scan. Changing `adminHomePath`.

## Rollout

1. Nav group + **Club health** page + `club-vitality.ts` + tests.
2. **Admin activity**: B1 account hygiene + B2 sensitive actions.
3. B3 workflow friction + B4 entity history (after the PII allowlist is settled).

Each phase is independently shippable and independently useful; phase 1 alone
would have surfaced Nature, Animatrix (E-Sports) and Ai Forge on its first load.
