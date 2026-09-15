# Broadcast Email, Event Reminders and `.ics` Feeds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the council a button to remind an event's registrants, subscribable `.ics` calendar feeds for students, and a composer that can mail club heads, council members, a club's members or all 908 students without exceeding what Gmail SMTP can actually deliver.

**Architecture:** Three independent slices sharing one queue. `.ics` is a pure RFC 5545 renderer behind three public route handlers. The reminder is a client-side prefill of the existing participant-email form — it reuses `broadcastAction` untouched. The composer adds a `manage:broadcast` capability, pure audience/permission logic, a server-only recipient resolver, and an Outbox that drains the queue in batches because bulk sends are queued rather than sent inline.

**Tech Stack:** Next.js 16 App Router (server actions + route handlers), React 19, TypeScript, Supabase (`supabase-js`, service role for admin reads), nodemailer over Gmail SMTP, Zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-15-broadcast-email-and-ics-design.md` — read it before Task 1. It carries the measured recipient counts and the reasoning behind the queue threshold.

## Global Constraints

- **Line endings are LF.** This repo is LF-only. Never write files with CRLF.
- **No database migration in this plan.** Every audience reads an existing table. If you think you need a migration, stop and re-read the spec.
- **Never run `supabase db push`** — the migration ledger and filenames share no version numbers; a push would replay 35+ migrations against a live schema. Migrations only ever go through the Supabase MCP `apply_migration` tool.
- **This is Next.js 16, not the Next.js you remember.** Read the relevant guide under `node_modules/next/dist/docs/` before writing routing or server-action code.
- `dangerouslySetInnerHTML` is banned by lint (SECURITY_SPEC §5).
- Every exported handler in `src/app/api/admin/**/route.ts` must call `requireSession` / `requireRole` / `requireCapability` — enforced by `eslint-rules/admin-route-requires-guard.mjs`. The `.ics` routes in this plan are public and outside that glob.
- **Club scope is always read from the database, never from the form.** A posted `clubId` is an input, not an authorisation.
- Tests live beside their source as `*.test.ts` (`src/**/*.test.{ts,tsx}`, vitest, node environment).
- Commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- `events.reminder_sent` (boolean) already exists in the schema, left over from the cron design that is **not** being built. Do not use it, do not remove it.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/ics.ts` | Pure RFC 5545 renderer: escaping, folding, VEVENT/VCALENDAR assembly |
| `src/lib/ics.test.ts` | Its tests |
| `src/app/events/[id]/event.ics/route.ts` | One event, as a download |
| `src/app/calendar.ics/route.ts` | All events, subscribable |
| `src/app/clubs/[slug]/events.ics/route.ts` | One club's events, subscribable |
| `src/lib/admin/reminder-text.ts` | Pure: builds reminder subject + body from an event |
| `src/lib/admin/reminder-text.test.ts` | Its tests |
| `src/lib/admin/broadcast-audience.ts` | Pure: audience type, parsing, labels, permission, dedupe, threshold |
| `src/lib/admin/broadcast-audience.test.ts` | Its tests |
| `src/lib/admin/broadcast-recipients.ts` | Server-only: one query per audience kind |
| `src/lib/email/bulk.ts` | Pure: chunking + row mapping for batch enqueue |
| `src/lib/email/bulk.test.ts` | Its tests |
| `src/app/admin/(app)/email/page.tsx` | The composer page |
| `src/app/admin/(app)/email/actions.ts` | `sendBroadcastAction` |
| `src/components/admin/BroadcastComposer.tsx` | Composer client component |
| `src/app/admin/(app)/outbox/page.tsx` | Queue state |
| `src/app/admin/(app)/outbox/actions.ts` | `drainBatchAction`, `retryFailedAction` |
| `src/components/admin/OutboxPanel.tsx` | Outbox client component |

**Modified**

| File | Change |
|---|---|
| `src/lib/queries.ts` | `getIcsEvents()` |
| `src/lib/admin/attendance.ts` | `getEventForAttendance` also returns `endsAt`, `isAllDay`, `venue` |
| `src/components/admin/BroadcastForm.tsx` | Reminder prefill button, "Last emailed" line |
| `src/app/admin/(app)/events/[id]/email/page.tsx` | Pass reminder text + last-sent |
| `src/lib/auth/capabilities.ts` | `manage:broadcast` |
| `src/lib/auth/capabilities.test.ts` | Its matrix row |
| `src/lib/email.ts` | `deferred` option, `enqueueEmailBatch` |
| `src/lib/email/send.ts` | `List-Unsubscribe` for bulk rows |
| `src/lib/email/resend.ts` | `headers` on `SendArgs` |
| `src/lib/email/gmail.ts` | Pass `headers` through |
| `src/app/api/cron/send-email/route.ts` | Drain 25 → 100 |
| `src/app/admin/(app)/layout.tsx` | Email + Outbox nav links |
| `src/lib/admin/nav.test.ts` | Updated label expectations |
| `src/app/events/[id]/page.tsx` | "Add to calendar" link |
| `src/app/calendar/page.tsx` | "Subscribe" link |
| `src/app/clubs/[slug]/page.tsx` | "Subscribe" link |
| `docs/STATUS.md` | What shipped |

**Dependency order:** Tasks 1–3 (`.ics`) and 4–5 (reminder) are independent of each other and of the rest. Tasks 6–11 are a chain: capability → pure audience logic → queue plumbing → recipients → composer → outbox.

---

### Task 1: The `.ics` renderer

**Files:**
- Create: `src/lib/ics.ts`
- Test: `src/lib/ics.test.ts`

**Interfaces:**
- Consumes: `istDateKey`, `addDays` from `@/lib/datetime`
- Produces:
  - `interface IcsEvent { id, title, description, startsAt, endsAt, isAllDay, location, url, updatedAt, cancelled }` — all strings except `isAllDay`/`cancelled` (boolean) and `description`/`location` (`string | null`)
  - `escapeText(s: string): string`
  - `foldLine(line: string): string`
  - `renderCalendar(events: IcsEvent[], opts: { host: string; name: string }): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { escapeText, foldLine, renderCalendar, type IcsEvent } from "./ics";

const timed: IcsEvent = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Hackathon 2026",
  description: "24 hours, bring a laptop.",
  startsAt: "2026-09-20T04:30:00.000Z", // 10:00 IST
  endsAt: "2026-09-20T07:30:00.000Z",
  isAllDay: false,
  location: "Seminar Hall 2",
  url: "https://cse-ccc.vercel.app/events/11111111-2222-3333-4444-555555555555",
  updatedAt: "2026-09-15T06:00:00.000Z",
  cancelled: false,
};

const opts = { host: "cse-ccc.vercel.app", name: "CSE Club Council" };

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newline", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeText("Hackathon 2026")).toBe("Hackathon 2026");
  });
});

describe("foldLine", () => {
  it("leaves a short line unfolded", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds a long line into chunks of at most 75 octets", () => {
    const folded = foldLine("DESCRIPTION:" + "x".repeat(200)).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    }
    // every continuation line begins with one space
    for (const part of folded.slice(1)) expect(part.startsWith(" ")).toBe(true);
    // unfolding restores the original
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      "DESCRIPTION:" + "x".repeat(200),
    );
  });

  it("counts octets, not characters, and never splits a codepoint", () => {
    const folded = foldLine("SUMMARY:" + "—".repeat(40)).split("\r\n");
    for (const part of folded) {
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
      expect(part.includes("�")).toBe(false);
    }
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      "SUMMARY:" + "—".repeat(40),
    );
  });
});

describe("renderCalendar", () => {
  it("emits a well-formed calendar for a timed event", () => {
    const out = renderCalendar([timed], opts);
    expect(out.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(out.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(out).toContain("VERSION:2.0");
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain(`UID:${timed.id}@cse-ccc.vercel.app`);
    expect(out).toContain("DTSTART:20260920T043000Z");
    expect(out).toContain("DTEND:20260920T073000Z");
    expect(out).toContain("SUMMARY:Hackathon 2026");
    expect(out).toContain("LOCATION:Seminar Hall 2");
    expect(out).toContain("LAST-MODIFIED:20260915T060000Z");
  });

  it("uses CRLF for every line break", () => {
    const out = renderCalendar([timed], opts);
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("writes an all-day event as a DATE with an exclusive end", () => {
    const out = renderCalendar(
      [{ ...timed, isAllDay: true, endsAt: "2026-09-20T18:29:00.000Z" }],
      opts,
    );
    expect(out).toContain("DTSTART;VALUE=DATE:20260920");
    expect(out).toContain("DTEND;VALUE=DATE:20260921");
  });

  it("marks a cancelled event rather than dropping it", () => {
    const out = renderCalendar([{ ...timed, cancelled: true }], opts);
    expect(out).toContain("STATUS:CANCELLED");
    expect(out).toContain("SUMMARY:Hackathon 2026");
  });

  it("gives a live event STATUS:CONFIRMED", () => {
    expect(renderCalendar([timed], opts)).toContain("STATUS:CONFIRMED");
  });

  it("keeps the UID stable across renders so a re-poll updates in place", () => {
    const a = renderCalendar([timed], opts);
    const b = renderCalendar([timed], opts);
    expect(a.match(/UID:.*/)?.[0]).toBe(b.match(/UID:.*/)?.[0]);
  });

  it("still produces a valid calendar with no events", () => {
    const out = renderCalendar([], opts);
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("END:VCALENDAR");
    expect(out).not.toContain("BEGIN:VEVENT");
  });

  it("omits DESCRIPTION and LOCATION when they are null", () => {
    const out = renderCalendar([{ ...timed, description: null, location: null }], opts);
    expect(out).not.toContain("DESCRIPTION:");
    expect(out).not.toContain("LOCATION:");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- src/lib/ics.test.ts`
Expected: FAIL — `Failed to resolve import "./ics"`.

- [ ] **Step 3: Write the renderer**

Create `src/lib/ics.ts`:

```ts
import { addDays, istDateKey } from "@/lib/datetime";

/**
 * RFC 5545 calendar rendering. Pure — no database, no request, no clock — so
 * the fiddly parts (octet folding, escaping, exclusive all-day ends) are
 * testable on their own. Calendar apps are unforgiving about all three.
 */
export interface IcsEvent {
  id: string;
  title: string;
  description: string | null;
  /** ISO 8601 UTC instant. */
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  location: string | null;
  /** Absolute URL of the public event page. */
  url: string;
  updatedAt: string;
  cancelled: boolean;
}

/** §3.3.11: backslash first, or the escapes we add get escaped again. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * §3.1: no content line exceeds 75 OCTETS, continuations begin with a space.
 * Counting characters instead of octets is the usual bug — one em dash is three
 * octets — and a naive slice can cut a codepoint in half, so this walks
 * codepoints and measures each one's encoded length.
 */
export function foldLine(line: string): string {
  const LIMIT = 75;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    // Continuation lines spend one octet on their leading space.
    const budget = out.length === 0 ? LIMIT : LIMIT - 1;
    if (bytes + size > budget) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : " " + part)).join("\r\n");
}

/** "20260920T043000Z" */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "20260920" — the IST calendar day, which is the day a student means. */
function dateStamp(iso: string): string {
  return istDateKey(iso).replace(/-/g, "");
}

function line(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

function vevent(ev: IcsEvent, host: string): string[] {
  const rows: string[] = ["BEGIN:VEVENT"];
  rows.push(`UID:${ev.id}@${host}`);
  rows.push(`DTSTAMP:${utcStamp(ev.updatedAt)}`);
  rows.push(`LAST-MODIFIED:${utcStamp(ev.updatedAt)}`);

  if (ev.isAllDay) {
    // DTEND is EXCLUSIVE for DATE values: a one-day event ends the next day, or
    // calendars render it a day short.
    rows.push(`DTSTART;VALUE=DATE:${dateStamp(ev.startsAt)}`);
    rows.push(`DTEND;VALUE=DATE:${addDays(istDateKey(ev.endsAt), 1).replace(/-/g, "")}`);
  } else {
    rows.push(`DTSTART:${utcStamp(ev.startsAt)}`);
    rows.push(`DTEND:${utcStamp(ev.endsAt)}`);
  }

  rows.push(line("SUMMARY", ev.title));
  if (ev.description) rows.push(line("DESCRIPTION", ev.description));
  if (ev.location) rows.push(line("LOCATION", ev.location));
  rows.push(line("URL", ev.url));
  // A cancelled event stays in the feed so subscribers SEE the cancellation
  // instead of watching the entry silently disappear.
  rows.push(`STATUS:${ev.cancelled ? "CANCELLED" : "CONFIRMED"}`);
  rows.push("END:VEVENT");
  return rows;
}

export function renderCalendar(
  events: IcsEvent[],
  opts: { host: string; name: string },
): string {
  const rows: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//CSE Club Council//${opts.host}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", opts.name),
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const ev of events) rows.push(...vevent(ev, opts.host));
  rows.push("END:VCALENDAR");
  return rows.join("\r\n") + "\r\n";
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- src/lib/ics.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lib/ics.ts src/lib/ics.test.ts
git commit -m "feat(ics): RFC 5545 renderer with octet folding and exclusive all-day ends"
```

---

### Task 2: The `.ics` query and three routes

**Files:**
- Modify: `src/lib/queries.ts`
- Create: `src/app/events/[id]/event.ics/route.ts`
- Create: `src/app/calendar.ics/route.ts`
- Create: `src/app/clubs/[slug]/events.ics/route.ts`

**Interfaces:**
- Consumes: `renderCalendar`, `IcsEvent` (Task 1); `createPublicClient` from `@/lib/supabase/server`; `siteOrigin` from `@/lib/site-origin`
- Produces: `getIcsEvents(opts?: { eventId?: string; clubSlug?: string }): Promise<IcsEvent[]>` in `src/lib/queries.ts`

**Why a new query:** `EventSummary` is lossy — it carries pre-formatted labels, no `updated_at` and no status. The feed needs raw columns.

**Why no RLS worry:** these read through `createPublicClient()`, and `events_public_read` already restricts to `approval_status = 'approved'` and non-cancelled-or-cancelled-within-7-days. A pending or rejected event cannot reach a feed.

- [ ] **Step 1: Add the query**

Append to `src/lib/queries.ts` (it already imports `createPublicClient` and `"server-only"`), and add `import type { IcsEvent } from "@/lib/ics";` plus `import { siteOrigin } from "@/lib/site-origin";` to the import block:

```ts
/**
 * Raw event rows for the `.ics` feeds. Deliberately not `EventSummary` — that
 * type is pre-formatted for the UI and drops `updated_at` and `status`, both of
 * which a calendar subscriber needs.
 *
 * Window: everything upcoming plus the last 60 days, so a subscriber keeps a
 * little history and sees a just-cancelled event. RLS does the visibility work.
 */
export async function getIcsEvents(
  opts: { eventId?: string; clubSlug?: string } = {},
): Promise<IcsEvent[]> {
  const origin = siteOrigin() ?? "";
  const supabase = createPublicClient();
  let q = supabase
    .from("events")
    .select(
      "id, title, description, starts_at, ends_at, is_all_day, venue_text, status, updated_at, venues ( name ), event_clubs!inner ( clubs!inner ( slug ) )",
    );

  if (opts.eventId) q = q.eq("id", opts.eventId);
  if (opts.clubSlug) q = q.eq("event_clubs.clubs.slug", opts.clubSlug);
  if (!opts.eventId) {
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("starts_at", since);
  }

  const { data, error } = await q.order("starts_at", { ascending: true }).limit(500);
  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string;
    is_all_day: boolean;
    venue_text: string | null;
    status: string;
    updated_at: string;
    venues: { name: string } | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    isAllDay: r.is_all_day,
    location: r.venue_text ?? r.venues?.name ?? null,
    url: origin ? `${origin}/events/${r.id}` : "",
    updatedAt: r.updated_at,
    cancelled: r.status === "cancelled",
  }));
}
```

- [ ] **Step 2: Add the single-event download route**

Create `src/app/events/[id]/event.ics/route.ts`:

```ts
import { getIcsEvents } from "@/lib/queries";
import { renderCalendar } from "@/lib/ics";
import { siteOrigin } from "@/lib/site-origin";

/**
 * One event as a calendar download — the "Add to calendar" button. Public: RLS
 * on `events` already limits this to approved events.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const events = await getIcsEvents({ eventId: id });
  if (events.length === 0) return new Response("Not found", { status: 404 });

  const host = new URL(siteOrigin() ?? "https://cse-ccc.vercel.app").host;
  const body = renderCalendar(events, { host, name: events[0].title });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="event.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

- [ ] **Step 3: Add the two subscribable feeds**

Create `src/app/calendar.ics/route.ts`:

```ts
import { getIcsEvents } from "@/lib/queries";
import { renderCalendar } from "@/lib/ics";
import { siteOrigin } from "@/lib/site-origin";

/** Every council event, for calendar apps to subscribe to and re-poll. */
export async function GET() {
  const events = await getIcsEvents();
  const host = new URL(siteOrigin() ?? "https://cse-ccc.vercel.app").host;
  return new Response(renderCalendar(events, { host, name: "CSE Club Council" }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

Create `src/app/clubs/[slug]/events.ics/route.ts`:

```ts
import { getIcsEvents } from "@/lib/queries";
import { renderCalendar } from "@/lib/ics";
import { siteOrigin } from "@/lib/site-origin";

/** One club's events, subscribable. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const events = await getIcsEvents({ clubSlug: slug });
  const host = new URL(siteOrigin() ?? "https://cse-ccc.vercel.app").host;
  return new Response(renderCalendar(events, { host, name: `CSE Club Council — ${slug}` }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
```

- [ ] **Step 4: Verify the routes build and answer**

```bash
npm run typecheck
npm run lint
npm run build
```
Expected: clean. The build output should list `/calendar.ics`, `/events/[id]/event.ics` and `/clubs/[slug]/events.ics` as routes.

Then, with `npm run dev` running in another terminal:

```bash
curl -si http://localhost:3000/calendar.ics | head -20
```
Expected: `200`, `Content-Type: text/calendar; charset=utf-8`, body starting `BEGIN:VCALENDAR`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries.ts "src/app/events/[id]/event.ics" src/app/calendar.ics "src/app/clubs/[slug]/events.ics"
git commit -m "feat(ics): event download plus council and per-club subscribable feeds"
```

---

### Task 3: Calendar links in the UI

**Files:**
- Modify: `src/app/events/[id]/page.tsx`
- Modify: `src/app/calendar/page.tsx`
- Modify: `src/app/clubs/[slug]/page.tsx`

**Interfaces:**
- Consumes: the three routes from Task 2. No new exports.

A feed nobody can find is a feed nobody uses. Read each page first and match its existing link/button markup rather than inventing a new style — these are public pages with an established visual language.

- [ ] **Step 1: Add "Add to calendar" to the event page**

In `src/app/events/[id]/page.tsx`, beside the existing register/share affordances:

```tsx
<a href={`/events/${id}/event.ics`} className="btn btn-ghost">
  Add to calendar
</a>
```

- [ ] **Step 2: Add "Subscribe" to the calendar page**

In `src/app/calendar/page.tsx`, near the heading:

```tsx
<a href="/calendar.ics" className="btn btn-ghost">
  Subscribe in your calendar
</a>
```

- [ ] **Step 3: Add "Subscribe" to the club page**

In `src/app/clubs/[slug]/page.tsx`, near the club's events list:

```tsx
<a href={`/clubs/${slug}/events.ics`} className="btn btn-ghost">
  Subscribe to this club
</a>
```

- [ ] **Step 4: Check it at phone width**

Run `npm run dev`, open `/calendar` and an event page at 390px wide. The new link must not overflow its row or push the heading off-screen.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run typecheck
git add src/app/events src/app/calendar src/app/clubs
git commit -m "feat(ics): add-to-calendar and subscribe links on the public pages"
```

---

### Task 4: Reminder text

**Files:**
- Create: `src/lib/admin/reminder-text.ts`
- Test: `src/lib/admin/reminder-text.test.ts`

**Interfaces:**
- Consumes: `istDateMedium`, `istFullDate`, `istTimeRange` from `@/lib/datetime`
- Produces:
  - `interface ReminderEvent { title: string; startsAt: string; endsAt: string; isAllDay: boolean; venue: string | null }`
  - `reminderText(ev: ReminderEvent): { subject: string; body: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/admin/reminder-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reminderText, type ReminderEvent } from "./reminder-text";

const base: ReminderEvent = {
  title: "Hackathon 2026",
  startsAt: "2026-09-20T04:30:00.000Z", // 10:00 IST, Sunday
  endsAt: "2026-09-20T07:30:00.000Z",   // 13:00 IST
  isAllDay: false,
  venue: "Seminar Hall 2",
};

describe("reminderText", () => {
  it("names the event and its date in the subject", () => {
    expect(reminderText(base).subject).toBe("Reminder: Hackathon 2026 is on 20 Sep 2026");
  });

  it("gives the full date, the time range and the venue in the body", () => {
    const { body } = reminderText(base);
    expect(body).toContain("Sunday, 20 September 2026");
    expect(body).toContain("10:00 AM – 1:00 PM");
    expect(body).toContain("Seminar Hall 2");
  });

  it("says all day instead of a time range for an all-day event", () => {
    const { body } = reminderText({ ...base, isAllDay: true });
    expect(body).toContain("all day");
    expect(body).not.toContain("10:00 AM");
  });

  it("falls back to TBA when no venue is set, matching the public pages", () => {
    expect(reminderText({ ...base, venue: null }).body).toContain("TBA");
  });

  it("never returns an empty subject or body", () => {
    const out = reminderText({ ...base, title: "X", venue: null });
    expect(out.subject.length).toBeGreaterThan(10);
    expect(out.body.length).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- src/lib/admin/reminder-text.test.ts`
Expected: FAIL — cannot resolve `./reminder-text`.

- [ ] **Step 3: Write the module**

Create `src/lib/admin/reminder-text.ts`:

```ts
import { istDateMedium, istFullDate, istTimeRange } from "@/lib/datetime";

/**
 * The prefilled text behind the "Remind them it's coming up" button.
 *
 * Pure, and deliberately not a template: the head sees this in the compose box
 * and can edit it before sending. A mass mail cannot be recalled, so the last
 * word belongs to a person, not to this function.
 */
export interface ReminderEvent {
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  venue: string | null;
}

export function reminderText(ev: ReminderEvent): { subject: string; body: string } {
  const subject = `Reminder: ${ev.title} is on ${istDateMedium(ev.startsAt)}`;
  const when = ev.isAllDay
    ? `${istFullDate(ev.startsAt)} (all day)`
    : `${istFullDate(ev.startsAt)}, ${istTimeRange(ev.startsAt, ev.endsAt)}`;
  // "TBA" matches what the public event pages already show for a venueless event.
  const where = ev.venue ?? "TBA";

  const body = [
    `Just a reminder that ${ev.title} is coming up.`,
    "",
    `When: ${when}`,
    `Where: ${where}`,
    "",
    "See you there.",
  ].join("\n");

  return { subject, body };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- src/lib/admin/reminder-text.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/admin/reminder-text.ts src/lib/admin/reminder-text.test.ts
git commit -m "feat(email): reminder subject and body from an event"
```

---

### Task 5: The reminder button on the participant-email page

**Files:**
- Modify: `src/lib/admin/attendance.ts` (`getEventForAttendance`)
- Modify: `src/app/admin/(app)/events/[id]/email/page.tsx`
- Modify: `src/components/admin/BroadcastForm.tsx`

**Interfaces:**
- Consumes: `reminderText`, `ReminderEvent` (Task 4)
- Produces: `AttendanceEvent` gains `endsAt: string`, `isAllDay: boolean`, `venue: string | null`; `BroadcastForm` gains props `reminder?: { subject: string; body: string }` and `lastSentAt?: string | null`

**`broadcastAction` is not touched.** The button fills the form; Send is the existing path.

- [ ] **Step 1: Widen `getEventForAttendance`**

In `src/lib/admin/attendance.ts`, extend the interface and select:

```ts
export interface AttendanceEvent {
  id: string;
  title: string;
  clubId: string | null;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  venue: string | null;
}
```

Change the select string to:

```ts
"id, title, starts_at, ends_at, is_all_day, venue_text, event_clubs ( is_primary, club_id ), venues ( name )"
```

Extend the local row type with `ends_at: string; is_all_day: boolean; venue_text: string | null; venues: { name: string } | null;` and the return with:

```ts
endsAt: row.ends_at,
isAllDay: row.is_all_day,
venue: row.venue_text ?? row.venues?.name ?? null,
```

- [ ] **Step 2: Run the existing suite to catch every caller**

Run: `npm test && npm run typecheck`
Expected: PASS. `getEventForAttendance` has several callers; widening a return type is additive, so nothing should break. If a test constructs an `AttendanceEvent` literal, add the three fields there.

- [ ] **Step 3: Pass the reminder text and last-sent into the form**

In `src/app/admin/(app)/events/[id]/email/page.tsx`, after `const ev = await getEventForAttendance(id)`:

```tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { reminderText } from "@/lib/admin/reminder-text";
import { istDateMedium, istTime } from "@/lib/datetime";

// … inside the component, after the ev/notFound checks:
const reminder = reminderText({
  title: ev.title,
  startsAt: ev.startsAt,
  endsAt: ev.endsAt,
  isAllDay: ev.isAllDay,
  venue: ev.venue,
});

// Last mail sent about THIS event, so nobody blasts the same people twice.
const { data: lastRow } = await createAdminClient()
  .from("email_log")
  .select("created_at")
  .eq("template", "event_broadcast")
  .contains("payload", { details: [{ label: "Event", value: ev.title }] })
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
const lastSentAt = lastRow?.created_at ?? null;
```

Render it above the form:

```tsx
{lastSentAt ? (
  <p className="hint" style={{ marginTop: 10 }}>
    Last emailed {istDateMedium(lastSentAt)} at {istTime(lastSentAt)}.
  </p>
) : null}
```

And pass the new props:

```tsx
<BroadcastForm
  eventId={id}
  confirmedCount={confirmed.length}
  allCount={regs.length}
  reminder={reminder}
/>
```

- [ ] **Step 4: Add the prefill button to the form**

In `src/components/admin/BroadcastForm.tsx`, accept the new prop, make the two fields controlled, and add the button above the Subject field:

```tsx
"use client";

import { useActionState, useState } from "react";
// … existing imports

export function BroadcastForm({
  eventId,
  confirmedCount,
  allCount,
  reminder,
}: {
  eventId: string;
  confirmedCount: number;
  allCount: number;
  reminder?: { subject: string; body: string };
}) {
  const [state, action, pending] = useActionState(broadcastAction, initial);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // …
```

Then, immediately inside the `<form>`, after the hidden `eventId` input:

```tsx
{reminder ? (
  <button
    type="button"
    className="btn btn-ghost"
    style={{ marginBottom: 14 }}
    onClick={() => {
      setSubject(reminder.subject);
      setMessage(reminder.body);
    }}
  >
    Remind them it&rsquo;s coming up
  </button>
) : null}
```

Wire the two fields to that state:

```tsx
<input id="subject" name="subject" required maxLength={120}
  value={subject} onChange={(e) => setSubject(e.target.value)}
  placeholder="Venue has changed" />
```

```tsx
<textarea id="message" name="message" rows={7} required maxLength={4000}
  value={message} onChange={(e) => setMessage(e.target.value)}
  placeholder="Write what participants need to know." />
```

- [ ] **Step 5: Verify in the browser**

`npm run dev`, sign in as `sandy` (tech_head — have the authenticator to hand), open `/admin/events/<id>/email`. Press the reminder button: subject and message must fill with the event's real date, time and venue, and both must still be editable. Do not press Send yet.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/lib/admin/attendance.ts "src/app/admin/(app)/events/[id]/email/page.tsx" src/components/admin/BroadcastForm.tsx
git commit -m "feat(email): one-press reminder prefill and a last-emailed line"
```

---

### Task 6: The `manage:broadcast` capability

**Files:**
- Modify: `src/lib/auth/capabilities.ts`
- Modify: `src/lib/auth/capabilities.test.ts`

**Interfaces:**
- Produces: `"manage:broadcast"` as a member of the `Capability` union, with grants `all` for `faculty_advisor` / `president` / `vice_president` / `tech_head` and `own` for `club_head` / `vice_head`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/auth/capabilities.test.ts`:

```ts
describe("manage:broadcast", () => {
  it("is council-wide for the council roles", () => {
    for (const role of ["faculty_advisor", "president", "vice_president", "tech_head"] as const) {
      expect(grantFor(role, "manage:broadcast")).toBe("all");
    }
  });

  it("is own-club for club and vice heads", () => {
    expect(grantFor("club_head", "manage:broadcast")).toBe("own");
    expect(grantFor("vice_head", "manage:broadcast")).toBe("own");
  });

  it("is withheld from the roles that were not granted it", () => {
    for (const role of ["events_head", "docs_head", "social_media_head", "gallery_manager"] as const) {
      expect(grantFor(role, "manage:broadcast")).toBe("none");
    }
  });

  it("lets a club head broadcast to their own club only", () => {
    const head = { role: "club_head" as const, clubId: "club-a" };
    expect(canManage(head, "manage:broadcast", "club-a")).toBe(true);
    expect(canManage(head, "manage:broadcast", "club-b")).toBe(false);
  });
});
```

Note: the existing test file at line ~241 enumerates every capability. Add `"manage:broadcast"` to that list too, or that test will fail.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- src/lib/auth/capabilities.test.ts`
Expected: FAIL — `manage:broadcast` is not assignable to `Capability`.

- [ ] **Step 3: Add the capability**

In `src/lib/auth/capabilities.ts`, add to the `Capability` union after `"manage:contact"`:

```ts
  | "manage:broadcast" // compose-and-send mail to admins, council or club members
```

And to `MATRIX`:

```ts
  // Mailing 908 students is the largest outward-facing action in the panel, so
  // it is council-wide only. A club head gets `own`: their own club's members
  // and their own club's events, nothing else.
  "manage:broadcast": {
    faculty_advisor: "all", president: "all", vice_president: "all",
    tech_head: "all", club_head: "own", vice_head: "own",
  },
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- src/lib/auth/capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/auth/capabilities.ts src/lib/auth/capabilities.test.ts
git commit -m "feat(auth): manage:broadcast capability"
```

---

### Task 7: Audience types, permission and dedupe

**Files:**
- Create: `src/lib/admin/broadcast-audience.ts`
- Test: `src/lib/admin/broadcast-audience.test.ts`

**Interfaces:**
- Consumes: `AdminIdentity`, `grantFor` from `@/lib/auth/capabilities`
- Produces:
  - `type Audience` (five kinds, as in the spec)
  - `const INLINE_MAX = 50`
  - `shouldQueue(count: number): boolean`
  - `audienceLabel(a: Audience): string`
  - `parseAudience(raw: { kind?: string | null; clubId?: string | null; eventId?: string | null; scope?: string | null }): Audience | null`
  - `isAudienceAllowed(id: AdminIdentity, a: Audience, resourceClubId: string | null): boolean`
  - `dedupeRecipients(list: { email: string; name: string | null }[]): { email: string; name: string | null }[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/admin/broadcast-audience.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INLINE_MAX,
  audienceLabel,
  dedupeRecipients,
  isAudienceAllowed,
  parseAudience,
  shouldQueue,
  type Audience,
} from "./broadcast-audience";

const tech = { role: "tech_head" as const, clubId: null };
const head = { role: "club_head" as const, clubId: "club-a" };
const gallery = { role: "gallery_manager" as const, clubId: "club-a" };

const heads: Audience = { kind: "heads" };
const council: Audience = { kind: "council" };
const allMembers: Audience = { kind: "all_members" };
const ownClub: Audience = { kind: "club_members", clubId: "club-a" };
const otherClub: Audience = { kind: "club_members", clubId: "club-b" };
const event: Audience = { kind: "event", eventId: "e1", scope: "confirmed" };

describe("shouldQueue", () => {
  it("sends inline at exactly the threshold", () => {
    expect(shouldQueue(INLINE_MAX)).toBe(false);
  });

  it("queues one above the threshold", () => {
    expect(shouldQueue(INLINE_MAX + 1)).toBe(true);
  });

  it("sends inline for an empty list", () => {
    expect(shouldQueue(0)).toBe(false);
  });
});

describe("isAudienceAllowed", () => {
  it("lets a council role reach every audience", () => {
    for (const a of [heads, council, allMembers, ownClub, otherClub, event]) {
      expect(isAudienceAllowed(tech, a, "club-b")).toBe(true);
    }
  });

  it("lets a club head reach their own club's members", () => {
    expect(isAudienceAllowed(head, ownClub, null)).toBe(true);
  });

  it("refuses a club head another club's members", () => {
    expect(isAudienceAllowed(head, otherClub, null)).toBe(false);
  });

  it("refuses a club head the council-wide audiences", () => {
    expect(isAudienceAllowed(head, heads, null)).toBe(false);
    expect(isAudienceAllowed(head, council, null)).toBe(false);
    expect(isAudienceAllowed(head, allMembers, null)).toBe(false);
  });

  it("judges an event by the event's real club, not the form", () => {
    expect(isAudienceAllowed(head, event, "club-a")).toBe(true);
    expect(isAudienceAllowed(head, event, "club-b")).toBe(false);
    expect(isAudienceAllowed(head, event, null)).toBe(false);
  });

  it("refuses a role without the capability entirely", () => {
    for (const a of [heads, ownClub, event]) {
      expect(isAudienceAllowed(gallery, a, "club-a")).toBe(false);
    }
  });
});

describe("parseAudience", () => {
  it("parses each kind", () => {
    expect(parseAudience({ kind: "heads" })).toEqual(heads);
    expect(parseAudience({ kind: "all_members" })).toEqual(allMembers);
    expect(parseAudience({ kind: "club_members", clubId: "club-a" })).toEqual(ownClub);
    expect(parseAudience({ kind: "event", eventId: "e1", scope: "confirmed" })).toEqual(event);
  });

  it("defaults an event to confirmed when the scope is missing", () => {
    expect(parseAudience({ kind: "event", eventId: "e1" })).toEqual({
      kind: "event", eventId: "e1", scope: "confirmed",
    });
  });

  it("rejects a kind that needs an id but has none", () => {
    expect(parseAudience({ kind: "club_members" })).toBeNull();
    expect(parseAudience({ kind: "event" })).toBeNull();
  });

  it("rejects an unknown kind", () => {
    expect(parseAudience({ kind: "everyone" })).toBeNull();
    expect(parseAudience({})).toBeNull();
  });
});

describe("audienceLabel", () => {
  it("names each audience in words a human reads before sending", () => {
    expect(audienceLabel(heads)).toMatch(/heads/i);
    expect(audienceLabel(allMembers)).toMatch(/all club members/i);
    expect(audienceLabel(council)).toMatch(/council/i);
  });
});

describe("dedupeRecipients", () => {
  it("collapses the same address in different cases", () => {
    const out = dedupeRecipients([
      { email: "A@x.com", name: "Aa" },
      { email: "a@x.com", name: "Bb" },
    ]);
    expect(out).toEqual([{ email: "a@x.com", name: "Aa" }]);
  });

  it("drops blank and malformed addresses", () => {
    const out = dedupeRecipients([
      { email: "", name: "x" },
      { email: "   ", name: "y" },
      { email: "not-an-email", name: "z" },
      { email: "ok@x.com", name: null },
    ]);
    expect(out).toEqual([{ email: "ok@x.com", name: null }]);
  });

  it("keeps order and trims whitespace", () => {
    const out = dedupeRecipients([
      { email: " b@x.com ", name: "B" },
      { email: "a@x.com", name: "A" },
    ]);
    expect(out.map((r) => r.email)).toEqual(["b@x.com", "a@x.com"]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- src/lib/admin/broadcast-audience.test.ts`
Expected: FAIL — cannot resolve `./broadcast-audience`.

- [ ] **Step 3: Write the module**

Create `src/lib/admin/broadcast-audience.ts`:

```ts
import { grantFor, type AdminIdentity } from "@/lib/auth/capabilities";

/**
 * Who a broadcast goes to, and who is allowed to pick that.
 *
 * Pure on purpose: this is the authorisation boundary for the largest
 * outward-facing action in the panel, and it should be provable without a
 * database, a session or a request.
 */
export type Audience =
  | { kind: "heads" }
  | { kind: "council" }
  | { kind: "club_members"; clubId: string }
  | { kind: "all_members" }
  | { kind: "event"; eventId: string; scope: "confirmed" | "all" };

/**
 * At or below this many addresses a send goes out inline, as every existing
 * mail does. Above it the send is queued: Gmail SMTP opens one connection per
 * message, so a few hundred sequential sends would run past the function limit.
 */
export const INLINE_MAX = 50;

export function shouldQueue(count: number): boolean {
  return count > INLINE_MAX;
}

export function audienceLabel(a: Audience): string {
  switch (a.kind) {
    case "heads":
      return "Club heads and vice heads";
    case "council":
      return "Council members";
    case "all_members":
      return "All club members";
    case "club_members":
      return "One club's members";
    case "event":
      return a.scope === "all"
        ? "An event's registrants, including the waitlist"
        : "An event's confirmed registrants";
  }
}

export function parseAudience(raw: {
  kind?: string | null;
  clubId?: string | null;
  eventId?: string | null;
  scope?: string | null;
}): Audience | null {
  switch (raw.kind) {
    case "heads":
      return { kind: "heads" };
    case "council":
      return { kind: "council" };
    case "all_members":
      return { kind: "all_members" };
    case "club_members":
      return raw.clubId ? { kind: "club_members", clubId: raw.clubId } : null;
    case "event":
      if (!raw.eventId) return null;
      return {
        kind: "event",
        eventId: raw.eventId,
        scope: raw.scope === "all" ? "all" : "confirmed",
      };
    default:
      return null;
  }
}

/**
 * `resourceClubId` is the club the DATABASE says owns the event — never a value
 * the form supplied. For non-event audiences it is ignored.
 */
export function isAudienceAllowed(
  id: AdminIdentity,
  a: Audience,
  resourceClubId: string | null,
): boolean {
  const grant = grantFor(id.role, "manage:broadcast");
  if (grant === "all") return true;
  if (grant !== "own") return false;
  if (id.clubId == null) return false;

  // An `own` holder reaches their own club's members and their own club's
  // events. The council-wide lists are not theirs to mail.
  if (a.kind === "club_members") return a.clubId === id.clubId;
  if (a.kind === "event") return resourceClubId != null && resourceClubId === id.clubId;
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One address is mailed once, whichever list it turned up on. First name wins. */
export function dedupeRecipients(
  list: { email: string; name: string | null }[],
): { email: string; name: string | null }[] {
  const seen = new Set<string>();
  const out: { email: string; name: string | null }[] = [];
  for (const r of list) {
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: r.name });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- src/lib/admin/broadcast-audience.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/admin/broadcast-audience.ts src/lib/admin/broadcast-audience.test.ts
git commit -m "feat(email): audience model, scope rules and recipient dedupe"
```

---

### Task 8: Queue plumbing for bulk sends

**Files:**
- Create: `src/lib/email/bulk.ts`
- Test: `src/lib/email/bulk.test.ts`
- Modify: `src/lib/email.ts`
- Modify: `src/lib/email/resend.ts` (add `headers` to `SendArgs`)
- Modify: `src/lib/email/gmail.ts` (pass `headers` through)
- Modify: `src/lib/email/send.ts` (`List-Unsubscribe` on bulk rows)
- Modify: `src/app/api/cron/send-email/route.ts` (25 → 100)

**Interfaces:**
- Consumes: `EnqueueEmailArgs` from `@/lib/email`
- Produces:
  - `const BULK_PRIORITY = 8`
  - `chunk<T>(items: T[], size: number): T[][]`
  - `enqueueEmail(args)` gains `deferred?: boolean`
  - `enqueueEmailBatch(rows: EnqueueEmailArgs[]): Promise<number>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/email/bulk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BULK_PRIORITY, chunk } from "./bulk";

describe("chunk", () => {
  it("splits into equal parts", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("keeps a short final chunk", () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("returns one chunk when the list is smaller than the size", () => {
    expect(chunk([1], 500)).toEqual([[1]]);
  });

  it("handles a 908-row list at the real insert size", () => {
    const rows = Array.from({ length: 908 }, (_, i) => i);
    const out = chunk(rows, 500);
    expect(out.length).toBe(2);
    expect(out[0].length).toBe(500);
    expect(out[1].length).toBe(408);
    expect(out.flat()).toEqual(rows);
  });
});

describe("BULK_PRIORITY", () => {
  it("sorts after transactional mail, which uses 3 to 5", () => {
    expect(BULK_PRIORITY).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test -- src/lib/email/bulk.test.ts`
Expected: FAIL — cannot resolve `./bulk`.

- [ ] **Step 3: Write the pure module**

Create `src/lib/email/bulk.ts`:

```ts
/**
 * Bulk-send constants and helpers. Pure — no `server-only`, so the composer's
 * client component can import BULK_PRIORITY if it ever needs to.
 */

/**
 * Bulk mail queues below transactional mail (which uses 3–5). `deliverPending`
 * orders by priority ascending, so a password reset never waits behind 900
 * newsletters.
 */
export const BULK_PRIORITY = 8;

/** Rows per insert statement. 908 individual inserts is its own timeout. */
export const INSERT_CHUNK = 500;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- src/lib/email/bulk.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add `deferred` and `enqueueEmailBatch`**

In `src/lib/email.ts`, extend the args interface:

```ts
export interface EnqueueEmailArgs {
  template: string;
  toEmail: string;
  toName?: string;
  subject: string;
  payload?: Json;
  /** Lower = sent sooner. */
  priority?: number;
  /**
   * Queue the row WITHOUT attempting an immediate send. Bulk audiences use
   * this: inline delivery is one SMTP connection per message, so a few hundred
   * of them would run past the function limit before the first batch landed.
   */
  deferred?: boolean;
}
```

Guard the inline delivery:

```ts
  if (args.deferred) return;

  // Best-effort immediate delivery. …
  try {
```

Then append the batch enqueue:

```ts
/**
 * Queue many rows in as few statements as possible and send NOTHING inline.
 * Returns how many rows were written. Draining is the Outbox's job (or the
 * nightly cron's).
 */
export async function enqueueEmailBatch(rows: EnqueueEmailArgs[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createAdminClient();
  let written = 0;
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const { error, count } = await supabase
      .from("email_log")
      .insert(
        part.map((r) => ({
          template: r.template,
          to_email: r.toEmail,
          to_name: r.toName ?? null,
          subject: r.subject,
          payload: r.payload ?? {},
          priority: r.priority ?? BULK_PRIORITY,
          status: "pending",
        })),
        { count: "exact" },
      );
    if (error) throw error;
    written += count ?? part.length;
  }
  return written;
}
```

Add the import at the top of `src/lib/email.ts`:

```ts
import { BULK_PRIORITY, INSERT_CHUNK, chunk } from "./email/bulk";
```

- [ ] **Step 6: Thread a `headers` option through the transports**

In `src/lib/email/resend.ts`, add to `SendArgs`:

```ts
  /** Extra SMTP/API headers, e.g. List-Unsubscribe on bulk mail. */
  headers?: Record<string, string>;
```

and include it in the Resend request body:

```ts
        ...(args.headers ? { headers: args.headers } : {}),
```

In `src/lib/email/gmail.ts`, pass it to nodemailer inside `sendMail`:

```ts
      ...(args.headers ? { headers: args.headers } : {}),
```

- [ ] **Step 7: Set `List-Unsubscribe` on bulk rows**

In `src/lib/email/send.ts`, inside `deliverEmail`, after `renderEmail`:

```ts
  // Bulk mail carries an unsubscribe affordance. 908 students never opted in to
  // this list; per-recipient preferences are a separate feature, but a reply-to
  // address they can actually use costs nothing.
  const bulk = payload?.bulk === true;
  const from = process.env.EMAIL_FROM ?? process.env.GMAIL_USER ?? "";
  const headers = bulk && from
    ? { "List-Unsubscribe": `<mailto:${from}?subject=unsubscribe>` }
    : undefined;

  const result = await sendEmail({ to: row.to_email, subject: row.subject, html, text, headers });
```

- [ ] **Step 8: Raise the cron drain**

In `src/app/api/cron/send-email/route.ts`:

```ts
  // 100, not 25: a queued all-members send is ~908 rows, and the nightly pass is
  // the backstop that clears whatever the Outbox did not.
  const summary = await deliverPending(100);
```

- [ ] **Step 9: Verify and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/lib/email.ts src/lib/email/ src/app/api/cron/send-email/route.ts
git commit -m "feat(email): deferred + batch enqueue, bulk priority, List-Unsubscribe, larger drain"
```

---

### Task 9: Resolving an audience to addresses

**Files:**
- Create: `src/lib/admin/broadcast-recipients.ts`

**Interfaces:**
- Consumes: `Audience`, `dedupeRecipients` (Task 7); `createAdminClient`; `listRegistrations`, `getEventFormSchema` from `@/lib/admin/registrations`; `teamRecipients` from `@/lib/registration-form/recipients`; `splitRegistrations` from `@/lib/registration/waitlist`
- Produces:
  - `interface Recipient { email: string; name: string | null }`
  - `resolveRecipients(a: Audience): Promise<Recipient[]>`
  - `audienceCounts(ownClubId: string | null): Promise<{ heads: number; council: number; councilTotal: number; allMembers: number; ownClubMembers: number }>`

Service-role reads throughout: `anon` has no SELECT on `club_members`.

- [ ] **Step 1: Write the module**

Create `src/lib/admin/broadcast-recipients.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { dedupeRecipients, type Audience } from "./broadcast-audience";

export interface Recipient {
  email: string;
  name: string | null;
}

/**
 * Turn an audience into addresses. Service role throughout — `anon` has no
 * SELECT on `club_members`, and that lockout is deliberate (see STATUS.md on
 * the Mumbai migration).
 *
 * Authorisation is NOT done here: callers must have already run
 * `isAudienceAllowed` against the event's real club.
 */
export async function resolveRecipients(a: Audience): Promise<Recipient[]> {
  const admin = createAdminClient();

  if (a.kind === "heads") {
    const { data } = await admin
      .from("admin_users")
      .select("email, full_name")
      .in("role", ["club_head", "vice_head"])
      .eq("is_active", true);
    return dedupeRecipients((data ?? []).map((r) => ({ email: r.email, name: r.full_name })));
  }

  if (a.kind === "council") {
    const { data } = await admin
      .from("council_members")
      .select("email, full_name")
      .eq("is_active", true)
      .not("approved_at", "is", null);
    return dedupeRecipients(
      (data ?? []).map((r) => ({ email: r.email ?? "", name: r.full_name })),
    );
  }

  if (a.kind === "club_members" || a.kind === "all_members") {
    let q = admin.from("club_members").select("email, name");
    if (a.kind === "club_members") q = q.eq("club_id", a.clubId);
    const { data } = await q;
    return dedupeRecipients((data ?? []).map((r) => ({ email: r.email ?? "", name: r.name })));
  }

  // An event: reuse the per-event path so team members are reached too, not
  // only whoever filled the form in.
  const [regs, { schema }] = await Promise.all([
    listRegistrations(a.eventId),
    getEventFormSchema(a.eventId),
  ]);
  const { confirmed } = splitRegistrations(regs);
  const rows = a.scope === "all" ? regs : confirmed;
  const out: Recipient[] = [];
  for (const r of rows) {
    for (const email of teamRecipients(schema, r.customAnswers, r.email)) {
      out.push({ email, name: email === r.email.toLowerCase() ? r.name : null });
    }
  }
  return dedupeRecipients(out);
}

/** Counts for the picker, so a sender sees the size before choosing. */
export async function audienceCounts(ownClubId: string | null): Promise<{
  heads: number;
  council: number;
  councilTotal: number;
  allMembers: number;
  ownClubMembers: number;
}> {
  const admin = createAdminClient();
  const [heads, council, members, ownMembers] = await Promise.all([
    admin
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .in("role", ["club_head", "vice_head"])
      .eq("is_active", true),
    admin
      .from("council_members")
      .select("email", { count: "exact", head: true })
      .eq("is_active", true)
      .not("approved_at", "is", null),
    admin.from("club_members").select("id", { count: "exact", head: true }),
    ownClubId
      ? admin
          .from("club_members")
          .select("id", { count: "exact", head: true })
          .eq("club_id", ownClubId)
      : Promise.resolve({ count: 0 }),
  ]);

  // Council is the one list with gaps — 26 of 32 had an address at design time —
  // so the page shows both numbers rather than quietly mailing fewer people.
  const councilWithEmail = await resolveRecipients({ kind: "council" });

  return {
    heads: heads.count ?? 0,
    council: councilWithEmail.length,
    councilTotal: council.count ?? 0,
    allMembers: members.count ?? 0,
    ownClubMembers: ownMembers.count ?? 0,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. If PostgREST degrades a row type to `GenericStringError`, the select string is being built dynamically — keep it literal or cast through `as unknown as` with an explicit row type (this repo hits that trap often; see STATUS.md).

- [ ] **Step 3: Commit**

```bash
npm run lint
git add src/lib/admin/broadcast-recipients.ts
git commit -m "feat(email): resolve an audience to deduped addresses"
```

---

### Task 10: The composer page

**Files:**
- Create: `src/app/admin/(app)/email/page.tsx`
- Create: `src/app/admin/(app)/email/actions.ts`
- Create: `src/components/admin/BroadcastComposer.tsx`
- Modify: `src/app/admin/(app)/layout.tsx`
- Modify: `src/lib/admin/nav.test.ts`
- Modify: `src/lib/admin/form-state.ts`

**Interfaces:**
- Consumes: everything from Tasks 6–9, plus `listClubsBrief` from `@/lib/admin/clubs` and `listEventsForAdmin` from `@/lib/admin/queries` (already club-scoped, so the event picker inherits scope)
- Produces: `sendBroadcastAction(prev: ComposerState, formData: FormData): Promise<ComposerState>`; `interface ComposerState { error?: string; sent?: number; queued?: number; confirm?: { count: number; label: string } }`

- [ ] **Step 1: Add the state type**

In `src/lib/admin/form-state.ts`, beside `BroadcastState`:

```ts
export interface ComposerState {
  error?: string;
  /** Addresses mailed inline. */
  sent?: number;
  /** Rows queued for the Outbox to drain. */
  queued?: number;
  /** Returned instead of sending when the audience is large enough to confirm. */
  confirm?: { count: number; label: string };
}
```

- [ ] **Step 2: Write the action**

Create `src/app/admin/(app)/email/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { enqueueEmail, enqueueEmailBatch } from "@/lib/email";
import { BULK_PRIORITY } from "@/lib/email/bulk";
import { writeAudit } from "@/lib/admin/audit";
import { isSafeHttpUrl } from "@/lib/url";
import { siteOrigin } from "@/lib/site-origin";
import {
  audienceLabel,
  isAudienceAllowed,
  parseAudience,
  shouldQueue,
} from "@/lib/admin/broadcast-audience";
import { resolveRecipients } from "@/lib/admin/broadcast-recipients";
import type { ComposerState } from "@/lib/admin/form-state";

const Schema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(4000),
  link: z.string().trim().max(2000).optional().or(z.literal("")),
  linkLabel: z.string().trim().max(60).optional().or(z.literal("")),
});

/**
 * Compose-and-send to a chosen audience.
 *
 * Two things this deliberately does NOT do: trust the posted club id (scope is
 * re-read from the database), and send a large audience inline (Gmail opens one
 * connection per message — a few hundred would outlast the function).
 */
export async function sendBroadcastAction(
  _prev: ComposerState,
  formData: FormData,
): Promise<ComposerState> {
  const parsed = Schema.safeParse({
    subject: formData.get("subject"),
    message: formData.get("message"),
    link: formData.get("link") ?? "",
    linkLabel: formData.get("linkLabel") ?? "",
  });
  if (!parsed.success) {
    return { error: "Add a subject (3+ characters) and a message (10+ characters)." };
  }

  const link = parsed.data.link?.trim() ?? "";
  if (link && !isSafeHttpUrl(link)) {
    return { error: "The link must be a full http(s) URL, e.g. https://chat.whatsapp.com/…" };
  }

  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const audience = parseAudience({
    kind: formData.get("kind") as string | null,
    clubId: formData.get("clubId") as string | null,
    eventId: formData.get("eventId") as string | null,
    scope: formData.get("scope") as string | null,
  });
  if (!audience) return { error: "Pick who should receive this." };

  // An event's club comes from the database, never from the form.
  let resourceClubId: string | null = null;
  if (audience.kind === "event") {
    const ev = await getEventForAttendance(audience.eventId);
    if (!ev) return { error: "Event not found." };
    resourceClubId = ev.clubId;
  }
  if (!isAudienceAllowed(session, audience, resourceClubId)) {
    return { error: "You can't send to that audience." };
  }

  const recipients = await resolveRecipients(audience);
  if (recipients.length === 0) {
    return { error: "Nobody to email — no one in that audience has an address on file." };
  }

  const label = audienceLabel(audience);
  const queued = shouldQueue(recipients.length);

  // A send this size gets a second look before it leaves.
  if (queued && formData.get("confirmed") !== "1") {
    return { confirm: { count: recipients.length, label } };
  }

  const base = siteOrigin() ?? "";
  const payload = {
    details: [{ label: "From", value: "CSE Club Council" }],
    body: parsed.data.message,
    url: link || (base || undefined),
    linkLabel: link ? parsed.data.linkLabel?.trim() || "Open link" : undefined,
    bulk: queued,
  };

  if (queued) {
    await enqueueEmailBatch(
      recipients.map((r) => ({
        template: "council_broadcast",
        toEmail: r.email,
        toName: r.name ?? undefined,
        subject: parsed.data.subject,
        payload,
        priority: BULK_PRIORITY,
      })),
    );
  } else {
    for (const r of recipients) {
      await enqueueEmail({
        template: "council_broadcast",
        toEmail: r.email,
        toName: r.name ?? undefined,
        subject: parsed.data.subject,
        payload,
        priority: 5,
      });
    }
  }

  await writeAudit({
    actorId: session.id,
    action: "broadcast_send",
    entity: "broadcast",
    entityId: null,
    after: {
      audience: audience.kind,
      label,
      recipients: recipients.length,
      subject: parsed.data.subject,
      queued,
    },
  });

  return queued ? { queued: recipients.length } : { sent: recipients.length };
}
```

- [ ] **Step 3: Write the page**

Create `src/app/admin/(app)/email/page.tsx`:

```tsx
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { listClubsBrief } from "@/lib/admin/clubs";
import { listEventsForAdmin } from "@/lib/admin/queries";
import { audienceCounts } from "@/lib/admin/broadcast-recipients";
import { BroadcastComposer } from "@/components/admin/BroadcastComposer";

/**
 * Compose a mail to a chosen audience. Gated on `manage:broadcast`; an `own`
 * holder is offered only their own club, and the action re-checks anyway.
 */
export default async function BroadcastPage() {
  const session = await requireViewPage("manage:broadcast");
  const councilWide = grantFor(session.role, "manage:broadcast") === "all";

  // `listEventsForAdmin` is already club-scoped and fails closed for a
  // club-scoped admin with no club, so the event picker inherits scope for free.
  const [clubs, events, counts] = await Promise.all([
    listClubsBrief(),
    listEventsForAdmin(session),
    audienceCounts(session.clubId),
  ]);

  const pickableClubs = councilWide
    ? clubs
    : clubs.filter((c) => c.id === session.clubId);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Email</div>
          <h1 style={{ margin: "6px 0 0" }}>Write to a group</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            Anything over 50 addresses is queued rather than sent at once, and
            goes out from the Outbox.
          </p>
        </div>
      </div>

      <BroadcastComposer
        councilWide={councilWide}
        clubs={pickableClubs}
        events={events.map((e) => ({ id: e.id, title: e.title }))}
        counts={counts}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write the composer component**

Create `src/components/admin/BroadcastComposer.tsx`. Mirror the field markup in `BroadcastForm.tsx` (same `.field`, `.hint`, `.note` classes) so the two pages look like one product:

```tsx
"use client";

import { useActionState, useState } from "react";
import { sendBroadcastAction } from "@/app/admin/(app)/email/actions";
import type { ComposerState } from "@/lib/admin/form-state";

const initial: ComposerState = {};

export function BroadcastComposer({
  councilWide,
  clubs,
  events,
  counts,
}: {
  councilWide: boolean;
  clubs: { id: string; name: string }[];
  events: { id: string; title: string }[];
  counts: {
    heads: number;
    council: number;
    councilTotal: number;
    allMembers: number;
    ownClubMembers: number;
  };
}) {
  const [state, action, pending] = useActionState(sendBroadcastAction, initial);
  const [kind, setKind] = useState(councilWide ? "heads" : "club_members");

  if (state.sent != null) {
    return <div className="note" style={{ marginTop: 18 }}>Sent to {state.sent} addresses.</div>;
  }
  if (state.queued != null) {
    return (
      <div className="note" style={{ marginTop: 18 }}>
        Queued {state.queued} messages. Open the Outbox to send them — Gmail
        takes about 500 a day, so a large send clears over more than one day.
      </div>
    );
  }

  return (
    <form action={action} style={{ marginTop: 18, maxWidth: 640 }}>
      {state.error ? (
        <div role="alert" className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      {state.confirm ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          <strong>This will email {state.confirm.count} people</strong> —{" "}
          {state.confirm.label}. Press Send again to confirm.
          <input type="hidden" name="confirmed" value="1" />
        </div>
      ) : null}

      <fieldset style={{ border: 0, padding: 0, margin: "4px 0 18px" }}>
        <legend className="label" style={{ marginBottom: 8 }}>Who receives it</legend>

        {councilWide ? (
          <>
            <label style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input type="radio" name="kind" value="heads"
                checked={kind === "heads"} onChange={() => setKind("heads")} />
              <span>Club heads and vice heads — {counts.heads}</span>
            </label>
            <label style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input type="radio" name="kind" value="council"
                checked={kind === "council"} onChange={() => setKind("council")} />
              <span>
                Council members — {counts.council}
                {counts.councilTotal > counts.council
                  ? ` (${counts.councilTotal - counts.council} have no address on file)`
                  : ""}
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input type="radio" name="kind" value="all_members"
                checked={kind === "all_members"} onChange={() => setKind("all_members")} />
              <span>All club members — {counts.allMembers}</span>
            </label>
          </>
        ) : null}

        <label style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input type="radio" name="kind" value="club_members"
            checked={kind === "club_members"} onChange={() => setKind("club_members")} />
          <span>One club&rsquo;s members</span>
        </label>

        {kind === "club_members" ? (
          <div className="field" style={{ marginLeft: 26 }}>
            <label htmlFor="clubId">Club</label>
            <select id="clubId" name="clubId" required defaultValue={clubs[0]?.id ?? ""}>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <label style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input type="radio" name="kind" value="event"
            checked={kind === "event"} onChange={() => setKind("event")} />
          <span>An event&rsquo;s registrants</span>
        </label>

        {kind === "event" ? (
          <div style={{ marginLeft: 26 }}>
            <div className="field">
              <label htmlFor="eventId">Event</label>
              <select id="eventId" name="eventId" required defaultValue={events[0]?.id ?? ""}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="scope">Which registrants</label>
              <select id="scope" name="scope" defaultValue="confirmed">
                <option value="confirmed">Confirmed only</option>
                <option value="all">Everyone, including the waitlist</option>
              </select>
            </div>
          </div>
        ) : null}
      </fieldset>

      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required maxLength={120} />
      </div>

      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" rows={8} required maxLength={4000} />
        <span className="hint">Plain text. Everyone gets the same message.</span>
      </div>

      <div className="field">
        <label htmlFor="link">Link (optional)</label>
        <input id="link" name="link" type="url" maxLength={2000} />
        <span className="hint">Becomes a button in the email.</span>
      </div>

      <div className="field">
        <label htmlFor="linkLabel">Button text (optional)</label>
        <input id="linkLabel" name="linkLabel" maxLength={60} />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : state.confirm ? "Yes, send it" : "Send"}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Add the nav link**

In `src/app/admin/(app)/layout.tsx`, alongside the other entries:

```tsx
    ...(canView(session, "manage:broadcast")
      ? [{ href: "/admin/email", label: "Email", group: "inbox" as const }]
      : []),
```

- [ ] **Step 6: Fix the nav tests**

Run: `npm test -- src/lib/admin/nav.test.ts`
Expected: FAIL — the label lists at roughly lines 40 and 59 are exhaustive. Add `"Email"` in the right position (the `inbox` group, after Contact and Feedback) and re-run until green.

- [ ] **Step 7: Verify in the browser**

`npm run dev`, sign in as `sandy`. Open `/admin/email`:
- Pick "Club heads and vice heads" (26) → Send → the success note should say 26, and 26 mails should arrive.
- Pick "All club members" (908) → Send → the **confirm panel** must appear naming 908 before anything is sent. Do not confirm yet; Task 11 builds the Outbox that drains it.

- [ ] **Step 8: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add "src/app/admin/(app)/email" src/components/admin/BroadcastComposer.tsx "src/app/admin/(app)/layout.tsx" src/lib/admin/nav.test.ts src/lib/admin/form-state.ts
git commit -m "feat(email): broadcast composer with audience picker and a confirm step"
```

---

### Task 11: The Outbox

**Files:**
- Create: `src/app/admin/(app)/outbox/page.tsx`
- Create: `src/app/admin/(app)/outbox/actions.ts`
- Create: `src/components/admin/OutboxPanel.tsx`
- Modify: `src/app/admin/(app)/layout.tsx`
- Modify: `src/lib/admin/nav.test.ts`

**Interfaces:**
- Consumes: `deliverPending` from `@/lib/email/send`; `dayKeyStartUTC`, `todayKey` from `@/lib/datetime`
- Produces: `interface OutboxResult { error?: string; sent?: number; failed?: number; retried?: number }`; `drainBatchAction(): Promise<OutboxResult>`; `retryFailedAction(): Promise<OutboxResult>`

**Classes to reuse, verified against `src/app/globals.css`:** stat tiles are `.admin-stats` wrapping `.admin-stat`, each holding a `.n` and a `.label` (there is no `.admin-stat-row`). Tables are a `.tablewrap.cards` div around a bare `<table>`, with `data-label` on every `<td>` and `data-primary` on the cell that leads the card below 720px — there is no `.admin-table`.

**The access split, from the spec:** readable by any `manage:broadcast` holder so a club head can see their queued send; **draining requires `all`**, because the ~500/day Gmail quota is shared org-wide.

- [ ] **Step 1: Write the actions**

Create `src/app/admin/(app)/outbox/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverPending } from "@/lib/email/send";
import { writeAudit } from "@/lib/admin/audit";

/** One press sends this many. ~1s per SMTP connection, well inside the 300s limit. */
const BATCH = 40;

/**
 * One shape for both actions. A discriminated union would narrow badly at the
 * call site — `"error" in r ? … : r.sent` does not narrow inside a template
 * literal — and the client only ever reads one field at a time.
 */
export interface OutboxResult {
  error?: string;
  sent?: number;
  failed?: number;
  retried?: number;
}

async function requireCouncilWide() {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (grantFor(session.role, "manage:broadcast") !== "all") {
    return { error: "Only the council can send the queue." };
  }
  return { session };
}

export async function drainBatchAction(): Promise<OutboxResult> {
  const guard = await requireCouncilWide();
  if ("error" in guard) return { error: guard.error };

  const summary = await deliverPending(BATCH);
  await writeAudit({
    actorId: guard.session.id,
    action: "outbox_drain",
    entity: "email_log",
    after: summary,
  });
  revalidatePath("/admin/outbox");
  return summary;
}

export async function retryFailedAction(): Promise<OutboxResult> {
  const guard = await requireCouncilWide();
  if ("error" in guard) return { error: guard.error };

  const admin = createAdminClient();
  const { data } = await admin
    .from("email_log")
    .update({ status: "pending", error: null })
    .eq("status", "failed")
    .select("id");

  const retried = data?.length ?? 0;
  await writeAudit({
    actorId: guard.session.id,
    action: "outbox_retry",
    entity: "email_log",
    after: { retried },
  });
  revalidatePath("/admin/outbox");
  return { retried };
}
```

- [ ] **Step 2: Write the page**

Create `src/app/admin/(app)/outbox/page.tsx`:

```tsx
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKeyStartUTC, todayKey, istDateMedium, istTime } from "@/lib/datetime";
import { OutboxPanel } from "@/components/admin/OutboxPanel";

/**
 * The email queue. Readable by anyone who can broadcast — a club head whose
 * 236-person send was queued needs to see where it went. Draining is council-
 * only: the daily Gmail allowance is shared, and spending it is their call.
 */
export default async function OutboxPage() {
  const session = await requireViewPage("manage:broadcast");
  const canDrain = grantFor(session.role, "manage:broadcast") === "all";

  const admin = createAdminClient();
  const startOfToday = dayKeyStartUTC(todayKey()).toISOString();

  const [pending, failed, sentToday, recent] = await Promise.all([
    admin.from("email_log").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("email_log").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", startOfToday),
    admin
      .from("email_log")
      .select("id, to_email, subject, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Email</div>
          <h1 style={{ margin: "6px 0 0" }}>Outbox</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            {sentToday.count ?? 0} sent today. Gmail allows roughly 500 a day, so
            a large send clears over more than one day.
          </p>
        </div>
      </div>

      <OutboxPanel
        pending={pending.count ?? 0}
        failed={failed.count ?? 0}
        sentToday={sentToday.count ?? 0}
        canDrain={canDrain}
        recent={(recent.data ?? []).map((r) => ({
          id: r.id,
          toEmail: r.to_email,
          subject: r.subject,
          status: r.status,
          error: r.error,
          when: `${istDateMedium(r.created_at)} ${istTime(r.created_at)}`,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 3: Write the panel component**

Create `src/components/admin/OutboxPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { drainBatchAction, retryFailedAction } from "@/app/admin/(app)/outbox/actions";

export function OutboxPanel({
  pending,
  failed,
  sentToday,
  canDrain,
  recent,
}: {
  pending: number;
  failed: number;
  sentToday: number;
  canDrain: boolean;
  recent: {
    id: string;
    toEmail: string;
    subject: string;
    status: string;
    error: string | null;
    when: string;
  }[];
}) {
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="admin-stats">
        <div className="admin-stat"><span className="n">{pending}</span><span className="label">pending</span></div>
        <div className="admin-stat"><span className="n">{failed}</span><span className="label">failed</span></div>
        <div className="admin-stat"><span className="n">{sentToday}</span><span className="label">sent today</span></div>
      </div>

      {note ? <div className="note" style={{ marginTop: 14 }}>{note}</div> : null}

      {canDrain ? (
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || pending === 0}
            onClick={() =>
              start(async () => {
                const r = await drainBatchAction();
                setNote(r.error ?? `Sent ${r.sent ?? 0}, failed ${r.failed ?? 0}.`);
              })
            }
          >
            {busy ? "Sending…" : "Send next batch"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || failed === 0}
            onClick={() =>
              start(async () => {
                const r = await retryFailedAction();
                setNote(r.error ?? `Requeued ${r.retried ?? 0}.`);
              })
            }
          >
            Retry failed
          </button>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 16 }}>
          Your queued mail sends when the council presses Send, or overnight.
        </p>
      )}

      <div className="tablewrap cards" style={{ marginTop: 22 }}>
        <table>
          <thead>
            <tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td data-label="When">{r.when}</td>
                <td data-label="To" data-primary>{r.toEmail}</td>
                <td data-label="Subject">{r.subject}</td>
                <td data-label="Status">{r.status}{r.error ? ` — ${r.error}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Check `src/app/globals.css` for the real class names before committing — `.admin-stat` is shared with `AttendanceAnalytics` and `FeedbackAnalytics`, and STATUS.md warns that every new rule there affects all three. Reuse, do not add.

- [ ] **Step 4: Add the nav link and fix the tests**

In `src/app/admin/(app)/layout.tsx`:

```tsx
    ...(canView(session, "manage:broadcast")
      ? [{ href: "/admin/outbox", label: "Outbox", group: "inbox" as const }]
      : []),
```

Run: `npm test -- src/lib/admin/nav.test.ts` and add `"Outbox"` to the exhaustive label lists.

- [ ] **Step 5: Drain the real queue end to end**

`npm run dev`, as `sandy`:
1. `/admin/email` → All club members → Send → confirm → note says 908 queued.
2. `/admin/outbox` → pending shows 908.
3. Press **Send next batch** → pending drops by 40, sent-today rises by 40, and 40 mails actually arrive.
4. Sign in as a club head: `/admin/outbox` opens read-only, with no Send button.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add "src/app/admin/(app)/outbox" src/components/admin/OutboxPanel.tsx "src/app/admin/(app)/layout.tsx" src/lib/admin/nav.test.ts
git commit -m "feat(email): outbox with batch drain, retry and the daily ceiling in view"
```

---

### Task 12: Full gate and documentation

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Run the whole gate**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Expected: all four clean. Record the test count — STATUS.md quotes it for every shipped feature.

- [ ] **Step 2: Update STATUS.md**

Add a block in the same style as the existing shipped entries, covering: the reminder is a button and there is deliberately **no reminder cron**; the three `.ics` routes; `manage:broadcast` and who holds it; the 50-address inline threshold; the Outbox and that draining is council-only; the cron drain change 25 → 100; and the standing limit that Gmail caps near 500/day so an all-members send takes more than one day. Move "reminder cron" and "`.ics` feeds" out of the Phase 2 remaining list.

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): broadcast email, reminders and .ics feeds shipped"
```

- [ ] **Step 4: Hand back**

Report the branch, the gate output, and the walkthrough items that still need a human in a browser — in particular the 908-row queue drain, which no test can prove.

---

## Notes for whoever executes this

- **Do not add a reminder cron.** It was explicitly declined. `events.reminder_sent` exists in the schema from an older design; leave it alone.
- **The `.ics` slice (Tasks 1–3) is independent** of the composer. If the email work stalls, `.ics` can ship on its own.
- **PostgREST type trap:** building a `select` string dynamically degrades the inferred row type to `GenericStringError` and every field access fails to compile. Keep select strings literal, or cast through `as unknown as` with an explicit row type. This repo has hit it repeatedly.
- **Do not test by mailing all 908 students.** Use the heads audience (26) for live checks, and for queue behaviour queue the large send but drain only one batch.
