# Session history — sortable date + search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use superpowers:test-driven-development for Task 1 — the test is written and watched to fail BEFORE the module exists.

**Goal:** Let a club head find a past session on `/admin/attendance` without scrolling: a search box over the Session history table, and a Date column header that toggles newest-first ⇄ oldest-first.

**Owner context (2026-09-05):** the owner first asked for ascending order, then for descending, then clarified what they actually wanted — *"like we can do sorting like that according to dates also add a search bar for the session history"*. So this is **user-controlled sorting**, not a changed default. The list is already newest-first and **must stay that way until the header is clicked**.

**Architecture:** A pure sort module (`session-sort.ts`) plus one client component (`SessionHistory.tsx`) that owns the query and direction state and re-orders rows already loaded by the server. **No server, query or data changes** — `listSessions` keeps its ordering and its `.limit(200)`, so the server still hands over the most recent 200 sessions and the client only re-orders what it was given. This mirrors `AttendanceRoster`, which already does instant client-side search over an already-loaded roster.

**Tech Stack:** Next 16 App Router (RSC, Turbopack) · React 19 · TypeScript strict · vitest (`environment: "node"` — there is **no DOM**, so only the pure module is unit-testable; the component is verified by build + a browser pass).

**Spec:** none — this is a bounded UI change agreed in chat, not an architectural one.

## Global Constants

- **Default direction is `"newest"`.** Nothing about the current view may change until the user clicks the header.
- **Do not touch `listSessions`** in `src/lib/admin/attendance-club.ts`. Its `.order("session_date", …)` / `.order("opened_at", …)` / `.limit(200)` stay exactly as they are. Re-ordering the fetch would make the limit return the *oldest* 200.
- **Reuse, do not reinvent:** `matchesAny` (`src/lib/admin/roster-filter.ts`) for the search, `pctOfStrength` (`attendance-analytics.ts`), `istNumericDate` (`lib/datetime.ts`). All three are pure and client-safe.
- **Sort on the date the table actually displays** — `sessionDate ?? openedAt`. See Task 1 for why this differs from the server.
- **LF line endings.** Write files with a Bash heredoc, or Python with `newline="\n"`. Python text-mode writes turn a 6-line change into a 4500-line diff in this repo (`core.autocrlf=false`, no `.gitattributes`).
- Verification gate for the commit: `npx tsc --noEmit` · `npx eslint` · `npm test` · `npm run build`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/admin/session-sort.ts` | **NEW.** Pure `sortSessions(rows, dir)`. |
| `src/lib/admin/session-sort.test.ts` | **NEW.** Its tests. |
| `src/components/admin/SessionHistory.tsx` | **NEW.** Client component: search box, sortable Date header, the table. |
| `src/app/admin/(app)/attendance/page.tsx` | **EDIT.** Swap the inline table for `<SessionHistory …>`. |

## Tasks

### - [ ] Task 1 — `session-sort.ts`, test-first

Write `src/lib/admin/session-sort.test.ts` FIRST and watch it fail on the missing module.

```ts
export type SortDir = "newest" | "oldest";
export function sortSessions<T extends { sessionDate: string | null; openedAt: string }>(
  rows: readonly T[], dir: SortDir,
): T[]
```

Requirements:
- Key on `sessionDate ?? openedAt`; tie-break on `openedAt`. Both are `YYYY-MM-DD` / ISO strings, so compare them **as strings** — lexicographic order equals chronological order for these formats. Never build a `Date` to compare.
- **Copy before sorting** (`[...rows].sort(…)`). The component re-sorts on every render and must not mutate its props.
- `"newest"` = descending, `"oldest"` = ascending.

Test cases:
- newest-first puts the most recent date at the top
- oldest-first reverses it
- same date → tie-broken by `openedAt`
- `sessionDate: null` sorts by that row's `openedAt`
- the input array is not mutated

**Why the null case matters — this is a real bug being fixed, not a hypothetical.** The server sorts `session_date` with `nullsFirst: false`, but `page.tsx` *displays* `sessionDate ?? openedAt`. So a session with no date shows a recent date and yet sits at the very bottom of the table. Sorting on the displayed value removes that contradiction. As of 2026-09-05 no live row has a null `session_date`, so this is invisible today — do not let that tempt you into dropping the case.

### - [ ] Task 2 — `SessionHistory.tsx`

Move the `<table className="admin">` block out of `page.tsx` **verbatim** (columns: Session · Date · Slot · Status · Present · % strength · Open link), then add around it:

- `"use client"`, `useState` for `q` and for `dir` (initial `"newest"`).
- A search input above the table: `className="search-input"`, `type="search"`, a placeholder, and an `aria-label` — copy the one in `AttendanceRoster.tsx`. Filter with `matchesAny([s.title, istNumericDate(s.sessionDate ?? s.openedAt), s.status], q)`.
- The **Date** `<th>` becomes a `<button type="button">` that toggles direction, labelled with ▼ (newest) or ▲ (oldest). Put `aria-sort={dir === "newest" ? "descending" : "ascending"}` on the `<th>`, not the button.
- Empty state when the filter matches nothing: `No sessions match “{q}”.` — mirror the roster's markup and `var(--ink-3)` colour.
- Keep the existing `<h2>Session history</h2>` and the "No sessions yet." state for a genuinely empty list; they are different states and both must survive.

Props: `{ sessions: SessionRow[]; strength: number }`.

### - [ ] Task 3 — wire it into the page

In `src/app/admin/(app)/attendance/page.tsx`, replace the table block with `<SessionHistory sessions={sessions} strength={strength} />`. Remove `istNumericDate` / `pctOfStrength` / `Link` imports **only if** nothing else on the page still uses them — check, don't assume; lint will catch it either way.

### - [ ] Task 4 — verify and commit

- `npm test` (expect the current 605 + 5 new), `npx tsc --noEmit`, `npx eslint`, `npm run build` — all must be clean.
- `git diff --stat` — if a file you barely touched shows a line count near its total, you hit the CRLF trap. Fix it before committing.
- One `feat(attendance):` commit on its own branch, then merge to `main`.

## Explicitly NOT in this plan

- **Sorting the Present or % strength columns.** Date only — that is what was asked for.
- **The council session history.** `src/app/admin/(app)/council/page.tsx` renders its own copy of this table from `attendance-council.ts:129`. Same feature would apply, but it is a separate component and was deliberately left out. Do it as a follow-up only if asked.
- Any change to `listSessions`, the 200-row limit, or the server-side ordering.

## Browser check owed on completion

Automated checks cannot see sort order or a filtered table. On `/admin/attendance` as a club head: type part of a session title and confirm the table narrows; clear it and confirm every row returns; click **Date** and confirm the order inverts and the arrow flips; click again and confirm it returns to newest-first. Note that as of 2026-09-05 there is **no test `club_head` account** — see the START HERE block in `docs/STATUS.md`.
