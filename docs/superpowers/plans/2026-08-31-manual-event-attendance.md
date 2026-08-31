# Manual Event Attendance (Feature B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the event QR self-scan subsystem entirely and make event attendance manual-only, marked inline on the registrations table with the control scoped to eligible registrants (all confirmed for seats events; shortlisted only for shortlist events).

**Architecture:** Delete the self-scan surface (student scan page, rotating-code + device-enroll API routes, `LiveAttendance`, the check-in-window admin page, and `src/lib/attendance.ts`). Keep the existing per-row `toggleAttendanceAction` on the registrations page — it already marks `attended` manually — and gate its UI control and its write with a new pure `isAttendanceEligible` helper. No additive migration; the three dead tables are dropped later via a held migration.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Supabase (service-role admin client), vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-manual-event-attendance-design.md`

## Global Constraints

- **Branch:** work on `feat/manual-event-attendance` (already created; the spec commit `c434452` is on it). Do not commit to `main`.
- **Live/shared DB:** dev and prod share one Supabase DB. **Do not apply** the drop migration in this plan — it is written and left unapplied (held). Create no test rows.
- **Server-action POSTs can't be curled** ("Failed to find Server Action") — verify mutations in a browser or via direct DB read assertion, never by curling the action.
- **No `dangerouslySetInnerHTML`** (ESLint-banned) — not relevant here but holds.
- **Verify gate before declaring done:** `npm run typecheck` ✓ / `npm run lint` ✓ / `npm test` ✓ / `npm run build` ✓. State real output; never assert green without running.
- **Test style:** `import { describe, it, expect } from "vitest";`. Run one file with `npx vitest run <path>`.
- **Pure logic is unit-tested; DB-backed layers (actions, pages) are typecheck + build + walkthrough-verified**, per the project's established convention.

---

### Task 1: Pure attendance-eligibility helper

**Files:**
- Create: `src/lib/admin/attendance-eligibility.ts`
- Test: `src/lib/admin/attendance-eligibility.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type SelectionMode = "seats" | "shortlist"`
  - `isAttendanceEligible(reg: { shortlistedAt: string | null }, selectionMode: SelectionMode): boolean` — used by Task 2 in both the registrations page and `toggleAttendanceAction`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/attendance-eligibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAttendanceEligible } from "./attendance-eligibility";

describe("isAttendanceEligible", () => {
  it("seats: every confirmed registrant is eligible regardless of shortlist state", () => {
    expect(isAttendanceEligible({ shortlistedAt: null }, "seats")).toBe(true);
    expect(
      isAttendanceEligible({ shortlistedAt: "2026-08-31T00:00:00Z" }, "seats"),
    ).toBe(true);
  });

  it("shortlist: only shortlisted registrants are eligible", () => {
    expect(
      isAttendanceEligible({ shortlistedAt: "2026-08-31T00:00:00Z" }, "shortlist"),
    ).toBe(true);
    expect(isAttendanceEligible({ shortlistedAt: null }, "shortlist")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/admin/attendance-eligibility.test.ts`
Expected: FAIL — cannot resolve `./attendance-eligibility` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/admin/attendance-eligibility.ts`:

```ts
/**
 * Who may be marked present at an event. Feature A's selection mode decides:
 * a `seats` event admits every confirmed registrant; a `shortlist` event admits
 * only the shortlisted ones. Pure — shared by the registrations page (to show the
 * Mark-present control) and `toggleAttendanceAction` (to guard the write).
 */
export type SelectionMode = "seats" | "shortlist";

export function isAttendanceEligible(
  reg: { shortlistedAt: string | null },
  selectionMode: SelectionMode,
): boolean {
  if (selectionMode === "seats") return true;
  return reg.shortlistedAt != null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/admin/attendance-eligibility.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/attendance-eligibility.ts src/lib/admin/attendance-eligibility.test.ts
git commit -m "feat(attendance): pure isAttendanceEligible helper for event scope

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 2: Scope the inline marking (registrations page + toggle action)

**Files:**
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx`
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts`

**Interfaces:**
- Consumes: `isAttendanceEligible`, `SelectionMode` from Task 1.
- Consumes (already present): `getEventFormSchema(eventId)` → `{ schema, selectionMode }` (imported in both files already); `listRegistrations(id)` rows carry `r.shortlistedAt` and `r.attended`.
- Produces: no new exports — behaviour change only.

**Context:** the page already computes `isShortlist = selectionMode === "shortlist"` and renders a per-row **Check-in** `<td>` with the `toggleAttendanceAction` form when `canEdit`. This task (a) removes the dead "Check-in" header link, (b) shows the toggle only on eligible rows, (c) simplifies the Attended badge to "Present", and (d) guards the write server-side.

- [ ] **Step 1: Add the import to the page**

In `src/app/admin/(app)/events/[id]/registrations/page.tsx`, add to the imports:

```ts
import { isAttendanceEligible } from "@/lib/admin/attendance-eligibility";
```

- [ ] **Step 2: Remove the dead "Check-in" header link**

Delete this block from the page header (`.stack` div near the Export CSV button):

```tsx
<Link href={`/admin/events/${id}/attendance`} className="btn btn-ghost btn-sm">
  Check-in
</Link>
```

Leave the `Export CSV` anchor. (If `Link` becomes unused after this, remove the `next/link` import; it is still used for the "← Events" back link, so keep it.)

- [ ] **Step 3: Simplify the Attended badge**

In the Attended `<td>`, replace the method-dependent badge text:

```tsx
{r.attended ? (
  <span className="abadge abadge-approved">
    {r.method ?? "yes"}
  </span>
) : (
  "—"
)}
```

with:

```tsx
{r.attended ? (
  <span className="abadge abadge-approved">Present</span>
) : (
  "—"
)}
```

- [ ] **Step 4: Gate the toggle to eligible rows**

Replace the Check-in `<td>` (the `{canEdit ? (...) : null}` block that renders the `toggleAttendanceAction` form) with a version that renders the form only for eligible rows and a plain "—" otherwise:

```tsx
{canEdit ? (
  isAttendanceEligible(r, selectionMode) ? (
    <td>
      <form action={toggleAttendanceAction}>
        <input type="hidden" name="registrationId" value={r.id} />
        <input type="hidden" name="eventId" value={id} />
        <input type="hidden" name="attend" value={r.attended ? "0" : "1"} />
        <button
          type="submit"
          className={`btn btn-sm ${r.attended ? "btn-ghost" : "btn-accent"}`}
        >
          {r.attended ? "Undo" : hasTeam ? "Mark team present" : "Mark present"}
        </button>
      </form>
    </td>
  ) : (
    <td>—</td>
  )
) : null}
```

(`selectionMode` is already destructured from `getEventFormSchema` at the top of the component. `r` has `shortlistedAt` typed `string | null`, matching the helper's parameter.)

- [ ] **Step 5: Guard the write in the action**

In `src/app/admin/(app)/events/[id]/registrations/actions.ts`, add the import near the top:

```ts
import { isAttendanceEligible } from "@/lib/admin/attendance-eligibility";
```

Then, inside `toggleAttendanceAction`, after the `canManage` guard and before building the `update`, add an eligibility check that applies only when marking present (an undo must always be allowed so an unshortlisted-after-marking row can be corrected):

```ts
  const admin = createAdminClient();

  if (attend) {
    const { selectionMode } = await getEventFormSchema(eventId);
    const { data: reg } = await admin
      .from("registrations")
      .select("shortlisted_at")
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!reg) return;
    if (!isAttendanceEligible({ shortlistedAt: reg.shortlisted_at }, selectionMode)) {
      return; // shortlist event, not shortlisted → not markable
    }
  }
```

Note: `getEventFormSchema` is **already imported** in this file (used by `shortlistAction`). Do not add a duplicate import. Keep the existing `const admin = createAdminClient();` — if it already sits below where you inserted this block, move the single declaration above the new block (there must be exactly one `createAdminClient()` call in the function).

- [ ] **Step 6: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds (the registrations route compiles with the new import).

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/registrations/page.tsx" "src/app/admin/(app)/events/[id]/registrations/actions.ts"
git commit -m "feat(attendance): scope inline event marking to eligible registrants

Show Mark-present only on eligible rows (all confirmed for seats events;
shortlisted only for shortlist events), guard the toggle write server-side,
drop the dead Check-in link, and simplify the Attended badge to 'Present'.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 3: Remove the QR self-scan subsystem + trim the attendance lib

**Files:**
- Delete: `src/app/a/[session]/page.tsx` (and the now-empty `src/app/a/` tree)
- Delete: `src/components/ScanRunner.tsx`
- Delete: `src/components/EnrollDevice.tsx`
- Delete: `src/components/admin/LiveAttendance.tsx`
- Delete: `src/app/admin/(app)/events/[id]/attendance/page.tsx`
- Delete: `src/app/admin/(app)/events/[id]/attendance/actions.ts` (and the now-empty `attendance/` dir)
- Delete: `src/app/api/attendance/scan/route.ts`
- Delete: `src/app/api/attendance/code/route.ts` (and the now-empty `src/app/api/attendance/` tree)
- Delete: `src/app/api/devices/enroll/route.ts` (and the now-empty `src/app/api/devices/` tree)
- Delete: `src/lib/attendance.ts`
- Modify: `src/lib/admin/attendance.ts` — remove the session helpers, keep `getEventForAttendance` + `AttendanceEvent`.

**Interfaces:**
- Consumes: nothing new.
- Produces: `src/lib/admin/attendance.ts` continues to export `getEventForAttendance(eventId): Promise<AttendanceEvent | null>` and the `AttendanceEvent` interface — the six existing importers (registrations page/actions, results page/actions, CSV export) keep working unchanged.

**Context:** verified — `@/lib/attendance` is imported only by the four deleted route/page files; the kept club-member attendance surface (`src/lib/admin/attendance-club.ts`, `SessionRoster.tsx`, `/admin/(app)/attendance/*`) does not import it; and no test references any removed module. So this is a clean deletion.

- [ ] **Step 1: Delete the self-scan files**

```bash
git rm "src/app/a/[session]/page.tsx" \
       src/components/ScanRunner.tsx \
       src/components/EnrollDevice.tsx \
       src/components/admin/LiveAttendance.tsx \
       "src/app/admin/(app)/events/[id]/attendance/page.tsx" \
       "src/app/admin/(app)/events/[id]/attendance/actions.ts" \
       src/app/api/attendance/scan/route.ts \
       src/app/api/attendance/code/route.ts \
       src/app/api/devices/enroll/route.ts \
       src/lib/attendance.ts
```

Then remove any directories left empty by the deletions (git does not track dirs, but the working tree may keep empty folders):

```bash
rmdir -p "src/app/a/[session]" 2>/dev/null || true
rmdir -p "src/app/admin/(app)/events/[id]/attendance" 2>/dev/null || true
rmdir -p src/app/api/attendance/scan src/app/api/attendance/code 2>/dev/null || true
rmdir -p src/app/api/devices/enroll 2>/dev/null || true
```

- [ ] **Step 2: Trim `src/lib/admin/attendance.ts`**

Replace the whole file with the trimmed version — keep only the event lookup, drop every session helper (`AttendanceSession`, `getLatestSession`, `getSessionById`, `openSession`, `closeSession`, `sessionScanCount`, `attendedCount`):

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve an event + its primary club id for attendance/registration authz. */

export interface AttendanceEvent {
  id: string;
  title: string;
  clubId: string | null;
  startsAt: string;
}

export async function getEventForAttendance(
  eventId: string,
): Promise<AttendanceEvent | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("id, title, starts_at, event_clubs ( is_primary, club_id )")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    starts_at: string;
    event_clubs: { is_primary: boolean; club_id: string }[];
  };
  const primary = row.event_clubs.find((e) => e.is_primary) ?? row.event_clubs[0];
  return { id: row.id, title: row.title, clubId: primary?.club_id ?? null, startsAt: row.starts_at };
}
```

- [ ] **Step 3: Typecheck to prove no dangling imports**

Run: `npm run typecheck`
Expected: no errors. (If any error names a removed symbol, an importer was missed — fix by removing that usage; per the blast-radius analysis there should be none beyond the deleted files.)

- [ ] **Step 4: Lint + full test suite + build**

Run: `npm run lint`
Expected: clean (no unused-import or dead-route errors).
Run: `npm test`
Expected: all tests pass — nothing imported the removed modules, so the count is unchanged plus Task 1's new suite.
Run: `npm run build`
Expected: build succeeds; the routes `/a/[session]`, `/api/attendance/*`, `/api/devices/enroll`, and `/admin/events/[id]/attendance` no longer appear in the route manifest.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(attendance): remove the event QR self-scan subsystem

Delete the student scan page, ScanRunner/EnrollDevice/LiveAttendance, the
rotating-code + scan + device-enroll API routes, the check-in-window admin page,
and src/lib/attendance.ts. Trim src/lib/admin/attendance.ts to getEventForAttendance.
Event attendance is now manual-only (marked inline on registrations). No consumer
outside the deleted files referenced any of this.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 4: Held drop migration for the dead self-scan tables

**Files:**
- Create: `supabase/migrations/20260831000000_drop_event_self_scan.sql`

**Interfaces:** none (SQL file; not executed by this plan).

**Context:** mirrors the `drop_member_portal` / `drop_register_v1` pattern — the file is committed but **not applied**, so a `git revert` rollback of the deploy still has working tables. The owner applies it later via Supabase MCP `apply_migration` once the deploy is confirmed.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260831000000_drop_event_self_scan.sql`:

```sql
-- Held drop migration — retire the event QR self-scan subsystem (Feature B).
--
-- DO NOT APPLY until AFTER the Feature B deploy succeeds. Held so a `git revert`
-- rollback of the deploy still has working tables. The new code no longer
-- references these tables; they sit harmlessly unused until this is applied via
-- the Supabase MCP `apply_migration` (name: drop_event_self_scan).
--
-- Order respects FKs: attendance_scans references attendance_sessions and
-- student_devices, so it drops first.

drop table if exists public.attendance_scans;
drop table if exists public.attendance_sessions;
drop table if exists public.student_devices;
```

- [ ] **Step 2: Sanity-check (do NOT run against the DB)**

Confirm the file is syntactically a plain sequence of `drop table if exists` statements and that its timestamp prefix `20260831000000` sorts after the latest existing migration (`20260829010000_register_for_event_v2`). Do not execute it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260831000000_drop_event_self_scan.sql
git commit -m "chore(db): held drop migration for dead self-scan tables

Drops attendance_scans, attendance_sessions, student_devices. Held (not applied)
until after the Feature B deploy, matching the drop_member_portal pattern.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

### Task 5: Final gate + STATUS.md update

**Files:**
- Modify: `docs/STATUS.md`

**Interfaces:** none.

- [ ] **Step 1: Run the full verify gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all four succeed. Record the test count. Do not proceed if any step fails — fix the cause.

- [ ] **Step 2: Route smoke (optional, needs `npm run dev`)**

If a dev server is available, confirm the removed routes are gone (all should 404):
`/a/anything`, `GET /api/attendance/code?session=x`, `POST /api/attendance/scan`, `POST /api/devices/enroll`, `/admin/events/<id>/attendance`.
And confirm `/admin/events/<id>/registrations` (no cookie) still 307→login. Skip if no dev server; the build route-manifest check in Task 3 already proves the routes are removed.

- [ ] **Step 3: Update STATUS.md**

Add a new entry at the top of the "🚦 START HERE" shipped list in `docs/STATUS.md` summarising Feature B: QR self-scan removed (student scan page, rotating-code/scan/device-enroll routes, LiveAttendance, check-in-window page, `src/lib/attendance.ts`); event attendance now manual-only inline on the registrations table, scoped via `isAttendanceEligible` (seats → all confirmed; shortlist → shortlisted only) with a server-side guard; **held** drop migration `drop_event_self_scan` for the three dead tables; new unit suite for the helper. Record the new test count and note the **owed human walkthrough** (mark a shortlisted registrant present → `attended` set; confirm a non-shortlisted row has no button; confirm a seats event marks any confirmed row). Cross-reference the spec + this plan.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): record Feature B — manual event attendance / self-scan removed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sy8nxfyxpiEndT2mwN1tQe"
```

---

## Post-plan (owner-gated, not part of execution)

- **Merge + deploy:** fast-forward-merge `feat/manual-event-attendance` → `main` and `git push origin main` (auto-deploys to prod) — **only when the owner says so**, per the project's merge convention.
- **Apply the held drop migration** `drop_event_self_scan` via Supabase MCP **after** the deploy is confirmed healthy — owner's call, alongside the other held drops (`drop_register_v1`, `drop_member_portal`).
- **Owed human walkthrough:** the browser check in Task 5 Step 3 (server-action POSTs can't be curled).
