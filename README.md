# CSE Club Council Platform

The department's eleven clubs, one calendar — events, registration, attendance,
certificates and club content for the CSE Club Council.

Delivered as a **Next.js web app + PWA** (installable on phones; not React
Native). The full product spec lives in [`docs/`](docs):

- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) — the complete build plan (stack, data model, features, phases)
- [`docs/SECURITY_SPEC.md`](docs/SECURITY_SPEC.md) — threat model + 16 control areas
- [`docs/style-guide.html`](docs/style-guide.html) — the locked "paper" design system

## Status — Phase 0 (foundation)

| Done | Item |
|------|------|
| ✅ | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind v4 |
| ✅ | Design tokens + "night paper" dark mode ported from the style guide |
| ✅ | Component library + pixel-matched, responsive **home page** |
| ✅ | Fail-fast environment validation (`src/lib/env.ts`) |
| ✅ | Full Supabase schema, RLS (default-deny), and RPCs (`supabase/`) |
| ✅ | 11-club CSV seed + importer |
| ✅ | CI (typecheck · lint · build · audit) + Dependabot |
| ⬜ | **Gate:** review the home page on a phone and a laptop and sign off |

> Next.js 16 note: the plan text says "Next 15"; `create-next-app` installs 16
> (current stable) and the App Router is a clean superset for everything here.

## Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript (strict)
- **Styling:** Tailwind v4 on a single token layer (`src/app/globals.css`)
- **Fonts:** DM Serif Display · Space Grotesk · IBM Plex Mono (via `next/font`)
- **Backend:** Supabase (Postgres + RLS + Storage) — project `jisahccdnthzgibszwnq`
- **Hosting:** Vercel (Phase 4)

## Local development

Requires Node 22+.

```bash
npm install
cp .env.example .env.local     # fill in as credentials become available
npm run dev                    # http://localhost:3000
```

Phase 0 runs **without any credentials** — the home page needs none. `src/lib/env.ts`
only validates the environment when a feature imports it (Phase 1+), and it
throws loudly on a missing/weak/duplicated secret rather than falling back to a
guessable default.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (incl. the `dangerouslySetInnerHTML` ban) |
| `npm run seed` | Import `seed/clubs.csv` into the database (needs Supabase creds) |

## Database

SQL migrations live in [`supabase/migrations/`](supabase/migrations) and run in
order:

1. `…_core.sql` — extensions, enums, clubs, admin users/invites, venues, blackouts
2. `…_events.sql` — events (timestamptz time model), venue-booking **exclusion constraint**, registrations, attendance sessions/devices, certificates
3. `…_content_admin.sql` — achievements, announcements, gallery, contact/join, resources, email log, append-only audit log
4. `…_functions.sql` — `SECURITY DEFINER` RPCs (clash check, seat count, waitlist promote, attendance redeem)
5. `…_rls.sql` — Row-Level Security: default-deny, public read-only policies, PII locked down

Seed data (the 11 clubs) is in [`supabase/seed.sql`](supabase/seed.sql) and
[`seed/clubs.csv`](seed/clubs.csv).

**Applying them** (once the Supabase MCP server is connected, or via the CLI):

```bash
# Supabase CLI
supabase link --project-ref jisahccdnthzgibszwnq
supabase db push          # applies migrations
supabase db reset         # migrations + seed.sql (local/dev only)
```

The app's server code uses the Supabase **service-role key**, which bypasses RLS
— that is how all admin reads and every write to PII happen through validated
server code, never the browser's anon key.

## Security posture (Phase 0)

- Static hardening headers set in `next.config.ts` (HSTS, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`, COOP/CORP).
  The strict **nonce-based CSP** lands with middleware in Phase 1.
- `dangerouslySetInnerHTML` is banned by ESLint (`SECURITY_SPEC` §5).
- No secret has an insecure fallback; all crypto secrets must be distinct and ≥32 bytes.

## Project structure

```
src/
  app/            App Router — layout, home page, globals.css (design tokens)
  components/     UI library (EventRow, WeekStrip, ClubCard, header/footer…)
    ui/           Primitives (Button, Badge, Chip, Card, ProgressBar, Field)
  lib/            env, types, clubs, sample data, cn helper
supabase/
  migrations/     Ordered schema + RLS + RPC migrations
  seed.sql        11-club seed
seed/clubs.csv    CSV source for the seed importer
scripts/seed.mjs  CSV → DB importer
docs/             BUILD_PLAN, SECURITY_SPEC, style-guide
```
