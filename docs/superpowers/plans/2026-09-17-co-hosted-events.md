# Co-hosted Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event list co-hosting clubs beside its primary host, and make every event permission check agree with the event list about what "your club's event" means.

**Architecture:** One pure authorisation module (`src/lib/admin/event-hosts.ts`) decides what each hosting club may do and plans link-row changes; one pure display module (`src/lib/event-hosts.ts`) turns hosts into "Coding × Ai Forge". `getEventForAttendance` returns `hosts` instead of `clubId`, so the typechecker finds every check that still reads the primary alone. A thin server-only writer applies the planned `event_clubs` changes in the one safe order.

**Tech Stack:** Next 16.3.1 App Router (server actions, server components), React 19, TypeScript strict, Supabase JS (service-role admin client, anon public client), zod 4, vitest (`renderToStaticMarkup` for component tests).

**Spec:** `docs/superpowers/specs/2026-09-15-co-hosted-events-design.md`. Read §1 first: the feature is mostly an authorisation change.

## Global Constraints

- **Branch:** `feat/co-hosted-events` (already checked out, with `main` merged in at `f9fe192`). Commit after each task. **Do not merge to `main` or push.** Merging needs the owner's browser walkthrough (below), and a push to `main` deploys to production.
- **No migration.** `event_clubs` (PK `(event_id, club_id)`, partial unique index `event_clubs_one_primary_idx` = exactly one primary) already supports this. Never run `supabase db push`.
- **Live data (checked 2026-09-17, project `jisahccdnthzgibszwnq`):** 1 event, 1 link row, 1 primary, 0 co-hosts, 0 events without a primary row. RLS on `event_clubs`: one read policy for `anon, authenticated`; no triggers. Admin writes use the service-role client.
- **AGENTS.md:** this Next.js has breaking changes. Before editing a server action or a page, read the relevant guide in `node_modules/next/dist/docs/`. This plan uses only patterns already in these files (`"use server"` actions taking `FormData`, `useActionState`, async server components).
- **Line endings are LF.** Use the Edit/Write tools or Git Bash `sed -i`. Never write files through Python text mode (it rewrites every line ending).
- **Tests** sit beside the source as `*.test.ts(x)` and use vitest globals imported from `"vitest"`, with the `@/` alias for `src/`. Run one file with `npx vitest run <path>`.
- **Gate:** `npm run typecheck && npm run lint && npm test && npm run build` must be green at the end (baseline before this work: 1162 tests).
- **Copy rules (spec):** join hosts with `" × "`, primary first. Audit action name is `event_cohosts_changed`, with before/after `primary_club_id` and `cohost_ids`.
- **Match the house style:** comments explain *why* and flag traps with ⚠️. Match the density of the surrounding file.

## Decisions this plan makes that the spec left open

1. **The email composer's event audience follows co-hosts.** `isAudienceAllowed` takes the event's host club ids, so a co-host's head can mail an event their club co-runs, the same way they can from `/admin/events/[id]/email`.
2. **The calendar's filter chips include co-hosts** (`clubsInRange`). If they didn't, the secondary club's chip would never appear, and §3's "filter by the co-host" would have nothing to click.
3. **The edit form locks a club-scoped role to the event's *primary* club, not their own.** Otherwise a co-host's form would post their own club as the hosting club. That reads as taking the primary, so every co-host save would be refused.
4. **Changing the primary still requires managing the destination club** (the check that exists today) as well as `canSetPrimary`. In practice only council roles reassign, which keeps today's rule that a club head cannot hand an event to another club. `canSetPrimary` is still built and tested exactly as the spec defines it.
5. **Duplicating counts as creating.** When a co-host's head duplicates an event, their own club owns the copy and the original owner stays on as a co-host (`hostsForCopy`).
6. **`listEventsForAdmin` resolves event ids first.** Filtering the embedded `event_clubs` with `!inner` also filters the *embedded rows*, so each row would lose its other hosts and label the event as the viewer's club alone.
7. **Co-host order after the primary is whatever the database returns.** The "Hosted by … with …" line appears only when there are two or more hosts.
8. **Only newly added co-hosts are checked against active clubs.** If a co-host club is later deactivated, the next edit quietly drops it: inactive clubs aren't offered as checkboxes, so it isn't posted back.
9. **The week strip and the achievements board show the joined label too.** They are public places that print an event's club name.
10. The spec says "cancel/delete". There is **no delete action** for events, so only cancel is gated.

## File Structure

| File | Responsibility |
|---|---|
| **Create** `src/lib/admin/event-hosts.ts` | Pure: `EventHosts`, reading hosts from link rows, the four permission predicates, co-host normalisation, `planHostChanges`, `hostsForCopy`. |
| **Create** `src/lib/admin/event-hosts.test.ts` | The coverage the spec asks for, including the asymmetry regression. |
| **Create** `src/lib/event-hosts.ts` | Pure, client-safe display: `orderHosts`, `hostLabel`, `hostedByLine`. |
| **Create** `src/lib/event-hosts.test.ts` | Label and ordering tests. |
| **Create** `src/lib/admin/event-host-store.ts` | Server-only: `applyHostPlan`, `notActiveClubIds`. |
| **Create** `src/components/admin/CohostPicker.tsx` (+ `.test.tsx`) | One checkbox per club that could co-host. |
| Modify `src/lib/admin/attendance.ts` | `AttendanceEvent.clubId` → `hosts`. |
| Modify `src/lib/admin/broadcast-audience.ts` (+ test) | Event audience judged against every host club. |
| Modify ~17 admin pages, actions and API routes | `canManage(…, ev.clubId)` → `canManageEvent(…, ev.hosts)`. |
| Modify `src/lib/admin/queries.ts` | Admin list (id-first scoping, joined label), edit read (hosts, co-hosts, scoping), review label. |
| Modify `src/lib/admin/certificates.ts` | `listDesignSources` authorises through hosts. |
| Modify `src/app/admin/(app)/events/actions.ts` | Create/update/duplicate/cancel write and authorise hosts. |
| Modify `src/app/admin/(app)/events/[id]/edit/page.tsx`, `EventForm.tsx` | Primary-locked form, co-host picker, cancel through `canCancelEvent`. |
| Modify `src/lib/types.ts`, `src/lib/queries.ts`, `src/lib/calendar-layout.ts` (+ test), `src/components/calendar/Calendar.tsx`, `src/app/events/[id]/page.tsx` | Public label, `clubSlugs`, calendar filtering, "Hosted by" line. |
| Modify `docs/STATUS.md` | Handoff block. |

---

### Task 1: The authorisation module

**Files:**
- Create: `src/lib/admin/event-hosts.ts`
- Test: `src/lib/admin/event-hosts.test.ts`

**Interfaces:**
- Consumes: `grantFor`, `canManage`, `type AdminIdentity`, `type Capability` from `@/lib/auth/capabilities` (existing).
- Produces (used by Tasks 3–6):
  - `interface EventHosts { primaryClubId: string | null; clubIds: string[] }` (`clubIds` lists the primary first)
  - `const NO_HOSTS: EventHosts`
  - `hostsFromLinks(links: readonly { club_id: string; is_primary: boolean }[] | null | undefined): EventHosts`
  - `cohostIdsOf(hosts: EventHosts): string[]`
  - `normalizeCohosts(primaryClubId: string, ids: readonly string[]): string[]`
  - `canManageEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean`
  - `canViewEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean`
  - `canCancelEvent(id: AdminIdentity, hosts: EventHosts): boolean`
  - `canSetPrimary(id: AdminIdentity, hosts: EventHosts): boolean`
  - `interface HostPlan { removeCohosts: string[]; primary: { op: "insert" | "move"; clubId: string } | null; addCohosts: string[] }`
  - `planHostChanges(current: EventHosts, desired: { primaryClubId: string; cohostIds: readonly string[] }): HostPlan`
  - `isEmptyPlan(plan: HostPlan): boolean`
  - `hostsForCopy(id: AdminIdentity, source: EventHosts): EventHosts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/event-hosts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AdminIdentity, Capability } from "@/lib/auth/capabilities";
import {
  NO_HOSTS,
  canCancelEvent,
  canManageEvent,
  canSetPrimary,
  canViewEvent,
  cohostIdsOf,
  hostsForCopy,
  hostsFromLinks,
  isEmptyPlan,
  normalizeCohosts,
  planHostChanges,
  type EventHosts,
} from "./event-hosts";

// Coding owns the event and AI Forge co-hosts it. Yoga has nothing to do with it.
const CODING = "club-coding";
const FORGE = "club-forge";
const YOGA = "club-yoga";
const cohosted: EventHosts = { primaryClubId: CODING, clubIds: [CODING, FORGE] };

const codingHead: AdminIdentity = { role: "club_head", clubId: CODING };
const forgeHead: AdminIdentity = { role: "club_head", clubId: FORGE };
const forgeVice: AdminIdentity = { role: "vice_head", clubId: FORGE };
const yogaHead: AdminIdentity = { role: "club_head", clubId: YOGA };
const unlinkedHead: AdminIdentity = { role: "club_head", clubId: null };
const tech: AdminIdentity = { role: "tech_head", clubId: null };
const docs: AdminIdentity = { role: "docs_head", clubId: null };

// The four capabilities a co-host exercises on another club's event (spec §1).
const EVENT_CAPS: Capability[] = [
  "manage:events",
  "manage:registrations",
  "manage:results",
  "issue:participation_certificate",
];

describe("hostsFromLinks", () => {
  it("puts the primary first whatever order the rows came back in", () => {
    expect(
      hostsFromLinks([
        { club_id: FORGE, is_primary: false },
        { club_id: CODING, is_primary: true },
      ]),
    ).toEqual({ primaryClubId: CODING, clubIds: [CODING, FORGE] });
  });

  it("falls back to the first row when none is marked primary, as every read site did", () => {
    expect(hostsFromLinks([{ club_id: YOGA, is_primary: false }])).toEqual({
      primaryClubId: YOGA,
      clubIds: [YOGA],
    });
  });

  it("returns no hosts for an event with no link rows", () => {
    expect(hostsFromLinks([])).toEqual(NO_HOSTS);
    expect(hostsFromLinks(null)).toEqual(NO_HOSTS);
  });

  it("lists a club once even if it appears twice", () => {
    expect(
      hostsFromLinks([
        { club_id: CODING, is_primary: true },
        { club_id: FORGE, is_primary: false },
        { club_id: FORGE, is_primary: false },
      ]).clubIds,
    ).toEqual([CODING, FORGE]);
  });
});

describe("cohostIdsOf", () => {
  it("is every host but the primary", () => {
    expect(cohostIdsOf(cohosted)).toEqual([FORGE]);
    expect(cohostIdsOf(NO_HOSTS)).toEqual([]);
  });
});

describe("canManageEvent", () => {
  for (const cap of EVENT_CAPS) {
    describe(cap, () => {
      it("lets the primary club's head act", () => {
        expect(canManageEvent(codingHead, cap, cohosted)).toBe(true);
      });
      it("lets the co-host club's head act", () => {
        expect(canManageEvent(forgeHead, cap, cohosted)).toBe(true);
      });
      it("refuses an unrelated club's head", () => {
        expect(canManageEvent(yogaHead, cap, cohosted)).toBe(false);
      });
      it("refuses a club-scoped head with no club (fail closed)", () => {
        expect(canManageEvent(unlinkedHead, cap, cohosted)).toBe(false);
      });
      it("lets a council role act on any event", () => {
        expect(canManageEvent(tech, cap, cohosted)).toBe(true);
      });
    });
  }

  // ⚠️ The asymmetry this feature fixes, named so nobody "simplifies" it back.
  // The club-scoped event LIST matches any event_clubs row. A head who is shown
  // an event must be able to act on it, not be refused because the check only
  // looked at the primary.
  it("REGRESSION: a head whose club hosts the event but is not primary can act on it", () => {
    const hosts: EventHosts = { primaryClubId: YOGA, clubIds: [YOGA, FORGE] };
    expect(canManageEvent(forgeHead, "manage:events", hosts)).toBe(true);
  });

  it("gives a vice head exactly the grants the matrix gives them", () => {
    expect(canManageEvent(forgeVice, "manage:events", cohosted)).toBe(true);
    expect(canManageEvent(forgeVice, "issue:participation_certificate", cohosted)).toBe(false);
  });

  it("refuses a role with no grant, co-host or not", () => {
    expect(canManageEvent(docs, "manage:events", cohosted)).toBe(false);
  });

  it("refuses club-scoped heads on an event with no hosts, but not the council", () => {
    expect(canManageEvent(codingHead, "manage:events", NO_HOSTS)).toBe(false);
    expect(canManageEvent(tech, "manage:events", NO_HOSTS)).toBe(true);
  });

  it("still matches the primary if a caller built hosts without listing it", () => {
    expect(
      canManageEvent(codingHead, "manage:events", { primaryClubId: CODING, clubIds: [] }),
    ).toBe(true);
  });
});

describe("canViewEvent", () => {
  it("shows a co-host's head the event", () => {
    expect(canViewEvent(forgeHead, "manage:registrations", cohosted)).toBe(true);
  });

  it("hides it from an unrelated club and from a head with no club", () => {
    expect(canViewEvent(yogaHead, "manage:registrations", cohosted)).toBe(false);
    expect(canViewEvent(unlinkedHead, "manage:registrations", cohosted)).toBe(false);
  });

  it("shows a council role any event", () => {
    expect(canViewEvent(tech, "manage:results", cohosted)).toBe(true);
  });

  it("lets a read grant see without managing", () => {
    // The President holds view:audit as "read", the one read grant in the matrix.
    const president: AdminIdentity = { role: "president", clubId: null };
    expect(canViewEvent(president, "view:audit", cohosted)).toBe(true);
    expect(canManageEvent(president, "view:audit", cohosted)).toBe(false);
  });

  it("refuses a role with no grant", () => {
    expect(canViewEvent(docs, "manage:registrations", cohosted)).toBe(false);
  });
});

describe("canCancelEvent", () => {
  it("lets the primary club's head cancel", () => {
    expect(canCancelEvent(codingHead, cohosted)).toBe(true);
  });

  it("does NOT let a co-host's head cancel", () => {
    expect(canCancelEvent(forgeHead, cohosted)).toBe(false);
  });

  it("lets the council cancel", () => {
    expect(canCancelEvent(tech, cohosted)).toBe(true);
  });

  it("never lets a vice head cancel, even their own club's event", () => {
    const codingVice: AdminIdentity = { role: "vice_head", clubId: CODING };
    expect(canCancelEvent(codingVice, cohosted)).toBe(false);
  });

  it("refuses a head with no club, and any club-scoped head on an event with no hosts", () => {
    expect(canCancelEvent(unlinkedHead, cohosted)).toBe(false);
    expect(canCancelEvent(codingHead, NO_HOSTS)).toBe(false);
  });
});

describe("canSetPrimary", () => {
  it("lets the current primary club's head reassign", () => {
    expect(canSetPrimary(codingHead, cohosted)).toBe(true);
  });

  // ⚠️ Otherwise a co-host could take the primary and lock the owner out of cancelling.
  it("does NOT let a co-host's head reassign", () => {
    expect(canSetPrimary(forgeHead, cohosted)).toBe(false);
  });

  it("refuses an unrelated head and allows the council", () => {
    expect(canSetPrimary(yogaHead, cohosted)).toBe(false);
    expect(canSetPrimary(tech, cohosted)).toBe(true);
  });
});

describe("normalizeCohosts", () => {
  it("drops the primary, blanks and repeats, keeping the order given", () => {
    expect(normalizeCohosts(CODING, [FORGE, "", CODING, YOGA, FORGE, " "])).toEqual([FORGE, YOGA]);
  });

  it("is empty when nothing was ticked", () => {
    expect(normalizeCohosts(CODING, [])).toEqual([]);
  });
});

describe("planHostChanges", () => {
  it("inserts the primary and the co-hosts for a new event", () => {
    expect(planHostChanges(NO_HOSTS, { primaryClubId: CODING, cohostIds: [FORGE] })).toEqual({
      removeCohosts: [],
      primary: { op: "insert", clubId: CODING },
      addCohosts: [FORGE],
    });
  });

  it("does nothing when nothing changed", () => {
    expect(isEmptyPlan(planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [FORGE] }))).toBe(true);
  });

  it("adds a co-host", () => {
    expect(planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [FORGE, YOGA] })).toEqual({
      removeCohosts: [],
      primary: null,
      addCohosts: [YOGA],
    });
  });

  it("removes a co-host, including a co-host removing itself", () => {
    expect(planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [] })).toEqual({
      removeCohosts: [FORGE],
      primary: null,
      addCohosts: [],
    });
  });

  // The writer relies on this: the promoted co-host's row is deleted BEFORE the
  // primary row is repointed at it, or the (event_id, club_id) key clashes.
  it("promotes a co-host: drops its co-host row, moves the primary, keeps the old owner as co-host", () => {
    expect(planHostChanges(cohosted, { primaryClubId: FORGE, cohostIds: [CODING] })).toEqual({
      removeCohosts: [FORGE],
      primary: { op: "move", clubId: FORGE },
      addCohosts: [CODING],
    });
  });

  it("moves the primary to a new club without keeping the old one", () => {
    expect(
      planHostChanges({ primaryClubId: CODING, clubIds: [CODING] }, { primaryClubId: YOGA, cohostIds: [] }),
    ).toEqual({ removeCohosts: [], primary: { op: "move", clubId: YOGA }, addCohosts: [] });
  });

  it("never plans the primary as its own co-host", () => {
    expect(
      planHostChanges(cohosted, { primaryClubId: CODING, cohostIds: [CODING, FORGE] }).addCohosts,
    ).toEqual([]);
  });
});

describe("hostsForCopy", () => {
  it("keeps the hosts as they are for the council", () => {
    expect(hostsForCopy(tech, cohosted)).toEqual(cohosted);
  });

  it("keeps the hosts as they are for the owning club's head", () => {
    expect(hostsForCopy(codingHead, cohosted)).toEqual(cohosted);
  });

  // A club-scoped creator's own club is always the primary (spec §2), and a
  // duplicate is a creation.
  it("makes a co-host's copy their own club's, keeping the original owner as co-host", () => {
    expect(hostsForCopy(forgeHead, cohosted)).toEqual({ primaryClubId: FORGE, clubIds: [FORGE, CODING] });
    expect(hostsForCopy(forgeVice, cohosted).primaryClubId).toBe(FORGE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/admin/event-hosts.test.ts`
Expected: FAIL, with `Failed to resolve import "./event-hosts"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/admin/event-hosts.ts`:

```ts
import {
  canManage,
  grantFor,
  type AdminIdentity,
  type Capability,
} from "@/lib/auth/capabilities";

/**
 * Which clubs host an event, and what that lets each of them do.
 *
 * Pure on purpose: this is the authorisation boundary for co-hosted events
 * (spec 2026-09-15 §1), and it has to be provable without a database.
 *
 * ⚠️ Why it exists: the club-scoped event LIST has always matched any
 * `event_clubs` row, primary or not, while every permission check resolved
 * the primary club only. A second link row would have shown a co-host's head
 * the event and refused them on every action. Every event permission check
 * goes through here instead of `canManage(…, primaryClubId)`.
 */
export interface EventHosts {
  /** The club that owns the event. Null only for a legacy row with no link. */
  primaryClubId: string | null;
  /** Every hosting club, primary first. */
  clubIds: string[];
}

export const NO_HOSTS: EventHosts = { primaryClubId: null, clubIds: [] };

/**
 * Hosts from `event_clubs` rows. The primary is the `is_primary` row, falling
 * back to the first row, exactly as every read site did before this module.
 */
export function hostsFromLinks(
  links: readonly { club_id: string; is_primary: boolean }[] | null | undefined,
): EventHosts {
  const rows = links ?? [];
  const primary = rows.find((l) => l.is_primary) ?? rows[0];
  if (!primary) return NO_HOSTS;
  const others = rows.map((l) => l.club_id).filter((id) => id !== primary.club_id);
  return { primaryClubId: primary.club_id, clubIds: [primary.club_id, ...new Set(others)] };
}

/** The co-hosts alone: every hosting club except the primary. */
export function cohostIdsOf(hosts: EventHosts): string[] {
  return hosts.clubIds.filter((id) => id !== hosts.primaryClubId);
}

/**
 * Co-host ids as submitted, made safe to write: blanks dropped, repeats
 * collapsed, and the primary removed, because a club is never its own co-host.
 */
export function normalizeCohosts(primaryClubId: string, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || id === primaryClubId || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** True when the identity's own club is one of the event's hosts. */
function hostsOwnClub(id: AdminIdentity, hosts: EventHosts): boolean {
  if (id.clubId == null) return false;
  return id.clubId === hosts.primaryClubId || hosts.clubIds.includes(id.clubId);
}

/** May this identity act on the event through ANY of its hosting clubs? */
export function canManageEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean {
  const grant = grantFor(id.role, cap);
  if (grant === "all") return true;
  if (grant === "own") return hostsOwnClub(id, hosts);
  return false;
}

/**
 * May this identity SEE the event's surface for `cap`? `all` and `read` see any
 * event, and `own` sees the events its club hosts. This is to `canManageEvent`
 * what `canViewClub` is to `canManage`.
 */
export function canViewEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean {
  const grant = grantFor(id.role, cap);
  if (grant === "all" || grant === "read") return true;
  if (grant === "own") return hostsOwnClub(id, hosts);
  return false;
}

/**
 * Cancelling is irreversible, so it stays with the club that owns the event: an
 * `own` grant matches the PRIMARY club only. A co-host can do everything else.
 */
export function canCancelEvent(id: AdminIdentity, hosts: EventHosts): boolean {
  return canManage(id, "cancel:events", hosts.primaryClubId);
}

/**
 * Reassigning the primary needs `all`, or managing events for the CURRENT
 * primary club.
 *
 * ⚠️ Without this, a co-host could make its own club primary and lock the
 * original club out of cancelling its own event.
 */
export function canSetPrimary(id: AdminIdentity, hosts: EventHosts): boolean {
  return canManage(id, "manage:events", hosts.primaryClubId);
}

/** The `event_clubs` writes that turn one set of hosts into another. */
export interface HostPlan {
  /** Co-host rows to delete: removed co-hosts, and a co-host being promoted to primary. */
  removeCohosts: string[];
  /** `insert` when the event has no primary row yet; `move` repoints the existing one in place. */
  primary: { op: "insert" | "move"; clubId: string } | null;
  /** Co-host rows to insert, including a former primary kept on as a co-host. */
  addCohosts: string[];
}

export function planHostChanges(
  current: EventHosts,
  desired: { primaryClubId: string; cohostIds: readonly string[] },
): HostPlan {
  const wanted = normalizeCohosts(desired.primaryClubId, desired.cohostIds);
  const have = cohostIdsOf(current);
  return {
    removeCohosts: have.filter((id) => !wanted.includes(id)),
    primary:
      current.primaryClubId == null
        ? { op: "insert", clubId: desired.primaryClubId }
        : current.primaryClubId !== desired.primaryClubId
          ? { op: "move", clubId: desired.primaryClubId }
          : null,
    addCohosts: wanted.filter((id) => !have.includes(id)),
  };
}

export function isEmptyPlan(plan: HostPlan): boolean {
  return plan.removeCohosts.length === 0 && plan.primary === null && plan.addCohosts.length === 0;
}

/**
 * The hosts a duplicated event starts with. The copy keeps every host, but a
 * club-scoped creator's own club is always the primary (spec §2), and a
 * duplicate is a creation. So when a co-host's head duplicates an event, their
 * club owns the copy and the original owner stays on as a co-host.
 *
 * Callers must already have passed `canManageEvent` for the source event.
 */
export function hostsForCopy(id: AdminIdentity, source: EventHosts): EventHosts {
  if (grantFor(id.role, "manage:events") !== "own" || id.clubId == null) return source;
  if (id.clubId === source.primaryClubId) return source;
  return {
    primaryClubId: id.clubId,
    clubIds: [id.clubId, ...source.clubIds.filter((c) => c !== id.clubId)],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/admin/event-hosts.test.ts`
Expected: PASS, every test green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/event-hosts.ts src/lib/admin/event-hosts.test.ts
git commit -m "feat(events): hosting-club authorisation for co-hosted events

Every event permission check is about to go through canManageEvent, which
matches ANY hosting club. Cancel and reassigning the primary match the
primary only, so a co-host cannot lock the owner out of its own event.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The display module

**Files:**
- Create: `src/lib/event-hosts.ts`
- Test: `src/lib/event-hosts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 4 and 7):
  - `orderHosts<C>(links: readonly { is_primary: boolean; clubs: C | null }[] | null | undefined): C[]`
  - `hostLabel(names: readonly string[]): string`
  - `hostedByLine(names: readonly string[]): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/event-hosts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hostLabel, hostedByLine, orderHosts } from "./event-hosts";

describe("orderHosts", () => {
  it("puts the primary first and keeps the co-hosts in the order given", () => {
    expect(
      orderHosts([
        { is_primary: false, clubs: { name: "AI Forge" } },
        { is_primary: true, clubs: { name: "Coding Club" } },
        { is_primary: false, clubs: { name: "Yoga Club" } },
      ]).map((c) => c.name),
    ).toEqual(["Coding Club", "AI Forge", "Yoga Club"]);
  });

  it("keeps the order when no row is marked primary, so the first row stands in", () => {
    expect(
      orderHosts([
        { is_primary: false, clubs: { name: "A" } },
        { is_primary: false, clubs: { name: "B" } },
      ]).map((c) => c.name),
    ).toEqual(["A", "B"]);
  });

  it("skips a link whose embedded club came back null", () => {
    expect(
      orderHosts([
        { is_primary: true, clubs: null },
        { is_primary: false, clubs: { name: "B" } },
      ]).map((c) => c.name),
    ).toEqual(["B"]);
  });

  it("is empty for no links", () => {
    expect(orderHosts([])).toEqual([]);
    expect(orderHosts(null)).toEqual([]);
  });
});

describe("hostLabel", () => {
  it("is the club alone for one host", () => {
    expect(hostLabel(["Coding"])).toBe("Coding");
  });

  it("joins two hosts, primary first", () => {
    expect(hostLabel(["Coding", "Ai Forge"])).toBe("Coding × Ai Forge");
  });

  it("joins three", () => {
    expect(hostLabel(["Coding", "Ai Forge", "Yoga"])).toBe("Coding × Ai Forge × Yoga");
  });

  it("preserves the order it is given", () => {
    expect(hostLabel(["Ai Forge", "Coding"])).toBe("Ai Forge × Coding");
  });

  it("is empty for no hosts, so callers keep their own fallback", () => {
    expect(hostLabel([])).toBe("");
  });
});

describe("hostedByLine", () => {
  it("says nothing for one host or none, because the club name is already on the page", () => {
    expect(hostedByLine(["Coding"])).toBeNull();
    expect(hostedByLine([])).toBeNull();
  });

  it("names the owner and its co-host", () => {
    expect(hostedByLine(["Coding", "Ai Forge"])).toBe("Hosted by Coding with Ai Forge");
  });

  it("lists several co-hosts in plain English", () => {
    expect(hostedByLine(["Coding", "Ai Forge", "Yoga"])).toBe("Hosted by Coding with Ai Forge and Yoga");
    expect(hostedByLine(["A", "B", "C", "D"])).toBe("Hosted by A with B, C and D");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/event-hosts.test.ts`
Expected: FAIL, with `Failed to resolve import "./event-hosts"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/event-hosts.ts`:

```ts
/**
 * How an event's hosting clubs read on the page. Pure and client-safe.
 *
 * Display only. Who may act on a co-hosted event is decided in
 * `@/lib/admin/event-hosts`, never from these strings.
 */

/** Hosting clubs from `event_clubs` rows: primary first, co-hosts in the order given. */
export function orderHosts<C>(
  links: readonly { is_primary: boolean; clubs: C | null }[] | null | undefined,
): C[] {
  const rows = links ?? [];
  const at = rows.findIndex((l) => l.is_primary);
  const ordered = at > 0 ? [rows[at], ...rows.filter((_, i) => i !== at)] : rows;
  return ordered.map((l) => l.clubs).filter((c): c is C => c != null);
}

/**
 * "Coding × Ai Forge", primary first. Empty when there are no hosts, so each
 * caller keeps the fallback it already had ("CSE Council", "Council", "—").
 */
export function hostLabel(names: readonly string[]): string {
  return names.filter((n) => n.trim() !== "").join(" × ");
}

/**
 * The event page's explicit sentence, so nobody has to interpret the ×.
 * Null for a single host: the club name above the title already says it.
 */
export function hostedByLine(names: readonly string[]): string | null {
  if (names.length < 2) return null;
  const [owner, ...rest] = names;
  const others =
    rest.length === 1
      ? rest[0]
      : `${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}`;
  return `Hosted by ${owner} with ${others}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/event-hosts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/event-hosts.ts src/lib/event-hosts.test.ts
git commit -m "feat(events): host label and hosted-by line for co-hosted events

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Route every event permission check through the hosts

This is the asymmetry fix. After this task, a co-host's head can open and act on every per-event surface: registrations, participants, results, event email, certificates, CSV export and certificate PDFs. The email composer's event audience follows co-hosts too.

**Files:**
- Modify: `src/lib/admin/attendance.ts` (whole file)
- Modify: `src/lib/admin/broadcast-audience.ts:135-171`
- Test: `src/lib/admin/broadcast-audience.test.ts`
- Modify: `src/app/admin/(app)/email/actions.ts:41-49`
- Modify: `src/app/admin/(app)/events/[id]/registrations/actions.ts` (import + 4 checks)
- Modify: `src/app/admin/(app)/events/[id]/registrations/page.tsx:4,29-34`
- Modify: `src/app/admin/(app)/events/[id]/participants/page.tsx:4,31-35`
- Modify: `src/app/admin/(app)/events/[id]/results/actions.ts:7,25`
- Modify: `src/app/admin/(app)/events/[id]/results/page.tsx:4,24-29`
- Modify: `src/app/admin/(app)/events/[id]/email/actions.ts:5,80`
- Modify: `src/app/admin/(app)/events/[id]/email/page.tsx:4,28`
- Modify: `src/app/admin/(app)/events/[id]/certificates/actions.ts:8` + 6 checks
- Modify: `src/app/admin/(app)/events/[id]/certificates/page.tsx:4,42,169`
- Modify: `src/app/api/admin/registrations/export/route.ts:2,16`
- Modify: `src/app/api/admin/events/[id]/certificates/print/route.ts:3,25`
- Modify: `src/app/api/admin/events/[id]/certificates/preview/route.ts:3,30,91`
- Modify: `src/app/api/admin/certificates/[certId]/pdf/route.ts:3,25`
- Modify: `src/lib/admin/certificates.ts:5,861-884`

**Interfaces:**
- Consumes: from Task 1, `EventHosts`, `hostsFromLinks`, `canManageEvent`, `canViewEvent`.
- Produces:
  - `AttendanceEvent` loses `clubId` and gains `hosts: EventHosts`. Every other field is unchanged.
  - `isAudienceAllowed(id: AdminIdentity, a: Audience, hostClubIds: readonly string[]): boolean`

- [ ] **Step 1: Write the failing test (email audience)**

In `src/lib/admin/broadcast-audience.test.ts`, change every `isAudienceAllowed` call's third argument from a club id or `null` to an array (`"club-x"` → `["club-x"]`, `null` → `[]`):

```bash
sed -i -E 's/(isAudienceAllowed\([^()]*, )null\)/\1[])/; s/(isAudienceAllowed\([^()]*, )("club-[ab]")\)/\1[\2])/' src/lib/admin/broadcast-audience.test.ts
grep -n "isAudienceAllowed(" src/lib/admin/broadcast-audience.test.ts
```

Expected grep output: every call ends in `[])` or `["club-a"])` / `["club-b"])`. No call should still end in `null)` or `"club-a")`.

Then add this test inside `describe("isAudienceAllowed", …)`, directly after the `"judges an event by the event's real club, not the form"` test:

```ts
  it("lets a co-host's head reach the registrants of an event their club co-hosts", () => {
    // club-coding owns the event; club-a co-hosts it.
    expect(isAudienceAllowed(head, event, ["club-coding", "club-a"])).toBe(true);
    expect(isAudienceAllowed(head, event, ["club-coding", "club-b"])).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/admin/broadcast-audience.test.ts`
Expected: FAIL. `"judges an event by the event's real club, not the form"` and the new co-host test fail, because an array is never `===` a club id.

- [ ] **Step 3: Implement the email audience change**

In `src/lib/admin/broadcast-audience.ts`, replace the doc comment and signature (currently lines 135–143):

```ts
/**
 * `resourceClubId` is the club the DATABASE says owns the event — never a value
 * the form supplied. It is ignored for the non-event audiences.
 */
export function isAudienceAllowed(
  id: AdminIdentity,
  a: Audience,
  resourceClubId: string | null,
): boolean {
```

with:

```ts
/**
 * `hostClubIds` are the clubs the DATABASE says host the event, primary and
 * co-hosts alike. Never a value the form supplied. Ignored for the non-event
 * audiences.
 */
export function isAudienceAllowed(
  id: AdminIdentity,
  a: Audience,
  hostClubIds: readonly string[],
): boolean {
```

and replace the event line (currently line 170):

```ts
  if (a.kind === "event") return resourceClubId != null && resourceClubId === id.clubId;
```

with:

```ts
  // An event is theirs when their club hosts it, as owner or co-host.
  if (a.kind === "event") return hostClubIds.includes(id.clubId);
```

(`id.clubId` is already narrowed to `string` by the `if (id.clubId == null) return false;` above it.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/admin/broadcast-audience.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace `clubId` with `hosts` on `AttendanceEvent`**

Replace the whole of `src/lib/admin/attendance.ts` with:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostsFromLinks, type EventHosts } from "@/lib/admin/event-hosts";

/** Resolve an event + its hosting clubs for attendance/registration authz. */

export interface AttendanceEvent {
  id: string;
  title: string;
  /**
   * Every club hosting the event, primary first. Authorise with
   * `canManageEvent` / `canViewEvent`.
   *
   * ⚠️ There is deliberately no `clubId` here. A check against the primary
   * alone refuses a co-host's head on an event their own list shows them.
   * Removing the field makes any such check a type error rather than a quiet
   * dead end.
   */
  hosts: EventHosts;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  /** Free-text venue, else the booked venue's name, else null. */
  venue: string | null;
}

export async function getEventForAttendance(
  eventId: string,
): Promise<AttendanceEvent | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select(
      "id, title, starts_at, ends_at, is_all_day, venue_text, event_clubs ( is_primary, club_id ), venues ( name )",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    is_all_day: boolean;
    venue_text: string | null;
    event_clubs: { is_primary: boolean; club_id: string }[];
    venues: { name: string } | null;
  };
  return {
    id: row.id,
    title: row.title,
    hosts: hostsFromLinks(row.event_clubs),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
    venue: row.venue_text ?? row.venues?.name ?? null,
  };
}
```

- [ ] **Step 6: Run typecheck to list every broken call site**

Run: `npm run typecheck`
Expected: FAIL, with `Property 'clubId' does not exist on type 'AttendanceEvent'` in these files (and `isAudienceAllowed` argument errors in `email/actions.ts`): `email/actions.ts`, `events/[id]/registrations/actions.ts`, `events/[id]/registrations/page.tsx`, `events/[id]/participants/page.tsx`, `events/[id]/results/actions.ts`, `events/[id]/results/page.tsx`, `events/[id]/email/actions.ts`, `events/[id]/email/page.tsx`, `events/[id]/certificates/actions.ts`, `events/[id]/certificates/page.tsx`, and the four API routes. That list is this step's "failing test".

- [ ] **Step 7: Fix the one-line checks mechanically**

Run from the repo root (Git Bash). Each `sed` swaps the import, then the check. The `grep` afterwards must print nothing.

```bash
f="src/app/admin/(app)/events/[id]/registrations/actions.ts"
sed -i 's#^import { canManage } from "@/lib/auth/capabilities";#import { canManageEvent } from "@/lib/admin/event-hosts";#' "$f"
sed -i 's/canManage(session, "manage:registrations", ev\.clubId)/canManageEvent(session, "manage:registrations", ev.hosts)/g' "$f"

f="src/app/admin/(app)/events/[id]/results/actions.ts"
sed -i 's#^import { canManage } from "@/lib/auth/capabilities";#import { canManageEvent } from "@/lib/admin/event-hosts";#' "$f"
sed -i 's/canManage(session, "manage:results", ev\.clubId)/canManageEvent(session, "manage:results", ev.hosts)/g' "$f"

for f in "src/app/admin/(app)/events/[id]/email/actions.ts" "src/app/admin/(app)/events/[id]/email/page.tsx"; do
  sed -i 's#^import { canManage } from "@/lib/auth/capabilities";#import { canManageEvent } from "@/lib/admin/event-hosts";#' "$f"
  sed -i 's/canManage(session, "manage:registrations", ev\.clubId)/canManageEvent(session, "manage:registrations", ev.hosts)/g' "$f"
done

f="src/app/admin/(app)/events/[id]/certificates/page.tsx"
sed -i 's#^import { canManage } from "@/lib/auth/capabilities";#import { canManageEvent } from "@/lib/admin/event-hosts";#' "$f"
sed -i 's/canManage(session, \([A-Z"a-z:_]*\), ev\.clubId)/canManageEvent(session, \1, ev.hosts)/g' "$f"

f="src/app/admin/(app)/events/[id]/certificates/actions.ts"
sed -i 's#^import { canManage, type Capability } from "@/lib/auth/capabilities";#import type { Capability } from "@/lib/auth/capabilities";\nimport { canManageEvent } from "@/lib/admin/event-hosts";#' "$f"
sed -i 's/canManage(\(auth\.session\|session\), \(.*\), \(auth\.ev\|ev\|source\)\.clubId)/canManageEvent(\1, \2, \3.hosts)/g' "$f"

for f in "src/app/api/admin/registrations/export/route.ts" "src/app/api/admin/events/[id]/certificates/print/route.ts" "src/app/api/admin/events/[id]/certificates/preview/route.ts" "src/app/api/admin/certificates/[certId]/pdf/route.ts"; do
  sed -i 's#^import { canManage } from "@/lib/auth/capabilities";#import { canManageEvent } from "@/lib/admin/event-hosts";#' "$f"
  sed -i 's/canManage(guard\.session, \("[a-z:_]*"\), \(ev\|event\)\.clubId)/canManageEvent(guard.session, \1, \2.hosts)/g' "$f"
done
```

Open `src/app/admin/(app)/events/[id]/certificates/actions.ts` and check the import block now reads:

```ts
import type { Capability } from "@/lib/auth/capabilities";
import { canManageEvent } from "@/lib/admin/event-hosts";
```

- [ ] **Step 8: Fix the three view-scoped pages by hand**

`src/app/admin/(app)/events/[id]/registrations/page.tsx`. Replace line 4:

```ts
import { canManage, grantFor } from "@/lib/auth/capabilities";
```

with:

```ts
import { canManageEvent, canViewEvent } from "@/lib/admin/event-hosts";
```

and replace lines 29–34:

```tsx
  // View: all-scope + read (faculty) see any club; club-scoped see only their own.
  const grant = grantFor(session.role, "manage:registrations");
  const canViewThis =
    grant === "all" || grant === "read" || (grant === "own" && session.clubId === ev.clubId);
  if (!canViewThis) redirect("/admin/events");
  const canEdit = canManage(session, "manage:registrations", ev.clubId);
```

with:

```tsx
  // View: all-scope + read see any event; club-scoped see the events their club
  // hosts, as owner or co-host.
  if (!canViewEvent(session, "manage:registrations", ev.hosts)) redirect("/admin/events");
  const canEdit = canManageEvent(session, "manage:registrations", ev.hosts);
```

`src/app/admin/(app)/events/[id]/participants/page.tsx`. Replace line 4:

```ts
import { grantFor } from "@/lib/auth/capabilities";
```

with:

```ts
import { canViewEvent } from "@/lib/admin/event-hosts";
```

and replace lines 31–35:

```tsx
  // Same scoping as the registrations page: all/read see any club, own sees theirs.
  const grant = grantFor(session.role, "manage:registrations");
  const canViewThis =
    grant === "all" || grant === "read" || (grant === "own" && session.clubId === ev.clubId);
  if (!canViewThis) redirect("/admin/events");
```

with:

```tsx
  // Same scoping as the registrations page: all/read see any event, own sees the
  // events its club hosts, as owner or co-host.
  if (!canViewEvent(session, "manage:registrations", ev.hosts)) redirect("/admin/events");
```

`src/app/admin/(app)/events/[id]/results/page.tsx`. Replace line 4:

```ts
import { canManage, grantFor } from "@/lib/auth/capabilities";
```

with:

```ts
import { canManageEvent, canViewEvent } from "@/lib/admin/event-hosts";
```

and replace lines 24–29:

```tsx
  // View: all/read see any club; club-scoped see only their own.
  const grant = grantFor(session.role, "manage:results");
  const canViewThis =
    grant === "all" || grant === "read" || (grant === "own" && session.clubId === ev.clubId);
  if (!canViewThis) redirect("/admin/events");
  const canEdit = canManage(session, "manage:results", ev.clubId);
```

with:

```tsx
  // View: all/read see any event; club-scoped see the events their club hosts,
  // as owner or co-host.
  if (!canViewEvent(session, "manage:results", ev.hosts)) redirect("/admin/events");
  const canEdit = canManageEvent(session, "manage:results", ev.hosts);
```

Now check that no per-event surface still authorises against the primary:

```bash
grep -rn "canManage(\|grantFor(\|\.clubId" "src/app/admin/(app)/events/[id]" src/app/api/admin/registrations src/app/api/admin/events src/app/api/admin/certificates
```

Expected: only
- `src/app/admin/(app)/events/[id]/review/page.tsx`: `canManage(session, "approve:events")`. Correct as it is: approval is council-wide, with no club.
- lines in `src/app/admin/(app)/events/[id]/edit/page.tsx` (its `grantFor(…"manage:events")`, `session.clubId`, `event.clubId` and `canManage(session, "cancel:events", …)`). Task 5 fixes that page. Any line in another file is a missed check. Fix it by hand to `canManageEvent(<identity>, <cap>, <event>.hosts)`, or `canViewEvent` for a view check, keeping the same identity and capability.

- [ ] **Step 9: Fix the email composer's audience gate**

In `src/app/admin/(app)/email/actions.ts`, replace lines 41–47:

```ts
  let resourceClubId: string | null = null;
  if (audience.kind === "event") {
    const ev = await getEventForAttendance(audience.eventId);
    if (!ev) return { error: "Event not found." } as const;
    resourceClubId = ev.clubId;
  }
  if (!isAudienceAllowed(session, audience, resourceClubId)) {
```

with:

```ts
  // Every club hosting the event, read from the database: a co-host's head may
  // mail the registrants of an event their club co-runs.
  let hostClubIds: readonly string[] = [];
  if (audience.kind === "event") {
    const ev = await getEventForAttendance(audience.eventId);
    if (!ev) return { error: "Event not found." } as const;
    hostClubIds = ev.hosts.clubIds;
  }
  if (!isAudienceAllowed(session, audience, hostClubIds)) {
```

- [ ] **Step 10: Fix `listDesignSources`**

In `src/lib/admin/certificates.ts`, replace line 5:

```ts
import { canManage, type AdminIdentity } from "@/lib/auth/capabilities";
```

with:

```ts
import type { AdminIdentity } from "@/lib/auth/capabilities";
import { canManageEvent, hostsFromLinks } from "@/lib/admin/event-hosts";
```

and inside `listDesignSources`, replace:

```ts
      const primary = row.events.event_clubs.find((c) => c.is_primary) ?? row.events.event_clubs[0];
      return canManage(identity, "issue:participation_certificate", primary?.club_id ?? null);
```

with:

```ts
      // Any event this admin could certify, as owner or co-host.
      return canManageEvent(
        identity,
        "issue:participation_certificate",
        hostsFromLinks(row.events.event_clubs),
      );
```

Then confirm `canManage` is not used anywhere else in that file: `grep -n "canManage(" src/lib/admin/certificates.ts` should print nothing.

- [ ] **Step 11: Run the gate for this task**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add -A src/lib/admin/attendance.ts src/lib/admin/broadcast-audience.ts src/lib/admin/broadcast-audience.test.ts src/lib/admin/certificates.ts "src/app/admin/(app)/email/actions.ts" "src/app/admin/(app)/events/[id]" src/app/api/admin
git commit -m "fix(events): authorise per-event surfaces through every hosting club

The club-scoped event list matches any event_clubs row, but every check on
registrations, participants, results, event email, certificates and the
exports resolved the primary club only. A co-host's head would have seen the
event and been refused on all of it. AttendanceEvent now carries hosts
instead of clubId, so a primary-only check no longer typechecks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Admin reads (event list, edit read and review label)

**Files:**
- Modify: `src/lib/admin/queries.ts:1-4,13-88,120-216,239-299`

**Interfaces:**
- Consumes: from Task 1, `EventHosts`, `hostsFromLinks`, `cohostIdsOf`, `canManageEvent`. From Task 2, `orderHosts`, `hostLabel`.
- Produces (used by Task 5):
  - `AdminEventRow.club` is now the joined label. `clubId` is still the primary's id.
  - `EventForEdit` gains `cohostIds: string[]` and `hosts: EventHosts`. `clubId` is still the primary's id.
  - `getEventForEdit` returns the event to anyone who can `canManageEvent(…, "manage:events", hosts)`.

- [ ] **Step 1: Update imports**

In `src/lib/admin/queries.ts`, after line 4 (`import type { AdminSession } from "@/lib/auth/guards";`) add:

```ts
import {
  canManageEvent,
  cohostIdsOf,
  hostsFromLinks,
  type EventHosts,
} from "@/lib/admin/event-hosts";
import { hostLabel, orderHosts } from "@/lib/event-hosts";
```

- [ ] **Step 2: Replace the list select, row shape and mapper**

Replace lines 13–62 (from `export interface AdminEventRow {` through the `EVENT_SELECT_OWN` constant) with:

```ts
export interface AdminEventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  approvalStatus: string;
  /** Every hosting club's short name, primary first: "Coding × Ai Forge". */
  club: string;
  /** The primary (owning) club. */
  clubId: string | null;
  createdBy: string | null;
}

const EVENT_SELECT =
  "id, title, starts_at, ends_at, status, approval_status, created_by, " +
  "event_clubs ( club_id, is_primary, clubs ( short_name ) )";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  approval_status: string;
  created_by: string | null;
  event_clubs: { club_id: string; is_primary: boolean; clubs: { short_name: string } | null }[];
};

function toRow(e: EventRow): AdminEventRow {
  return {
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    status: e.status,
    approvalStatus: e.approval_status,
    club: hostLabel(orderHosts(e.event_clubs).map((c) => c.short_name)) || "—",
    clubId: hostsFromLinks(e.event_clubs).primaryClubId,
    createdBy: e.created_by,
  };
}

/** True when the session only manages its own club's events. */
function isClubScoped(session: AdminSession): boolean {
  return grantFor(session.role, "manage:events") === "own";
}
```

- [ ] **Step 3: Replace the club-scoped branch of `listEventsForAdmin`**

Replace the `if (isClubScoped(session)) { … }` block inside `listEventsForAdmin` with:

```ts
  if (isClubScoped(session)) {
    // Fail closed: a club-scoped admin with no club sees nothing, never "all".
    if (!session.clubId) return [];

    // Every event this club hosts, as owner or co-host, resolved to ids FIRST.
    // ⚠️ Do not fold this back into one `event_clubs!inner` query filtered on
    // club_id. That filter also strips the embedded link rows down to this
    // club's own, so each row would lose its other hosts and label a co-hosted
    // event as this club's alone.
    const { data: links, error: linkErr } = await admin
      .from("event_clubs")
      .select("event_id")
      .eq("club_id", session.clubId);
    if (linkErr) throw linkErr;
    const ids = [...new Set((links ?? []).map((l) => l.event_id))];
    if (ids.length === 0) return [];

    const { data, error } = await admin
      .from("events")
      .select(EVENT_SELECT)
      .in("id", ids)
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data ?? []) as unknown as EventRow[]).map(toRow);
  }
```

- [ ] **Step 4: Update `EventForEdit` and `getEventForEdit`**

In `interface EventForEdit`, replace:

```ts
  capacity: number | null;
  clubId: string | null;
```

with:

```ts
  capacity: number | null;
  /** The primary (owning) club: the form's "Hosting club". */
  clubId: string | null;
  /** Co-hosting clubs, not including the primary. */
  cohostIds: string[];
  hosts: EventHosts;
```

Replace the doc comment above `getEventForEdit`:

```ts
/**
 * A single event's editable fields + its primary club, for the edit form.
 * Fail-closed for club-scoped admins: returns null (→ 404) unless the event
 * belongs to the admin's own club.
 */
```

with:

```ts
/**
 * A single event's editable fields and its hosting clubs, for the edit form.
 * Fail-closed: returns null (→ 404) unless this admin manages the event through
 * one of its hosting clubs. A co-host's head gets the form, like the owner's.
 */
```

Inside `getEventForEdit`, replace:

```ts
  const primary = row.event_clubs.find((l) => l.is_primary) ?? row.event_clubs[0];
  const clubId = primary?.club_id ?? null;

  if (isClubScoped(session) && (!session.clubId || session.clubId !== clubId)) {
    return null;
  }
```

with:

```ts
  const hosts = hostsFromLinks(row.event_clubs);
  if (!canManageEvent(session, "manage:events", hosts)) return null;
```

and in the returned object replace:

```ts
    capacity: row.capacity,
    clubId,
```

with:

```ts
    capacity: row.capacity,
    clubId: hosts.primaryClubId,
    cohostIds: cohostIdsOf(hosts),
    hosts,
```

- [ ] **Step 5: Label the review page with every host**

In `getEventForReview`, replace:

```ts
  const primary = row.event_clubs.find((l) => l.is_primary) ?? row.event_clubs[0];
```

with nothing (delete the line), and replace:

```ts
    club: primary?.clubs?.name ?? null,
```

with:

```ts
    club: hostLabel(orderHosts(row.event_clubs).map((c) => c.name)) || null,
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

Run: `grep -rn "getEventForEdit(" src`
Expected: only the definition in `src/lib/admin/queries.ts` and the call in `src/app/admin/(app)/events/[id]/edit/page.tsx`. This confirms the widened scope reaches no other caller.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/queries.ts
git commit -m "feat(events): admin list and edit read show every hosting club

The club-scoped list resolves event ids first. An event_clubs!inner filter
also strips the embedded link rows, which would have labelled a co-hosted
event as the viewer's club alone. The edit read now opens for a co-host.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Writing hosts (create, update, duplicate, cancel)

**Files:**
- Create: `src/lib/admin/event-host-store.ts`
- Modify: `src/app/admin/(app)/events/actions.ts`
- Modify: `src/app/admin/(app)/events/[id]/edit/page.tsx`

> ⚠️ **Don't merge the branch between Task 5 and Task 6.** From this task on, the update action rewrites co-hosts from the `cohostIds` the form posts, and the form only starts posting them in Task 6. Saving an edit between the two would clear an event's co-hosts. Live data has none, but the branch still must not ship half-done.

**Interfaces:**
- Consumes: from Task 1, `NO_HOSTS`, `hostsFromLinks`, `cohostIdsOf`, `normalizeCohosts`, `canManageEvent`, `canCancelEvent`, `canSetPrimary`, `planHostChanges`, `isEmptyPlan`, `hostsForCopy`, `type HostPlan`. From Task 4, `EventForEdit.hosts`.
- Produces:
  - `applyHostPlan(eventId: string, plan: HostPlan): Promise<boolean>`
  - `notActiveClubIds(ids: readonly string[]): Promise<string[]>`
  - The create/update actions read `formData.getAll("cohostIds")` and report problems under the field key `cohostIds` (Task 6 renders the input).

- [ ] **Step 1: Create the writer**

Create `src/lib/admin/event-host-store.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HostPlan } from "@/lib/admin/event-hosts";

/**
 * Carries out a `planHostChanges` plan. WHAT changes is decided and tested in
 * `event-hosts.ts`; this file only does it, in the one order that never leaves
 * an event with two primaries or a primary-key clash:
 *
 * 1. delete co-host rows, including a co-host about to become primary, which
 *    frees its (event_id, club_id) key;
 * 2. insert the primary, or repoint the existing primary row in place, so the
 *    event always has exactly one primary (`event_clubs_one_primary_idx`);
 * 3. insert new co-hosts, including a former primary kept on as a co-host.
 *
 * Not transactional, like every other multi-step write in the events actions.
 * Returns false on the first failure so the caller can say so.
 */
export async function applyHostPlan(eventId: string, plan: HostPlan): Promise<boolean> {
  const admin = createAdminClient();

  if (plan.removeCohosts.length > 0) {
    const { error } = await admin
      .from("event_clubs")
      .delete()
      .eq("event_id", eventId)
      // Never the primary row, whatever the plan says.
      .eq("is_primary", false)
      .in("club_id", plan.removeCohosts);
    if (error) return false;
  }

  if (plan.primary?.op === "insert") {
    const { error } = await admin
      .from("event_clubs")
      .insert({ event_id: eventId, club_id: plan.primary.clubId, is_primary: true });
    if (error) return false;
  } else if (plan.primary?.op === "move") {
    const { data, error } = await admin
      .from("event_clubs")
      .update({ club_id: plan.primary.clubId })
      .eq("event_id", eventId)
      .eq("is_primary", true)
      .select("club_id");
    // Zero rows means there was no primary row to move: a failure, not a no-op.
    if (error || !data || data.length === 0) return false;
  }

  if (plan.addCohosts.length > 0) {
    const { error } = await admin
      .from("event_clubs")
      .insert(plan.addCohosts.map((club_id) => ({ event_id: eventId, club_id, is_primary: false })));
    if (error) return false;
  }

  return true;
}

/**
 * The ids here that are not an active club. Checked before anything is
 * written, so a tampered or stale id is refused rather than half-saved.
 */
export async function notActiveClubIds(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("clubs")
    .select("id")
    .in("id", [...ids])
    .eq("is_active", true);
  if (error) throw error;
  const active = new Set((data ?? []).map((c) => c.id));
  return ids.filter((id) => !active.has(id));
}
```

- [ ] **Step 2: Accept `cohostIds` in the event schema**

In `src/app/admin/(app)/events/actions.ts`, replace the imports on lines 7–8:

```ts
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
```

with:

```ts
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import {
  NO_HOSTS,
  canCancelEvent,
  canManageEvent,
  canSetPrimary,
  cohostIdsOf,
  hostsForCopy,
  hostsFromLinks,
  isEmptyPlan,
  normalizeCohosts,
  planHostChanges,
} from "@/lib/admin/event-hosts";
import { applyHostPlan, notActiveClubIds } from "@/lib/admin/event-host-store";
```

In `CreateSchema`, after the `clubId: z.string().uuid("Choose which club is hosting."),` line, add:

```ts
    cohostIds: z
      .array(z.string().uuid("Pick co-hosts from the list."))
      .max(10, "An event can have at most 10 co-hosts.")
      .default([]),
```

In `parseEvent`, after `clubId: formData.get("clubId"),` add:

```ts
    // One entry per ticked checkbox; none ticked is an empty list.
    cohostIds: formData.getAll("cohostIds").map(String),
```

Add this constant directly under `const POSTER_BUCKET = "event-posters";`:

```ts
const COHOST_REFUSED = "One of those clubs can't co-host. Pick from the list.";
```

- [ ] **Step 3: Create writes the co-hosts**

In `createEventAction`, directly after:

```ts
  // Capability + club scope: a club-scoped role may only create for its own club.
  if (!canManage(session, "manage:events", clubId)) {
    return { error: "You can't create events for that club." };
  }
```

add:

```ts
  // Co-hosts are picked directly, with no consent step (spec §2): the audit log
  // records who added whom. A club-scoped creator's own club stays the primary,
  // which the check above already guarantees.
  const cohostIds = normalizeCohosts(clubId, parsed.data.cohostIds);
  if ((await notActiveClubIds(cohostIds)).length > 0) {
    return { fieldErrors: { cohostIds: COHOST_REFUSED } };
  }
```

Replace the link insert:

```ts
  const { error: linkErr } = await admin
    .from("event_clubs")
    .insert({ event_id: ev.id, club_id: clubId, is_primary: true });
  if (linkErr) {
    await admin.from("events").delete().eq("id", ev.id); // avoid an orphan event
    if (poster.path) await admin.storage.from(POSTER_BUCKET).remove([poster.path]);
    return { error: "Could not link the event to its club. Try again." };
  }
```

with:

```ts
  const linked = await applyHostPlan(
    ev.id,
    planHostChanges(NO_HOSTS, { primaryClubId: clubId, cohostIds }),
  );
  if (!linked) {
    // Avoid an orphan event; any link rows already written cascade with it.
    await admin.from("events").delete().eq("id", ev.id);
    if (poster.path) await admin.storage.from(POSTER_BUCKET).remove([poster.path]);
    return { error: "Could not link the event to its clubs. Try again." };
  }
```

Replace the create audit:

```ts
  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "event",
    entityId: ev.id,
    after: { title, approval_status: autoApproved ? "approved" : "pending" },
  });
```

with:

```ts
  await writeAudit({
    actorId: session.id,
    action: "create",
    entity: "event",
    entityId: ev.id,
    after: { title, approval_status: autoApproved ? "approved" : "pending" },
  });
  if (cohostIds.length > 0) {
    await writeAudit({
      actorId: session.id,
      action: "event_cohosts_changed",
      entity: "event",
      entityId: ev.id,
      before: { primary_club_id: null, cohost_ids: [] },
      after: { primary_club_id: clubId, cohost_ids: cohostIds },
    });
  }
```

- [ ] **Step 4: Update authorises through hosts and reconciles co-hosts**

In `updateEventAction`, replace:

```ts
  const currentClubId =
    (existing.event_clubs.find((l) => l.is_primary) ?? existing.event_clubs[0])?.club_id ?? null;

  // Authorise: must manage the event's current club, and — if moving it — the new
  // club too. Club-scoped roles can therefore neither edit another club's event
  // nor hand one to another club.
  if (!canManage(session, "manage:events", currentClubId)) {
    return { error: "You can't edit that event." };
  }
  if (clubId !== currentClubId && !canManage(session, "manage:events", clubId)) {
    return { error: "You can't move the event to that club." };
  }
```

with:

```ts
  const hosts = hostsFromLinks(existing.event_clubs);
  const cohostIds = normalizeCohosts(clubId, parsed.data.cohostIds);

  // Authorise through ANY hosting club: a co-host edits the event like its owner.
  if (!canManageEvent(session, "manage:events", hosts)) {
    return { error: "You can't edit that event." };
  }
  // Changing which club OWNS the event is narrower. A co-host may add and remove
  // co-hosts, itself included, but never take the primary, or it could lock the
  // owning club out of cancelling its own event. And no club-scoped role may hand
  // an event to a club it does not manage, which this action has always refused,
  // so in practice only council roles reassign the primary.
  if (
    clubId !== hosts.primaryClubId &&
    (!canSetPrimary(session, hosts) || !canManage(session, "manage:events", clubId))
  ) {
    return { error: "Only the owning club or the council can change which club hosts this event." };
  }
  const hostPlan = planHostChanges(hosts, { primaryClubId: clubId, cohostIds });
  // Only NEW co-hosts are checked. A co-host kept from before stays even if its
  // club has since been made inactive.
  if ((await notActiveClubIds(hostPlan.addCohosts)).length > 0) {
    return { fieldErrors: { cohostIds: COHOST_REFUSED } };
  }
```

Replace the primary-move block:

```ts
  // Move the primary club link if the hosting club changed.
  if (clubId !== currentClubId) {
    const { error: linkErr } = await admin
      .from("event_clubs")
      .update({ club_id: clubId })
      .eq("event_id", eventId)
      .eq("is_primary", true);
    if (linkErr) return { error: "Saved, but couldn't update the hosting club. Try again." };
  }
```

with:

```ts
  // Reconcile the hosting clubs: add and remove co-hosts, and move the primary
  // if a council role changed it. Adding a co-host never re-triggers approval.
  if (!isEmptyPlan(hostPlan)) {
    if (!(await applyHostPlan(eventId, hostPlan))) {
      return { error: "Saved, but couldn't update the hosting clubs. Try again." };
    }
    await writeAudit({
      actorId: session.id,
      action: "event_cohosts_changed",
      entity: "event",
      entityId: eventId,
      before: { primary_club_id: hosts.primaryClubId, cohost_ids: cohostIdsOf(hosts) },
      after: { primary_club_id: clubId, cohost_ids: cohostIds },
    });
  }
```

In the final `update` audit, replace `club_id: currentClubId,` with `club_id: hosts.primaryClubId,`.

- [ ] **Step 5: Duplicate keeps the hosts**

In `duplicateEventAction`, replace:

```ts
  const clubId =
    (src.event_clubs.find((l) => l.is_primary) ?? src.event_clubs[0])?.club_id ?? null;
  if (!clubId || !canManage(session, "manage:events", clubId)) redirect("/admin/events");
```

with:

```ts
  const hosts = hostsFromLinks(src.event_clubs);
  if (!hosts.primaryClubId || !canManageEvent(session, "manage:events", hosts)) {
    redirect("/admin/events");
  }
  // A duplicate is a creation: a co-host's copy is owned by their own club.
  const copy = hostsForCopy(session, hosts);
```

Replace the link insert:

```ts
  const { error: linkErr } = await admin
    .from("event_clubs")
    .insert({ event_id: ev.id, club_id: clubId, is_primary: true });
  if (linkErr) {
    await admin.from("events").delete().eq("id", ev.id); // avoid an orphan event
    redirect("/admin/events");
  }
```

with:

```ts
  const linked = await applyHostPlan(
    ev.id,
    planHostChanges(NO_HOSTS, {
      primaryClubId: copy.primaryClubId ?? hosts.primaryClubId,
      cohostIds: cohostIdsOf(copy),
    }),
  );
  if (!linked) {
    await admin.from("events").delete().eq("id", ev.id); // avoid an orphan event
    redirect("/admin/events");
  }
```

In the duplicate audit, replace:

```ts
    after: { source: eventId, title: `Copy of ${src.title}`.slice(0, 140) },
```

with:

```ts
    after: {
      source: eventId,
      title: `Copy of ${src.title}`.slice(0, 140),
      primary_club_id: copy.primaryClubId,
      cohost_ids: cohostIdsOf(copy),
    },
```

- [ ] **Step 6: Cancel stays with the owner**

In `cancelEventAction`, replace:

```ts
  const clubId =
    (ev.event_clubs.find((l) => l.is_primary) ?? ev.event_clubs[0])?.club_id ?? null;

  // Cancel is its own capability (§9): club heads may cancel their own club's
  // events, but vice heads (manage but not cancel) may not.
  if (!canManage(session, "cancel:events", clubId)) {
```

with:

```ts
  // Cancel is its own capability (§9), and it stays with the club that OWNS the
  // event: a co-host can edit, take attendance and enter results, but not cancel.
  // Vice heads (manage but not cancel) still may not.
  if (!canCancelEvent(session, hostsFromLinks(ev.event_clubs))) {
```

- [ ] **Step 7: Lock the edit form to the owning club, and gate cancel through hosts**

In `src/app/admin/(app)/events/[id]/edit/page.tsx`, replace line 3:

```ts
import { grantFor, canManage } from "@/lib/auth/capabilities";
```

with:

```ts
import { grantFor } from "@/lib/auth/capabilities";
import { canCancelEvent } from "@/lib/admin/event-hosts";
```

Replace:

```tsx
  // Club-scoped roles keep the hosting club locked, same as create.
  const clubScoped = grantFor(session.role, "manage:events") === "own";
  const fixedClub =
    clubScoped && session.clubId
      ? clubs.find((c) => c.id === session.clubId) ?? null
      : null;

  const isCancelled = event.status === "cancelled";
  const canCancel = canManage(session, "cancel:events", event.clubId);
```

with:

```tsx
  // Club-scoped roles keep the hosting club locked, locked to the club that OWNS
  // the event. ⚠️ Not to their own club: for a co-host those differ, and posting
  // their own club here would read as taking the primary, so every save a
  // co-host made would be refused.
  const clubScoped = grantFor(session.role, "manage:events") === "own";
  const fixedClub = clubScoped ? clubs.find((c) => c.id === event.clubId) ?? null : null;

  const isCancelled = event.status === "cancelled";
  const canCancel = canCancelEvent(session, event.hosts);
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

Run: `grep -n "is_primary" "src/app/admin/(app)/events/actions.ts"`
Expected: only the three `event_clubs ( club_id, is_primary )` select strings. There should be no `.find(` resolving a primary by hand.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin/event-host-store.ts "src/app/admin/(app)/events/actions.ts" "src/app/admin/(app)/events/[id]/edit/page.tsx"
git commit -m "feat(events): save co-hosts on create, edit and duplicate

A co-host edits like the owner but cannot cancel or take the primary.
Changing the primary still needs the destination club, so only the council
reassigns. Link rows are written delete, then primary, then add, so an event
never has two primaries. Audited as event_cohosts_changed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The co-host picker

**Files:**
- Create: `src/components/admin/CohostPicker.tsx`
- Test: `src/components/admin/CohostPicker.test.tsx`
- Modify: `src/components/admin/EventForm.tsx`
- Modify: `src/app/admin/(app)/events/[id]/edit/page.tsx` (the `initial` prop)

**Interfaces:**
- Consumes: from Task 4, `EventForEdit.cohostIds`. The `cohostIds` field-error key from Task 5.
- Produces:
  - `CohostPicker({ clubs, primaryClubId, selected, fieldErrors }: { clubs: { id: string; name: string }[]; primaryClubId: string; selected: readonly string[]; fieldErrors?: Record<string, string> })`
  - `EventFormInitial.cohostIds: string[]`

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/CohostPicker.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CohostPicker } from "./CohostPicker";

const clubs = [
  { id: "c-coding", name: "Coding Club" },
  { id: "c-forge", name: "AI Forge" },
  { id: "c-yoga", name: "Yoga Club" },
];

const render = (over: Partial<Parameters<typeof CohostPicker>[0]> = {}) =>
  renderToStaticMarkup(
    <CohostPicker clubs={clubs} primaryClubId="c-coding" selected={[]} {...over} />,
  );

/** The whole <input> tag for one club, so assertions don't depend on attribute order. */
const inputFor = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? null;

describe("CohostPicker", () => {
  it("offers every club except the one hosting", () => {
    const html = render();
    expect(inputFor(html, "c-coding")).toBeNull();
    expect(html).toContain("AI Forge");
    expect(html).toContain("Yoga Club");
  });

  it("offers every club before a hosting club is chosen", () => {
    const html = render({ primaryClubId: "" });
    for (const c of clubs) expect(inputFor(html, c.id)).not.toBeNull();
  });

  it("posts each tick as cohostIds", () => {
    expect(render().match(/name="cohostIds"/g)).toHaveLength(2);
  });

  it("ticks the current co-hosts and nothing else", () => {
    const html = render({ selected: ["c-forge"] });
    expect(inputFor(html, "c-forge")).toContain("checked");
    expect(inputFor(html, "c-yoga")).not.toContain("checked");
  });

  it("shows the complaint under the picker and marks the field", () => {
    const html = render({ fieldErrors: { cohostIds: "One of those clubs can't co-host." } });
    expect(html).toContain("One of those clubs can&#x27;t co-host.");
    expect(html).toContain('class="field err"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/admin/CohostPicker.test.tsx`
Expected: FAIL, with `Failed to resolve import "./CohostPicker"`.

- [ ] **Step 3: Write the component**

Create `src/components/admin/CohostPicker.tsx`:

```tsx
import { FieldError, fieldClass } from "@/components/admin/FieldError";

interface Option {
  id: string;
  name: string;
}

/**
 * Co-hosting clubs for an event, one checkbox each (spec 2026-09-15 §2).
 *
 * The hosting club is left out rather than shown disabled, because a club is
 * never its own co-host. The server drops it anyway (`normalizeCohosts`), so
 * this is only about not offering a choice that means nothing. A co-host may
 * untick its own club: that takes the club off the event.
 */
export function CohostPicker({
  clubs,
  primaryClubId,
  selected,
  fieldErrors,
}: {
  clubs: Option[];
  primaryClubId: string;
  selected: readonly string[];
  fieldErrors?: Record<string, string>;
}) {
  const choices = clubs.filter((c) => c.id !== primaryClubId);

  return (
    <div className={fieldClass(fieldErrors, "cohostIds")} role="group" aria-labelledby="cohosts-label">
      <span id="cohosts-label" style={{ font: "500 12px var(--sans)", color: "var(--ink-2)" }}>
        Co-hosting clubs (optional)
      </span>
      {choices.map((c) => (
        <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input
            type="checkbox"
            name="cohostIds"
            value={c.id}
            defaultChecked={selected.includes(c.id)}
          />
          {c.name}
        </label>
      ))}
      <span className="hint">
        Co-hosts can edit the event, take attendance, manage registrations and enter results. Only
        the hosting club or the council can cancel it.
      </span>
      <FieldError errors={fieldErrors} name="cohostIds" />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/admin/CohostPicker.test.tsx`
Expected: PASS. If the apostrophe assertion fails only on encoding, check the rendered HTML and match React's actual escape for `'`. Do not change the message text.

- [ ] **Step 5: Put the picker in `EventForm`**

In `src/components/admin/EventForm.tsx`:

Replace line 3:

```ts
import { useActionState } from "react";
```

with:

```ts
import { useActionState, useState } from "react";
```

After line 8 (`import { FieldError, fieldClass } from "@/components/admin/FieldError";`) add:

```ts
import { CohostPicker } from "@/components/admin/CohostPicker";
```

In `interface EventFormInitial`, after `clubId: string;` add:

```ts
  /** Co-hosting clubs, not including the primary. */
  cohostIds: string[];
```

Directly after `const [state, formAction, pending] = useActionState(action, emptyState);` add:

```ts
  // Tracked only so the co-host list can leave out whichever club is hosting.
  const [primaryId, setPrimaryId] = useState(fixedClub?.id ?? initial?.clubId ?? "");
```

On the hosting-club `<select>`, replace:

```tsx
          <select id="clubId" name="clubId" required defaultValue={initial?.clubId ?? ""}>
```

with:

```tsx
          <select
            id="clubId"
            name="clubId"
            required
            defaultValue={initial?.clubId ?? ""}
            onChange={(e) => setPrimaryId(e.target.value)}
          >
```

Directly after the closing `)}` of the `{fixedClub ? ( … ) : ( … )}` hosting-club block (before the Venue field), add:

```tsx
      <CohostPicker
        clubs={clubs}
        primaryClubId={primaryId}
        selected={initial?.cohostIds ?? []}
        fieldErrors={state.fieldErrors}
      />
```

- [ ] **Step 6: Pass the current co-hosts from the edit page**

In `src/app/admin/(app)/events/[id]/edit/page.tsx`, in the `initial={{ … }}` object, after `clubId: event.clubId ?? "",` add:

```tsx
          cohostIds: event.cohostIds,
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. The new-event page passes no `initial`, so it needs no change.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/CohostPicker.tsx src/components/admin/CohostPicker.test.tsx src/components/admin/EventForm.tsx "src/app/admin/(app)/events/[id]/edit/page.tsx"
git commit -m "feat(events): pick co-hosting clubs on the event form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Public display and calendar filtering

**Files:**
- Modify: `src/lib/types.ts:22-66`
- Modify: `src/lib/queries.ts` (imports, `primaryClubName`, `toSummary`, `EventDetail`, `getEventDetail`, `toCalendarEvent`, `getWeekStrip`, `getAchievementsBoard`)
- Modify: `src/lib/calendar-layout.ts:95-107`
- Test: `src/lib/calendar-layout.test.ts`
- Modify: `src/components/calendar/Calendar.tsx:7-12,112-115`
- Modify: `src/app/events/[id]/page.tsx` (after the `<h1>`)

**Interfaces:**
- Consumes: from Task 2, `orderHosts`, `hostLabel`, `hostedByLine`.
- Produces:
  - `CalendarEvent.clubSlugs: string[]` (every host's slug, primary first; `["council"]` when there are no hosts)
  - `EventDetail.hostedBy: string | null`
  - `filterByClubs(events: readonly CalendarEvent[], active: ReadonlySet<string> | null): CalendarEvent[]`

- [ ] **Step 1: Write the failing calendar tests**

In `src/lib/calendar-layout.test.ts`:

Add `filterByClubs` to the import list (between `clubsInRange,` and `normalizeView,`).

In the `ev()` fixture, after `clubSlug: "coding",` add:

```ts
    clubSlugs: ["coding"],
```

In `describe("clubsInRange", …)`, replace:

```ts
      ev({ id: "a", clubSlug: "ai-forge" }),
      ev({ id: "b", clubSlug: "coding" }),
```

with:

```ts
      ev({ id: "a", clubSlug: "ai-forge", clubSlugs: ["ai-forge"] }),
      ev({ id: "b", clubSlug: "coding", clubSlugs: ["coding"] }),
```

replace:

```ts
    expect(clubsInRange([ev({ clubSlug: "ghost" })], clubs)).toEqual([]);
```

with:

```ts
    expect(clubsInRange([ev({ clubSlug: "ghost", clubSlugs: ["ghost"] })], clubs)).toEqual([]);
```

and add at the end of that `describe`:

```ts
  it("offers a chip for a club that only co-hosts an event", () => {
    const events = [ev({ clubSlug: "coding", clubSlugs: ["coding", "ai-forge"] })];
    expect(clubsInRange(events, clubs).map((c) => c.slug)).toEqual(["coding", "ai-forge"]);
  });
```

Append a new block at the end of the file:

```ts
describe("filterByClubs", () => {
  const solo = ev({ id: "solo", clubSlug: "yoga", clubSlugs: ["yoga"] });
  const joint = ev({ id: "joint", clubSlug: "coding", clubSlugs: ["coding", "ai-forge"] });

  it("shows everything when no club is chosen", () => {
    expect(filterByClubs([solo, joint], null).map((e) => e.id)).toEqual(["solo", "joint"]);
  });

  // ⚠️ The point of §3: filtering by the club that co-ran an event must find it.
  it("finds a co-hosted event under its SECONDARY club", () => {
    expect(filterByClubs([solo, joint], new Set(["ai-forge"])).map((e) => e.id)).toEqual(["joint"]);
  });

  it("still finds it under its primary", () => {
    expect(filterByClubs([solo, joint], new Set(["coding"])).map((e) => e.id)).toEqual(["joint"]);
  });

  it("hides events no chosen club hosts", () => {
    expect(filterByClubs([solo, joint], new Set(["nature"]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/calendar-layout.test.ts`
Expected: FAIL. `filterByClubs` is not exported, and the co-host chip test fails because `clubsInRange` still reads `clubSlug`.

- [ ] **Step 3: Implement the calendar helpers**

In `src/lib/calendar-layout.ts`, replace the `clubsInRange` function body line:

```ts
  const present = new Set(events.map((e) => e.clubSlug));
```

with:

```ts
  // Every host counts: a club that only co-hosts still gets its chip.
  const present = new Set(events.flatMap((e) => e.clubSlugs));
```

and add directly after the `clubsInRange` function:

```ts
/**
 * The events a club filter shows. An event appears under EVERY club hosting it,
 * so filtering by a co-host still finds the event it co-ran. `null` = no filter.
 */
export function filterByClubs(
  events: readonly CalendarEvent[],
  active: ReadonlySet<string> | null,
): CalendarEvent[] {
  return active ? events.filter((e) => e.clubSlugs.some((s) => active.has(s))) : [...events];
}
```

In `src/lib/types.ts`, in `interface CalendarEvent`, replace:

```ts
  /** Primary club: short name for chips, slug for filtering, colour for the rail. */
  club: string;
  clubSlug: string;
  clubColor: string;
```

with:

```ts
  /** Every hosting club's short name, primary first: "Coding × Ai Forge". */
  club: string;
  /** The PRIMARY club's slug, paired with `clubColor`: a dot is one colour. */
  clubSlug: string;
  /** Every hosting club's slug, primary first. Filtering matches any of them. */
  clubSlugs: string[];
  /** The primary club's calendar colour. */
  clubColor: string;
```

and in `interface EventSummary`, replace:

```ts
  /** Primary club display name. */
  club: string;
```

with:

```ts
  /** Every hosting club's display name, primary first: "Coding Club × AI Forge". */
  club: string;
```

In `src/components/calendar/Calendar.tsx`, add `filterByClubs,` to the `@/lib/calendar-layout` import (after `clubsInRange,`), and replace:

```ts
  const filtered = useMemo(
    () => (active ? events.filter((e) => active.has(e.clubSlug)) : events),
    [events, active],
  );
```

with:

```ts
  const filtered = useMemo(() => filterByClubs(events, active), [events, active]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/calendar-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Public queries print every host**

In `src/lib/queries.ts`, add to the imports at the top of the file:

```ts
import { hostLabel, hostedByLine, orderHosts } from "@/lib/event-hosts";
```

Replace:

```ts
function primaryClubName(row: EventJoinRow): string {
  const primary = row.event_clubs.find((ec) => ec.is_primary) ?? row.event_clubs[0];
  return primary?.clubs?.name ?? "CSE Council";
}
```

with:

```ts
/** Every hosting club's full name, primary first. */
function hostNames(row: EventJoinRow): string[] {
  return orderHosts(row.event_clubs).map((c) => c.name);
}
```

In `toSummary`, replace `club: primaryClubName(row),` with:

```ts
    club: hostLabel(hostNames(row)) || "CSE Council",
```

In `interface EventDetail`, after `description: string;` add:

```ts
  /** "Hosted by Coding Club with AI Forge", or null when one club hosts. */
  hostedBy: string | null;
```

In `getEventDetail`'s returned object, after `description: row.description ?? "",` add:

```ts
    hostedBy: hostedByLine(hostNames(row)),
```

In `toCalendarEvent`, replace:

```ts
  const primary = row.event_clubs.find((ec) => ec.is_primary) ?? row.event_clubs[0];
  const club = primary?.clubs;
```

with:

```ts
  const hosts = orderHosts(row.event_clubs);
  const club = hosts[0];
```

and replace:

```ts
    club: club?.short_name ?? "Council",
    clubSlug: club?.slug ?? "council",
```

with:

```ts
    club: hostLabel(hosts.map((c) => c.short_name)) || "Council",
    clubSlug: club?.slug ?? "council",
    clubSlugs: hosts.length > 0 ? hosts.map((c) => c.slug) : ["council"],
```

In `getWeekStrip`, replace:

```ts
    const primary = e.event_clubs.find((x) => x.is_primary) ?? e.event_clubs[0];
    byDay.set(key, {
      time: istTime(e.starts_at),
      title: e.title,
      club: primary?.clubs?.short_name ?? "",
    });
```

with:

```ts
    byDay.set(key, {
      time: istTime(e.starts_at),
      title: e.title,
      club: hostLabel(orderHosts(e.event_clubs).map((c) => c.short_name)),
    });
```

In `getAchievementsBoard`, replace:

```ts
    const primary = e.event_clubs?.find((ec) => ec.is_primary) ?? e.event_clubs?.[0];
```

with nothing (delete the line), and replace:

```ts
      clubName: primary?.clubs?.name ?? null,
```

with:

```ts
      clubName: hostLabel(orderHosts(e.event_clubs).map((c) => c.name)) || null,
```

- [ ] **Step 6: The "Hosted by" line on the event page**

In `src/app/events/[id]/page.tsx`, replace:

```tsx
        <h1 style={{ margin: "12px 0 0" }}>{event.title}</h1>
```

with:

```tsx
        <h1 style={{ margin: "12px 0 0" }}>{event.title}</h1>
        {/* Says outright what the "×" above the title means, for a co-hosted event. */}
        {event.hostedBy ? (
          <p className="body-text" style={{ marginTop: 6, color: "var(--ink-2)" }}>
            {event.hostedBy}
          </p>
        ) : null}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS. If typecheck flags another object literal typed `CalendarEvent` (for example a component test fixture), add `clubSlugs: [<its clubSlug>]` to it.

Run: `grep -rn "is_primary)" src/lib/queries.ts`
Expected: no output. No public read picks a primary by hand any more.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/queries.ts src/lib/calendar-layout.ts src/lib/calendar-layout.test.ts src/components/calendar/Calendar.tsx "src/app/events/[id]/page.tsx"
git commit -m "feat(events): show every hosting club publicly and filter by any of them

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full gate, leftover audit and handoff

**Files:**
- Modify: `docs/STATUS.md` (new block at the top of START HERE)

- [ ] **Step 1: Audit for primary-only resolution left behind**

Run:

```bash
grep -rn "is_primary) ??" src --include=*.ts --include=*.tsx
```

Expected: exactly these, all intentional:
- `src/lib/admin/event-hosts.ts` (`hostsFromLinks`, the one sanctioned resolver)
- `src/lib/admin/certificates.ts` in `getCertEvent` (certificate branding carries one club, spec §4)
- `src/lib/certificates/verify-lookup.ts` (the `/verify` page names the certificate's club, spec §4)

Any other hit is a missed site. Route it through `hostsFromLinks`/`canManageEvent` (authorisation) or `orderHosts`/`hostLabel` (display).

Run:

```bash
grep -rn "canManage([^)]*event[^)]*\.clubId\|canManage([^)]*ev\.clubId" src --include=*.ts --include=*.tsx
```

Expected: no output.

- [ ] **Step 2: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all PASS. Note the test count vitest prints for the STATUS block.

- [ ] **Step 3: Write the handoff block**

In `docs/STATUS.md`, directly under the line `## 🚦 START HERE — current git/deploy state (2026-09-16)`, insert this block, with `<N>` replaced by the test count from Step 2:

```markdown
> ### 🧩 BUILT ON `feat/co-hosted-events`, NOT MERGED — co-hosted events (2026-09-17)
>
> Spec `docs/superpowers/specs/2026-09-15-co-hosted-events-design.md`, plan
> `docs/superpowers/plans/2026-09-17-co-hosted-events.md`. Gate: typecheck ✓ lint ✓ **<N> tests** ✓
> build ✓. **No migration**: `event_clubs` always allowed several clubs per event. **Needs the owner's
> signed-in walkthrough before merging** (every admin has TOTP); the six steps end the spec.
>
> - **Every event permission check now goes through `src/lib/admin/event-hosts.ts`.**
>   `canManageEvent` / `canViewEvent` match ANY hosting club; `canCancelEvent` and `canSetPrimary`
>   match the PRIMARY only. `getEventForAttendance` returns `hosts`, not `clubId`, so a check against
>   the primary alone no longer typechecks.
> - ⚠️ **The asymmetry this fixed:** the club-scoped event list matched any `event_clubs` row while
>   every check read the primary, so a co-host's head would have seen the event and been refused on it.
> - ⚠️ **`listEventsForAdmin` resolves event ids first.** An `event_clubs!inner` filter also strips the
>   OTHER hosts from each row's embed. Do not fold it back into one query.
> - ⚠️ **A co-host cannot cancel or reassign the primary.** Changing the primary also still needs the
>   destination club, so in practice only the council reassigns.
> - ⚠️ **The edit form locks a club-scoped role to the event's PRIMARY club, not their own.** Posting
>   their own club would read as taking the primary and refuse every co-host save.
> - A co-host's **duplicate** is owned by their club, with the original owner kept as co-host.
> - The email composer's event audience and the calendar's filter chips follow co-hosts too.
> - Public: "Coding × Ai Forge" wherever a club name showed, plus a "Hosted by … with …" line on the
>   event page. Unchanged on purpose: certificate branding and the calendar dot colour stay the primary's.
> - Audited as `event_cohosts_changed` (before/after `primary_club_id` + `cohost_ids`).
```

Also update the `**Last updated:**` line near the top of the file to start with `2026-09-17 (co-hosted events built on branch, unmerged; `, keeping the rest of the existing text.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): co-hosted events built on branch, awaiting walkthrough

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Stop. Do not merge or push.**

Report the branch state (`git log --oneline main..feat/co-hosted-events`) and hand the walkthrough below to the owner.

---

## Verification when built (owner, signed-in browser + authenticator)

From spec §"Verification when built":

1. As `sandy` (tech_head), edit an event and add a second club. Confirm the public event page, an event card and the calendar all read "A × B", and that the event page says "Hosted by A with B".
2. Filter the calendar by the **secondary** club. The event must still appear, and that club's chip must be offered.
3. Sign in as the **secondary** club's head. The event appears in their list **and** they can open, edit and take attendance on it. (Before this work they'd have been refused.)
4. As that same secondary head, confirm there is **no** cancel option and that the hosting club is shown locked to the primary.
5. As the primary club's head, confirm cancel still works.
6. Remove the co-host and confirm the event reads as single-club again. `/admin/audit` should show two `event_cohosts_changed` rows naming who did it.
