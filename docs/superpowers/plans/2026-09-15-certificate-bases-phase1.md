# Certificate base templates — phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every event's Participants and Volunteers certificates follow council-wide base designs until customised; a council admin saves a base from inside any event's editor; volunteers can be typed in by hand with name, email and roll no.

**Architecture:** A new `certificate_bases` table holds one design per base kind. Each event group records which base it follows (`base_kind`) and keeps `design = null` while following. A single pure resolver (`effectiveDesign`) turns that into the design the group prints with, and `CertificateGroup.design` carries the resolved design so every existing issue/preview/print path stays correct unchanged. The Design tab opens a read-only preview for a following group, and the editor gains Save for this event / Save as base / Reset to base.

**Tech Stack:** Next.js 16 App Router (server actions), Supabase Postgres via service role, zod, vitest (node env, `renderToStaticMarkup` for component tests), React 19 client components.

**Spec:** `docs/superpowers/specs/2026-09-15-certificate-base-templates-design.md` (phase 1 rows of §9). It builds on `docs/superpowers/specs/2026-09-14-certificate-designer-design.md`.

## Global Constraints

- **Never run `supabase db push`.** Apply the migration only through the Supabase MCP `apply_migration` tool on project `jisahccdnthzgibszwnq`, then hand-patch `src/lib/database.types.ts` (STATUS.md).
- The repo is **LF-only**. Write files with the editor tools, never with Python text-mode writes.
- `node_modules/next/dist/docs/` is the Next.js reference for this version (AGENTS.md). Check it before using any Next API not already used in these files.
- Base asset folder: `certificate-assets/00000000-0000-0000-0000-000000000000/` (`BASE_ASSET_FOLDER`).
- A base may use only `person.*`, `team.*`, `event.*`, `cert.*` (and `winner.*` in the Winners base, phase 2). `form.*` / `sheet.*` block Save as base with: `Remove {<label>} — a base can only use fields every event has.`
- Only council-wide admins save bases: `canManage(session, cap, null)`; cap is `issue:participation_certificate` for participants/volunteers.
- Phase 1 enables bases `participants` and `volunteers` only (`ENABLED_BASE_KINDS`). `winners` exists in the DB enum but is not offered.
- Typed list row: name required (≤ 500), email optional but must look like an email (typo → `That email doesn't look right.`), roll optional (≤ 500), ≤ 1,000 rows per group.
- Identity-changing edit refusal copy: `<name> already has a certificate, so their name and email can't change here. Ask a Faculty Advisor, VP or Tech Head to revoke it first.`
- Copy strings from the spec verbatim (banners, confirms, errors).
- Gate before claiming done: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all green.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260915000000_certificate_bases.sql` (new) | Bases table, `base_kind`, nullable design, `roll`, RPC update |
| `src/lib/database.types.ts` | Hand-patched types for the migration |
| `src/lib/certificates/bases.ts` (new) + test | Pure: kinds, labels, `effectiveDesign`, who may save, base field check, impact wording, summaries |
| `src/lib/certificates/design.ts` + test | `rewriteAssetRefs` helper |
| `src/lib/certificates/sheet.ts` + test | `roll` on rows, roll column detection, `validateListRow`, `ListRow` |
| `src/lib/certificates/fields.ts` + test | `sheetValues` prints `person.roll` |
| `src/lib/certificates/recipients.ts` + test | `sheetIdentity` |
| `src/lib/certificates/assets.ts` | `copyDesignAssets` (server) |
| `src/lib/admin/certificate-bases.ts` (new) | Server: load bases, impact counts, write bases, follow base |
| `src/lib/admin/certificate-list-rows.ts` (new) | Server: typed row CRUD + live-certificate identity check |
| `src/lib/admin/certificates.ts` | Groups resolve their base; Volunteers slot; list rows in workspace |
| `src/app/admin/(app)/events/[id]/certificates/actions.ts` | Save as base, reset, typed-row actions, guards |
| `src/components/admin/certificates/PageSvg.tsx` (new) | Pure page render shared by editor and preview |
| `src/components/admin/certificates/CertificatePreview.tsx` (new) + test | Read-only, responsive preview with banner + Customise |
| `src/components/admin/certificates/SaveAsBasePanel.tsx` (new) | Pick bases, show impact, confirm |
| `src/components/admin/certificates/DesignTab.tsx` (new) | Preview-first vs editor switch |
| `src/components/admin/certificates/ListEditor.tsx` (new) | Typed people table for list groups |
| `Canvas.tsx`, `CertificateDesigner.tsx`, `DesignerLoader.tsx`, `GroupBar.tsx`, `SheetUpload.tsx`, `page.tsx` | Wiring |
| `DesignerHarness.tsx`, `src/app/dev/certificate-designer/page.tsx` | Dev harness panels |
| `src/app/globals.css` | A few `.cd-*` rules |
| `docs/STATUS.md` | Shipped block + owed walkthrough |

---

### Task 1: Migration, applied live, and types

**Files:**
- Create: `supabase/migrations/20260915000000_certificate_bases.sql`
- Modify: `src/lib/database.types.ts` (`certificate_groups` ≈498–551, `certificate_sheet_rows` ≈552–586, Enums ≈2334, Constants ≈2488; add `certificate_bases` before `certificate_design_versions` ≈466)

**Interfaces:**
- Produces: table `certificate_bases(kind, design, source_event_id, updated_by, updated_at)`; `certificate_groups.base_kind`, `.position_column`, nullable `.design`; `certificate_sheet_rows.roll`; enum `certificate_base_kind`; `certificate_group_kind` gains `results`.

- [ ] **Step 1: Re-check the live precondition**

Run with the Supabase MCP `execute_sql` on `jisahccdnthzgibszwnq`:

```sql
select g.kind::text, count(*) n,
       count(*) filter (where coalesce(g.design->'page'->'template','null'::jsonb) <> 'null'::jsonb) with_template,
       (select count(*) from certificates) certificates
from certificate_groups g group by g.kind;
```

Expected (as of 2026-09-15): one row `participants | 1 | 0 | 0`. If `certificates` > 0 or a group has a template, STOP and report. The backfill below keeps such groups custom, but the owner should know.

- [ ] **Step 2: Write the migration file**

```sql
-- Certificate base templates (spec 2026-09-15-certificate-base-templates-design.md §2).
--
-- Council-wide base designs (Participants / Volunteers / Winners). An event's
-- group FOLLOWS its base while its own `design` is null, and becomes custom the
-- moment an event-level design is saved. Issued certificates are unaffected:
-- each is tied to the immutable design version it was issued with.
--
-- ⚠️ Applied through the Supabase MCP apply_migration tool. NEVER `supabase db push`.

create type public.certificate_base_kind as enum ('participants', 'volunteers', 'winners');

-- Winners can come from results (phase 2). Not used below, so the rule that a new
-- enum value can't be used in the transaction that adds it does not bite.
alter type public.certificate_group_kind add value if not exists 'results';

create table public.certificate_bases (
  kind            public.certificate_base_kind primary key,
  design          jsonb not null,
  source_event_id uuid references public.events(id) on delete set null,
  updated_by      uuid references public.admin_users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.certificate_bases enable row level security;
revoke all on public.certificate_bases from anon, authenticated;

alter table public.certificate_groups
  add column base_kind public.certificate_base_kind,
  add column position_column text,
  alter column design drop not null;
alter table public.certificate_groups
  add constraint certificate_groups_design_or_base
  check (design is not null or base_kind is not null);

create unique index certificate_groups_one_per_base
  on public.certificate_groups (event_id, base_kind) where base_kind is not null;

-- Existing Participants groups get their base slot. One with no template and
-- nothing issued starts following; one with a real design stays custom.
update public.certificate_groups set base_kind = 'participants' where kind = 'participants';
update public.certificate_groups g
   set design = null
 where g.kind = 'participants'
   and coalesce(g.design->'page'->'template', 'null'::jsonb) = 'null'::jsonb
   and not exists (select 1 from public.certificates c where c.group_id = g.id);

-- Typed volunteers (D12): roll no. as a real column, and the upload RPC writes it.
alter table public.certificate_sheet_rows add column roll text;

create or replace function public.replace_certificate_sheet_rows(p_group_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.certificate_sheet_rows where group_id = p_group_id;
  insert into public.certificate_sheet_rows (group_id, row_no, name, email, roll, data)
  select p_group_id,
         (r->>'row_no')::int,
         r->>'name',
         nullif(r->>'email', ''),
         nullif(r->>'roll', ''),
         coalesce(r->'data', '{}'::jsonb)
    from jsonb_array_elements(p_rows) as r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.replace_certificate_sheet_rows(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.replace_certificate_sheet_rows(uuid, jsonb) to service_role;
```

- [ ] **Step 3: Apply it live**

Use the Supabase MCP `apply_migration` with `project_id: jisahccdnthzgibszwnq`, `name: certificate_bases`, and the file's contents as `query`. The migration is additive, and the deployed production code already tolerates a null design (`parseStoredDesign(null) ?? emptyDesign()`), so applying it before this branch deploys is safe.

- [ ] **Step 4: Verify it live**

Run with `execute_sql`:

```sql
select
  (select string_agg(kind::text || ':' || coalesce(base_kind::text,'-') || ':' || (design is null)::text, ',') from certificate_groups) groups,
  (select relrowsecurity from pg_class where oid = 'public.certificate_bases'::regclass) rls_on,
  has_table_privilege('anon', 'public.certificate_bases', 'select') anon_select,
  has_table_privilege('authenticated', 'public.certificate_bases', 'insert') auth_insert,
  has_function_privilege('anon', 'public.replace_certificate_sheet_rows(uuid, jsonb)', 'execute') anon_rpc,
  (select enum_range(null::certificate_group_kind)::text) group_kinds,
  (select is_nullable from information_schema.columns where table_name = 'certificate_groups' and column_name = 'design') design_nullable,
  (select count(*) from information_schema.columns where table_name = 'certificate_sheet_rows' and column_name = 'roll') has_roll;
```

Expected: `groups = participants:participants:true`, `rls_on = true`, `anon_select = false`, `auth_insert = false`, `anon_rpc = false`, `group_kinds = {participants,sheet,results}`, `design_nullable = YES`, `has_roll = 1`. If any privilege is `true`, run `revoke all on public.certificate_bases from anon, authenticated;` and re-check (the fresh-project trap in STATUS.md).

- [ ] **Step 5: Hand-patch `src/lib/database.types.ts`**

Insert before `certificate_design_versions: {`:

```ts
      certificate_bases: {
        Row: {
          design: Json
          kind: Database["public"]["Enums"]["certificate_base_kind"]
          source_event_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          design: Json
          kind: Database["public"]["Enums"]["certificate_base_kind"]
          source_event_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          design?: Json
          kind?: Database["public"]["Enums"]["certificate_base_kind"]
          source_event_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_bases_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_bases_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
```

In `certificate_groups`, under `Row`, `Insert` and `Update`, add `base_kind` and `position_column` and make `design` nullable:

```ts
        Row: {
          base_kind: Database["public"]["Enums"]["certificate_base_kind"] | null
          created_at: string
          created_by: string | null
          design: Json | null
          event_id: string
          id: string
          kind: Database["public"]["Enums"]["certificate_group_kind"]
          name: string
          position_column: string | null
          sheet_columns: string[]
          sort: number
          updated_at: string
        }
        Insert: {
          base_kind?: Database["public"]["Enums"]["certificate_base_kind"] | null
          created_at?: string
          created_by?: string | null
          design?: Json | null
          event_id: string
          id?: string
          kind: Database["public"]["Enums"]["certificate_group_kind"]
          name: string
          position_column?: string | null
          sheet_columns?: string[]
          sort?: number
          updated_at?: string
        }
        Update: {
          base_kind?: Database["public"]["Enums"]["certificate_base_kind"] | null
          created_at?: string
          created_by?: string | null
          design?: Json | null
          event_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["certificate_group_kind"]
          name?: string
          position_column?: string | null
          sheet_columns?: string[]
          sort?: number
          updated_at?: string
        }
```

In `certificate_sheet_rows`, add `roll: string | null` to `Row`, and `roll?: string | null` to `Insert` and `Update`.

In the `Enums` block, replace `certificate_group_kind: "participants" | "sheet"` with:

```ts
      certificate_base_kind: "participants" | "volunteers" | "winners"
      certificate_group_kind: "participants" | "sheet" | "results"
```

In `Constants.public.Enums`, replace `certificate_group_kind: ["participants", "sheet"],` with:

```ts
      certificate_base_kind: ["participants", "volunteers", "winners"],
      certificate_group_kind: ["participants", "sheet", "results"],
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: errors only where code now reads a nullable `design`: `src/lib/admin/certificates.ts` (`GroupRow` cast is manual, so possibly none). Note any errors. Tasks 5–7 resolve them. If there are none, good.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260915000000_certificate_bases.sql src/lib/database.types.ts
git commit -m "feat(db): certificate base templates — bases table, base_kind, roll on list rows

Applied live through the Supabase MCP (never db push) and verified: RLS on,
no anon/authenticated privileges, the one Participants group now follows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure base logic (`bases.ts`) and `rewriteAssetRefs`

**Files:**
- Create: `src/lib/certificates/bases.ts`, `src/lib/certificates/bases.test.ts`
- Modify: `src/lib/certificates/design.ts` (add helper after `assetRefsOf`, ≈line 268), `src/lib/certificates/design.test.ts`

**Interfaces:**
- Produces (from `bases.ts`):
  - `BASE_KINDS: readonly ["participants","volunteers","winners"]`, `type BaseKind`
  - `ENABLED_BASE_KINDS: readonly BaseKind[]` (= participants, volunteers)
  - `BASE_LABEL: Record<BaseKind,string>`
  - `BASE_ASSET_FOLDER: string`
  - `interface BaseDesign { kind: BaseKind; design: Design; sourceEventTitle: string | null; updatedAt: string }`
  - `interface BaseSummary { kind: BaseKind; label: string; exists: boolean; sourceEventTitle: string | null; updatedAt: string | null }`
  - `interface BaseImpact { following: number; withLive: number }`
  - `effectiveDesign(group: { customDesign: Design | null; baseKind: BaseKind | null }, bases: ReadonlyMap<BaseKind, BaseDesign>): Design`
  - `baseCapability(kind: BaseKind): Capability`
  - `savableBases(identity: AdminIdentity, kinds?: readonly BaseKind[]): BaseKind[]`
  - `baseFieldProblem(design: Design, targets: readonly BaseKind[], labelOf: (key: string) => string): string | null`
  - `isBaseAsset(ref: Pick<AssetRef,"bucket"|"path">): boolean`
  - `baseImpactText(impact: BaseImpact | undefined, exists: boolean): string`
  - `summarizeBases(bases: ReadonlyMap<BaseKind, BaseDesign>): Record<BaseKind, BaseSummary>`
- Produces (from `design.ts`): `rewriteAssetRefs(design: Design, swap: (ref: AssetRef) => AssetRef): Design`

- [ ] **Step 1: Write the failing tests**

`src/lib/certificates/bases.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BASE_ASSET_FOLDER,
  baseFieldProblem,
  baseImpactText,
  effectiveDesign,
  isBaseAsset,
  savableBases,
  summarizeBases,
  type BaseDesign,
  type BaseKind,
} from "./bases";
import { DEFAULT_STYLE, emptyDesign, type Design, type TextElement } from "./design";

const withField = (field: string): Design => {
  const el: TextElement = {
    id: "t1", name: "Body", type: "text", x: 10, y: 40, w: 80, h: 10, locked: false, hidden: false,
    align: "center", lineHeight: 1.2, fit: "wrap",
    paragraphs: [{ runs: [
      { kind: "text", text: "Awarded to ", style: DEFAULT_STYLE },
      { kind: "field", field, transform: "none", style: DEFAULT_STYLE },
    ] }],
  };
  return { ...emptyDesign(), elements: [el] };
};

const base = (kind: BaseKind, design: Design): BaseDesign => ({ kind, design, sourceEventTitle: "Hack Night", updatedAt: "2026-09-12T10:00:00Z" });

describe("effectiveDesign", () => {
  const custom = withField("person.name");
  const shared = withField("event.title");
  const bases = new Map<BaseKind, BaseDesign>([["participants", base("participants", shared)]]);

  it("uses the group's own design once it is customised", () => {
    expect(effectiveDesign({ customDesign: custom, baseKind: "participants" }, bases)).toBe(custom);
  });
  it("uses the base while the group follows it", () => {
    expect(effectiveDesign({ customDesign: null, baseKind: "participants" }, bases)).toBe(shared);
  });
  it("is an empty design when the base has not been saved yet", () => {
    expect(effectiveDesign({ customDesign: null, baseKind: "volunteers" }, bases)).toEqual(emptyDesign());
  });
});

describe("savableBases", () => {
  it("lets a council-wide admin save the enabled bases", () => {
    expect(savableBases({ role: "tech_head", clubId: null })).toEqual(["participants", "volunteers"]);
  });
  it("gives a club head nothing — they customise on their own event instead", () => {
    expect(savableBases({ role: "club_head", clubId: "c1" })).toEqual([]);
  });
});

describe("baseFieldProblem", () => {
  const label = (key: string) => (key === "form.tshirt" ? "T-shirt size" : key);

  it("accepts fields every event has", () => {
    for (const key of ["person.name", "person.roll", "team.name", "event.date", "cert.serial"]) {
      expect(baseFieldProblem(withField(key), ["participants"], label)).toBeNull();
    }
  });
  it("refuses a form answer, naming it", () => {
    expect(baseFieldProblem(withField("form.tshirt"), ["participants"], label)).toBe(
      "Remove {T-shirt size} — a base can only use fields every event has.",
    );
  });
  it("refuses a sheet column", () => {
    expect(baseFieldProblem(withField("sheet.Shift"), ["volunteers"], label)).toBe(
      "Remove {sheet.Shift} — a base can only use fields every event has.",
    );
  });
  it("keeps winner fields to the Winners base", () => {
    expect(baseFieldProblem(withField("winner.place"), ["participants", "winners"], label)).toBe(
      "Remove {winner.place} — winner fields can only go in the Winners base.",
    );
    expect(baseFieldProblem(withField("winner.place"), ["winners"], label)).toBeNull();
  });
});

describe("isBaseAsset", () => {
  it("is true only for the council folder of the asset bucket", () => {
    expect(isBaseAsset({ bucket: "certificate-assets", path: `${BASE_ASSET_FOLDER}/a.png` })).toBe(true);
    expect(isBaseAsset({ bucket: "certificate-assets", path: "11111111-1111-4111-8111-111111111111/a.png" })).toBe(false);
    expect(isBaseAsset({ bucket: "certificate-templates", path: `${BASE_ASSET_FOLDER}/a.png` })).toBe(false);
  });
});

describe("baseImpactText", () => {
  it("explains a first save", () => {
    expect(baseImpactText(undefined, false)).toBe("Every event without a custom design will use this.");
  });
  it("counts events and those with issued certificates", () => {
    expect(baseImpactText({ following: 9, withLive: 2 }, true)).toBe(
      "Used by 9 events. 2 of them have issued certificates that will show as outdated.",
    );
    expect(baseImpactText({ following: 1, withLive: 1 }, true)).toBe(
      "Used by 1 event. 1 of them has issued certificates that will show as outdated.",
    );
    expect(baseImpactText({ following: 3, withLive: 0 }, true)).toBe("Used by 3 events. None has issued certificates yet.");
    expect(baseImpactText({ following: 0, withLive: 0 }, true)).toBe("No other event follows this base right now.");
  });
});

describe("summarizeBases", () => {
  it("reports every kind, saved or not", () => {
    const out = summarizeBases(new Map<BaseKind, BaseDesign>([["volunteers", base("volunteers", emptyDesign())]]));
    expect(out.volunteers).toEqual({ kind: "volunteers", label: "Volunteers", exists: true, sourceEventTitle: "Hack Night", updatedAt: "2026-09-12T10:00:00Z" });
    expect(out.participants).toEqual({ kind: "participants", label: "Participants", exists: false, sourceEventTitle: null, updatedAt: null });
    expect(out.winners.exists).toBe(false);
  });
});
```

Append to `src/lib/certificates/design.test.ts` (add `rewriteAssetRefs` and `type AssetRef` to its import list):

```ts
describe("rewriteAssetRefs", () => {
  it("swaps the template and every image, leaving other elements alone", () => {
    const t: AssetRef = { bucket: "certificate-assets", path: "a/t.png", type: "png", widthPx: 10, heightPx: 10 };
    const logo: AssetRef = { ...t, path: "a/logo.png" };
    const design: Design = {
      v: 1,
      page: { template: t, widthPx: 10, heightPx: 10 },
      elements: [
        { id: "logo", name: "Logo", type: "image", x: 0, y: 0, w: 5, h: 5, locked: false, hidden: false, opacity: 1, asset: logo },
        { id: "qr", name: "QR", type: "qr", x: 0, y: 0, w: 5, h: 5, locked: false, hidden: false, color: "#000000" },
      ],
    };
    const out = rewriteAssetRefs(design, (ref) => ({ ...ref, path: ref.path.replace("a/", "b/") }));
    expect(out.page.template?.path).toBe("b/t.png");
    expect(out.elements[0].type === "image" && out.elements[0].asset.path).toBe("b/logo.png");
    expect(out.elements[1]).toBe(design.elements[1]);
    expect(design.page.template?.path).toBe("a/t.png");
  });

  it("keeps a missing template missing", () => {
    expect(rewriteAssetRefs(emptyDesign(), (r) => r).page.template).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/certificates/bases.test.ts src/lib/certificates/design.test.ts`
Expected: FAIL — `Failed to resolve import "./bases"` and `rewriteAssetRefs is not a function`.

- [ ] **Step 3: Add `rewriteAssetRefs` to `design.ts`** (right after `assetRefsOf`)

```ts
/** The same design with every stored asset reference (template and images) passed through `swap`. */
export function rewriteAssetRefs(design: Design, swap: (ref: AssetRef) => AssetRef): Design {
  return {
    ...design,
    page: { ...design.page, template: design.page.template ? swap(design.page.template) : null },
    elements: design.elements.map((el) => (el.type === "image" ? { ...el, asset: swap(el.asset) } : el)),
  };
}
```

- [ ] **Step 4: Write `src/lib/certificates/bases.ts`**

```ts
import { canManage, type AdminIdentity, type Capability } from "@/lib/auth/capabilities";
import { CERT_ASSET_BUCKET, emptyDesign, type AssetRef, type Design } from "./design";

/**
 * Council-wide base designs (spec 2026-09-15 §1–§5). Pure: which bases exist,
 * who may overwrite them, what a base may contain, and which design a group
 * prints with while it follows one.
 */

export const BASE_KINDS = ["participants", "volunteers", "winners"] as const;
export type BaseKind = (typeof BASE_KINDS)[number];

/** Bases this build offers. Phase 2 (winner certificates) adds "winners". */
export const ENABLED_BASE_KINDS: readonly BaseKind[] = ["participants", "volunteers"];

export const BASE_LABEL: Record<BaseKind, string> = {
  participants: "Participants",
  volunteers: "Volunteers",
  winners: "Winners",
};

/**
 * Where a base's images live in the asset bucket. The nil UUID matches the
 * design validator's `<uuid>/<uuid>.<ext>` path rule, and no event can have it,
 * so a base never depends on an event's objects.
 */
export const BASE_ASSET_FOLDER = "00000000-0000-0000-0000-000000000000";

export interface BaseDesign {
  kind: BaseKind;
  design: Design;
  sourceEventTitle: string | null;
  updatedAt: string;
}

/** What the page needs to know about a base without its design. */
export interface BaseSummary {
  kind: BaseKind;
  label: string;
  exists: boolean;
  sourceEventTitle: string | null;
  updatedAt: string | null;
}

export interface BaseImpact {
  /** Other events whose group follows this base. */
  following: number;
  /** How many of those have at least one live certificate. */
  withLive: number;
}

/** The design a group prints with: its own once customised, else its base's, else empty. */
export function effectiveDesign(
  group: { customDesign: Design | null; baseKind: BaseKind | null },
  bases: ReadonlyMap<BaseKind, BaseDesign>,
): Design {
  if (group.customDesign) return group.customDesign;
  return (group.baseKind ? bases.get(group.baseKind)?.design : undefined) ?? emptyDesign();
}

export function baseCapability(kind: BaseKind): Capability {
  return kind === "winners" ? "issue:winner_certificate" : "issue:participation_certificate";
}

/** Bases this admin may overwrite. `canManage` with no club is true only for an "all" grant (spec D7). */
export function savableBases(identity: AdminIdentity, kinds: readonly BaseKind[] = ENABLED_BASE_KINDS): BaseKind[] {
  return kinds.filter((kind) => canManage(identity, baseCapability(kind), null));
}

const EVENT_ONLY_FIELD = /^(form|sheet)\./;
const WINNER_FIELD = /^winner\./;

/** The first field a base can't carry, as the refusal to show; null when the design is fine (spec D6). */
export function baseFieldProblem(
  design: Design,
  targets: readonly BaseKind[],
  labelOf: (key: string) => string,
): string | null {
  const winnersOnly = targets.length > 0 && targets.every((kind) => kind === "winners");
  for (const el of design.elements) {
    if (el.type !== "text") continue;
    for (const paragraph of el.paragraphs) {
      for (const run of paragraph.runs) {
        if (run.kind !== "field") continue;
        if (EVENT_ONLY_FIELD.test(run.field)) {
          return `Remove {${labelOf(run.field)}} — a base can only use fields every event has.`;
        }
        if (WINNER_FIELD.test(run.field) && !winnersOnly) {
          return `Remove {${labelOf(run.field)}} — winner fields can only go in the Winners base.`;
        }
      }
    }
  }
  return null;
}

export const isBaseAsset = (ref: Pick<AssetRef, "bucket" | "path">): boolean =>
  ref.bucket === CERT_ASSET_BUCKET && ref.path.startsWith(`${BASE_ASSET_FOLDER}/`);

/** The line the Save-as-base confirm shows for one base. */
export function baseImpactText(impact: BaseImpact | undefined, exists: boolean): string {
  if (!exists) return "Every event without a custom design will use this.";
  const following = impact?.following ?? 0;
  const withLive = impact?.withLive ?? 0;
  if (following === 0) return "No other event follows this base right now.";
  const used = `Used by ${following} ${following === 1 ? "event" : "events"}.`;
  if (withLive === 0) return `${used} None has issued certificates yet.`;
  return `${used} ${withLive} of them ${withLive === 1 ? "has" : "have"} issued certificates that will show as outdated.`;
}

export function summarizeBases(bases: ReadonlyMap<BaseKind, BaseDesign>): Record<BaseKind, BaseSummary> {
  const one = (kind: BaseKind): BaseSummary => {
    const saved = bases.get(kind);
    return {
      kind,
      label: BASE_LABEL[kind],
      exists: !!saved,
      sourceEventTitle: saved?.sourceEventTitle ?? null,
      updatedAt: saved?.updatedAt ?? null,
    };
  };
  return { participants: one("participants"), volunteers: one("volunteers"), winners: one("winners") };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/certificates/bases.test.ts src/lib/certificates/design.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/certificates/bases.ts src/lib/certificates/bases.test.ts src/lib/certificates/design.ts src/lib/certificates/design.test.ts
git commit -m "feat(certificates): base kinds, effective design, who may save a base, base field rules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Roll no. on list rows, typed-row validation, list identity

**Files:**
- Modify: `src/lib/certificates/sheet.ts`, `src/lib/certificates/sheet.test.ts`
- Modify: `src/lib/certificates/fields.ts` (`sheetValues`, ≈line 312), `src/lib/certificates/fields.test.ts` (≈line 164)
- Modify: `src/lib/certificates/recipients.ts` (`sheetKey`, ≈line 83), `src/lib/certificates/recipients.test.ts`

**Interfaces:**
- Produces:
  - `SheetRow` gains `roll: string | null`
  - `interface ListRow extends SheetRow { id: string }`
  - `ColumnChoice` gains `roll: number | null`
  - `validateListRow(input: { name?: unknown; email?: unknown; roll?: unknown }): { ok: true; row: { name: string; email: string | null; roll: string | null } } | { ok: false; error: string }`
  - `sheetValues` accepts `row.roll?: string | null` and prints it as `person.roll`
  - `sheetIdentity(row: { name: string; email: string | null }): string`

- [ ] **Step 1: Write the failing tests**

In `sheet.test.ts`, change the import to `import { buildSheetRows, detectColumns, parseDelimited, SHEET_LIMITS, validateListRow } from "./sheet";`. Every existing `detectColumns(...)` expectation gains `roll: null`:

```ts
    expect(detectColumns(["Full Name", "E-mail", "Role"])).toEqual({ name: 0, email: 1, roll: null });
    expect(detectColumns(["email address", "student name"])).toEqual({ name: 1, email: 0, roll: null });
    expect(detectColumns(["Team Name", "Participant", "Email"])).toEqual({ name: 1, email: 2, roll: null });
    expect(detectColumns(["Event name", "Club name"])).toEqual({ name: 0, email: null, roll: null });
    expect(detectColumns(["A", "B"])).toEqual({ name: 0, email: null, roll: null });
    expect(detectColumns([])).toEqual({ name: 0, email: null, roll: null });
```

In the same file, every `buildSheetRows(…, { name: …, email: … })` call in `describe("buildSheetRows")` gains `roll: null` (seven calls). In the first test ("builds rows, drops the nameless and blanks bad emails"), each of the three expected row objects gains `roll: null`, e.g. `{ row_no: 1, name: "Asha", email: "asha@x.com", roll: null, data: { … } }`. Then add:

```ts
describe("roll column", () => {
  it("finds a roll / VTU / register number column and never takes it for the name", () => {
    expect(detectColumns(["Student Roll No", "Student Name", "Email"])).toEqual({ name: 1, email: 2, roll: 0 });
    expect(detectColumns(["VTU No", "Student"])).toEqual({ name: 1, email: null, roll: 0 });
    // The name fallback skips the roll column too.
    expect(detectColumns(["Enrollment No", "Col B"])).toEqual({ name: 1, email: null, roll: 0 });
    expect(detectColumns(["Name", "Register Number"])).toEqual({ name: 0, email: null, roll: 1 });
    expect(detectColumns(["Name", "Reg. No"])).toEqual({ name: 0, email: null, roll: 1 });
  });

  it("carries the roll into each row, blank as null", () => {
    const built = buildSheetRows(
      [["Name", "Roll"], ["Asha", " VTU27001 "], ["Kim", ""]],
      { name: 0, email: null, roll: 1 },
    );
    expect(built.ok && built.rows.map((r) => r.roll)).toEqual(["VTU27001", null]);
  });
});

describe("validateListRow", () => {
  it("trims and keeps a full row", () => {
    expect(validateListRow({ name: " Asha R ", email: " asha@veltech.edu.in ", roll: " VTU27001 " })).toEqual({
      ok: true,
      row: { name: "Asha R", email: "asha@veltech.edu.in", roll: "VTU27001" },
    });
  });
  it("needs only a name", () => {
    expect(validateListRow({ name: "Kim", email: "", roll: "" })).toEqual({ ok: true, row: { name: "Kim", email: null, roll: null } });
  });
  it("refuses a missing name", () => {
    expect(validateListRow({ name: "  ", email: "a@b.co" })).toEqual({ ok: false, error: "Enter a name." });
  });
  it("refuses a typo'd email instead of dropping it", () => {
    expect(validateListRow({ name: "Kim", email: "kim@gmail" })).toEqual({ ok: false, error: "That email doesn't look right." });
  });
  it("applies the cell cap to every value", () => {
    const long = "x".repeat(SHEET_LIMITS.cell + 1);
    expect(validateListRow({ name: long })).toEqual({ ok: false, error: "That name is too long." });
    expect(validateListRow({ name: "Kim", roll: long })).toEqual({ ok: false, error: "That roll no. is too long." });
  });
  it("ignores non-string input", () => {
    expect(validateListRow({ name: 42 as unknown as string })).toEqual({ ok: false, error: "Enter a name." });
  });
});
```

In `fields.test.ts`, change the existing sheet-row test's `row` to `{ name: " Kim ", email: "kim@x.com", roll: null, data: { Role: "Judge", Shift: 2 } }`, then add after it:

```ts
  it("prints a typed or uploaded roll no. as the person's roll", () => {
    const v = sheetValues({ event, columns: [], row: { name: "Asha", email: null, roll: " VTU27001 ", data: {} }, groupLabel: "Volunteers" });
    expect(v["person.roll"]).toBe("VTU27001");
  });
```

In `recipients.test.ts`, add `sheetIdentity` to the import, then:

```ts
describe("sheetIdentity", () => {
  it("is the identity sheetKey is built from: email first, else name", () => {
    expect(sheetIdentity({ name: "Asha", email: " A@X.COM " })).toBe("a@x.com");
    expect(sheetIdentity({ name: "  Asha   R ", email: null })).toBe("asha r");
    expect(sheetKey("g1", { name: "Asha", email: "A@X.COM" }, new Set())).toBe(`sheet:g1:${sheetIdentity({ name: "Asha", email: "A@X.COM" })}`);
  });
  it("changes when the email or (without email) the name changes — not otherwise", () => {
    const before = sheetIdentity({ name: "Asha", email: "a@x.com" });
    expect(sheetIdentity({ name: "Asha R", email: "a@x.com" })).toBe(before);
    expect(sheetIdentity({ name: "Asha", email: "asha@x.com" })).not.toBe(before);
    expect(sheetIdentity({ name: "Asha R", email: null })).not.toBe(sheetIdentity({ name: "Asha", email: null }));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/certificates/sheet.test.ts src/lib/certificates/fields.test.ts src/lib/certificates/recipients.test.ts`
Expected: FAIL — `validateListRow` / `sheetIdentity` not exported; `roll` missing from `detectColumns` results.

- [ ] **Step 3: Implement in `sheet.ts`**

Replace the `SheetRow` and `ColumnChoice` interfaces:

```ts
/** One row as stored in `certificate_sheet_rows`. */
export interface SheetRow {
  row_no: number;
  name: string;
  email: string | null;
  /** Roll / VTU no. — typed in, or read from the upload's roll column. Prints as {Roll / VTU no.}. */
  roll: string | null;
  data: Record<string, string>;
}

/** A stored row with its id — what the typed list edits (spec §1.4). */
export interface ListRow extends SheetRow {
  id: string;
}

export interface ColumnChoice {
  name: number;
  email: number | null;
  roll: number | null;
}
```

Add `ROLL_RE` beside the other patterns, and replace `detectColumns`:

```ts
const ROLL_RE = /roll|vtu|usn|reg(istration|ister)?\.?\s*(no|num)/i;

/** Guess which columns hold the person's name, address and roll no. */
export function detectColumns(header: string[]): ColumnChoice {
  const clean = header.map((h) => h.trim());
  const email = clean.findIndex((h) => EMAIL_RE.test(h));
  const roll = clean.findIndex((h, i) => i !== email && ROLL_RE.test(h));
  const name = clean.findIndex((h) => NAME_RE.test(h) && !NOT_A_PERSON_RE.test(h) && !ROLL_RE.test(h));
  const fallback = clean.findIndex((h, i) => i !== email && i !== roll && h !== "");
  return {
    name: name >= 0 ? name : fallback >= 0 ? fallback : 0,
    email: email >= 0 ? email : null,
    roll: roll >= 0 ? roll : null,
  };
}
```

In `buildSheetRows`, after the email lines, add:

```ts
    const roll = choice.roll === null ? "" : (raw[choice.roll] ?? "").trim().slice(0, SHEET_LIMITS.cell);
```

and change the push to `rows.push({ row_no: rows.length + 1, name, email, roll: roll || null, data });`.

Append:

```ts
export type ListRowCheck =
  | { ok: true; row: { name: string; email: string | null; roll: string | null } }
  | { ok: false; error: string };

/**
 * One person typed into a list (spec §1.4). Stricter than an upload: a typo'd
 * email is refused, not silently dropped, because the person typing can fix it.
 * The browser and the server action both run this.
 */
export function validateListRow(input: { name?: unknown; email?: unknown; roll?: unknown }): ListRowCheck {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const name = text(input.name);
  const email = text(input.email);
  const roll = text(input.roll);
  if (!name) return { ok: false, error: "Enter a name." };
  if (name.length > SHEET_LIMITS.cell) return { ok: false, error: "That name is too long." };
  if (email && !looksLikeEmail(email)) return { ok: false, error: "That email doesn't look right." };
  if (email.length > SHEET_LIMITS.cell) return { ok: false, error: "That email is too long." };
  if (roll.length > SHEET_LIMITS.cell) return { ok: false, error: "That roll no. is too long." };
  return { ok: true, row: { name, email: email || null, roll: roll || null } };
}
```

- [ ] **Step 4: Implement in `fields.ts`**

In `sheetValues`, change the `row` parameter type to `row: { name: string; email: string | null; roll?: string | null; data: Record<string, unknown> | null };`, change `"person.roll": "",` to `"person.roll": input.row.roll?.trim() ?? "",`, and change the doc comment's last sentence to: `Name, email and roll come from the row; the person fields a list has no value for print empty.`

- [ ] **Step 5: Implement in `recipients.ts`**

Replace `sheetKey`:

```ts
/** Who a list row is, for matching certificates: email where there is one, else name (spec §1.4). */
export function sheetIdentity(row: { name: string; email: string | null }): string {
  return norm(row.email ?? "") || norm(row.name) || "row";
}

/** A sheet row is identified by email where there is one, else by name, so a re-upload matches. */
export function sheetKey(groupId: string, row: { name: string; email: string | null }, taken: Set<string>): string {
  return unique(`sheet:${groupId}:${sheetIdentity(row)}`, taken);
}
```

- [ ] **Step 6: Run the tests, then typecheck**

Run: `npx vitest run src/lib/certificates` — Expected: PASS.
Run: `npm run typecheck` — expected errors only in files that build a `ColumnChoice` or `SheetRow` literal. Fix them in place:
- `SheetUpload.tsx`: `useState<ColumnChoice>({ name: 0, email: null, roll: null })`
- `listSheetRows` in `src/lib/admin/certificates.ts`: Task 5 replaces it, so a temporary `roll: null` in its map is fine
- any harness sample rows: add `roll: null`

- [ ] **Step 7: Commit**

```bash
git add src/lib/certificates/sheet.ts src/lib/certificates/sheet.test.ts src/lib/certificates/fields.ts src/lib/certificates/fields.test.ts src/lib/certificates/recipients.ts src/lib/certificates/recipients.test.ts src/components/admin/certificates/SheetUpload.tsx src/lib/admin/certificates.ts
git commit -m "feat(certificates): roll no. on list rows, typed-row validation, list identity

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server helpers — copy assets, load/write bases, impact

**Files:**
- Modify: `src/lib/certificates/assets.ts` (append `copyDesignAssets`; import `rewriteAssetRefs`)
- Create: `src/lib/admin/certificate-bases.ts`

**Interfaces:**
- Consumes: `rewriteAssetRefs` (Task 2); `BaseDesign`, `BaseImpact`, `BaseKind` (Task 2)
- Produces:
  - `copyDesignAssets(design: Design, folder: string, keep?: (ref: AssetRef) => boolean, load?: (ref: AssetRef) => Promise<Uint8Array>): Promise<{ design: Design; copied: AssetRef[] }>` (throws on a failed upload)
  - `loadBases(): Promise<Map<BaseKind, BaseDesign>>`
  - `baseImpact(kinds: readonly BaseKind[], exceptEventId: string): Promise<Partial<Record<BaseKind, BaseImpact>>>`
  - `writeBases(input: { kinds: readonly BaseKind[]; design: Design; sourceEventId: string; actorId: string }): Promise<{ previous: Map<BaseKind, Json> } | { error: string }>`
  - `followBase(eventId: string, groupId: string): Promise<boolean>`

These are service-role database/storage calls. The repo unit-tests only pure modules, so this task's check is the typecheck plus the browser walkthrough in Task 11.

- [ ] **Step 1: Append `copyDesignAssets` to `assets.ts`**

Add `rewriteAssetRefs` to the import from `./design`, then append:

```ts
/**
 * Copy the stored images a design points at into `folder` of the asset bucket,
 * and return the design pointing at the copies. `keep` leaves an asset where it
 * is — a base's own images are already in the council folder. Throws when an
 * upload fails; nothing has been saved by then, so the caller just reports it.
 */
export async function copyDesignAssets(
  design: Design,
  folder: string,
  keep: (ref: AssetRef) => boolean = () => false,
  load: (ref: AssetRef) => Promise<Uint8Array> = assetLoader(),
): Promise<{ design: Design; copied: AssetRef[] }> {
  const admin = createAdminClient();
  const moved = new Map<string, AssetRef>();
  for (const ref of assetRefsOf(design)) {
    if (keep(ref) || moved.has(assetKey(ref))) continue;
    const path = `${folder}/${crypto.randomUUID()}.${ref.type}`;
    const { error } = await admin.storage
      .from(CERT_ASSET_BUCKET)
      .upload(path, await load(ref), { contentType: ref.type === "png" ? "image/png" : "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    moved.set(assetKey(ref), { ...ref, bucket: CERT_ASSET_BUCKET, path });
  }
  return { design: rewriteAssetRefs(design, (ref) => moved.get(assetKey(ref)) ?? ref), copied: [...moved.values()] };
}
```

- [ ] **Step 2: Create `src/lib/admin/certificate-bases.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import type { BaseDesign, BaseImpact, BaseKind } from "@/lib/certificates/bases";
import { parseStoredDesign, type Design } from "@/lib/certificates/design";

/**
 * The council's base designs (spec 2026-09-15 §2, §5). Service role only —
 * `certificate_bases` has no anon/authenticated privileges. Callers check the
 * capability first.
 */

/** Every saved base, by kind. A row whose design no longer parses counts as not saved. */
export async function loadBases(): Promise<Map<BaseKind, BaseDesign>> {
  const { data, error } = await createAdminClient()
    .from("certificate_bases")
    .select("kind, design, updated_at, events ( title )");
  if (error) throw error;
  const out = new Map<BaseKind, BaseDesign>();
  const rows = (data ?? []) as unknown as { kind: BaseKind; design: Json; updated_at: string; events: { title: string } | null }[];
  for (const row of rows) {
    const design = parseStoredDesign(row.design);
    if (design) out.set(row.kind, { kind: row.kind, design, sourceEventTitle: row.events?.title ?? null, updatedAt: row.updated_at });
  }
  return out;
}

/** Who a base save reaches: other events following each base, and how many of them already issued. */
export async function baseImpact(
  kinds: readonly BaseKind[],
  exceptEventId: string,
): Promise<Partial<Record<BaseKind, BaseImpact>>> {
  if (kinds.length === 0) return {};
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("certificate_groups")
    .select("id, event_id, base_kind")
    .in("base_kind", [...kinds])
    .is("design", null)
    .neq("event_id", exceptEventId);
  if (error) throw error;
  const groups = (data ?? []) as { id: string; event_id: string; base_kind: BaseKind }[];

  const withLive = new Set<string>();
  const ids = groups.map((g) => g.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: live, error: liveError } = await admin
      .from("certificates")
      .select("group_id")
      .in("group_id", ids.slice(i, i + 200))
      .is("revoked_at", null);
    if (liveError) throw liveError;
    for (const row of live ?? []) if (row.group_id) withLive.add(row.group_id);
  }

  const out: Partial<Record<BaseKind, BaseImpact>> = {};
  for (const kind of kinds) {
    // One group per (event, base) by index, so groups here are events.
    const mine = groups.filter((g) => g.base_kind === kind);
    out[kind] = { following: mine.length, withLive: mine.filter((g) => withLive.has(g.id)).length };
  }
  return out;
}

/** Upsert one base row per kind. Returns each kind's previous design (for the audit row) or a user-facing error. */
export async function writeBases(input: {
  kinds: readonly BaseKind[];
  design: Design;
  sourceEventId: string;
  actorId: string;
}): Promise<{ previous: Map<BaseKind, Json> } | { error: string }> {
  const admin = createAdminClient();
  const { data: before, error: readError } = await admin
    .from("certificate_bases")
    .select("kind, design")
    .in("kind", [...input.kinds]);
  if (readError) return { error: "Could not save the base. Try again." };

  const now = new Date().toISOString();
  const { error } = await admin.from("certificate_bases").upsert(
    input.kinds.map((kind) => ({
      kind,
      design: input.design as unknown as Json,
      source_event_id: input.sourceEventId,
      updated_by: input.actorId,
      updated_at: now,
    })),
    { onConflict: "kind" },
  );
  if (error) return { error: "Could not save the base. Try again." };
  return { previous: new Map((before ?? []).map((row) => [row.kind as BaseKind, row.design])) };
}

/** Make a base-slot group follow its base again (drop its own design). False when nothing changed. */
export async function followBase(eventId: string, groupId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .update({ design: null, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId)
    .not("base_kind", "is", null)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from these two files. If the embedded `events ( title )` select errors on the `certificate_bases_source_event_id_fkey` relationship, check the Task 1 types patch; the `as unknown as` cast covers the row shape.

- [ ] **Step 4: Commit**

```bash
git add src/lib/certificates/assets.ts src/lib/admin/certificate-bases.ts
git commit -m "feat(certificates): load and write council bases, count who a base save reaches

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Groups follow their base (data layer)

**Files:**
- Modify: `src/lib/admin/certificates.ts`

**Interfaces:**
- Consumes: `effectiveDesign`, `summarizeBases`, `BaseKind`, `BaseSummary`, `BaseDesign` (Task 2); `loadBases` (Task 4); `ListRow` (Task 3)
- Produces:
  - `CertificateGroup` = `{ id; eventId; kind: "participants" | "sheet"; name; design: Design /* effective */; customDesign: Design | null; baseKind: BaseKind | null; followsBase: boolean; sheetColumns: string[] }`
  - `CertificateWorkspace` gains `bases: Record<BaseKind, BaseSummary>` and `listRows: ListRow[]`
  - `listSheetRows(groupId): Promise<ListRow[]>`
  - `renameGroup` / `deleteSheetGroup` refuse base-slot groups and return false when no row matched
  - `listGroups` returns Participants, Volunteers, then extra groups

- [ ] **Step 1: Imports and types**

Add to the imports:

```ts
import { effectiveDesign, summarizeBases, type BaseDesign, type BaseKind, type BaseSummary } from "@/lib/certificates/bases";
import { loadBases } from "./certificate-bases";
```

Change `import type { SheetRow } from "@/lib/certificates/sheet";` to `import type { ListRow, SheetRow } from "@/lib/certificates/sheet";`.

Replace `GROUP_COLUMNS`, `CertificateGroup`, `GroupRow` and `toGroup` with:

```ts
const GROUP_COLUMNS = "id, event_id, kind, name, design, base_kind, sheet_columns";

export interface CertificateGroup {
  id: string;
  eventId: string;
  kind: "participants" | "sheet";
  name: string;
  /**
   * The design this group prints with — its own once customised, otherwise its
   * council base's (spec 2026-09-15 §3). Issuing, previews, print and outdated
   * checks all read this, so they follow the base without knowing it exists.
   */
  design: Design;
  /** The group's own saved design; null while it follows its base. */
  customDesign: Design | null;
  /** The base slot this group fills; null for an extra group (Judges…), which is always custom. */
  baseKind: BaseKind | null;
  followsBase: boolean;
  sheetColumns: string[];
}

type GroupRow = {
  id: string;
  event_id: string;
  kind: "participants" | "sheet";
  name: string;
  design: Json | null;
  base_kind: BaseKind | null;
  sheet_columns: string[] | null;
};

const toGroup = (row: GroupRow, bases: ReadonlyMap<BaseKind, BaseDesign>): CertificateGroup => {
  const customDesign = row.design === null ? null : (parseStoredDesign(row.design) ?? emptyDesign());
  return {
    id: row.id,
    eventId: row.event_id,
    kind: row.kind,
    name: row.name,
    design: effectiveDesign({ customDesign, baseKind: row.base_kind }, bases),
    customDesign,
    baseKind: row.base_kind,
    followsBase: customDesign === null,
    sheetColumns: row.sheet_columns ?? [],
  };
};
```

- [ ] **Step 2: Readers load the bases**

Replace `getGroup` and `getParticipantsGroup`:

```ts
export async function getGroup(eventId: string, groupId: string): Promise<CertificateGroup | null> {
  const [{ data }, bases] = await Promise.all([
    createAdminClient().from("certificate_groups").select(GROUP_COLUMNS).eq("event_id", eventId).eq("id", groupId).maybeSingle(),
    loadBases(),
  ]);
  return data ? toGroup(data as GroupRow, bases) : null;
}

export async function getParticipantsGroup(eventId: string): Promise<CertificateGroup | null> {
  const [{ data }, bases] = await Promise.all([
    createAdminClient().from("certificate_groups").select(GROUP_COLUMNS).eq("event_id", eventId).eq("kind", "participants").maybeSingle(),
    loadBases(),
  ]);
  return data ? toGroup(data as GroupRow, bases) : null;
}
```

- [ ] **Step 3: Participants follows the base unless there is a v1 setup; add the Volunteers slot**

In `designFromV1`, change the return type to `Promise<Design | null>`. Change every `return emptyDesign();` inside it to `return null;`, and the last line to `return validateDesign(design, { formFieldIds: new Set(), sheetColumns: new Set() }).ok ? design : null;`. Update its comment to: `/** v1's uploaded image + name anchor as a design, or null when the event never had one. */`

In `ensureParticipantsGroup`, change the insert to:

```ts
  const legacyDesign = await designFromV1(eventId);
  const { data, error } = await admin
    .from("certificate_groups")
    .insert({
      event_id: eventId,
      kind: "participants",
      base_kind: "participants",
      name: "Participants",
      // A v1 setup is this event's own design; otherwise it follows the council base.
      design: legacyDesign as unknown as Json | null,
      created_by: actorId,
    })
    .select(GROUP_COLUMNS)
    .single();
```

(delete the old `const design = await designFromV1(eventId);` line), and change `const group = toGroup(data as GroupRow);` to `const group = toGroup(data as GroupRow, await loadBases());`.

Replace `listGroups` with:

```ts
/** The fixed list groups every event has besides Participants (spec §1.1). Phase 2 adds Winners. */
const LIST_SLOTS: { baseKind: BaseKind; name: string }[] = [{ baseKind: "volunteers", name: "Volunteers" }];

const SLOT_RANK: Record<BaseKind, number> = { participants: 0, volunteers: 1, winners: 2 };
const slotRank = (group: CertificateGroup) => (group.baseKind ? SLOT_RANK[group.baseKind] : 3);

async function ensureListSlots(eventId: string, actorId: string | null): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("certificate_groups").select("base_kind").eq("event_id", eventId).not("base_kind", "is", null);
  const have = new Set((data ?? []).map((row) => row.base_kind));
  for (const slot of LIST_SLOTS) {
    if (have.has(slot.baseKind)) continue;
    // Another tab racing this insert loses on certificate_groups_one_per_base. Harmless: the group exists.
    await admin
      .from("certificate_groups")
      .insert({ event_id: eventId, kind: "sheet", base_kind: slot.baseKind, name: slot.name, design: null, created_by: actorId });
  }
}

/** Every group on the event: Participants, Volunteers, then extra groups in the order they were added. */
export async function listGroups(eventId: string, actorId: string | null): Promise<CertificateGroup[]> {
  await ensureParticipantsGroup(eventId, actorId);
  await ensureListSlots(eventId, actorId);
  const [{ data }, bases] = await Promise.all([
    createAdminClient()
      .from("certificate_groups")
      .select(GROUP_COLUMNS)
      .eq("event_id", eventId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true }),
    loadBases(),
  ]);
  const groups = (data ?? []).map((row) => toGroup(row as GroupRow, bases));
  return [...groups].sort((a, b) => slotRank(a) - slotRank(b));
}
```

- [ ] **Step 4: Extra groups stay editable; base slots don't**

`createSheetGroup` already copies `participants.design`, which is now the effective design. Leave its body unchanged. Change its doc comment to: `/** A new extra list group (Judges…), starting from whatever Participants currently prints with. Always custom. */`

Replace `renameGroup` and `deleteSheetGroup`:

```ts
export async function renameGroup(eventId: string, groupId: string, name: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId)
    .is("base_kind", null)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Delete an extra group. Base slots (Participants, Volunteers) can't be. Issued certificates keep their snapshot. */
export async function deleteSheetGroup(eventId: string, groupId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .delete()
    .eq("id", groupId)
    .eq("event_id", eventId)
    .is("base_kind", null)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
```

- [ ] **Step 5: List rows carry id + roll; copy sources are custom designs only**

Replace `listSheetRows`:

```ts
export async function listSheetRows(groupId: string): Promise<ListRow[]> {
  const { data } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("id, row_no, name, email, roll, data")
    .eq("group_id", groupId)
    .order("row_no", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    row_no: r.row_no,
    name: r.name,
    email: r.email,
    roll: r.roll,
    data: (r.data ?? {}) as Record<string, string>,
  }));
}
```

In `listDesignSources`, add `.not("design", "is", null)` after `.eq("kind", "participants")`. Add this line to its doc comment: `A group following the base isn't listed: copying it would just copy the base.`

- [ ] **Step 6: Workspace carries base summaries and the active list's rows**

In `CertificateWorkspace`, add:

```ts
  /** Every base's status — the preview banner and the Save-as-base confirm read it. */
  bases: Record<BaseKind, BaseSummary>;
  /** The active group's people, when it is a list group (typed or uploaded). */
  listRows: ListRow[];
```

In `getCertificateWorkspace`, replace `const groups = await listGroups(eventId, actorId);` with:

```ts
  const [groups, bases] = await Promise.all([listGroups(eventId, actorId), loadBases()]);
```

Replace the `Promise.all([listAllRecipients…, signAssetUrls…])` with:

```ts
  const [recipients, assetUrls, listRows] = await Promise.all([
    listAllRecipients(event, groups),
    signAssetUrls(assetRefsOf(editableDesign)),
    group.kind === "sheet" ? listSheetRows(group.id) : Promise.resolve([] as ListRow[]),
  ]);
```

and add `bases: summarizeBases(bases),` and `listRows,` to the returned object.

- [ ] **Step 7: Typecheck + tests**

Run: `npm run typecheck`
Expected: remaining errors only in `actions.ts` (`deleteCertificateGroupAction`'s `group.kind !== "sheet"` still compiles; nothing else should break) and in `page.tsx` if it spreads groups. Fix any error that is about the new `CertificateGroup` fields in place.
Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin/certificates.ts
git commit -m "feat(certificates): groups follow their council base until customised; Volunteers on every event

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Actions — Save as base, Reset to base, guards, copy refactor

**Files:**
- Modify: `src/app/admin/(app)/events/[id]/certificates/actions.ts`

**Interfaces:**
- Consumes: `savableBases`, `baseFieldProblem`, `isBaseAsset`, `BASE_ASSET_FOLDER`, `ENABLED_BASE_KINDS`, `BaseKind` (Task 2); `copyDesignAssets` (Task 4); `writeBases`, `followBase`, `baseImpact` (Task 4); `CertificateGroup.baseKind/followsBase/customDesign` (Task 5)
- Produces:
  - `saveCertificateBaseAction(input: { eventId: string; groupId: string; design: unknown; targets: string[] }): Promise<SaveBaseResult>` where `SaveBaseResult = { ok: true; groupFollows: boolean } | { ok: false; error: string }`
  - `resetCertificateGroupToBaseAction(input: { eventId: string; groupId: string }): Promise<ActionResult>`

- [ ] **Step 1: Imports and result type**

Add:

```ts
import {
  BASE_ASSET_FOLDER,
  BASE_LABEL,
  ENABLED_BASE_KINDS,
  baseFieldProblem,
  isBaseAsset,
  savableBases,
  type BaseKind,
} from "@/lib/certificates/bases";
import { baseImpact, followBase, writeBases } from "@/lib/admin/certificate-bases";
```

Change the assets import to `import { copyDesignAssets, signAssetUrls, verifyNewAssets } from "@/lib/certificates/assets";`.

Add under the other result types:

```ts
export type SaveBaseResult = { ok: true; groupFollows: boolean } | { ok: false; error: string };
```

- [ ] **Step 2: Add `saveCertificateBaseAction` and `resetCertificateGroupToBaseAction`** (after `saveCertificateDesignAction`)

```ts
/**
 * Save the editor's design as one or more council bases (spec 2026-09-15 §5).
 * Council-wide admins only. The images are copied into the council folder, so
 * a base never depends on this event. If this group's own base was saved, the
 * group follows it from now on.
 */
export async function saveCertificateBaseAction(input: {
  eventId: string;
  groupId: string;
  design: unknown;
  targets: string[];
}): Promise<SaveBaseResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.groupId).success) return { ok: false, error: "Missing certificate group." };

  const enabled: readonly string[] = ENABLED_BASE_KINDS;
  const targets = [...new Set(Array.isArray(input.targets) ? input.targets : [])].filter(
    (t): t is BaseKind => enabled.includes(t),
  );
  if (targets.length === 0) return { ok: false, error: "Choose which base to save." };
  const allowed = savableBases(auth.session);
  if (targets.some((kind) => !allowed.includes(kind))) {
    return { ok: false, error: "Only council admins can change a base template." };
  }

  const [event, group] = await Promise.all([getCertEvent(input.eventId), getGroup(input.eventId, input.groupId)]);
  if (!event || !group) return { ok: false, error: "That certificate group no longer exists." };

  const checked = validateDesign(input.design, designContextFor(event.schema, group.sheetColumns));
  if (!checked.ok) return { ok: false, error: checked.error };
  const catalogue = buildFieldCatalogue({ formSchema: event.schema, sheetColumns: group.sheetColumns });
  const fieldProblem = baseFieldProblem(checked.design, targets, (key) => fieldLabel(catalogue, key));
  if (fieldProblem) return { ok: false, error: fieldProblem };
  if (!checked.design.page.template) return { ok: false, error: "Add a template before saving it as a base." };
  // `group.design` is the effective design, so the base's own images count as known here.
  const assetProblem = await verifyNewAssets(input.eventId, checked.design, group.design);
  if (assetProblem) return { ok: false, error: assetProblem };

  let design: Design;
  let impact: Awaited<ReturnType<typeof baseImpact>>;
  try {
    [design, impact] = await Promise.all([
      copyDesignAssets(checked.design, BASE_ASSET_FOLDER, isBaseAsset).then((r) => r.design),
      baseImpact(targets, input.eventId),
    ]);
  } catch {
    return { ok: false, error: "Could not save the base. Try again." };
  }

  const written = await writeBases({ kinds: targets, design, sourceEventId: input.eventId, actorId: auth.session.id });
  if ("error" in written) return { ok: false, error: written.error };

  const groupFollows =
    group.baseKind !== null && targets.includes(group.baseKind) ? await followBase(input.eventId, group.id) : false;

  await Promise.all(
    targets.map((kind) =>
      writeAudit({
        actorId: auth.session.id,
        action: "update",
        entity: "certificate_base",
        entityId: kind,
        // The previous base, so a mistaken overwrite can be restored by hand.
        before: written.previous.has(kind) ? { design: written.previous.get(kind) ?? null } : null,
        after: {
          base: BASE_LABEL[kind],
          sourceEventId: input.eventId,
          elements: design.elements.length,
          following: impact[kind]?.following ?? 0,
          withLive: impact[kind]?.withLive ?? 0,
        },
      }),
    ),
  );
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, groupFollows };
}

/** Drop this event's custom design so the group follows its council base again. */
export async function resetCertificateGroupToBaseAction(input: { eventId: string; groupId: string }): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.groupId).success) return { ok: false, error: "Missing certificate group." };
  const group = await getGroup(input.eventId, input.groupId);
  if (!group) return { ok: false, error: "That certificate group no longer exists." };
  if (!group.baseKind) return { ok: false, error: "This group has no base to reset to." };
  if (group.followsBase) return { ok: true };
  if (!(await followBase(input.eventId, group.id))) return { ok: false, error: "Could not reset the design. Try again." };

  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_design",
    entityId: group.id,
    before: { design: group.customDesign as unknown as Json },
    after: { eventId: input.eventId, reset: true },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}
```

- [ ] **Step 3: Guard rename/delete by slot; refactor the copy action**

In `deleteCertificateGroupAction`, replace `if (group.kind !== "sheet") return { ok: false, error: "The participants group can't be deleted." };` with:

```ts
  if (group.baseKind) return { ok: false, error: `${group.name} is on every event and can't be deleted.` };
```

In `renameCertificateGroupAction`, change the failure message to `"That group can't be renamed."` (renameGroup now returns false for base slots).

In `copyCertificateDesignAction`, replace everything from `const admin = createAdminClient();` through the `const copied: Design = {…};` block with:

```ts
  let copied: { design: Design; copied: AssetRef[] };
  try {
    copied = await copyDesignAssets(sourceGroup.design, input.eventId);
  } catch {
    return { ok: false, error: "Could not copy that design's images. Try again." };
  }
```

then change `designWithUnknownFieldsAsText(copied, …)` to `designWithUnknownFieldsAsText(copied.design, …)`, the audit's `assets: moved.size` to `assets: copied.copied.length`, and the return's `signAssetUrls([...moved.values()])` to `signAssetUrls(copied.copied)`.

- [ ] **Step 4: Lint + typecheck**

Run: `npm run lint` and `npm run typecheck`
Expected: lint reports now-unused imports in `actions.ts` (`assetKey`, `assetRefsOf`, `assetLoader`). Remove exactly the ones it names. `CERT_ASSET_BUCKET` and `createAdminClient` are still used by other actions. Both commands then pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(app)/events/[id]/certificates/actions.ts"
git commit -m "feat(certificates): Save as base and Reset to base actions; base slots can't be renamed or deleted

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Typed list rows — data and actions

**Files:**
- Create: `src/lib/admin/certificate-list-rows.ts`
- Modify: `src/app/admin/(app)/events/[id]/certificates/actions.ts`

**Interfaces:**
- Consumes: `validateListRow`, `SHEET_LIMITS`, `ListRow` (Task 3); `sheetIdentity` (Task 3); `getGroup` (Task 5)
- Produces:
  - `getListRow(groupId, rowId): Promise<ListRow | null>`
  - `countListRows(groupId): Promise<number>`
  - `addListRow(groupId, person): Promise<{ id: string } | { error: string }>`
  - `updateListRow(groupId, rowId, person): Promise<boolean>`
  - `removeListRow(groupId, rowId): Promise<boolean>`
  - `hasLiveListCertificate(eventId, groupId, identity): Promise<boolean>`
  - actions `addCertificateListRowAction({ eventId, groupId, name, email, roll })`, `updateCertificateListRowAction({ eventId, groupId, rowId, name, email, roll })`, `removeCertificateListRowAction({ eventId, groupId, rowId })`, all `Promise<ActionResult>`

- [ ] **Step 1: Create `src/lib/admin/certificate-list-rows.ts`**

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ListRow } from "@/lib/certificates/sheet";

/**
 * People typed into a list group, one at a time (spec 2026-09-15 §1.4). Same
 * table as uploaded rows, so issuing treats both identically. Service role —
 * callers check the capability and that the group belongs to the event.
 */

type Person = { name: string; email: string | null; roll: string | null };

export async function getListRow(groupId: string, rowId: string): Promise<ListRow | null> {
  const { data } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("id, row_no, name, email, roll, data")
    .eq("group_id", groupId)
    .eq("id", rowId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, row_no: data.row_no, name: data.name, email: data.email, roll: data.roll, data: (data.data ?? {}) as Record<string, string> };
}

export async function countListRows(groupId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  return count ?? 0;
}

export async function addListRow(groupId: string, person: Person): Promise<{ id: string } | { error: string }> {
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("certificate_sheet_rows")
    .select("row_no")
    .eq("group_id", groupId)
    .order("row_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await admin
    .from("certificate_sheet_rows")
    .insert({ group_id: groupId, row_no: (last?.row_no ?? 0) + 1, name: person.name, email: person.email, roll: person.roll, data: {} })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add that person. Try again." };
  return { id: data.id };
}

export async function updateListRow(groupId: string, rowId: string, person: Person): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_sheet_rows")
    .update({ name: person.name, email: person.email, roll: person.roll })
    .eq("group_id", groupId)
    .eq("id", rowId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export async function removeListRow(groupId: string, rowId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_sheet_rows")
    .delete()
    .eq("group_id", groupId)
    .eq("id", rowId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Does a live certificate exist under this list identity — or a `#n` duplicate
 * of it (recipients.ts `unique`)? Conservative on purpose: a false "yes" only
 * refuses an edit, a false "no" would give one person two live certificates.
 */
export async function hasLiveListCertificate(eventId: string, groupId: string, identity: string): Promise<boolean> {
  const admin = createAdminClient();
  const key = `sheet:${groupId}:${identity}`;
  const pattern = `${key.replace(/[\\%_]/g, (c) => `\\${c}`)}#%`;
  const [exact, numbered] = await Promise.all([
    admin.from("certificates").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("revoked_at", null).eq("recipient_key", key),
    admin.from("certificates").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("revoked_at", null).like("recipient_key", pattern),
  ]);
  if (exact.error || numbered.error) throw new Error("Could not check this person's certificates.");
  return (exact.count ?? 0) + (numbered.count ?? 0) > 0;
}
```

- [ ] **Step 2: Add the three actions to `actions.ts`** (after `uploadCertificateSheetAction`)

Imports:

```ts
import {
  addListRow,
  countListRows,
  getListRow,
  hasLiveListCertificate,
  removeListRow,
  updateListRow,
} from "@/lib/admin/certificate-list-rows";
import { sheetIdentity } from "@/lib/certificates/recipients";
```

Change the sheet import to `import { buildSheetRows, SHEET_LIMITS, validateListRow, type ColumnChoice } from "@/lib/certificates/sheet";`. Merge `sheetIdentity` into the existing `import type { IssueMode } from "@/lib/certificates/recipients";` line: `import { sheetIdentity, type IssueMode } from "@/lib/certificates/recipients";`.

```ts
// ── typed list rows (spec 2026-09-15 §1.4) ─────────────────────────────────────

/** The event's list group, or null — typed rows only go into list groups. */
async function listGroupOf(eventId: string, groupId: string) {
  if (!uuid.safeParse(groupId).success) return null;
  const group = await getGroup(eventId, groupId);
  return group?.kind === "sheet" ? group : null;
}

export async function addCertificateListRowAction(input: {
  eventId: string;
  groupId: string;
  name: string;
  email: string;
  roll: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await listGroupOf(input.eventId, input.groupId);
  if (!group) return { ok: false, error: "Add people to one of this event's lists." };
  const checked = validateListRow(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  if ((await countListRows(group.id)) >= SHEET_LIMITS.rows) {
    return { ok: false, error: `${group.name} already has ${SHEET_LIMITS.rows} people.` };
  }
  const added = await addListRow(group.id, checked.row);
  if ("error" in added) return { ok: false, error: added.error };
  await writeAudit({
    actorId: auth.session.id,
    action: "create",
    entity: "certificate_sheet_row",
    entityId: added.id,
    after: { eventId: input.eventId, groupId: group.id },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

export async function updateCertificateListRowAction(input: {
  eventId: string;
  groupId: string;
  rowId: string;
  name: string;
  email: string;
  roll: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await listGroupOf(input.eventId, input.groupId);
  const row = group && uuid.safeParse(input.rowId).success ? await getListRow(group.id, input.rowId) : null;
  if (!group || !row) return { ok: false, error: "That person is no longer on the list." };
  const checked = validateListRow(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  // Identity (email, else name) is what an issued certificate is keyed by. Changing it
  // would orphan that certificate and queue a second one for the same person.
  if (sheetIdentity(row) !== sheetIdentity(checked.row)) {
    let held: boolean;
    try {
      held = await hasLiveListCertificate(input.eventId, group.id, sheetIdentity(row));
    } catch {
      return { ok: false, error: "Could not check this person's certificates. Try again." };
    }
    if (held) {
      return {
        ok: false,
        error: `${row.name} already has a certificate, so their name and email can't change here. Ask a Faculty Advisor, VP or Tech Head to revoke it first.`,
      };
    }
  }

  if (!(await updateListRow(group.id, row.id, checked.row))) return { ok: false, error: "Could not save that change. Try again." };
  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_sheet_row",
    entityId: row.id,
    after: { eventId: input.eventId, groupId: group.id },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

export async function removeCertificateListRowAction(input: {
  eventId: string;
  groupId: string;
  rowId: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await listGroupOf(input.eventId, input.groupId);
  if (!group || !uuid.safeParse(input.rowId).success) return { ok: false, error: "That person is no longer on the list." };
  if (!(await removeListRow(group.id, input.rowId))) return { ok: false, error: "That person is no longer on the list." };
  await writeAudit({
    actorId: auth.session.id,
    action: "delete",
    entity: "certificate_sheet_row",
    entityId: input.rowId,
    after: { eventId: input.eventId, groupId: group.id },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}
```

- [ ] **Step 3: Lint + typecheck + tests**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/admin/certificate-list-rows.ts "src/app/admin/(app)/events/[id]/certificates/actions.ts"
git commit -m "feat(certificates): add, edit and remove list people by hand; identity locks once issued

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `PageSvg` and the read-only `CertificatePreview`

**Files:**
- Create: `src/components/admin/certificates/PageSvg.tsx`
- Create: `src/components/admin/certificates/CertificatePreview.tsx`, `src/components/admin/certificates/CertificatePreview.test.tsx`
- Modify: `src/components/admin/certificates/Canvas.tsx` (≈lines 1–45 imports/constant, ≈171–206 svg block)
- Modify: `src/components/admin/certificates/DesignerLoader.tsx`
- Modify: `src/app/globals.css` (certificate designer section, after `.cd-copy`)

**Interfaces:**
- Consumes: `BaseSummary` (Task 2); `PreviewRecipient` (existing, `CertificateDesigner.tsx`)
- Produces:
  - `PageSvg(props: { design: Design; layouts: ReadonlyMap<string, TextLayout>; assetUrls: Record<string, string>; skipId?: string | null; width?: number | string; height?: number | string; children?: ReactNode })`
  - `CertificatePreview(props: CertificatePreviewProps)` with `CertificatePreviewProps = { eventId: string; groupId: string; design: Design; assetUrls: Record<string, string>; catalogue: FieldGroup[]; previewRecipients: PreviewRecipient[]; base: BaseSummary; onCustomise: () => void; offline?: boolean }`
  - `CertificatePreviewLoader` (dynamic, client-only) exported from `DesignerLoader.tsx`

- [ ] **Step 1: Write the failing test** — `CertificatePreview.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_STYLE, assetKey, type AssetRef, type Design } from "@/lib/certificates/design";
import { buildFieldCatalogue } from "@/lib/certificates/fields";
import { CertificatePreview } from "./CertificatePreview";

const TEMPLATE: AssetRef = {
  bucket: "certificate-assets",
  path: "00000000-0000-0000-0000-000000000000/11111111-1111-4111-8111-111111111111.png",
  type: "png",
  widthPx: 3508,
  heightPx: 2480,
};

const design: Design = {
  v: 1,
  page: { template: TEMPLATE, widthPx: 3508, heightPx: 2480 },
  elements: [
    {
      id: "name", name: "Name", type: "text", x: 20, y: 40, w: 60, h: 9, locked: false, hidden: false,
      align: "center", lineHeight: 1.2, fit: "shrink",
      paragraphs: [{ runs: [{ kind: "field", field: "person.name", transform: "none", style: { ...DEFAULT_STYLE, sizePct: 6 } }] }],
    },
  ],
};

const render = (over: Partial<Parameters<typeof CertificatePreview>[0]> = {}) =>
  renderToStaticMarkup(
    <CertificatePreview
      eventId="e1"
      groupId="g1"
      design={design}
      assetUrls={{ [assetKey(TEMPLATE)]: "https://example.test/t.png" }}
      catalogue={buildFieldCatalogue({ formSchema: [] })}
      previewRecipients={[{ key: "reg:1", name: "Asha R", values: { "person.name": "Asha R" } }]}
      base={{ kind: "participants", label: "Participants", exists: true, sourceEventTitle: "Hack Night 2026", updatedAt: "2026-09-12T10:00:00Z" }}
      onCustomise={() => {}}
      {...over}
    />,
  );

describe("CertificatePreview", () => {
  it("shows the certificate filled with the first real person, on the template", () => {
    const html = render();
    expect(html).toContain('href="https://example.test/t.png"');
    expect(html).toContain("Asha R");
    expect(html).not.toContain("{Name}");
  });

  it("says where the base came from and offers Customise", () => {
    const html = render();
    expect(html).toContain("Council base");
    expect(html).toContain("saved from Hack Night 2026 on 12 September 2026");
    expect(html).toContain("Customise");
  });

  it("drops the source event when it was deleted", () => {
    const html = render({ base: { kind: "participants", label: "Participants", exists: true, sourceEventTitle: null, updatedAt: "2026-09-12T10:00:00Z" } });
    expect(html).toContain("saved 12 September 2026");
    expect(html).not.toContain("saved from");
  });

  it("is read-only: no hit boxes or resize handles", () => {
    const html = render();
    expect(html).not.toContain("cd-hit");
    expect(html).not.toContain("cd-handle");
  });

  it("shows field names when there is nobody to preview as", () => {
    expect(render({ previewRecipients: [] })).toContain("{Name}");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/admin/certificates/CertificatePreview.test.tsx`
Expected: FAIL — `Failed to resolve import "./CertificatePreview"`.

- [ ] **Step 3: Create `PageSvg.tsx`** (moves the SVG block and QR sample text out of `Canvas.tsx`)

```tsx
import type { ReactNode } from "react";
import { assetKey, type Design } from "@/lib/certificates/design";
import type { TextLayout } from "@/lib/certificates/layout";
import { SAMPLE_SERIAL, verifyUrl } from "@/lib/certificates/qr";
import { pctToPx } from "./geometry";
import { QrSvg } from "./QrSvg";
import { TextSvg } from "./TextSvg";

/**
 * What a QR encodes on a real certificate, with a placeholder serial of the real
 * length, so the preview has the printed density. The editor and preview only run
 * in the browser, so the page's own origin stands in when the env var isn't set.
 */
export const SAMPLE_QR_TEXT = verifyUrl(
  process.env.NEXT_PUBLIC_SITE_URL || (typeof window === "undefined" ? "" : window.location.origin),
  SAMPLE_SERIAL,
);

/**
 * The page as drawn: template, images, QR and laid-out text. Pure rendering —
 * the editor's Canvas lays its hit boxes and handles over this, the read-only
 * preview shows it alone. `layouts` comes from `layoutText` so both agree with the PDF.
 */
export function PageSvg({
  design,
  layouts,
  assetUrls,
  skipId = null,
  width,
  height,
  children,
}: {
  design: Design;
  layouts: ReadonlyMap<string, TextLayout>;
  assetUrls: Record<string, string>;
  /** An element drawn elsewhere (the text being typed into). */
  skipId?: string | null;
  width?: number | string;
  height?: number | string;
  children?: ReactNode;
}) {
  const page = design.page;
  const templateUrl = page.template ? assetUrls[assetKey(page.template)] : undefined;
  return (
    <svg className="cd-svg" viewBox={`0 0 ${page.widthPx} ${page.heightPx}`} width={width} height={height}>
      <rect width={page.widthPx} height={page.heightPx} fill="#ffffff" />
      {templateUrl ? (
        <image href={templateUrl} x={0} y={0} width={page.widthPx} height={page.heightPx} preserveAspectRatio="none" />
      ) : null}
      {design.elements.map((el) => {
        if (el.hidden || el.id === skipId) return null;
        if (el.type === "image") {
          const r = pctToPx(el, page);
          const url = assetUrls[assetKey(el.asset)];
          return url ? (
            <image key={el.id} href={url} x={r.x} y={r.y} width={r.w} height={r.h} opacity={el.opacity} preserveAspectRatio="none" />
          ) : (
            <rect key={el.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="#eeeeee" />
          );
        }
        if (el.type === "qr") {
          return <QrSvg key={el.id} box={pctToPx(el, page)} color={el.color} text={SAMPLE_QR_TEXT} />;
        }
        const layout = layouts.get(el.id);
        return layout ? <TextSvg key={el.id} layout={layout} /> : null;
      })}
      {children}
    </svg>
  );
}
```

- [ ] **Step 4: Make `Canvas.tsx` use it**

Remove from `Canvas.tsx` the `SAMPLE_QR_TEXT` constant with its comment, and the imports of `SAMPLE_SERIAL, verifyUrl`, `QrSvg` and `TextSvg`. Remove `assetKey` from the design import if it is now unused, and the `templateUrl` const. Add `import { PageSvg } from "./PageSvg";`. Replace the whole `<svg className="cd-svg" …>…</svg>` block with:

```tsx
      <PageSvg
        design={design}
        layouts={layouts}
        assetUrls={assetUrls}
        skipId={editingId}
        width={page.widthPx * zoom}
        height={page.heightPx * zoom}
      >
        {guides.map((g, i) =>
          g.axis === "x" ? (
            <line key={i} className="cd-guide" x1={g.at} x2={g.at} y1={0} y2={page.heightPx} vectorEffect="non-scaling-stroke" />
          ) : (
            <line key={i} className="cd-guide" x1={0} x2={page.widthPx} y1={g.at} y2={g.at} vectorEffect="non-scaling-stroke" />
          ),
        )}
      </PageSvg>
```

- [ ] **Step 5: Create `CertificatePreview.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { BaseSummary } from "@/lib/certificates/bases";
import type { Design } from "@/lib/certificates/design";
import { fieldNameValue, formatIstDate, type FieldGroup } from "@/lib/certificates/fields";
import { fontFaceCss } from "@/lib/certificates/fonts";
import { layoutText, type TextLayout } from "@/lib/certificates/layout";
import { METRICS } from "@/lib/certificates/metrics";
import type { PreviewRecipient } from "./CertificateDesigner";
import { PageSvg } from "./PageSvg";

const FONT_CSS = fontFaceCss();

export interface CertificatePreviewProps {
  eventId: string;
  groupId: string;
  design: Design;
  assetUrls: Record<string, string>;
  catalogue: FieldGroup[];
  previewRecipients: PreviewRecipient[];
  base: BaseSummary;
  onCustomise: () => void;
  /** Dev harness only: no PDF download. */
  offline?: boolean;
}

/**
 * A group that follows its council base opens here, not in the editor (spec
 * 2026-09-15 §1.2): the certificate as it will print, filled with a real person,
 * and one button to customise it for this event. Unlike the editor it works on
 * a phone — it is just the page, scaled to the width.
 */
export function CertificatePreview(props: CertificatePreviewProps) {
  const { design, base } = props;
  const [previewKey, setPreviewKey] = useState(props.previewRecipients[0]?.key ?? "");
  const values = props.previewRecipients.find((r) => r.key === previewKey)?.values;
  const valueFor = useMemo(
    () => (values ? (key: string) => values[key] ?? "" : fieldNameValue(props.catalogue)),
    [values, props.catalogue],
  );
  const layouts = useMemo(() => {
    const map = new Map<string, TextLayout>();
    for (const el of design.elements) {
      if (el.type === "text") map.set(el.id, layoutText(el, valueFor, design.page, METRICS));
    }
    return map;
  }, [design, valueFor]);

  const saved = base.updatedAt ? formatIstDate(base.updatedAt) : null;
  const provenance = base.sourceEventTitle ? `saved from ${base.sourceEventTitle} on ${saved}` : saved ? `saved ${saved}` : null;
  const pdfHref = `/api/admin/events/${props.eventId}/certificates/preview?group=${props.groupId}&recipient=${encodeURIComponent(previewKey)}`;

  return (
    <div className="cd-preview">
      <style>{FONT_CSS}</style>
      <div className="cd-base-banner">
        <p className="body-text">
          <strong>● Council base</strong>
          {provenance ? <span className="hint"> · {provenance}</span> : null}
          <br />
          <span className="hint">
            Stays in step with the council: when they edit the {base.label} base, this event&rsquo;s certificates change too.
          </span>
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={props.onCustomise}>
          Customise
        </button>
      </div>

      <div className="cd-preview-page">
        <PageSvg design={design} layouts={layouts} assetUrls={props.assetUrls} width="100%" />
      </div>

      <div className="stack cd-preview-actions">
        <label className="cd-inline">
          Preview as
          <select value={previewKey} onChange={(e) => setPreviewKey(e.target.value)}>
            <option value="">Field names</option>
            {props.previewRecipients.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name || r.key}
              </option>
            ))}
          </select>
        </label>
        {previewKey && !props.offline ? (
          <a className="btn btn-ghost btn-sm" href={pdfHref} target="_blank" rel="noopener">
            Download preview PDF
          </a>
        ) : (
          <span className="hint">Pick a person to download their preview PDF.</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Export a dynamic loader** — replace `DesignerLoader.tsx` with:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { CertificateDesignerProps } from "./CertificateDesigner";
import type { CertificatePreviewProps } from "./CertificatePreview";

// The editor (TipTap, font metrics) is browser-only and heavy: load it on this page, on the client.
const CertificateDesigner = dynamic(() => import("./CertificateDesigner").then((m) => m.CertificateDesigner), {
  ssr: false,
  loading: () => <div className="cal-empty">Loading the certificate designer…</div>,
});

// The preview needs the same font metrics, so it loads the same way.
const CertificatePreview = dynamic(() => import("./CertificatePreview").then((m) => m.CertificatePreview), {
  ssr: false,
  loading: () => <div className="cal-empty">Loading the certificate…</div>,
});

export function DesignerLoader(props: CertificateDesignerProps) {
  return <CertificateDesigner {...props} />;
}

export function CertificatePreviewLoader(props: CertificatePreviewProps) {
  return <CertificatePreview {...props} />;
}
```

- [ ] **Step 7: CSS** — in `globals.css`, after the `.cd-copy { margin-top: 14px; }` line, add:

```css
  /* Base preview (a group following its council base) — responsive, unlike the editor. */
  .cd-preview { display: grid; gap: 12px; }
  .cd-base-banner {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border: 1px solid var(--line-3);
    border-radius: var(--r-md);
    background: var(--sand);
  }
  .cd-base-banner p { margin: 0; flex: 1 1 18rem; min-width: 0; }
  .cd-preview-page {
    border: 1px solid var(--line-2);
    border-radius: var(--r-md);
    background: var(--card);
    padding: 8px;
  }
  .cd-preview-page .cd-svg { width: 100%; height: auto; }
  .cd-preview-actions { align-items: center; }
  .cd-badge { font: 500 11px var(--sans); color: var(--ink-3); }
```

- [ ] **Step 8: Run the tests, including the fidelity tests that cover Canvas's SVG output**

Run: `npx vitest run src/components/admin/certificates src/lib/certificates`
Expected: PASS (`layout-fidelity` and `qr-fidelity` stay green).

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/certificates/PageSvg.tsx src/components/admin/certificates/CertificatePreview.tsx src/components/admin/certificates/CertificatePreview.test.tsx src/components/admin/certificates/Canvas.tsx src/components/admin/certificates/DesignerLoader.tsx src/app/globals.css
git commit -m "feat(certificates): read-only certificate preview for groups on a council base

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Editor save controls, DesignTab, group badges, page wiring

**Files:**
- Create: `src/components/admin/certificates/SaveAsBasePanel.tsx`, `src/components/admin/certificates/DesignTab.tsx`
- Modify: `src/components/admin/certificates/CertificateDesigner.tsx`
- Modify: `src/components/admin/certificates/GroupBar.tsx`
- Modify: `src/app/admin/(app)/events/[id]/certificates/page.tsx`
- Modify: `src/components/admin/certificates/DesignerHarness.tsx` (new required props, so it still compiles)

**Interfaces:**
- Consumes: `saveCertificateBaseAction`, `resetCertificateGroupToBaseAction` (Task 6); `CertificatePreviewLoader` (Task 8); `savableBases`, `BaseKind`, `BaseSummary`, `BaseImpact`, `baseImpactText`, `BASE_LABEL` (Task 2); `baseImpact` (Task 4); `ws.bases`, `group.baseKind`, `group.followsBase` (Task 5)
- Produces:
  - `CertificateDesignerProps` gains `baseKind: BaseKind | null; followsBase: boolean; bases: Record<BaseKind, BaseSummary>; savableBases: BaseKind[]; baseImpact: Partial<Record<BaseKind, BaseImpact>>; onCancel?: () => void`
  - `DesignTab(props: Omit<CertificateDesignerProps, "onCancel">)`
  - `GroupSummary` gains `baseKind: BaseKind | null; followsBase: boolean`

- [ ] **Step 1: Create `SaveAsBasePanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { BASE_LABEL, baseImpactText, type BaseImpact, type BaseKind, type BaseSummary } from "@/lib/certificates/bases";

/** Pick which council bases this design becomes, see who it reaches, confirm (spec 2026-09-15 §1.3, §5). */
export function SaveAsBasePanel({
  savable,
  defaultKind,
  bases,
  impact,
  busy,
  onSave,
  onClose,
}: {
  savable: BaseKind[];
  defaultKind: BaseKind | null;
  bases: Record<BaseKind, BaseSummary>;
  impact: Partial<Record<BaseKind, BaseImpact>>;
  busy: boolean;
  onSave: (targets: BaseKind[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<BaseKind[]>(defaultKind && savable.includes(defaultKind) ? [defaultKind] : []);
  const toggle = (kind: BaseKind) =>
    setPicked((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));

  return (
    <div className="cd-confirm" style={{ marginTop: 10 }}>
      <p className="body-text">
        <strong>Save this design as a council base.</strong> Every event that hasn&rsquo;t customised that group uses it.
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
        <legend className="label">Save as</legend>
        {savable.map((kind) => (
          <label key={kind} className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={picked.includes(kind)} onChange={() => toggle(kind)} style={{ width: "auto" }} />
            <span>
              {BASE_LABEL[kind]} base
              {picked.includes(kind) ? <span className="hint"> — {baseImpactText(impact[kind], bases[kind].exists)}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="hint">Certificates already issued keep the design they were issued with.</p>
      <div className="stack">
        <button type="button" className="btn btn-accent btn-sm" disabled={busy || picked.length === 0} onClick={() => onSave(picked)}>
          {busy ? "Saving…" : "Save as base"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Extend `CertificateDesigner.tsx`**

Imports: add `resetCertificateGroupToBaseAction, saveCertificateBaseAction` to the actions import; add `import { BASE_LABEL, type BaseImpact, type BaseKind, type BaseSummary } from "@/lib/certificates/bases";` and `import { SaveAsBasePanel } from "./SaveAsBasePanel";`.

Add to `CertificateDesignerProps` (before `offline?`):

```ts
  /** The council base slot this group fills; null for an extra group. */
  baseKind: BaseKind | null;
  /** True while the group has no design of its own (spec 2026-09-15 D2). */
  followsBase: boolean;
  bases: Record<BaseKind, BaseSummary>;
  /** Bases this admin may overwrite — empty for anyone but council-wide admins. */
  savableBases: BaseKind[];
  baseImpact: Partial<Record<BaseKind, BaseImpact>>;
  /** Back to the base preview without saving (a following group being customised). */
  onCancel?: () => void;
```

Change `type Busy = "upload" | "preview" | "copy" | null;` to `type Busy = "upload" | "preview" | "copy" | "base" | "reset" | null;`. After the `confirmCopy` state add:

```ts
  const [baseOpen, setBaseOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const baseExists = props.baseKind ? props.bases[props.baseKind].exists : false;
```

After `save()` add:

```ts
  async function saveAsBase(targets: BaseKind[]) {
    if (props.offline) {
      setMessage({ tone: "error", text: "Saving only works on the real admin page." });
      return;
    }
    const sent = state.design;
    setBusy("base");
    setMessage(null);
    const res = await saveCertificateBaseAction({ eventId, groupId, design: sent, targets });
    setBusy(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    setBaseOpen(false);
    // The group now follows the base it was saved as, so there is nothing left unsaved for it.
    if (res.groupFollows && latestDesign.current === sent) dispatch({ type: "markSaved" });
    setMessage({ tone: "ok", text: `Saved as the ${targets.map((k) => BASE_LABEL[k]).join(" and ")} base.` });
  }

  async function resetToBase() {
    setConfirmReset(false);
    setBusy("reset");
    setMessage(null);
    const res = await resetCertificateGroupToBaseAction({ eventId, groupId });
    setBusy(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    dispatch({ type: "markSaved" });
  }

  function cancelCustomise() {
    if (state.dirty) {
      setConfirmDiscard(true);
      return;
    }
    props.onCancel?.();
  }
```

In the toolbar's last `.stack`, replace the single Save button with:

```tsx
            <button type="button" className="btn btn-primary btn-sm" disabled={!state.dirty || saving || props.offline} onClick={save}>
              {saving ? "Saving…" : state.dirty ? "Save for this event" : "Saved"}
            </button>
            {props.savableBases.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={baseOpen}
                // Not disabled offline: the dev harness needs to open the panel. saveAsBase refuses instead.
                disabled={busy !== null}
                onClick={() => setBaseOpen((open) => !open)}
              >
                Save as base ▾
              </button>
            ) : null}
            {props.followsBase && props.onCancel ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={cancelCustomise}>
                Cancel
              </button>
            ) : props.baseKind && !props.followsBase && baseExists ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || props.offline} onClick={() => setConfirmReset(true)}>
                Reset to base
              </button>
            ) : null}
```

Directly after the closing `</div>` of `.cd-toolbar` (before the hidden file inputs), add:

```tsx
        {baseOpen ? (
          <SaveAsBasePanel
            savable={props.savableBases}
            defaultKind={props.baseKind}
            bases={props.bases}
            impact={props.baseImpact}
            busy={busy === "base"}
            onSave={saveAsBase}
            onClose={() => setBaseOpen(false)}
          />
        ) : null}
        {confirmReset ? (
          <div className="cd-confirm" style={{ marginTop: 10 }}>
            <p className="body-text">
              This group&rsquo;s custom design will be discarded. Certificates already issued keep the design they were issued with.
            </p>
            <div className="stack">
              <button type="button" className="btn btn-accent btn-sm" onClick={resetToBase}>
                Reset to base
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                Keep my design
              </button>
            </div>
          </div>
        ) : null}
        {confirmDiscard ? (
          <div className="cd-confirm" style={{ marginTop: 10 }}>
            <p className="body-text">Discard your changes? This group keeps following the council base.</p>
            <div className="stack">
              <button type="button" className="btn btn-accent btn-sm" onClick={() => { setConfirmDiscard(false); props.onCancel?.(); }}>
                Discard
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </button>
            </div>
          </div>
        ) : null}
        {props.baseKind && props.followsBase && !baseExists ? (
          <p className="note" style={{ marginTop: 10 }}>
            No council base yet for {props.bases[props.baseKind].label}. Design it here
            {props.savableBases.includes(props.baseKind) ? ", then Save as base so every event can use it." : " and save it for this event."}
          </p>
        ) : null}
```

Change the existing template hint `Start by uploading your base certificate template (PNG or JPEG, up to 8 MB).` to `Start by uploading a certificate template (PNG or JPEG, up to 8 MB).` It is no longer the "base" in the council sense.

- [ ] **Step 3: Create `DesignTab.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { CertificateDesignerProps } from "./CertificateDesigner";
import { CertificatePreviewLoader, DesignerLoader } from "./DesignerLoader";

/**
 * The Design tab for one group (spec 2026-09-15 §1.2): a group following a saved
 * council base opens as the certificate itself; Customise opens the editor.
 * Anything else — a custom group, or a base nobody has saved yet — opens straight
 * in the editor.
 */
export function DesignTab(props: Omit<CertificateDesignerProps, "onCancel">) {
  const base = props.baseKind ? props.bases[props.baseKind] : null;
  const previewable = props.followsBase && !!base?.exists;
  const [mode, setMode] = useState<"preview" | "edit">(previewable ? "preview" : "edit");

  if (mode === "preview" && base) {
    return (
      <CertificatePreviewLoader
        eventId={props.eventId}
        groupId={props.groupId}
        design={props.initialDesign}
        assetUrls={props.initialAssetUrls}
        catalogue={props.catalogue}
        previewRecipients={props.previewRecipients}
        base={base}
        offline={props.offline}
        onCustomise={() => setMode("edit")}
      />
    );
  }
  return <DesignerLoader {...props} onCancel={previewable ? () => setMode("preview") : undefined} />;
}
```

- [ ] **Step 4: `GroupBar.tsx` — badges and slot rules**

Add `import type { BaseKind } from "@/lib/certificates/bases";` and extend `GroupSummary`:

```ts
export interface GroupSummary {
  id: string;
  name: string;
  kind: "participants" | "sheet";
  people: number;
  /** The council base slot this group fills; null for an extra group. */
  baseKind: BaseKind | null;
  followsBase: boolean;
}
```

Change the chip content from `{group.name} · {group.people}` to:

```tsx
            {group.name} · {group.people}{" "}
            <span className="cd-badge">{group.followsBase ? "● Base" : "◆ Custom"}</span>
```

Change the Rename/Delete condition from `active?.kind === "sheet" && !renaming` to `active && active.baseKind === null && !renaming`. In `remove()`, change the fallback to `go(groups.find((g) => g.baseKind === "participants")?.id ?? groups[0].id);`.

- [ ] **Step 5: Wire the page** — in `page.tsx`

Imports: add `import { savableBases } from "@/lib/certificates/bases";`, `import { baseImpact } from "@/lib/admin/certificate-bases";`, `import { DesignTab } from "@/components/admin/certificates/DesignTab";`; remove the `DesignerLoader` import.

After `const sources = …`:

```tsx
  const savable = savableBases(session);
  const impact = tab === "design" && savable.length > 0 ? await baseImpact(savable, id) : {};
```

In `groupSummaries`, add `baseKind: group.baseKind,` and `followsBase: group.followsBase,`.

Replace the `<DesignerLoader … />` element with:

```tsx
          <DesignTab
            // Remount when the group switches between following and custom, or its base changes,
            // so it opens in the right mode with the right design.
            key={`${ws.group.id}:${ws.group.followsBase ? "base" : "custom"}:${ws.group.baseKind ? ws.bases[ws.group.baseKind].updatedAt ?? "" : ""}`}
            eventId={id}
            groupId={ws.group.id}
            initialDesign={ws.editableDesign}
            initialAssetUrls={ws.assetUrls}
            catalogue={ws.catalogue}
            previewRecipients={ws.recipients
              .filter((r) => r.groupId === ws.group.id)
              .map((r) => ({ key: r.key, name: r.name, values: r.values }))}
            issuedCount={ws.counts.issued}
            designSources={sources}
            baseKind={ws.group.baseKind}
            followsBase={ws.group.followsBase}
            bases={ws.bases}
            savableBases={savable}
            baseImpact={impact}
          />
```

- [ ] **Step 6: Keep the harness compiling** — in `DesignerHarness.tsx`

Add the new props to the `<DesignerLoader …>` element (Task 11 adds the base panels):

```tsx
      baseKind={null}
      followsBase={false}
      bases={NO_BASES}
      savableBases={[]}
      baseImpact={{}}
```

and near the top:

```tsx
import { summarizeBases } from "@/lib/certificates/bases";
const NO_BASES = summarizeBases(new Map());
```

- [ ] **Step 7: Gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/certificates/SaveAsBasePanel.tsx src/components/admin/certificates/DesignTab.tsx src/components/admin/certificates/CertificateDesigner.tsx src/components/admin/certificates/GroupBar.tsx src/components/admin/certificates/DesignerHarness.tsx "src/app/admin/(app)/events/[id]/certificates/page.tsx"
git commit -m "feat(certificates): open on the base, Customise, Save for this event, Save as base, Reset to base

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `ListEditor` and the upload's roll column

**Files:**
- Create: `src/components/admin/certificates/ListEditor.tsx`
- Modify: `src/components/admin/certificates/SheetUpload.tsx`
- Modify: `src/components/admin/certificates/GroupBar.tsx`
- Modify: `src/app/admin/(app)/events/[id]/certificates/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `addCertificateListRowAction`, `updateCertificateListRowAction`, `removeCertificateListRowAction` (Task 7); `validateListRow`, `ListRow`, `ColumnChoice` (Task 3); `ws.listRows` (Task 5)
- Produces: `ListEditor(props: { eventId: string; groupId: string; groupName: string; rows: ListRow[]; offline?: boolean })`; `SheetUpload` gains `replaceCount: number`; `GroupBar` gains `listRows: ListRow[]`

- [ ] **Step 1: `SheetUpload.tsx` — roll column and the replace warning**

Change the signature to:

```tsx
export function SheetUpload({
  eventId,
  groupId,
  groupName,
  replaceCount,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  /** People already in the list — an upload replaces them. */
  replaceCount: number;
}) {
```

After the Email column `<label>`, add a third select:

```tsx
            <label className="cd-row">
              <span>Roll no. column</span>
              <select
                value={choice.roll ?? ""}
                onChange={(e) => setChoice((c) => ({ ...c, roll: e.target.value === "" ? null : Number(e.target.value) }))}
              >
                <option value="">None</option>
                {headings.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
```

In the preview `<th>`, after the email marker, add `{i === choice.roll ? " · roll" : ""}`. Directly above the `Use this list` button's `.stack`, add:

```tsx
          {replaceCount > 0 ? (
            <p className="note">
              This replaces the {replaceCount} {replaceCount === 1 ? "person" : "people"} already in {groupName}.
            </p>
          ) : null}
```

Change the button label from `"Upload list"` to `"Upload a list"`, and the hint to: `CSV or Excel, up to {SHEET_LIMITS.rows} people. Uploading replaces the list; certificates already issued stay.`

- [ ] **Step 2: Create `ListEditor.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  addCertificateListRowAction,
  removeCertificateListRowAction,
  updateCertificateListRowAction,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import { validateListRow, type ListRow } from "@/lib/certificates/sheet";
import { SheetUpload } from "./SheetUpload";

type Draft = { name: string; email: string; roll: string };
const EMPTY: Draft = { name: "", email: "", roll: "" };

/**
 * The people in a list group — Volunteers, Judges — typed in one at a time
 * (spec 2026-09-15 §1.4), with the file upload alongside for long lists. Event
 * details fill in on their certificates like everyone else's.
 */
export function ListEditor({
  eventId,
  groupId,
  groupName,
  rows,
  offline,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  rows: ListRow[];
  offline?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after: () => void) {
    if (offline) {
      setMessage({ tone: "error", text: "Saving only works on the real admin page." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await work();
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    after();
    setMessage({ tone: "ok", text: done });
  }

  function add() {
    const checked = validateListRow(draft);
    if (!checked.ok) {
      setMessage({ tone: "error", text: checked.error });
      return;
    }
    void run(() => addCertificateListRowAction({ eventId, groupId, ...draft }), `Added ${checked.row.name}.`, () => setDraft(EMPTY));
  }

  function saveEdit() {
    if (!editing) return;
    const checked = validateListRow(editing.draft);
    if (!checked.ok) {
      setMessage({ tone: "error", text: checked.error });
      return;
    }
    const { id, draft: next } = editing;
    void run(() => updateCertificateListRowAction({ eventId, groupId, rowId: id, ...next }), "Saved.", () => setEditing(null));
  }

  function remove(row: ListRow) {
    setConfirmRemove(null);
    void run(() => removeCertificateListRowAction({ eventId, groupId, rowId: row.id }), `Removed ${row.name}.`, () => {});
  }

  const field = (value: string, label: string, onChange: (v: string) => void, type = "text") => (
    <input type={type} value={value} aria-label={label} placeholder={label} maxLength={500} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="cd-list">
      {rows.length > 0 ? (
        <div className="tablewrap cards">
          <table className="admin">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Roll no.</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) =>
                editing?.id === row.id ? (
                  <tr key={row.id}>
                    <td data-label="#" data-index="">{i + 1}</td>
                    <td data-label="Name">{field(editing.draft.name, "Name", (name) => setEditing({ id: row.id, draft: { ...editing.draft, name } }))}</td>
                    <td data-label="Email">{field(editing.draft.email, "Email", (email) => setEditing({ id: row.id, draft: { ...editing.draft, email } }), "email")}</td>
                    <td data-label="Roll no.">{field(editing.draft.roll, "Roll no.", (roll) => setEditing({ id: row.id, draft: { ...editing.draft, roll } }))}</td>
                    <td className="cd-actions-cell" data-action="">
                      <div className="stack">
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={saveEdit}>
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td data-label="#" data-index="">{i + 1}</td>
                    <td data-primary="" style={{ fontWeight: 500 }}>{row.name}</td>
                    <td data-label="Email">{row.email ?? "—"}</td>
                    <td data-label="Roll no.">{row.roll ?? "—"}</td>
                    <td className="cd-actions-cell" data-action="">
                      {confirmRemove === row.id ? (
                        <div className="stack">
                          <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={() => remove(row)}>
                            Remove
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="stack">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => setEditing({ id: row.id, draft: { name: row.name, email: row.email ?? "", roll: row.roll ?? "" } })}
                          >
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmRemove(row.id)}>
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">Nobody in {groupName} yet. Type people in below, or upload a list.</p>
      )}
      {confirmRemove ? (
        <p className="hint">Certificates already issued to them stay valid.</p>
      ) : null}

      <form
        className="cd-list-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        {field(draft.name, "Name", (name) => setDraft((d) => ({ ...d, name })))}
        {field(draft.email, "Email", (email) => setDraft((d) => ({ ...d, email })), "email")}
        {field(draft.roll, "Roll no.", (roll) => setDraft((d) => ({ ...d, roll })))}
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.name.trim()}>
          + Add
        </button>
      </form>

      {message ? (
        <p className="label" role="status" style={{ color: message.tone === "ok" ? "var(--forest)" : "var(--rust)" }}>
          {message.text}
        </p>
      ) : null}

      {offline ? null : <SheetUpload eventId={eventId} groupId={groupId} groupName={groupName} replaceCount={rows.length} />}
    </div>
  );
}
```

- [ ] **Step 3: `GroupBar.tsx` shows the list editor**

Add `import type { ListRow } from "@/lib/certificates/sheet";` and `import { ListEditor } from "./ListEditor";`, and remove the `SheetUpload` import. Add `listRows` to the props (`listRows: ListRow[];` in the type, and destructure it). Replace the `SheetUpload` block with:

```tsx
      {active?.kind === "sheet" ? (
        <ListEditor key={active.id} eventId={eventId} groupId={active.id} groupName={active.name} rows={listRows} />
      ) : null}
```

- [ ] **Step 4: Page passes the rows** — in `page.tsx`, change the `<GroupBar … />` element to add `listRows={ws.listRows}`.

- [ ] **Step 5: CSS** — in `globals.css`, after `.cd-upload { display: grid; gap: 10px; }`, add:

```css
  .cd-list { display: grid; gap: 10px; }
  .cd-list-add { display: grid; grid-template-columns: 2fr 2fr 1fr auto; gap: 8px; align-items: center; }
  .cd-list input {
    width: 100%;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--line-3);
    border-radius: 8px;
    background: var(--paper-2);
    color: var(--ink);
    font: 400 13px var(--sans);
  }
  @media (max-width: 720px) {
    .cd-list-add { grid-template-columns: 1fr; }
    /* 16px stops iOS Safari zooming the page when an input takes focus. */
    .cd-list input { font-size: 16px; min-height: 44px; }
  }
```

- [ ] **Step 6: Gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/certificates/ListEditor.tsx src/components/admin/certificates/SheetUpload.tsx src/components/admin/certificates/GroupBar.tsx "src/app/admin/(app)/events/[id]/certificates/page.tsx" src/app/globals.css
git commit -m "feat(certificates): type volunteers in by hand with name, email and roll no.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Dev harness panels and browser check

**Files:**
- Modify: `src/components/admin/certificates/DesignerHarness.tsx`
- Modify: `src/app/dev/certificate-designer/page.tsx`

**Interfaces:**
- Consumes: `DesignTab` (Task 9), `ListEditor` (Task 10), `summarizeBases` (Task 2)
- Produces: `BaseHarness` and `ListHarness` components, plus harness panels `?panel=base` and `?panel=list`

- [ ] **Step 1: Add harness components** — append to `DesignerHarness.tsx`

```tsx
const SAVED_BASES = summarizeBases(
  new Map<BaseKind, BaseDesign>([
    ["participants", { kind: "participants", design, sourceEventTitle: "Hack Night 2026", updatedAt: "2026-09-12T10:00:00Z" }],
  ]),
);

/** A Participants group following a saved council base, as a council admin sees it. */
export function BaseHarness() {
  return (
    <DesignTab
      eventId="00000000-0000-4000-8000-000000000000"
      groupId="00000000-0000-4000-8000-00000000000b"
      initialDesign={design}
      initialAssetUrls={{ [assetKey(TEMPLATE)]: svgUrl(TEMPLATE_SVG), [assetKey(LOGO)]: svgUrl(LOGO_SVG) }}
      catalogue={catalogue}
      previewRecipients={people}
      issuedCount={0}
      designSources={[]}
      baseKind="participants"
      followsBase
      bases={SAVED_BASES}
      savableBases={["participants", "volunteers"]}
      baseImpact={{ participants: { following: 9, withLive: 2 } }}
      offline
    />
  );
}

/** A Volunteers list with typed people. */
export function ListHarness() {
  return (
    <ListEditor
      eventId="00000000-0000-4000-8000-000000000000"
      groupId="00000000-0000-4000-8000-00000000000c"
      groupName="Volunteers"
      rows={[
        { id: "r1", row_no: 1, name: "Asha R", email: "asha@example.test", roll: "VTU27001", data: {} },
        { id: "r2", row_no: 2, name: "Karthik S", email: null, roll: "VTU27044", data: {} },
      ]}
      offline
    />
  );
}
```

Add the imports `import { DesignTab } from "./DesignTab";` and `import { ListEditor } from "./ListEditor";`, and widen the Task 9 bases import to `import { summarizeBases, type BaseDesign, type BaseKind } from "@/lib/certificates/bases";`.

In `src/app/dev/certificate-designer/page.tsx`, add `{ id: "base", label: "Base preview" }` and `{ id: "list", label: "Volunteers list" }` to `PANELS`. Import `BaseHarness` and `ListHarness` from the harness file, and extend the render:

```tsx
      {active === "recipients" ? <RecipientsHarness /> : active === "issue" ? <IssueHarness /> : active === "base" ? <BaseHarness /> : active === "list" ? <ListHarness /> : <DesignerHarness />}
```

Wrap `ListHarness` output in `<div className="cd-groups">` so it gets the group bar's input styles: return `<div className="cd-groups"><ListEditor … /></div>`.

- [ ] **Step 2: Start the dev server** (background)

Run: `npm run dev` with `run_in_background: true`. Wait until it prints `Ready`.

- [ ] **Step 3: Check in the browser** (claude-in-chrome; load the core tool set in one ToolSearch)

At `http://localhost:3000/dev/certificate-designer?panel=base`, 1280 px wide:
1. The banner reads "● Council base · saved from Hack Night 2026 on 12 September 2026", and the certificate shows "Asha R" (title case) on the template.
2. "Preview as → Field names" shows `{Name}`.
3. **Customise** opens the editor; the toolbar shows "Saved" (disabled), "Save as base ▾" and "Cancel".
4. Nudge an element (select it, press ArrowRight). "Save for this event" becomes enabled. **Cancel** shows "Discard your changes?"; **Discard** returns to the preview.
5. Customise again → **Save as base ▾**: Participants is ticked, and its hint reads "Used by 9 events. 2 of them have issued certificates that will show as outdated." Ticking Volunteers shows "Every event without a custom design will use this."

Resize to 400 px wide: the preview banner and certificate fit with no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`).

At `?panel=list`, 1280 px: two rows show, and Karthik's email is "—". At 400 px the rows read as cards. Type a name plus the email `kim@gmail` and press **+ Add**: "That email doesn't look right." shows, and nothing is sent.

Fix anything that fails and re-check. Take a screenshot of each panel at both widths for the STATUS block.

- [ ] **Step 4: Stop the dev server and commit**

```bash
git add src/components/admin/certificates/DesignerHarness.tsx src/app/dev/certificate-designer/page.tsx
git commit -m "test(certificates): dev harness panels for the base preview and the typed list

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Full gate and STATUS.md

**Files:**
- Modify: `docs/STATUS.md` (top "START HERE" section)

- [ ] **Step 1: Run the whole gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all four succeed. Record the test count from vitest's summary. If `build` fails on `package-lock.json` drift, run `npm install --package-lock-only` (no new dependencies are expected in this phase).

- [ ] **Step 2: Add a STATUS block** under the handover section in `docs/STATUS.md`:

```markdown
> ### 🧩 BUILT, NOT MERGED — certificate base templates, phase 1 (`feat/certificate-bases`, 2026-09-15)
>
> **Every event's Participants and Volunteers certificates follow a council base until customised.**
> Spec `docs/superpowers/specs/2026-09-15-certificate-base-templates-design.md`, plan
> `docs/superpowers/plans/2026-09-15-certificate-bases-phase1.md`. Gate: typecheck ✓ lint ✓ <N> tests ✓ build ✓.
>
> - **Migration `certificate_bases` — APPLIED LIVE + VERIFIED** via MCP (never `db push`): `certificate_bases`
>   (RLS on, no anon/authenticated grants), `certificate_groups.base_kind` + nullable `design` (null = follows),
>   `certificate_sheet_rows.roll`, `certificate_group_kind` gains `results` (phase 2). The one live
>   Participants group now follows.
> - **How it works:** `CertificateGroup.design` is the *effective* design (`effectiveDesign` in
>   `src/lib/certificates/bases.ts`), so issuing/preview/print/outdated follow a base without knowing bases
>   exist. ⚠️ Don't read `certificate_groups.design` directly — null means "use the base".
> - **UI:** a following group opens as the certificate (`CertificatePreview`) with **Customise**; the editor
>   has **Save for this event**, **Save as base ▾** (council-wide admins only; images copied into
>   `certificate-assets/00000000-0000-0000-0000-000000000000/`), **Reset to base**. Volunteers (any list
>   group) can be typed in with name/email/roll no.; an issued person's name/email is locked.
> - **Browser-checked** in the harness (`/dev/certificate-designer?panel=base`, `?panel=list`) at 1280 and
>   400 px. **Nothing signed-in yet** — TOTP blocks agents.
> - **Owed human walkthrough** (as `sandy`, tech_head):
>   1. On an event, design a certificate → Save as base → Participants + Volunteers.
>   2. Open a second event: both groups show the certificate immediately, marked ● Base.
>   3. Customise Volunteers there → Save for this event; edit the base from the first event →
>      Participants changes on the second event, Volunteers does not.
>   4. Reset Volunteers to base.
>   5. Type three volunteers (one without email), issue, then try to change the issued one's email →
>      refused; change their roll no. → shows outdated.
> - **Next:** phase 2 — Winners (results or uploaded list), spec §4.
```

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): certificate base templates phase 1 built; owed human walkthrough

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
