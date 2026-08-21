import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
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
  "id, title, description, starts_at, ends_at, capacity, is_all_day, " +
  "venues ( name ), event_clubs ( is_primary, clubs ( name, short_name ) )";

type EventJoinRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  is_all_day: boolean;
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

function toSummary(row: EventJoinRow, registered: number): EventSummary {
  return {
    id: row.id,
    title: row.title,
    blurb: row.description ?? "",
    club: primaryClubName(row),
    day: istDayNum(row.starts_at),
    dateLabel: istDateLabel(row.starts_at),
    timeLabel: row.is_all_day ? "All day" : istTime(row.starts_at),
    venue: row.venues?.name ?? "TBA",
    registered,
    capacity: row.capacity ?? 0,
    status: seatStatus(registered, row.capacity),
  };
}

async function toSummaries(rows: EventJoinRow[]): Promise<EventSummary[]> {
  const counts = await registeredCounts(rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, counts.get(r.id) ?? 0));
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
}

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, rules, starts_at, ends_at, capacity, is_all_day, " +
      "venues ( name ), event_clubs ( is_primary, clubs ( name, short_name ) )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as EventJoinRow & { rules: string | null };
  const counts = await registeredCounts([row.id]);
  const summary = toSummary(row, counts.get(row.id) ?? 0);
  return {
    ...summary,
    description: row.description ?? "",
    rules: row.rules ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
  };
}

// ── calendar ─────────────────────────────────────────────────────────────

const CAL_SELECT =
  "id, title, starts_at, ends_at, capacity, is_all_day, status, " +
  "venues ( name ), event_clubs ( is_primary, clubs ( short_name, slug, color ) )";

type CalEventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  is_all_day: boolean;
  status: string;
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
    venue: row.venues?.name ?? "TBA",
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
