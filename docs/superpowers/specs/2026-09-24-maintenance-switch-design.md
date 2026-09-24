# Maintenance switch in the admin panel — design

**Date:** 2026-09-24 · **Status:** approved in conversation, awaiting spec review

## Goal

Let the Technical Head, President or Vice President put the public site into
maintenance mode — and bring it back — from a button in `/admin`, taking effect
within ~10 seconds, with no code change and no redeploy. Today the only switches
are the `DEFAULT_MAINTENANCE` constant in `src/lib/maintenance.ts` and the
`MAINTENANCE_MODE` Vercel env var, both of which need a deploy.

**Success:** click the button → within ~10 s every public route answers 503 with
the maintenance page; click again → the site is back. `/admin/*` works
throughout.

## Decisions (owner)

- Who can flip it: `tech_head`, `president`, `vice_president` (option 2).
  The Faculty Advisor is deliberately NOT included even though that role is
  otherwise unrestricted.
- Storage: a Supabase settings row read by the proxy with a short cache
  (option A) — not Vercel Global Config, not env var + redeploy.

## 1. Storage — `site_settings`

New migration `supabase/migrations/20260924000000_site_settings.sql`:

- Table `site_settings`: a single row enforced by `id boolean primary key
  default true check (id)`; `maintenance boolean not null`, `updated_at
  timestamptz not null default now()`, `updated_by uuid null references
  public.admin_users(id) on delete set null`.
- **Seeded with `maintenance = true`**, because production is in maintenance at
  the time this ships — deploying the feature must not silently bring the site
  back.
- RLS enabled. One policy: `select` for `anon, authenticated` (a single public
  boolean, nothing secret). No insert/update/delete policies — writes happen only
  through the service-role client in the admin server action.
- Regenerate `src/lib/database.types.ts`.

## 2. Resolution in `proxy.ts` (public routes only)

`isExemptPath(pathname)` is checked FIRST: `/admin/*` never reads the switch, so
the panel works regardless of the switch or of the read failing.

For every other path, maintenance is ON when, in precedence order:

1. `MAINTENANCE_MODE` env var holds a recognised value (`1/true/on/yes` or
   `0/false/off/no`) → that value wins (break-glass override, unchanged).
2. Otherwise the `site_settings.maintenance` value.
3. If the read fails or exceeds a **1.5 s timeout** → the last value this
   instance successfully read; if it never read one → `DEFAULT_MAINTENANCE`.

`DEFAULT_MAINTENANCE` is set back to `false` in this change — the switch is now
the source of truth; the constant is only the cold-start-with-DB-down fallback.

**Cache:** a module-level `{ value, fetchedAt }` per server instance, TTL
**10 s**. At most one read per instance per 10 s, never per request. Concurrent
misses share one in-flight promise.

**Client:** the read uses the anon key (public-read RLS), not the service role —
the proxy never holds more privilege than it needs. A plain `fetch` to PostgREST
(`/rest/v1/site_settings?select=maintenance&id=eq.true`) with `AbortSignal.timeout`
keeps it dependency-free and easy to test.

This relaxes the old "zero DB queries while down" rule to "at most one cached,
timeout-bounded read, with a fallback". The maintenance page itself still issues
no queries and is still fully inline.

Code shape: `src/lib/maintenance.ts` keeps the pure pieces
(`isMaintenanceMode` → becomes `resolveMaintenance(envValue, switchValue)`,
`isExemptPath`, `maintenanceResponse`). A new `src/lib/maintenance-switch.ts`
owns the cached fetch (`getMaintenanceSwitch(): Promise<boolean | null>`,
`null` = unknown) with an injectable fetch/clock for tests.

## 3. Admin UI

**"Public site" card at the top of the dashboard** (`src/app/admin/(app)/page.tsx`
→ `AdminDashboardView`), shown to the three roles only:

- Status: 🟢 Live / 🔧 In maintenance; "Turned on by <name> · <date time>".
- One button: "Put site in maintenance" / "Bring site back live".
- Clicking reveals an inline confirm ("This takes the public site down for
  everyone. Continue?" / "This brings the public site back for everyone.
  Continue?") with Confirm / Cancel — no `window.confirm`.
- When the env var is overriding: the card shows "Forced on/off by the
  MAINTENANCE_MODE setting in Vercel" and the button is disabled.

**Server action** `src/app/admin/(app)/maintenance/actions.ts`
(`setMaintenanceAction(on: boolean)`), following `feedback/actions.ts`:
`requireRole(["tech_head","president","vice_president"])` (redirect on deny),
update the row via `createAdminClient()` setting `updated_by`/`updated_at`,
`writeAudit({ action: on ? "maintenance_on" : "maintenance_off", entity:
"site_settings", before, after })`, `revalidatePath("/admin", "layout")`.
The role check is repeated server-side; hiding the card is UX only.

**Banner for every admin** while maintenance is on: a thin line at the top of
`admin-main` in `src/app/admin/(app)/layout.tsx`: "The public site is in
maintenance mode." Read fresh via `getSiteStatus()` (service role, same
`resolveMaintenance()` precedence), so it can lead visitors by at most the
proxy's 10 s cache.

## 4. Failure cases

| Situation | Public site | Admin |
|---|---|---|
| DB read slow/failing, value cached | last known state | works (panel itself may be degraded) |
| DB down, cold instance | `DEFAULT_MAINTENANCE` (false) | login needs DB — use env var |
| Env var set to a recognised value | env var wins | card says "forced", button disabled |
| Row missing (migration not applied) | treated as read failure → fallback | card shows "switch unavailable" |

Full-outage runbook stays: set `MAINTENANCE_MODE=on` in Vercel and redeploy.

## 5. Testing

- `resolveMaintenance`: env wins both ways; unrecognised env falls through;
  switch true/false; `null` switch → default.
- `maintenance-switch`: caches within TTL; refetches after; timeout/error →
  last good value, then `null` when none; concurrent calls share one fetch.
- Proxy: `/admin/*` never calls the switch; public paths 503 when on.
- Server action: each non-allowed role is rejected; allowed roles update the
  row and write audit with before/after.
- Existing 11 maintenance tests keep passing (renamed where the API changes).
- After deploy: flip on/off from `/admin` on production and confirm `/events`
  503 ↔ 200 within ~10 s and `/admin/login` 200 throughout.

## Out of scope

Scheduled maintenance windows, a custom message per maintenance, and fixing the
`/team` + `/contact` links on the maintenance page (known loop, tracked in
docs/STATUS.md).
