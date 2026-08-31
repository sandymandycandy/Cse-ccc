# Club Public Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the council a per-club **Publish / Hide** toggle (`clubs.is_public`) that removes a club from the public site only, while it stays fully manageable in admin.

**Architecture:** Add one additive boolean column `clubs.is_public` (default `true`). The public-visibility rule everywhere becomes `is_active = true AND is_public = true`, enforced app-layer in the three anon-client club queries. Surface the flag as a council-only one-click toggle on the `/admin/clubs` list plus a checkbox in the club editor/create form. Reuse the existing `manage:clubs` capability (`grant === "all"` = council).

**Tech Stack:** Next 16 App Router (server components + server actions), TypeScript strict, Supabase (service-role for admin writes, anon client for public reads), vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-club-public-visibility-design.md`

## Global Constraints

- **Branch:** `feat/club-visibility` (already created; spec already committed there). Commit per task.
- **Council-only gate** is expressed exactly as `grantFor(session.role, "manage:clubs") === "all"`. Never trust the UI — re-check in the action.
- **All admin mutations**: `getAdminSession()` guard → capability gate → service-role write → `writeAudit(...)`.
- **No RLS change.** Visibility is enforced app-layer in `src/lib/queries.ts`, matching how `is_active` already works.
- **`database.types.ts` is regenerated via the Supabase MCP `generate_typescript_types`, never `npm run types:gen`** (the CLI truncates the file — STATUS gotcha). Hand-adding the one column inline is acceptable.
- **Live/shared DB.** The migration is additive (`default true`) so it is safe to apply live. Delete any throwaway rows created while smoke-testing.
- **Verification posture:** server-action POSTs can't be curled ("Failed to find Server Action"). Verify actions by typecheck + lint + build + route smoke on read/redirect paths + the owed human walkthrough. The `manage:clubs` grant map is already unit-tested in `src/lib/auth/capabilities.test.ts` (club_head→"own", president/vp/tech→"all", faculty→"read", others→"none") — no new capability test is needed and none is invented to pad coverage.
- **Gate command** (run at the end of each task and at the close): `npm run typecheck && npm run lint && npm test && npm run build`.

---

### Task 1: Add `clubs.is_public` column + types

**Files:**
- Create: `supabase/migrations/20260831020000_club_public_visibility.sql`
- Modify: `src/lib/database.types.ts` (the `clubs` table `Row`/`Insert`/`Update`, ~lines 717–760)

**Interfaces:**
- Produces: the `clubs.is_public boolean not null default true` column, and `is_public: boolean` on the generated `clubs.Row` (optional on `Insert`/`Update`), consumed by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260831020000_club_public_visibility.sql`:

```sql
-- Club public visibility flag. Hides a club from the PUBLIC site only
-- (home, /clubs directory, /clubs/[slug] page, calendar chips) while it stays
-- fully manageable in admin. Distinct from is_active ("operational").
-- Default true so every existing club stays visible — no regression.
alter table public.clubs
  add column is_public boolean not null default true;

comment on column public.clubs.is_public is
  'Listed on the public site (home, /clubs, /clubs/[slug], calendar chips). Council-only toggle. Distinct from is_active (operational).';
```

- [ ] **Step 2: Apply the migration to the live DB via Supabase MCP**

Use the MCP tool `mcp__plugin_supabase_supabase__apply_migration` with `name: "club_public_visibility"` and the SQL above (project_ref `svkbleeibbrjryeovvjw`). Additive + default true → safe on the shared DB.

- [ ] **Step 3: Verify the column landed (MCP probe)**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='clubs' and column_name='is_public';
select count(*) filter (where is_public) as public_count, count(*) as total from public.clubs;
```

Expected: one row `is_public | boolean | NO | true`; `public_count == total` (all 11 clubs public).

- [ ] **Step 4: Add `is_public` to the generated types**

In `src/lib/database.types.ts`, in the `clubs` table block, add the field alphabetically right after each `is_active` line:
- `Row`: `is_active: boolean` → add on the next line `          is_public: boolean`
- `Insert`: `is_active?: boolean` → add `          is_public?: boolean`
- `Update`: `is_active?: boolean` → add `          is_public?: boolean`

(Optionally reconcile the whole file via the MCP `generate_typescript_types` and diff — but the three-line hand-add is exact.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no other file references `is_public` yet).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260831020000_club_public_visibility.sql src/lib/database.types.ts
git commit -m "feat(clubs): add is_public visibility column + types"
```

---

### Task 2: Filter public club queries on `is_public`

**Files:**
- Modify: `src/lib/queries.ts` — `getCalendarClubs` (~L243–247), `getClubsWithCounts` (~L284–288), `getClubBySlug` (~L315–319)

**Interfaces:**
- Consumes: `clubs.is_public` (Task 1).
- Produces: no signature change — the three functions now return only clubs where `is_active AND is_public`.

- [ ] **Step 1: Filter `getCalendarClubs`**

In `src/lib/queries.ts`, in `getCalendarClubs`, add the visibility filter beside the existing active filter:

```ts
    .from("clubs")
    .select("slug, short_name, color")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort", { ascending: true });
```

- [ ] **Step 2: Filter `getClubsWithCounts`**

In the same file, in `getClubsWithCounts`, add beside the active filter:

```ts
    .from("clubs")
    .select("slug, name, short_name, category, color, tagline, description")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort", { ascending: true });
```

- [ ] **Step 3: Filter `getClubBySlug` on both flags**

In `getClubBySlug` (which filters neither today), add both filters before `.maybeSingle()`:

```ts
    .from("clubs")
    .select("slug, name, short_name, category, color, tagline, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_public", true)
    .maybeSingle();
```

A hidden or inactive club now returns `null`, and the page's existing `if (!data) notFound()` fires. `getEventsForClub` is unchanged (only reached after `getClubBySlug` succeeds).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat(clubs): gate public club surfaces on is_public (+ close is_active detail-page leak)"
```

---

### Task 3: Wire `is_public` through the editor + create form

Schema, form-parse, actions, data helpers and the form UI move together so create/edit never submits a stale `is_public` — a reviewer would reject a half-wired form.

**Files:**
- Modify: `src/lib/validation/club.ts` — `ClubStructuralSchema`
- Modify: `src/app/admin/(app)/clubs/actions.ts` — `structuralFrom`, `createClubAction`, `updateClubAction`
- Modify: `src/lib/admin/clubs.ts` — `AdminClubRow` + `listClubsForAdmin`; `ClubForEdit` + `getClubForEdit`
- Modify: `src/components/admin/ClubForm.tsx` — `ClubInitial`, the structural checkbox block
- Modify: `src/app/admin/(app)/clubs/new/page.tsx` — `initial`
- Modify: `src/app/admin/(app)/clubs/[id]/edit/page.tsx` — `initial`

**Interfaces:**
- Consumes: `clubs.is_public` (Task 1).
- Produces: `ClubStructuralSchema` now parses `isPublic: boolean`; `AdminClubRow` and `ClubForEdit` gain `isPublic: boolean`; the form submits an `isPublic` checkbox. Consumed by Task 4 (list uses `AdminClubRow.isPublic`; `setClubVisibilityAction` reads `getClubForEdit().isPublic`).

- [ ] **Step 1: Add `isPublic` to the structural schema**

In `src/lib/validation/club.ts`, add to `ClubStructuralSchema` (right after `isActive`):

```ts
export const ClubStructuralSchema = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(SLUG_RE, "lowercase-hyphen"),
  category: z.enum(CLUB_CATEGORIES),
  color: z.string().trim().regex(HEX_COLOR_RE, "hex"),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sort: z.coerce.number().int().min(0).max(9999),
});
```

- [ ] **Step 2: Read the checkbox in `structuralFrom` + write it in both actions**

In `src/app/admin/(app)/clubs/actions.ts`:

`structuralFrom` — add the field:
```ts
function structuralFrom(formData: FormData) {
  return {
    slug: formData.get("slug") ?? "",
    category: formData.get("category") ?? "",
    color: formData.get("color") ?? "",
    isActive: formData.get("isActive") != null,
    isPublic: formData.get("isPublic") != null,
    sort: formData.get("sort") ?? "0",
  };
}
```

`createClubAction` insert — add `is_public: d.isPublic,` beside `is_active: d.isActive,`.

`updateClubAction` `canStructural` block — add beside the `is_active` line:
```ts
    update.is_active = structural.data.isActive;
    update.is_public = structural.data.isPublic;
```
and in the same block extend the audit `after`:
```ts
    after.isActive = structural.data.isActive;
    after.isPublic = structural.data.isPublic;
```

- [ ] **Step 3: Expose `isPublic` from the data helpers**

In `src/lib/admin/clubs.ts`:
- `AdminClubRow` interface — add `isPublic: boolean;`.
- `listClubsForAdmin` — add `is_public` to the select string and `isPublic: c.is_public,` to the mapped object:
  ```ts
    .select("id, name, short_name, category, tagline, is_active, is_public, updated_at")
  ```
  ```ts
      isActive: c.is_active,
      isPublic: c.is_public,
  ```
- `ClubForEdit` interface — add `isPublic: boolean;`.
- `getClubForEdit` — add `is_public` to the select and `isPublic: data.is_public,` to the return:
  ```ts
    .select("id, name, short_name, slug, category, color, tagline, description, is_active, is_public, sort")
  ```
  ```ts
      isActive: data.is_active,
      isPublic: data.is_public,
  ```

- [ ] **Step 4: Add the checkbox to the form + relabel `is_active`**

In `src/components/admin/ClubForm.tsx`:
- `ClubInitial` interface — add `isPublic: boolean;` (after `isActive`).
- Replace the existing `isActive` checkbox block (the `canEditStructural` `<label>` near the end) with both checkboxes, and fix the misleading `is_active` label:

```tsx
      {canEditStructural ? (
        <>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initial.isActive}
              style={{ width: "auto" }}
            />
            <span>Active (club is operational)</span>
          </label>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              name="isPublic"
              defaultChecked={initial.isPublic}
              style={{ width: "auto" }}
            />
            <span>Show on public site</span>
          </label>
        </>
      ) : null}
```

- [ ] **Step 5: Pass `isPublic` in both pages' `initial`**

- `src/app/admin/(app)/clubs/new/page.tsx` — in the `initial={{ … }}` object add `isPublic: true,` (new clubs default visible).
- `src/app/admin/(app)/clubs/[id]/edit/page.tsx` — in `initial={{ … }}` add `isPublic: club.isPublic,`.

- [ ] **Step 6: Gate check**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS; existing 181 tests still green (no test references changed signatures).

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/club.ts "src/app/admin/(app)/clubs/actions.ts" src/lib/admin/clubs.ts src/components/admin/ClubForm.tsx "src/app/admin/(app)/clubs/new/page.tsx" "src/app/admin/(app)/clubs/[id]/edit/page.tsx"
git commit -m "feat(clubs): edit/create is_public via the club form (council-only)"
```

---

### Task 4: One-click Publish / Hide on the clubs list

**Files:**
- Modify: `src/app/admin/(app)/clubs/actions.ts` — new `setClubVisibilityAction`
- Modify: `src/app/admin/(app)/clubs/page.tsx` — Public column + badge + toggle button

**Interfaces:**
- Consumes: `getClubForEdit().isPublic` and `AdminClubRow.isPublic` (Task 3); `grantFor` / `canManage` (existing).
- Produces: `setClubVisibilityAction(formData: FormData): Promise<void>` — a form action reading `id` (uuid) and `makePublic` (`"true"`/`"false"`).

- [ ] **Step 1: Add `setClubVisibilityAction`**

In `src/app/admin/(app)/clubs/actions.ts`, add the import `import { revalidatePath } from "next/cache";` at the top, and the action (council-only, audited, no redirect):

```ts
/** One-click publish/hide from the clubs list. Council-only (grant `all`). */
export async function setClubVisibilityAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  if (grantFor(session.role, "manage:clubs") !== "all") return;

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return;
  const isPublic = formData.get("makePublic") === "true";

  const existing = await getClubForEdit(id);
  if (!existing) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("clubs")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return;

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "club",
    entityId: id,
    before: { isPublic: existing.isPublic },
    after: { isPublic },
  });

  revalidatePath("/admin/clubs");
}
```

- [ ] **Step 2: Add the Public column + toggle to the list**

In `src/app/admin/(app)/clubs/page.tsx`, import the action:
```ts
import { setClubVisibilityAction } from "./actions";
```
Add a header cell after `<th>Active</th>`:
```tsx
                <th>Public</th>
```
Add the matching body cell after the Active `<td>` (uses the already-computed `grant`):
```tsx
                  <td>
                    {c.isPublic ? (
                      <span style={{ color: "var(--forest)" }}>Public</span>
                    ) : (
                      <span style={{ color: "var(--rust)", fontWeight: 500 }}>Hidden</span>
                    )}
                    {grant === "all" ? (
                      <form action={setClubVisibilityAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="makePublic" value={c.isPublic ? "false" : "true"} />
                        <button type="submit" className="btn btn-sm" style={{ marginLeft: 8 }}>
                          {c.isPublic ? "Hide" : "Publish"}
                        </button>
                      </form>
                    ) : null}
                  </td>
```

- [ ] **Step 3: Gate check**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS; `/admin/clubs` compiles as a server component wiring a server action into a `<form>`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(app)/clubs/actions.ts" "src/app/admin/(app)/clubs/page.tsx"
git commit -m "feat(clubs): one-click Publish/Hide toggle + Hidden badge on the clubs list"
```

---

### Task 5: Verify, smoke, and document

**Files:**
- Modify: `docs/STATUS.md` (START HERE block for this feature)

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green; test count unchanged at 181 (no new unit logic — the gate is already covered by `capabilities.test.ts`).

- [ ] **Step 2: Read-path route smoke (dev server, curl-able)**

With `npm run dev` running: `GET /clubs` → 200, `GET /calendar` → 200, `GET /clubs/<a-real-active-public-slug>` → 200 (no regression); `/admin/clubs` (no cookie) → 307→login.

- [ ] **Step 3: Hidden-path smoke via a throwaway club (MCP; self-cleaning)**

Via MCP `execute_sql` insert a throwaway hidden club, confirm it 404s, then delete it (shared live DB — leave no residue):

```sql
insert into public.clubs (name, short_name, slug, category, color, is_active, is_public, sort)
values ('zzz-verify-tmp','ZZZ','zzz-verify-tmp','tech','#1f7a4d', true, false, 9999);
```
Then `GET /clubs/zzz-verify-tmp` → **404**, and it is **absent** from `GET /clubs`. Then:
```sql
delete from public.clubs where slug = 'zzz-verify-tmp';
```
(If a smoke insert is undesirable on prod, skip and rely on the human walkthrough below.)

- [ ] **Step 4: Update `docs/STATUS.md`**

Add a START-HERE block for this feature: what shipped (`clubs.is_public`, council-only Publish/Hide + editor checkbox, three query filters closing the leak), the applied additive migration `20260831020000_club_public_visibility`, the gate result, and the **owed human walkthrough** (below). Commit:

```bash
git add docs/STATUS.md
git commit -m "docs(status): record club public visibility toggle"
```

- [ ] **Step 5: Record the owed human walkthrough**

Server-action POSTs can't be curled, so note in STATUS that a human must: as council, **Hide** a club on `/admin/clubs` → confirm it vanishes from home, `/clubs`, `/clubs/[slug]` (404), and the calendar chips, while its admin/edit pages still work → **Publish** to restore; and confirm a **club_head** login sees no Public badge/Hide button and no "Show on public site" checkbox in their editor.

- [ ] **Step 6: Finish the branch**

Invoke `superpowers:finishing-a-development-branch` to merge `feat/club-visibility` → `main` and push (auto-deploys). Do not apply any drop migration (none here).

---

## Self-Review

**Spec coverage:**
- Data model `clubs.is_public` (default true) → Task 1. ✓
- Three public query filters, single `is_active AND is_public` rule, close both leaks → Task 2. ✓
- Council-only editor checkbox + relabel `is_active` + new-club default visible → Task 3. ✓
- One-click Publish/Hide + Hidden badge on the list, council-gated + audited → Task 4. ✓
- Testing posture (gate already covers the capability; typecheck/build/smoke/walkthrough) → Global Constraints + Task 5. ✓
- Out-of-scope items (events hub untouched, no RLS, no club-head self-serve, boolean not timestamp) → honored by construction (no task touches them). ✓

**Placeholder scan:** none — every step carries exact code/SQL/paths.

**Type consistency:** `isPublic` (camelCase) on `AdminClubRow` / `ClubForEdit` / `ClubInitial` / `ClubStructuralSchema`; `is_public` (snake) on the DB column, generated types, selects and updates. `setClubVisibilityAction(formData)` reads `id` + `makePublic`; the list form posts exactly those two hidden inputs. `structuralFrom` returns `isPublic` which `ClubStructuralSchema` parses and both actions consume. Consistent throughout.
