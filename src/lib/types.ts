// Domain types shared across UI. These mirror the data model in
// docs/BUILD_PLAN.md §8; the DB-generated types (Phase 0, Supabase) will be the
// source of truth once the schema is applied — these keep the UI honest until then.

export type ClubCategory = "Tech" | "Media" | "Cultural" | "Wellness" | "Career";

/** Seat status drives the badge + register/waitlist CTA on event surfaces. */
export type SeatStatus = "open" | "fast" | "full";

export interface Club {
  slug: string;
  name: string;
  /** Short display name used in dense UI (e.g. "Coding" not "Coding Club"). */
  shortName: string;
  category: ClubCategory;
  /** Calendar-only colour (BUILD_PLAN §4) — never used for UI chrome. */
  color: string;
  /** Tagline. NOTE: placeholders until real copy arrives (BUILD_PLAN §18 item 6). */
  blurb: string;
}

export interface EventSummary {
  id: string;
  title: string;
  blurb: string;
  /** Primary club display name. */
  club: string;
  /** Day-of-month, e.g. "21". */
  day: string;
  /** e.g. "Aug · Fri". */
  dateLabel: string;
  /** e.g. "9:00 AM". */
  timeLabel: string;
  venue: string;
  registered: number;
  capacity: number;
  status: SeatStatus;
  /** At least one standing has been published for this event. */
  hasResults: boolean;
  /** The event has finished, so registration is a dead end. */
  isPast: boolean;
}

/**
 * An event as the calendar needs it (BUILD_PLAN §5): raw instants for layout
 * math, the club's calendar colour, and a cancelled flag so §5.6's 7-day
 * struck-through window can render. Serialisable — crosses the server→client
 * boundary as props.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO timestamptz — the true instant, rendered in IST by the views. */
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  /** Primary club: short name for chips, slug for filtering, colour for the rail. */
  club: string;
  clubSlug: string;
  clubColor: string;
  venue: string;
  registered: number;
  capacity: number;
  status: SeatStatus;
  /** Cancelled but still inside the §5.6 grace window → render struck-through. */
  cancelled: boolean;
}
