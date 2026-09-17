import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { orderStandings } from "@/lib/results";
import { isSafeHttpUrl } from "@/lib/url";
import { siteOrigin } from "@/lib/site-origin";
import type { IcsEvent } from "@/lib/ics";
import { validateFormSchema, type FormField } from "@/lib/registration-form/schema";
import { registrationPhase, type RegPhase } from "@/lib/registration/phase";
import {
  type BoardEntry,
  mergeBoard,
  parseWinners,
  winnersFromResults,
} from "@/lib/achievements-board";
import { podiumRound } from "@/lib/certificates/winners";
import type { Database } from "@/lib/database.types";
import type {
  CalendarEvent,
  Club,
  ClubCategory,
  EventSummary,
  SeatStatus,
} from "@/lib/types";
import type { WeekDay } from "@/components/WeekStrip";
import {
  istDateKey,
  istDateLabel,
  istDayNum,
  istTime,
  istWeekDates,
  istWeekdayShort,
} from "@/lib/datetime";

// ── helpers ──────────────────────────────────────────────────────────────

function seatStatus(registered: number, capacity: number | null): SeatStatus {
  if (!capacity) return "open";
  const left = capacity - registered;
  if (left <= 0) return "full";
  if (left / capacity <= 0.15) return "fast";
  return "open";
}

function capCategory(c: string): ClubCategory {
  return (c.charAt(0).toUpperCase() + c.slice(1)) as ClubCategory;
}

/** Seat counts for a set of events (anon-safe RPC — bare integers, no PII). */
async function registeredCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_registration_counts", {
    p_event_ids: ids,
  });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.event_id, r.registered]));
}

const EVENT_SELECT =
  "id, title, description, starts_at, ends_at, capacity, is_all_day, venue_text, " +
  "venues ( name ), event_clubs ( is_primary, clubs ( name, short_name ) )";

type EventJoinRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  is_all_day: boolean;
  venue_text: string | null;
  venues: { name: string } | null;
  event_clubs: {
    is_primary: boolean;
    clubs: { name: string; short_name: string } | null;
  }[];
};

function primaryClubName(row: EventJoinRow): string {
  const primary = row.event_clubs.find((ec) => ec.is_primary) ?? row.event_clubs[0];
  return primary?.clubs?.name ?? "CSE Council";
}

/**
 * Which of these events have at least one PUBLISHED standing — one query for a
 * whole page of rows, never one per event. RLS (`results_public_read`) already
 * limits this to published rows on approved events; the explicit filter keeps
 * the intent visible at the call site.
 */
async function eventsWithResults(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("results")
    .select("event_id")
    .in("event_id", ids)
    .not("published_at", "is", null);
  return new Set((data ?? []).map((r) => r.event_id));
}

function toSummary(
  row: EventJoinRow,
  registered: number,
  hasResults = false,
): EventSummary {
  return {
    id: row.id,
    title: row.title,
    blurb: row.description ?? "",
    club: primaryClubName(row),
    day: istDayNum(row.starts_at),
    dateLabel: istDateLabel(row.starts_at),
    timeLabel: row.is_all_day ? "All day" : istTime(row.starts_at),
    venue: row.venue_text ?? row.venues?.name ?? "TBA",
    registered,
    capacity: row.capacity ?? 0,
    status: seatStatus(registered, row.capacity),
    hasResults,
    isPast: new Date(row.ends_at).getTime() < Date.now(),
  };
}

async function toSummaries(rows: EventJoinRow[]): Promise<EventSummary[]> {
  const ids = rows.map((r) => r.id);
  const [counts, withResults] = await Promise.all([
    registeredCounts(ids),
    eventsWithResults(ids),
  ]);
  return rows.map((r) => toSummary(r, counts.get(r.id) ?? 0, withResults.has(r.id)));
}

// ── events ───────────────────────────────────────────────────────────────

/** Approved, non-cancelled events that haven't finished yet, soonest first. */
export async function getUpcomingEvents(limit = 12): Promise<EventSummary[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .neq("status", "cancelled")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  // The select is built from a const string, so supabase-js can't infer the row
  // shape — we own the shape via EventJoinRow instead.
  return toSummaries((data ?? []) as unknown as EventJoinRow[]);
}

/** Finished events, most recent first (the archive). */
export async function getPastEvents(limit = 24): Promise<EventSummary[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .lt("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return toSummaries((data ?? []) as unknown as EventJoinRow[]);
}

export interface EventDetail extends EventSummary {
  description: string;
  rules: string | null;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  posterUrl: string | null;
  selectionMode: "seats" | "shortlist";
  registrationForm: FormField[] | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  registrationPhase: RegPhase;
}

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, rules, starts_at, ends_at, capacity, is_all_day, venue_text, poster_path, selection_mode, registration_form, " +
      "registration_opens_at, registration_closes_at, " +
      "venues ( name ), event_clubs ( is_primary, clubs ( name, short_name ) )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as EventJoinRow & {
    rules: string | null;
    poster_path: string | null;
    selection_mode: "seats" | "shortlist" | null;
    registration_form: unknown;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
  };
  const [counts, withResults] = await Promise.all([
    registeredCounts([row.id]),
    eventsWithResults([row.id]),
  ]);
  const summary = toSummary(row, counts.get(row.id) ?? 0, withResults.has(row.id));
  return {
    ...summary,
    description: row.description ?? "",
    rules: row.rules ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
    posterUrl: row.poster_path
      ? supabase.storage.from("event-posters").getPublicUrl(row.poster_path).data.publicUrl
      : null,
    selectionMode: row.selection_mode ?? "seats",
    registrationForm: (() => {
      if (!row.registration_form) return null;
      const parsed = validateFormSchema(row.registration_form);
      return parsed.ok ? parsed.fields : null;
    })(),
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    registrationPhase: registrationPhase(
      Date.now(),
      row.registration_opens_at,
      row.registration_closes_at,
    ),
  };
}

// ── calendar ─────────────────────────────────────────────────────────────

const CAL_SELECT =
  "id, title, starts_at, ends_at, capacity, is_all_day, status, venue_text, " +
  "venues ( name ), event_clubs ( is_primary, clubs ( short_name, slug, color ) )";

type CalEventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  is_all_day: boolean;
  status: string;
  venue_text: string | null;
  venues: { name: string } | null;
  event_clubs: {
    is_primary: boolean;
    clubs: { short_name: string; slug: string; color: string } | null;
  }[];
};

function toCalendarEvent(row: CalEventRow, registered: number): CalendarEvent {
  const primary = row.event_clubs.find((ec) => ec.is_primary) ?? row.event_clubs[0];
  const club = primary?.clubs;
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
    club: club?.short_name ?? "Council",
    clubSlug: club?.slug ?? "council",
    clubColor: club?.color ?? "var(--forest)",
    venue: row.venue_text ?? row.venues?.name ?? "TBA",
    registered,
    capacity: row.capacity ?? 0,
    status: seatStatus(registered, row.capacity),
    cancelled: row.status === "cancelled",
  };
}

/**
 * Every public event whose [starts_at, ends_at) touches the UTC window — RLS
 * exposes approved events plus cancelled ones inside the §5.6 7-day grace
 * window (rendered struck-through), so we intentionally don't filter status.
 */
export async function getCalendarEvents(
  startISO: string,
  endISO: string,
): Promise<CalendarEvent[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select(CAL_SELECT)
    .lt("starts_at", endISO)
    .gt("ends_at", startISO)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as CalEventRow[];
  const counts = await registeredCounts(rows.map((r) => r.id));
  return rows.map((r) => toCalendarEvent(r, counts.get(r.id) ?? 0));
}

/** Active clubs as filter chips: slug, short label, and calendar colour. */
export async function getCalendarClubs(): Promise<
  { slug: string; shortName: string; color: string }[]
> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("clubs")
    .select("slug, short_name, color")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    slug: c.slug,
    shortName: c.short_name,
    color: c.color,
  }));
}

// ── clubs ────────────────────────────────────────────────────────────────

type ClubRow = {
  slug: string;
  name: string;
  short_name: string;
  category: string;
  color: string;
  tagline: string | null;
  description: string | null;
};

function toClub(row: ClubRow): Club {
  return {
    slug: row.slug,
    name: row.name,
    shortName: row.short_name,
    category: capCategory(row.category),
    color: row.color,
    blurb: row.tagline ?? "",
  };
}

/** Active clubs with a count of their upcoming events. */
export async function getClubsWithCounts(): Promise<
  { club: Club; eventCount: number }[]
> {
  const supabase = createPublicClient();
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("slug, name, short_name, category, color, tagline, description")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort", { ascending: true });
  if (error) throw error;

  // Upcoming events per club (via the co-host mapping; RLS hides non-public rows).
  const { data: ecs, error: ecErr } = await supabase
    .from("event_clubs")
    .select("clubs ( slug ), events!inner ( ends_at, status )")
    .neq("events.status", "cancelled")
    .gte("events.ends_at", new Date().toISOString());
  if (ecErr) throw ecErr;

  const counts = new Map<string, number>();
  for (const row of (ecs ?? []) as { clubs: { slug: string } | null }[]) {
    const slug = row.clubs?.slug;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return (clubs ?? []).map((c) => ({
    club: toClub(c as ClubRow),
    eventCount: counts.get(c.slug) ?? 0,
  }));
}

export async function getClubBySlug(
  slug: string,
): Promise<{ club: Club; description: string | null } | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("clubs")
    .select("slug, name, short_name, category, color, tagline, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ClubRow;
  return { club: toClub(row), description: row.description };
}

/** Upcoming events hosted (primary or co-host) by a club. */
export async function getEventsForClub(slug: string): Promise<EventSummary[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("event_clubs")
    .select(`events!inner ( ${EVENT_SELECT} ), clubs!inner ( slug )`)
    .eq("clubs.slug", slug)
    .neq("events.status", "cancelled")
    .gte("events.ends_at", new Date().toISOString());
  if (error) throw error;
  const rows = ((data ?? []) as { events: EventJoinRow | null }[])
    .map((r) => r.events)
    .filter((e): e is EventJoinRow => e !== null)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return toSummaries(rows);
}

// ── achievements ───────────────────────────────────────────────────────────

export interface AchievementItem {
  title: string;
  club: string;
  detail: string;
}

export async function getAchievements(limit = 4): Promise<AchievementItem[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("achievements")
    .select("title, description, happened_on, clubs ( short_name )")
    .order("happened_on", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as {
    title: string;
    description: string | null;
    clubs: { short_name: string } | null;
  }[]).map((a) => ({
    title: a.title,
    club: a.clubs?.short_name ?? "CSE Council",
    detail: a.description ?? "",
  }));
}

// ── week strip ─────────────────────────────────────────────────────────────

export async function getWeekStrip(): Promise<WeekDay[]> {
  const days = istWeekDates();
  const start = days[0];
  const end = new Date(days[6]);
  end.setUTCDate(end.getUTCDate() + 1);

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select("title, starts_at, event_clubs ( is_primary, clubs ( short_name ) )")
    .neq("status", "cancelled")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;

  const byDay = new Map<string, { time: string; title: string; club: string }>();
  for (const e of (data ?? []) as {
    title: string;
    starts_at: string;
    event_clubs: { is_primary: boolean; clubs: { short_name: string } | null }[];
  }[]) {
    const key = istDateKey(e.starts_at);
    if (byDay.has(key)) continue; // first event of the day wins
    const primary = e.event_clubs.find((x) => x.is_primary) ?? e.event_clubs[0];
    byDay.set(key, {
      time: istTime(e.starts_at),
      title: e.title,
      club: primary?.clubs?.short_name ?? "",
    });
  }

  const todayKey = istDateKey(new Date());
  return days.map((d) => ({
    weekday: istWeekdayShort(d),
    num: istDayNum(d),
    today: istDateKey(d) === todayKey,
    event: byDay.get(istDateKey(d)),
  }));
}

// ── published standings (§13.9) ──────────────────────────────────────────────

export interface PublishedResult {
  roll_no: string;
  display_name: string | null;
  /** The team's own name, when the entrant registered as a team. */
  team_name: string | null;
  /** Team members as published: name + roll only, never contact details. */
  team_members: { name: string; roll: string }[] | null;
  rank: number | null;
  score: number | null;
  advanced: boolean;
  remarks: string | null;
}
export interface PublishedRound {
  id: string;
  name: string;
  sort: number;
  showScore: boolean;
  showAdvanced: boolean;
  showRemarks: boolean;
  results: PublishedResult[];
}

/**
 * Rounds with published standings for an event, ordered by `sort`. Uses the anon
 * client, so RLS (`results_public_read`) returns only rows with `published_at`
 * set on approved events — draft rows never reach here. Rounds with no published
 * results are omitted. Columns the organiser hid (show_* = false) are nulled
 * server-side, so hidden values never reach the client. Rank + name always show.
 *
 * `team_name` is read from the DENORMALISED snapshot on `results`, never joined
 * from `registrations`: the anon role has no privilege on that table (it is PII)
 * and must not be given one.
 */
export async function getPublishedResults(eventId: string): Promise<PublishedRound[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("event_rounds")
    .select(
      "id, name, sort, show_score, show_advanced, show_remarks, results ( roll_no, display_name, team_name, team_members, rank, score, advanced, remarks, published_at )",
    )
    .eq("event_id", eventId)
    .order("sort", { ascending: true });

  // A failed query here would otherwise render as "not published yet" — the
  // wrong answer with no signal. Readers still get the calm empty state, but the
  // cause is logged instead of vanishing.
  if (error) console.error("getPublishedResults failed", error);

  const rounds = (data ?? []) as unknown as Array<{
    id: string;
    name: string;
    sort: number;
    show_score: boolean;
    show_advanced: boolean;
    show_remarks: boolean;
    results: Array<PublishedResult & { published_at: string | null }>;
  }>;

  return rounds
    .map((r) => {
      const published = r.results.filter((x) => x.published_at !== null);
      return {
        id: r.id,
        name: r.name,
        sort: r.sort,
        showScore: r.show_score,
        showAdvanced: r.show_advanced,
        showRemarks: r.show_remarks,
        results: orderStandings(published).map((x) => ({
          roll_no: x.roll_no,
          display_name: x.display_name,
          team_name: x.team_name,
          team_members: x.team_members,
          rank: x.rank,
          score: r.show_score ? x.score : null,
          advanced: r.show_advanced ? x.advanced : false,
          remarks: r.show_remarks ? x.remarks : null,
        })),
      };
    })
    .filter((r) => r.results.length > 0);
}

// ── Announcements (Phase 2) ──────────────────────────────────────────────────

export interface AnnouncementCard {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  imageUrl: string | null;
  /** ISO timestamp after which this drops off the public site, or null. */
  expiresAt: string | null;
}

export interface AnnouncementDetail {
  slug: string;
  title: string;
  bodyMarkdown: string;
  publishedAt: string;
  imageUrl: string | null;
}

/** Plain-text excerpt from markdown body — strip the lightweight syntax, clamp. */
function excerpt(md: string, max = 160): string {
  const text = md
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // link → its label
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/**
 * Published, NOT-YET-EXPIRED announcements, newest first (RLS also enforces
 * published-only).
 *
 * The expiry filter is applied here, in SQL, because this one read feeds every
 * public surface — the home hero, the home Announcements section and
 * /announcements. Filtering here is what makes an expired notice vanish from
 * all three at once. Filtering in SQL rather than after the fetch also keeps
 * `.limit(100)` counting live notices instead of letting old ones eat the cap.
 *
 * Deliberately NOT applied to `getAnnouncementBySlug`: a link already sent to
 * students keeps working after the notice leaves the lists.
 *
 * Admin reads (`listAnnouncementsForAdmin`) bypass this entirely and show past
 * announcements on purpose.
 */
export async function getPublishedAnnouncements(): Promise<AnnouncementCard[]> {
  const supabase = createPublicClient();
  // One string literal: splitting a .select() degrades the inferred row type.
  const { data, error } = await supabase
    .from("announcements")
    .select("slug, title, body_markdown, published_at, image_path, expires_at")
    .not("published_at", "is", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    slug: a.slug,
    title: a.title,
    excerpt: excerpt(a.body_markdown),
    publishedAt: a.published_at as string,
    imageUrl: a.image_path
      ? supabase.storage.from("announcements").getPublicUrl(a.image_path).data.publicUrl
      : null,
    expiresAt: a.expires_at,
  }));
}

/** One published announcement by slug, or null (a draft/missing slug → null → 404). */
export async function getAnnouncementBySlug(slug: string): Promise<AnnouncementDetail | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("slug, title, body_markdown, published_at, image_path")
    .eq("slug", slug)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    slug: data.slug,
    title: data.title,
    bodyMarkdown: data.body_markdown,
    publishedAt: data.published_at as string,
    imageUrl: data.image_path
      ? supabase.storage.from("announcements").getPublicUrl(data.image_path).data.publicUrl
      : null,
  };
}

// ── Achievements (Phase 2) ───────────────────────────────────────────────────

export interface PublicAchievement {
  id: string;
  title: string;
  description: string | null;
  happenedOn: string | null;
  imageUrl: string | null;
  clubName: string | null;
}

/** All achievements for the public page (no draft state; RLS allows anon read).
 *  Ordered by date (newest first, undated last) then newest created. */
export async function getPublicAchievements(): Promise<PublicAchievement[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("achievements")
    .select("id, title, description, happened_on, image_path, created_at, clubs(name)")
    .order("happened_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    happenedOn: a.happened_on,
    imageUrl: a.image_path
      ? supabase.storage.from("achievements").getPublicUrl(a.image_path).data.publicUrl
      : null,
    clubName: a.clubs?.name ?? null,
  }));
}

/**
 * The achievements board: hand-entered wins plus the podium of every event
 * whose results are published and which has not been hidden from the board.
 *
 * Automatic entries are derived at read time, never snapshotted, so the board
 * cannot disagree with an event's own results page. An event has rounds, so
 * "the podium" means one of them: the highest-`sort` round that actually has
 * published results — not simply the last round, which may be an unplayed final.
 */
export async function getAchievementsBoard(): Promise<BoardEntry[]> {
  const supabase = createPublicClient();

  const manualQ = supabase
    .from("achievements")
    .select("id, title, description, happened_on, image_path, created_at, winners, clubs(name)")
    .order("happened_on", { ascending: false, nullsFirst: false })
    .limit(500);

  const autoQ = supabase
    .from("events")
    .select(
      "id, title, starts_at, created_at, show_on_achievements, " +
        "event_clubs ( is_primary, clubs ( name ) ), " +
        "event_rounds ( sort, results ( roll_no, display_name, team_name, team_members, rank, score, advanced, remarks, published_at ) )",
    )
    .eq("show_on_achievements", true)
    .limit(500);

  const [manualRes, autoRes] = await Promise.all([manualQ, autoQ]);

  if (manualRes.error) throw manualRes.error;
  // A failed auto query must not masquerade as "no winners yet" — log it and
  // fall back to the manual half, the way getPublishedResults does.
  if (autoRes.error) console.error("getAchievementsBoard: auto half failed", autoRes.error);

  const manual: BoardEntry[] = (manualRes.data ?? []).map((a) => ({
    id: a.id,
    kind: "manual" as const,
    title: a.title,
    clubName: a.clubs?.name ?? null,
    date: a.happened_on,
    fallbackDate: a.created_at,
    winners: parseWinners(a.winners),
    description: a.description,
    imageUrl: a.image_path
      ? supabase.storage.from("achievements").getPublicUrl(a.image_path).data.publicUrl
      : null,
    href: null,
  }));

  type AutoRow = {
    id: string;
    title: string;
    starts_at: string;
    created_at: string;
    event_clubs: { is_primary: boolean; clubs: { name: string } | null }[];
    event_rounds: {
      sort: number;
      results: (PublishedResult & { published_at: string | null })[];
    }[];
  };

  const auto: BoardEntry[] = [];
  for (const e of (autoRes.data ?? []) as unknown as AutoRow[]) {
    // Highest-sort round that has at least one published result — the same rule
    // winner certificates use, so the board and a certificate can never disagree.
    const round = podiumRound(e.event_rounds ?? []);
    if (!round) continue;

    const published = round.results.filter((r) => r.published_at != null);
    const winners = winnersFromResults(published);
    if (winners.length === 0) continue;

    const primary = e.event_clubs?.find((ec) => ec.is_primary) ?? e.event_clubs?.[0];
    auto.push({
      id: e.id,
      kind: "event" as const,
      title: e.title,
      clubName: primary?.clubs?.name ?? null,
      date: e.starts_at,
      fallbackDate: e.created_at,
      winners,
      description: null,
      imageUrl: null,
      href: `/events/${e.id}/results`,
    });
  }

  return mergeBoard(auto, manual);
}


// ── Gallery (Phase 2) ────────────────────────────────────────────────────────

export interface GalleryPhoto {
  id: string;
  imageUrl: string;
  caption: string | null;
  clubName: string | null;
  /** Stored pixel size, when known. Lets the browser reserve the right space
   *  before the image loads; the masonry works without it, just with a reflow. */
  width: number | null;
  height: number | null;
}

/** All gallery photos for the public page (no draft state; RLS allows anon
 *  read). Ordered by `sort` then newest first — the admin controls `sort`. */
export async function getPublicGallery(): Promise<GalleryPhoto[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("gallery")
    .select("id, image_path, caption, sort, created_at, image_w, image_h, clubs(name)")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((g) => ({
    id: g.id,
    imageUrl: supabase.storage.from("gallery").getPublicUrl(g.image_path).data.publicUrl,
    caption: g.caption,
    clubName: g.clubs?.name ?? null,
    width: g.image_w,
    height: g.image_h,
  }));
}

// ── Resources (Phase 2) ──────────────────────────────────────────────────────

export interface PublicResource {
  id: string;
  title: string;
  url: string;
  kind: Database["public"]["Enums"]["resource_kind"];
  clubId: string | null;
  clubName: string | null;
}

/**
 * All resources for the public page (there is no draft state — a row is live
 * once created; RLS allows anon read). Any row whose stored URL isn't a safe
 * http(s) link is dropped defensively so it never becomes a live `<a href>`.
 */
export async function getPublicResources(): Promise<PublicResource[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("resources")
    .select("id, title, url, kind, club_id, clubs(name)")
    .order("title")
    .limit(500);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => isSafeHttpUrl(r.url))
    .map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      kind: r.kind,
      clubId: r.club_id,
      clubName: r.clubs?.name ?? null,
    }));
}

/**
 * Raw event rows for the `.ics` feeds. Deliberately not `EventSummary` — that
 * type is pre-formatted for the UI and drops `updated_at` and `status`, both of
 * which a calendar subscriber needs.
 *
 * Window: everything upcoming plus the last 60 days, so a subscriber keeps a
 * little history and sees a just-cancelled event. RLS does the visibility work:
 * `events_public_read` allows approved events, and cancelled ones only for 7
 * days after `cancelled_at` — exactly the window a subscriber needs to notice.
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
