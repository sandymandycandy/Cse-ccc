# Maintenance Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button on the admin dashboard that puts the public site into (and out of) maintenance mode within ~10 s, with no deploy.

**Architecture:** A one-row `site_settings` table holds the switch. `src/proxy.ts` reads it for public routes through a per-instance 10 s cache with a 1.5 s timeout (anon key, public-read RLS); `MAINTENANCE_MODE` env still overrides; `/admin/*` never reads it. A server action (Tech Head / President / VP only) flips the row and writes the audit log; a dashboard card and an admin-wide banner show the state.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`, server actions), Supabase Postgres + PostgREST, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-24-maintenance-switch-design.md`

## Global Constraints

- Roles allowed to flip: exactly `tech_head`, `president`, `vice_president` (NOT `faculty_advisor`).
- Precedence: recognised `MAINTENANCE_MODE` (`1/true/on/yes`, `0/false/off/no`, case/space-insensitive) → `site_settings.maintenance` → last good value → `DEFAULT_MAINTENANCE` (`false`).
- Cache TTL **10 000 ms**; read timeout **1 500 ms**; a failed read is not retried for 10 000 ms.
- `/admin` and `/admin/*` never read the switch.
- The proxy reads with `NEXT_PUBLIC_SUPABASE_ANON_KEY` via the `apikey` header only — never the service role.
- Migration seeds `maintenance = true` and MUST be applied to production BEFORE the code deploys.
- The maintenance page HTML (`PAGE` in `src/lib/maintenance.ts`) is not touched.
- Repo is LF-only; don't rewrite files with a tool that converts line endings.
- Gate before push: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all green.

## Review Focus

1. **Deploy order** — if code ships before the table exists, every read fails, a cold instance falls back to `false` and the site silently comes back live. Pinned by Task 1 applying the migration first and Task 6's pre-push check that the live row exists and is `true`.
2. **DB down / slow** — visitors must not hang: each read is capped at 1.5 s and failures back off for 10 s. Pinned by the timeout + backoff tests in Task 3.
3. **Env override present** — the button must not pretend to work: the card shows "forced" and the button is disabled; the proxy skips the DB read. Pinned in Tasks 2, 4 and 5.
4. **Wrong role posting the form directly** — hiding the card is UX only; the action itself rejects every non-allowed role. Pinned by the role loop in Task 5.
5. **Double-click / stale form** — posting "on" when already on is a harmless no-op update with an audit row, never an error. Pinned in Task 5.

---

### Task 1: `site_settings` table (migration, applied live, types)

**Files:**
- Create: `supabase/migrations/20260924000000_site_settings.sql`
- Modify: `src/lib/database.types.ts` (regenerated)

**Interfaces:**
- Produces: table `public.site_settings(id boolean pk, maintenance boolean, updated_at timestamptz, updated_by uuid → admin_users.id)`, exactly one row `id = true`.

- [ ] **Step 1: Write the migration**

```sql
-- The public site's maintenance switch — one row, flipped from /admin.
--
-- Read by src/proxy.ts on public requests (anon key, 10 s cache) and written
-- only by the service-role client in the admin server action. Spec:
-- docs/superpowers/specs/2026-09-24-maintenance-switch-design.md
--
-- Seeded ON: production was in maintenance when this shipped, and deploying the
-- feature must not quietly bring the site back.
create table public.site_settings (
  -- `check (id)` makes `true` the only legal key, so a second row is impossible.
  id          boolean primary key default true check (id),
  maintenance boolean not null,
  updated_at  timestamptz not null default now(),
  -- set null, not cascade: removing an admin must not delete the switch.
  updated_by  uuid references public.admin_users(id) on delete set null
);

insert into public.site_settings (id, maintenance) values (true, true);

alter table public.site_settings enable row level security;

-- A fresh project hands anon/authenticated full privileges on every table
-- (see docs/STATUS.md, Mumbai migration), so start from nothing and grant
-- back exactly SELECT. One public boolean — nothing secret in it.
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;

create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);
```

- [ ] **Step 2: Apply to production** with the Supabase MCP `apply_migration` (project `jisahccdnthzgibszwnq`, name `site_settings`, the SQL above). Additive and unused until Task 6 deploys, so it is safe ahead of the code.

- [ ] **Step 3: Verify grants and the row** with `execute_sql`:

```sql
select maintenance from public.site_settings;                         -- expect: true
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'site_settings' and grantee in ('anon','authenticated');
-- expect: exactly SELECT for each
```

and that the anon key can read it (run from repo root; `.env.local` holds the keys):

```bash
node --env-file=.env.local -e 'fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/rest/v1/site_settings?select=maintenance&id=eq.true",{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}}).then(r=>r.text()).then(console.log)'
```
Expected: `[{"maintenance":true}]`. Also confirm an anon PATCH is refused (expect 401/403 or `[]` with no change):

```bash
node --env-file=.env.local -e 'fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/rest/v1/site_settings?id=eq.true",{method:"PATCH",headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,"content-type":"application/json"},body:JSON.stringify({maintenance:false})}).then(async r=>console.log(r.status,await r.text()))'
```

- [ ] **Step 4: Regenerate types**

Run: `npm run types:gen` (or the Supabase MCP `generate_typescript_types`, written to `src/lib/database.types.ts`).
Expected: `site_settings` appears under `Tables`. `git diff --stat src/lib/database.types.ts` shows only additions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260924000000_site_settings.sql src/lib/database.types.ts
git commit -m "feat(db): site_settings table for the maintenance switch"
```

---

### Task 2: Precedence rules in `maintenance.ts`

**Files:**
- Modify: `src/lib/maintenance.ts:1-37` (header comment, `DEFAULT_MAINTENANCE`, replace `isMaintenanceMode`)
- Test: `src/lib/maintenance.test.ts` (replace the `isMaintenanceMode` describe block)

**Interfaces:**
- Produces:
  - `parseMaintenanceFlag(value: string | undefined | null): boolean | null` — `null` = unset/unrecognised.
  - `resolveMaintenance(envValue: string | undefined | null, switchValue: boolean | null): boolean`
  - `isExemptPath`, `maintenanceResponse` unchanged. `isMaintenanceMode` is removed (only `proxy.ts` used it; Task 4 updates it).

- [ ] **Step 1: Replace the `isMaintenanceMode` tests** in `src/lib/maintenance.test.ts` (keep the other two describe blocks) and fix the import line:

```ts
import { describe, expect, it } from "vitest";
import {
  parseMaintenanceFlag,
  resolveMaintenance,
  isExemptPath,
  maintenanceResponse,
} from "./maintenance";

describe("parseMaintenanceFlag", () => {
  it("reads affirmative values as on", () => {
    for (const v of ["1", "true", "TRUE", "on", "yes", " true "]) {
      expect(parseMaintenanceFlag(v)).toBe(true);
    }
  });

  it("reads negative values as off", () => {
    for (const v of ["0", "false", "FALSE", "off", "no", " 0 "]) {
      expect(parseMaintenanceFlag(v)).toBe(false);
    }
  });

  // A typo must not answer the question — it means "no override".
  it("treats absent or unrecognised values as no answer", () => {
    for (const v of [undefined, null, "", "   ", "maybe", "MAINTENANCE", "enabled", "2"]) {
      expect(parseMaintenanceFlag(v)).toBeNull();
    }
  });
});

describe("resolveMaintenance", () => {
  it("lets a recognised env value override the switch both ways", () => {
    expect(resolveMaintenance("on", false)).toBe(true);
    expect(resolveMaintenance("off", true)).toBe(false);
  });

  it("uses the admin switch when the env var says nothing", () => {
    expect(resolveMaintenance(undefined, true)).toBe(true);
    expect(resolveMaintenance("typo", false)).toBe(false);
  });

  // Cold instance, database unreachable: the committed default decides, and
  // that default is now "live" — the switch is the source of truth.
  it("falls back to the committed default (live) when nothing is known", () => {
    expect(resolveMaintenance(undefined, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/maintenance.test.ts`
Expected: FAIL — `parseMaintenanceFlag is not a function` / not exported.

- [ ] **Step 3: Implement.** Replace lines 1-37 of `src/lib/maintenance.ts` (everything above `/** Paths that stay reachable while maintenance is on. */`) with:

```ts
// Maintenance mode for the public site.
//
// Flipped from the admin dashboard (the `site_settings` row, read through
// src/lib/maintenance-switch.ts) and enforced in src/proxy.ts, which runs
// before any page renders. The MAINTENANCE_MODE environment variable still
// overrides the switch as a break-glass control.
//
// /admin/* is exempt. Locking the council out of their own admin panel during
// maintenance is exactly backwards — maintenance is usually when they most
// need to get in.

/**
 * Used only when neither the env var nor the switch gives an answer — a cold
 * server instance that cannot reach the database. The switch is the source of
 * truth; this is its last-resort fallback, so it stays `false`.
 */
const DEFAULT_MAINTENANCE = false;

/**
 * MAINTENANCE_MODE as an override: `true`/`false` when it says something
 * recognisable, `null` otherwise. A typo or stray space is not an answer — it
 * falls through rather than silently meaning "off".
 */
export function parseMaintenanceFlag(value: string | undefined | null): boolean | null {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return null;
}

/**
 * Env override → admin switch → committed default. `switchValue` is `null`
 * when the switch could not be read and no earlier value is cached.
 */
export function resolveMaintenance(
  envValue: string | undefined | null,
  switchValue: boolean | null,
): boolean {
  return parseMaintenanceFlag(envValue) ?? switchValue ?? DEFAULT_MAINTENANCE;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/maintenance.test.ts`
Expected: PASS (all describe blocks). `npm run typecheck` will fail in `src/proxy.ts` until Task 4 — that is expected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenance.ts src/lib/maintenance.test.ts
git commit -m "refactor(maintenance): env override -> switch -> default precedence"
```

---

### Task 3: Cached switch reader

**Files:**
- Create: `src/lib/maintenance-switch.ts`
- Test: `src/lib/maintenance-switch.test.ts`

**Interfaces:**
- Produces:
  - `createSwitchReader(fetcher: () => Promise<boolean>, now?: () => number): () => Promise<boolean | null>`
  - `fetchMaintenanceSwitch(): Promise<boolean>` — throws on any failure.
  - `getMaintenanceSwitch: () => Promise<boolean | null>` — the shared instance the proxy uses.
  - `SWITCH_TTL_MS = 10_000`, `SWITCH_TIMEOUT_MS = 1_500`.

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSwitchReader,
  fetchMaintenanceSwitch,
  SWITCH_TTL_MS,
  SWITCH_TIMEOUT_MS,
} from "./maintenance-switch";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("createSwitchReader", () => {
  it("reads once and serves the cached value inside the TTL", async () => {
    const c = clock();
    const fetcher = vi.fn().mockResolvedValue(true);
    const read = createSwitchReader(fetcher, c.now);
    expect(await read()).toBe(true);
    c.advance(SWITCH_TTL_MS - 1);
    expect(await read()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-reads after the TTL so a flip lands within ~10 s", async () => {
    const c = clock();
    const fetcher = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const read = createSwitchReader(fetcher, c.now);
    await read();
    c.advance(SWITCH_TTL_MS);
    expect(await read()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good value when a later read fails", async () => {
    const c = clock();
    const fetcher = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("down"));
    const read = createSwitchReader(fetcher, c.now);
    await read();
    c.advance(SWITCH_TTL_MS);
    expect(await read()).toBe(true);
  });

  it("returns null when it has never read a value", async () => {
    const read = createSwitchReader(vi.fn().mockRejectedValue(new Error("down")), clock().now);
    expect(await read()).toBeNull();
  });

  // A dead database must not be hit (and waited on) by every single visitor.
  it("backs off for a TTL after a failure", async () => {
    const c = clock();
    const fetcher = vi.fn().mockRejectedValue(new Error("down"));
    const read = createSwitchReader(fetcher, c.now);
    await read();
    c.advance(SWITCH_TTL_MS - 1);
    await read();
    expect(fetcher).toHaveBeenCalledTimes(1);
    c.advance(1);
    await read();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight read between concurrent callers", async () => {
    let resolve!: (v: boolean) => void;
    const fetcher = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const read = createSwitchReader(fetcher, clock().now);
    const a = read();
    const b = read();
    resolve(true);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("fetchMaintenanceSwitch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stub(response: Response | Error) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const f = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
    vi.stubGlobal("fetch", f);
    return f;
  }

  it("reads the single row with the anon key only", async () => {
    const f = stub(new Response(JSON.stringify([{ maintenance: true }]), { status: 200 }));
    expect(await fetchMaintenanceSwitch()).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://db.test/rest/v1/site_settings?select=maintenance&id=eq.true");
    expect(init.headers).toEqual({ apikey: "anon-key" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on an HTTP error, a missing row, or a non-boolean", async () => {
    stub(new Response("nope", { status: 404 }));
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
    stub(new Response("[]", { status: 200 }));
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
    stub(new Response(JSON.stringify([{ maintenance: "yes" }]), { status: 200 }));
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
  });

  it("throws when the Supabase env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(fetchMaintenanceSwitch()).rejects.toThrow();
  });

  it("uses a 1.5 s timeout", () => {
    expect(SWITCH_TIMEOUT_MS).toBe(1_500);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/maintenance-switch.test.ts`
Expected: FAIL — cannot resolve `./maintenance-switch`.

- [ ] **Step 3: Implement `src/lib/maintenance-switch.ts`**

```ts
// Reads the admin maintenance switch (public.site_settings) for src/proxy.ts.
//
// The proxy runs on every public request, so this must never cost a database
// round-trip per visitor or hang when the database is down:
// - each server instance caches the value for SWITCH_TTL_MS;
// - a read is abandoned after SWITCH_TIMEOUT_MS;
// - after a failure it waits a full TTL before trying again, serving the last
//   good value (or null, meaning "unknown") in between.
// It uses the anon key through PostgREST: the row is public-read by RLS, and
// the proxy should hold no more privilege than it needs.

export const SWITCH_TTL_MS = 10_000;
export const SWITCH_TIMEOUT_MS = 1_500;

export function createSwitchReader(
  fetcher: () => Promise<boolean>,
  now: () => number = Date.now,
): () => Promise<boolean | null> {
  let last: { value: boolean; at: number } | null = null;
  let failedAt: number | null = null;
  let inflight: Promise<boolean | null> | null = null;

  return function readSwitch(): Promise<boolean | null> {
    const t = now();
    if (last && t - last.at < SWITCH_TTL_MS) return Promise.resolve(last.value);
    if (failedAt !== null && t - failedAt < SWITCH_TTL_MS) {
      return Promise.resolve(last?.value ?? null);
    }
    if (!inflight) {
      inflight = fetcher()
        .then((value) => {
          last = { value, at: now() };
          failedAt = null;
          return value;
        })
        .catch((err: unknown) => {
          failedAt = now();
          console.error("maintenance switch read failed:", err instanceof Error ? err.message : err);
          return last?.value ?? null;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

export async function fetchMaintenanceSwitch(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");

  const res = await fetch(`${url}/rest/v1/site_settings?select=maintenance&id=eq.true`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(SWITCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`site_settings read failed: HTTP ${res.status}`);

  const rows = (await res.json()) as Array<{ maintenance?: unknown }>;
  const value = rows.length === 1 ? rows[0].maintenance : undefined;
  if (typeof value !== "boolean") throw new Error("site_settings row missing or malformed");
  return value;
}

/** The instance the proxy shares for the life of the server process. */
export const getMaintenanceSwitch = createSwitchReader(fetchMaintenanceSwitch);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/maintenance-switch.test.ts`
Expected: PASS (10 tests). If the `init.headers`/`signal` assertion fails because `cache` is in `init`, that's fine — the assertions only check `headers` and `signal`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenance-switch.ts src/lib/maintenance-switch.test.ts
git commit -m "feat(maintenance): cached, timeout-bounded switch reader"
```

---

### Task 4: Wire the switch into `proxy.ts`

**Files:**
- Modify: `src/proxy.ts:5` (import) and `src/proxy.ts:33-47` (the maintenance block + public early return)
- Test: `src/proxy.test.ts` (new)

**Interfaces:**
- Consumes: `parseMaintenanceFlag`, `resolveMaintenance`, `isExemptPath`, `maintenanceResponse` (Task 2); `getMaintenanceSwitch` (Task 3).

- [ ] **Step 1: Write the failing test `src/proxy.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/maintenance-switch", () => ({ getMaintenanceSwitch: vi.fn() }));

const { getMaintenanceSwitch } = await import("@/lib/maintenance-switch");
const { proxy } = await import("./proxy");
const switchMock = vi.mocked(getMaintenanceSwitch);

const req = (path: string) => new NextRequest(new URL(path, "https://site.test"));

describe("proxy maintenance gate", () => {
  beforeEach(() => {
    switchMock.mockReset();
    vi.stubEnv("MAINTENANCE_MODE", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("serves the maintenance page on public routes when the switch is on", async () => {
    switchMock.mockResolvedValue(true);
    const res = await proxy(req("/events"));
    expect(res.status).toBe(503);
  });

  it("lets public routes through when the switch is off", async () => {
    switchMock.mockResolvedValue(false);
    const res = await proxy(req("/events"));
    expect(res.status).not.toBe(503);
  });

  it("stays live when the switch is unknown (cold instance, DB down)", async () => {
    switchMock.mockResolvedValue(null);
    const res = await proxy(req("/"));
    expect(res.status).not.toBe(503);
  });

  it("never reads the switch for the admin panel", async () => {
    switchMock.mockResolvedValue(true);
    const res = await proxy(req("/admin/login"));
    expect(res.status).not.toBe(503);
    expect(switchMock).not.toHaveBeenCalled();
  });

  it("lets a recognised env value win without touching the database", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "off");
    switchMock.mockResolvedValue(true);
    expect((await proxy(req("/events"))).status).not.toBe(503);
    vi.stubEnv("MAINTENANCE_MODE", "on");
    switchMock.mockResolvedValue(false);
    expect((await proxy(req("/events"))).status).toBe(503);
    expect(switchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL — the proxy imports `isMaintenanceMode` (removed in Task 2) and never calls the switch. If the failure is instead an import error from `next-auth/jwt` under Vitest, add `vi.mock("next-auth/jwt", () => ({ getToken: vi.fn().mockResolvedValue(null) }))` above the imports and re-run; the expected failure is then the assertions.

- [ ] **Step 3: Implement.** In `src/proxy.ts` change line 5 to:

```ts
import {
  parseMaintenanceFlag,
  resolveMaintenance,
  isExemptPath,
  maintenanceResponse,
} from "@/lib/maintenance";
import { getMaintenanceSwitch } from "@/lib/maintenance-switch";
```

and replace the block from `// Maintenance mode (MAINTENANCE_MODE env var).` down to and including `if (!isExemptPath(pathname)) return NextResponse.next();` with:

```ts
  // Public routes: maintenance gate, then straight through — they have no
  // session to check, and running the JWT decode on them would be pure waste.
  //
  // The admin switch (site_settings, flipped from /admin) decides, unless
  // MAINTENANCE_MODE holds a recognised value — then that wins and the
  // database is not read at all. The read is cached for 10 s per instance and
  // bounded by a 1.5 s timeout (src/lib/maintenance-switch.ts), so visitors
  // never pay a round-trip each or hang on a dead database.
  //
  // /admin/* never reaches this block: maintenance is usually exactly when the
  // council needs to get in, and the switch that ends it lives there.
  if (!isExemptPath(pathname)) {
    const envFlag = process.env.MAINTENANCE_MODE;
    const switchValue =
      parseMaintenanceFlag(envFlag) === null ? await getMaintenanceSwitch() : null;
    if (resolveMaintenance(envFlag, switchValue)) return maintenanceResponse();
    return NextResponse.next();
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/proxy.test.ts src/lib/maintenance.test.ts src/lib/maintenance-switch.test.ts && npm run typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts
git commit -m "feat(proxy): gate public routes on the admin maintenance switch"
```

---

### Task 5: Site status read + the flip action

**Files:**
- Create: `src/lib/admin/site-status.ts`
- Create: `src/app/admin/(app)/maintenance/actions.ts`
- Test: `src/lib/admin/site-status.test.ts`, `src/app/admin/(app)/maintenance/actions.test.ts`

**Interfaces:**
- Consumes: `parseMaintenanceFlag`, `resolveMaintenance` (Task 2); `site_settings` types (Task 1); `getAdminSession`/`AdminSession` (`src/lib/auth/guards.ts`); `createAdminClient`; `writeAudit`.
- Produces:
  - `MAINTENANCE_ROLES: readonly AdminRole[]`, `canToggleMaintenance(role: AdminRole): boolean`
  - `interface SiteStatus { maintenance: boolean; forced: boolean; available: boolean; updatedAt: string | null; updatedByName: string | null }`
  - `describeSiteStatus(envValue: string | undefined | null, row: SiteSettingsRow | null): SiteStatus` (pure)
  - `type SiteSettingsRow = { maintenance: boolean; updated_at: string; updater: { full_name: string } | null }`
  - `getSiteStatus(): Promise<SiteStatus>` (React-`cache`d, service-role read, never throws)
  - `setMaintenanceAction(formData: FormData): Promise<void>` — form field `on` = `"true" | "false"`.

- [ ] **Step 1: Write the failing tests `src/lib/admin/site-status.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { canToggleMaintenance, describeSiteStatus, MAINTENANCE_ROLES } = await import("./site-status");
const { ADMIN_ROLES } = await import("@/lib/auth/capabilities");

describe("canToggleMaintenance", () => {
  it("allows exactly Tech Head, President and VP", () => {
    expect([...MAINTENANCE_ROLES].sort()).toEqual(["president", "tech_head", "vice_president"]);
    for (const role of ADMIN_ROLES) {
      expect(canToggleMaintenance(role)).toBe(MAINTENANCE_ROLES.includes(role));
    }
  });

  // Owner decision 2026-09-24: unrestricted elsewhere, but not this lever.
  it("does not allow the Faculty Advisor", () => {
    expect(canToggleMaintenance("faculty_advisor")).toBe(false);
  });
});

describe("describeSiteStatus", () => {
  const row = { maintenance: true, updated_at: "2026-09-24T07:10:00Z", updater: { full_name: "Sandy K" } };

  it("reports the switch and who last flipped it", () => {
    expect(describeSiteStatus(undefined, row)).toEqual({
      maintenance: true,
      forced: false,
      available: true,
      updatedAt: "2026-09-24T07:10:00Z",
      updatedByName: "Sandy K",
    });
  });

  it("marks the state as forced when the env var decides", () => {
    const s = describeSiteStatus("off", row);
    expect(s.maintenance).toBe(false);
    expect(s.forced).toBe(true);
  });

  it("falls back to live and flags unavailable when the row can't be read", () => {
    expect(describeSiteStatus(undefined, null)).toEqual({
      maintenance: false,
      forced: false,
      available: false,
      updatedAt: null,
      updatedByName: null,
    });
  });

  it("handles a row never flipped by an admin", () => {
    expect(describeSiteStatus(undefined, { ...row, updater: null }).updatedByName).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing action tests `src/app/admin/(app)/maintenance/actions.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth/guards";

vi.mock("server-only", () => ({}));

const session = vi.fn<() => Promise<AdminSession | null>>();
vi.mock("@/lib/auth/guards", () => ({ getAdminSession: () => session() }));

const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const writeAudit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ writeAudit: (e: unknown) => writeAudit(e) }));

// A fake of exactly the two query chains the action uses.
const update = vi.fn();
const db = {
  current: { maintenance: false } as { maintenance: boolean } | null,
  updateError: null as { message: string } | null,
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.current, error: null }) }) }),
      update: (values: unknown) => {
        update(values);
        return { eq: async () => ({ error: db.updateError }) };
      },
    }),
  }),
}));

const { setMaintenanceAction } = await import("./actions");
const { ADMIN_ROLES } = await import("@/lib/auth/capabilities");
const { MAINTENANCE_ROLES } = await import("@/lib/admin/site-status");

const as = (role: AdminSession["role"]): AdminSession => ({
  id: "admin-1", role, clubId: null, email: "a@b.c", name: "Sandy K",
});
const form = (on: string) => {
  const fd = new FormData();
  fd.set("on", on);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.current = { maintenance: false };
  db.updateError = null;
});

describe("setMaintenanceAction", () => {
  it("sends a signed-out visitor to login and touches nothing", async () => {
    session.mockResolvedValue(null);
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin/login");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects every role outside Tech Head / President / VP", async () => {
    for (const role of ADMIN_ROLES.filter((r) => !MAINTENANCE_ROLES.includes(r))) {
      session.mockResolvedValue(as(role));
      await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin");
    }
    expect(update).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("turns maintenance on, stamps who did it, and audits before/after", async () => {
    session.mockResolvedValue(as("president"));
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ maintenance: true, updated_by: "admin-1" }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "maintenance_on",
        entity: "site_settings",
        before: { maintenance: false },
        after: { maintenance: true },
      }),
    );
  });

  it("turns maintenance off", async () => {
    db.current = { maintenance: true };
    session.mockResolvedValue(as("tech_head"));
    await expect(setMaintenanceAction(form("false"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ maintenance: false }));
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "maintenance_off" }));
  });

  // A double-click or a stale tab posts the state it already has.
  it("treats re-posting the current state as a harmless no-op", async () => {
    db.current = { maintenance: true };
    session.mockResolvedValue(as("vice_president"));
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ maintenance: true }));
  });

  it("rejects a malformed value without writing", async () => {
    session.mockResolvedValue(as("tech_head"));
    await expect(setMaintenanceAction(form("maybe"))).rejects.toThrow("REDIRECT:/admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not audit a write that failed", async () => {
    db.updateError = { message: "boom" };
    session.mockResolvedValue(as("tech_head"));
    await expect(setMaintenanceAction(form("true"))).rejects.toThrow("REDIRECT:/admin?maintenance=error");
    expect(writeAudit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run src/lib/admin/site-status.test.ts "src/app/admin/(app)/maintenance/actions.test.ts"`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/lib/admin/site-status.ts`**

```ts
import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/auth/capabilities";
import { parseMaintenanceFlag, resolveMaintenance } from "@/lib/maintenance";

/**
 * Who may take the public site down (owner decision 2026-09-24). Deliberately
 * NOT the Faculty Advisor, who is otherwise unrestricted — do not "fix" this by
 * switching to a capability check.
 */
export const MAINTENANCE_ROLES: readonly AdminRole[] = ["tech_head", "president", "vice_president"];

export function canToggleMaintenance(role: AdminRole): boolean {
  return MAINTENANCE_ROLES.includes(role);
}

export type SiteSettingsRow = {
  maintenance: boolean;
  updated_at: string;
  updater: { full_name: string } | null;
};

export interface SiteStatus {
  /** What visitors get (modulo the proxy's ≤10 s cache). */
  maintenance: boolean;
  /** MAINTENANCE_MODE is deciding; the button can't change anything. */
  forced: boolean;
  /** The switch row could be read. */
  available: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export function describeSiteStatus(
  envValue: string | undefined | null,
  row: SiteSettingsRow | null,
): SiteStatus {
  return {
    maintenance: resolveMaintenance(envValue, row?.maintenance ?? null),
    forced: parseMaintenanceFlag(envValue) !== null,
    available: row !== null,
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updater?.full_name ?? null,
  };
}

/**
 * Fresh, uncached-by-TTL read for the admin panel (the dashboard card and the
 * banner). Never throws: an unreadable row reports `available: false`.
 */
export const getSiteStatus = cache(async function getSiteStatus(): Promise<SiteStatus> {
  let row: SiteSettingsRow | null = null;
  try {
    const { data, error } = await createAdminClient()
      .from("site_settings")
      .select("maintenance, updated_at, updater:admin_users(full_name)")
      .eq("id", true)
      .maybeSingle();
    if (error) console.error("site_settings read failed:", error.message);
    else row = (data as SiteSettingsRow | null) ?? null;
  } catch (err) {
    console.error("site_settings read failed:", err instanceof Error ? err.message : err);
  }
  return describeSiteStatus(process.env.MAINTENANCE_MODE, row);
});
```

- [ ] **Step 5: Implement `src/app/admin/(app)/maintenance/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/admin/audit";
import { canToggleMaintenance } from "@/lib/admin/site-status";

const OnValue = z.enum(["true", "false"]);

/**
 * Flip the public site's maintenance switch (spec 2026-09-24). The role check
 * lives HERE — hiding the dashboard card is only UX. The proxy picks the new
 * value up within its 10 s cache.
 */
export async function setMaintenanceAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canToggleMaintenance(session.role)) redirect("/admin");

  const parsed = OnValue.safeParse(formData.get("on"));
  if (!parsed.success) redirect("/admin");
  const on = parsed.data === "true";

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("site_settings")
    .select("maintenance")
    .eq("id", true)
    .maybeSingle();

  const { error } = await admin
    .from("site_settings")
    .update({ maintenance: on, updated_by: session.id, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    console.error("maintenance switch update failed:", error.message);
    redirect("/admin?maintenance=error");
  }

  await writeAudit({
    actorId: session.id,
    action: on ? "maintenance_on" : "maintenance_off",
    entity: "site_settings",
    before: before ? { maintenance: before.maintenance } : null,
    after: { maintenance: on },
  });

  revalidatePath("/admin", "layout"); // the card and the banner
  redirect("/admin");
}
```

- [ ] **Step 6: Run to verify both pass**

Run: `npx vitest run src/lib/admin/site-status.test.ts "src/app/admin/(app)/maintenance/actions.test.ts" && npm run typecheck`
Expected: PASS; typecheck clean. If typecheck rejects the `updater:admin_users(full_name)` embed, confirm Task 1's types include the `site_settings_updated_by_fkey` relationship (regenerate if not) — do not cast around it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/site-status.ts src/lib/admin/site-status.test.ts "src/app/admin/(app)/maintenance"
git commit -m "feat(admin): maintenance switch action, role-gated and audited"
```

---

### Task 6: Dashboard card, admin banner, ship

**Files:**
- Create: `src/components/admin/MaintenanceCard.tsx`
- Test: `src/components/admin/MaintenanceCard.test.tsx`
- Modify: `src/components/admin/AdminDashboardView.tsx:7-13` (new `siteControl` prop) and just above `<div className="dashboard-columns"` (render it)
- Modify: `src/app/admin/(app)/page.tsx` (fetch status, pass the card)
- Modify: `src/app/admin/(app)/layout.tsx:108-110` (banner)
- Modify: `src/app/admin/(app)/admin-workspace.css` (after line 203, same block)
- Modify: `docs/STATUS.md` (deploy entry)

**Interfaces:**
- Consumes: `SiteStatus`, `getSiteStatus`, `canToggleMaintenance` (Task 5); `setMaintenanceAction` (Task 5); `istDateMedium`, `istTime` from `src/lib/datetime.ts`.
- Produces: `MaintenanceCard({ status }: { status: SiteStatus })`, `MaintenanceConfirm({ on, onCancel }: { on: boolean; onCancel: () => void })`.

- [ ] **Step 1: Write the failing component test `src/components/admin/MaintenanceCard.test.tsx`.** The repo renders components with `renderToStaticMarkup` in a Node environment (see `src/components/registration/ResultMessage.test.tsx`) — there is no DOM or `@testing-library`. So the confirm step is its own stateless `MaintenanceConfirm`, and both pieces are tested as static HTML:

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteStatus } from "@/lib/admin/site-status";

vi.mock("@/app/admin/(app)/maintenance/actions", () => ({ setMaintenanceAction: vi.fn() }));
const { MaintenanceCard, MaintenanceConfirm } = await import("./MaintenanceCard");

const status = (over: Partial<SiteStatus> = {}): SiteStatus => ({
  maintenance: false, forced: false, available: true,
  updatedAt: "2026-09-24T07:10:00Z", updatedByName: "Sandy K", ...over,
});
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("MaintenanceCard", () => {
  it("shows the live state, who flipped it, and an enabled take-down button", () => {
    const out = html(<MaintenanceCard status={status()} />);
    expect(out).toContain("Live");
    expect(out).toContain("Sandy K");
    expect(out).toMatch(/<button type="button" class="btn btn-ghost">Put site in maintenance<\/button>/);
  });

  it("offers to bring the site back when in maintenance", () => {
    const out = html(<MaintenanceCard status={status({ maintenance: true })} />);
    expect(out).toContain("In maintenance");
    expect(out).toContain("Bring site back live");
  });

  it("disables the button and explains when the env var is forcing the state", () => {
    const out = html(<MaintenanceCard status={status({ forced: true, maintenance: true })} />);
    expect(out).toContain("MAINTENANCE_MODE setting in Vercel");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Bring site back live/);
  });

  it("disables the button when the switch can't be read", () => {
    const out = html(<MaintenanceCard status={status({ available: false })} />);
    expect(out).toMatch(/switch unavailable/i);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Put site in maintenance/);
  });
});

describe("MaintenanceConfirm", () => {
  it("posts on=true with a take-down warning when the site is live", () => {
    const out = html(<MaintenanceConfirm on={false} onCancel={() => {}} />);
    expect(out).toContain("takes the public site down for everyone");
    expect(out).toContain('name="on" value="true"');
    expect(out).toContain(">Confirm</button>");
    expect(out).toContain(">Cancel</button>");
  });

  it("posts on=false with a bring-back message when in maintenance", () => {
    const out = html(<MaintenanceConfirm on={true} onCancel={() => {}} />);
    expect(out).toContain("brings the public site back for everyone");
    expect(out).toContain('name="on" value="false"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/admin/MaintenanceCard.test.tsx`
Expected: FAIL — cannot resolve `./MaintenanceCard`.

- [ ] **Step 3: Implement `src/components/admin/MaintenanceCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { SiteStatus } from "@/lib/admin/site-status";
import { setMaintenanceAction } from "@/app/admin/(app)/maintenance/actions";
import { istDateMedium, istTime } from "@/lib/datetime";

/** Dashboard control for the public site's maintenance switch (TH / President / VP only). */
export function MaintenanceCard({ status }: { status: SiteStatus }) {
  const [confirming, setConfirming] = useState(false);
  const on = status.maintenance;
  const blocked = status.forced || !status.available;

  return (
    <section className="dashboard-site" data-state={on ? "maintenance" : "live"} aria-labelledby="site-status-title">
      <div className="dashboard-site-copy">
        <span className="dashboard-kicker">Public site</span>
        <h2 id="site-status-title">{on ? "🔧 In maintenance" : "🟢 Live"}</h2>
        {status.forced ? (
          <p>Forced {on ? "on" : "off"} by the MAINTENANCE_MODE setting in Vercel — remove it there to use this switch.</p>
        ) : !status.available ? (
          <p>Switch unavailable — the setting couldn&apos;t be read. Try again shortly.</p>
        ) : status.updatedByName && status.updatedAt ? (
          <p>
            Turned {on ? "on" : "off"} by {status.updatedByName} · {istDateMedium(status.updatedAt)}, {istTime(status.updatedAt)}
          </p>
        ) : null}
      </div>

      {confirming ? (
        <MaintenanceConfirm on={on} onCancel={() => setConfirming(false)} />
      ) : (
        <button type="button" className="btn btn-ghost" disabled={blocked} onClick={() => setConfirming(true)}>
          {on ? "Bring site back live" : "Put site in maintenance"}
        </button>
      )}
    </section>
  );
}

/** The confirm step: posts the OPPOSITE of the current state. */
export function MaintenanceConfirm({ on, onCancel }: { on: boolean; onCancel: () => void }) {
  return (
    <form action={setMaintenanceAction} className="dashboard-site-confirm">
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <p>
        {on
          ? "This brings the public site back for everyone. Continue?"
          : "This takes the public site down for everyone. Continue?"}
      </p>
      <button type="submit" className="btn btn-primary btn-sm">Confirm</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/admin/MaintenanceCard.test.tsx`
Expected: PASS (6 tests). If a regex misses only because React orders attributes differently, loosen the regex to the attribute it's checking — never drop the `disabled` assertion. The click-through (button → confirm → cancel) is checked by hand in Step 11.

- [ ] **Step 5: Wire the dashboard.** In `AdminDashboardView.tsx`, add `siteControl` to the destructured props and the prop type:

```tsx
export function AdminDashboardView({ name, summary, docket, glance, actions, feedbackControl, siteControl }: {
  name: string;
  summary: string;
  docket: DocketItem[];
  glance: GlanceTile[];
  actions: QuickAction[];
  feedbackControl?: ReactNode;
  /** The public-site maintenance card — only passed for TH / President / VP. */
  siteControl?: ReactNode;
```

and render it immediately before `<div className="dashboard-columns" data-actions={hasActions}>`:

```tsx
      {siteControl}
```

In `src/app/admin/(app)/page.tsx`, add imports:

```tsx
import { MaintenanceCard } from "@/components/admin/MaintenanceCard";
import { canToggleMaintenance, getSiteStatus } from "@/lib/admin/site-status";
```

after `const actions = quickActions(reach);` add:

```tsx
  const siteStatus = canToggleMaintenance(session.role) ? await getSiteStatus() : null;
```

and pass the prop to `<AdminDashboardView … >`:

```tsx
      siteControl={siteStatus ? <MaintenanceCard status={siteStatus} /> : null}
```

- [ ] **Step 6: Banner in `src/app/admin/(app)/layout.tsx`.** Add `import { getSiteStatus } from "@/lib/admin/site-status";`, after `const home = adminHomePath(session.role);` add `const site = await getSiteStatus();`, and change the `<main …>` line to:

```tsx
          <main className="admin-main" id="admin-content" tabIndex={-1}>
            {site.maintenance ? (
              <p className="admin-maintenance-banner" role="status">
                The public site is in maintenance mode — visitors see the maintenance page.
              </p>
            ) : null}
            {children}
          </main>
```

- [ ] **Step 7: CSS.** In `src/app/admin/(app)/admin-workspace.css`, directly after line 203 (`.dashboard-feedback p { … }`), inside the same block and at the same indent:

```css
  .dashboard-site { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 0 0 18px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 12px; }
  .dashboard-site[data-state="maintenance"] { border-color: var(--forest); background: var(--forest-tint); }
  .dashboard-site h2 { font: 400 20px/1.2 var(--serif); margin-top: 4px; }
  .dashboard-site p { color: var(--ink-2); font: 400 12px/1.5 var(--sans); margin-top: 4px; }
  .dashboard-site-confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dashboard-site-confirm p { flex-basis: 100%; margin: 0 0 4px; color: var(--ink); }
  .admin-maintenance-banner { margin: 0 0 16px; padding: 8px 12px; border-radius: 8px; background: var(--forest-tint); color: var(--ink); font: 500 12.5px/1.5 var(--sans); }
```

- [ ] **Step 8: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green; test count = previous total + the new tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/MaintenanceCard.tsx src/components/admin/MaintenanceCard.test.tsx src/components/admin/AdminDashboardView.tsx "src/app/admin/(app)/page.tsx" "src/app/admin/(app)/layout.tsx" "src/app/admin/(app)/admin-workspace.css"
git commit -m "feat(admin): public-site maintenance card and admin banner"
```

- [ ] **Step 10: Pre-push safety check.** Confirm the live row still exists and is ON (Review Focus 1), via Supabase MCP `execute_sql`: `select maintenance from public.site_settings;` → `true`. Do NOT push if it errors.

- [ ] **Step 11: Push and verify production**

```bash
git push origin main
```

Wait for Vercel to deploy (poll `https://cse-ccc.vercel.app/` until the response contains the new admin build — or ~90 s), then:
1. `/events` → 503 and `/admin/login` → 200 (switch still ON).
2. Ask the owner to sign in, click **Bring site back live**, check Cancel backs out, then click it again → Confirm. Within ~10 s `/events` → 200. (If the owner prefers, flip the row with `execute_sql` `update public.site_settings set maintenance = false` to test the proxy path, then restore it to the owner's chosen state.)
3. Leave the site in whichever state the owner asks for.

- [ ] **Step 12: Record in `docs/STATUS.md`** a "SHIPPED" entry at the top of the deploy-state section: commit hash, migration `site_settings` APPLIED LIVE, how to flip (dashboard card; TH/President/VP), precedence (env → switch → default false), and that `DEFAULT_MAINTENANCE` is no longer the switch. Commit `docs(status): maintenance switch shipped` and push.
