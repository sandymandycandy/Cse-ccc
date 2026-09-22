import { istFullDate, istLocalToUTC } from "@/lib/datetime";

/**
 * The event form's tab strip, and the rule for whether a tab still wants
 * something.
 *
 * Pure so the progress dots can be tested without rendering the form. The form
 * runs to sixteen fields; split across five tabs, only one is on screen at a
 * time, and a dot per tab is the only thing that tells you the other four are
 * finished. Get the rule wrong and the form cheerfully reports itself complete
 * while a required field sits unfilled two tabs away.
 *
 * These are *guidance*, not validation. The server action is the authority on
 * what may be saved (`CreateSchema` in the events actions); a gap here only
 * colours a dot, so a half-finished draft can still be saved and come back to.
 */

export type EventFormTab = "basics" | "when" | "registration" | "form" | "cover";

export interface EventFormTabDef {
  key: EventFormTab;
  /** Rendered in the tab strip, so it is a string, not an index. */
  n: string;
  label: string;
}

export const EVENT_FORM_TABS: EventFormTabDef[] = [
  { key: "basics", n: "01", label: "Basics" },
  { key: "when", n: "02", label: "When & where" },
  { key: "registration", n: "03", label: "Registration" },
  { key: "form", n: "04", label: "Form" },
  { key: "cover", n: "05", label: "Cover" },
];

/** What the form holds right now. Times are IST wall-clock, as the inputs give them. */
export interface EventFormValues {
  title: string;
  description: string;
  venue: string;
  startsAtLocal: string;
  endsAtLocal: string;
  registrationClosesAtLocal: string;
  fieldCount: number;
}

export type EventFormGaps = Record<EventFormTab, string | null>;

/** Minutes between two IST wall-clock strings, or null if that is not a span. */
function spanMinutes(startsAtLocal: string, endsAtLocal: string): number | null {
  const a = istLocalToUTC(startsAtLocal);
  const b = istLocalToUTC(endsAtLocal);
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60000);
}

/**
 * "3 hours 40 min" — how long the event runs, or "—" when the pair is not yet
 * a span. Shown beside the two time inputs, where it is the quickest way to
 * catch a PM/AM slip that would otherwise only surface as a validation error.
 */
export function durationText(startsAtLocal: string, endsAtLocal: string): string {
  const total = spanMinutes(startsAtLocal, endsAtLocal);
  if (total == null) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  // Under an hour reads as minutes alone — "0 hours 40 min" is nobody's phrasing.
  if (h === 0) return `${m} min`;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m ? `${hours} ${m} min` : hours;
}

/** "Thursday, 1 October 2026" — the start's full date, or "" if there isn't one. */
export function dayText(startsAtLocal: string): string {
  const utc = istLocalToUTC(startsAtLocal);
  return utc ? istFullDate(utc) : "";
}

/** What each tab is still missing, in the order the form asks for it. */
export function tabGaps(v: EventFormValues): EventFormGaps {
  return {
    basics: !v.title.trim() ? "a title" : !v.description.trim() ? "a description" : null,
    when: !v.venue.trim()
      ? "a venue"
      : durationText(v.startsAtLocal, v.endsAtLocal) === "—"
        ? "a valid start and end"
        : null,
    registration: !v.registrationClosesAtLocal ? "a registration closing time" : null,
    form: v.fieldCount === 0 ? "at least one question" : null,
    // Never a gap: an event ships fine without a poster, and saying otherwise
    // would leave a permanent amber dot on every event that doesn't want one.
    cover: null,
  };
}

/** The earliest tab wanting something — in tab order, not object order. */
export function firstGap(gaps: EventFormGaps): EventFormTab | null {
  return EVENT_FORM_TABS.find((t) => gaps[t.key])?.key ?? null;
}

export function gapCount(gaps: EventFormGaps): number {
  return EVENT_FORM_TABS.filter((t) => gaps[t.key]).length;
}

/** Capacity means nothing in shortlist mode, so the hint says so outright. */
export function capacityHint(mode: "seats" | "shortlist"): string {
  return mode === "shortlist"
    ? "Ignored for shortlists — you select applicants afterward."
    : "Leave blank for unlimited seats.";
}

/**
 * Which tab each form field lives on.
 *
 * The server action rejects by field name, and with five tabs the field it
 * names is usually not the one on screen. Without this the form would render
 * an error nobody can see and the save would look like it simply did nothing.
 * Every key the action's schema can reject has an entry; a name with no entry
 * is left alone rather than guessed at.
 */
const FIELD_TABS: Record<string, EventFormTab> = {
  title: "basics",
  description: "basics",
  clubId: "basics",
  cohostIds: "basics",
  venueText: "when",
  startsAt: "when",
  endsAt: "when",
  selectionMode: "registration",
  capacity: "registration",
  registrationOpensAt: "registration",
  registrationClosesAt: "registration",
  waitlistEnabled: "registration",
  showOnAchievements: "registration",
  whatsappUrl: "registration",
  registrationForm: "form",
  image: "cover",
};

export function tabForField(name: string): EventFormTab | null {
  return FIELD_TABS[name] ?? null;
}

/** The earliest tab holding a rejected field, so the form can open it. */
export function tabWithFirstError(
  fieldErrors: Record<string, string> | undefined,
): EventFormTab | null {
  if (!fieldErrors) return null;
  const hit = new Set(
    Object.keys(fieldErrors)
      .map(tabForField)
      .filter((t): t is EventFormTab => t !== null),
  );
  return EVENT_FORM_TABS.find((t) => hit.has(t.key))?.key ?? null;
}
