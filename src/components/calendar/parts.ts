import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/types";
import { istTime } from "@/lib/datetime";
import { isBanded, spanRole } from "@/lib/calendar-layout";

/** Inline `--chip-color` so a chip/block picks up its club's calendar colour. */
export function chipColor(ev: CalendarEvent): CSSProperties {
  return { ["--chip-color" as string]: ev.clubColor };
}

/**
 * The mono time stamp a chip shows for `ev` on `dayKey`: an all-day or spanning
 * event reads "All day" / "continues"; a timed event shows its start (§5.4).
 */
export function chipTime(ev: CalendarEvent, dayKey: string): string {
  if (ev.isAllDay) return spanRole(ev, dayKey) === "continue" ? "continues" : "All day";
  if (isBanded(ev)) {
    return spanRole(ev, dayKey) === "continue" ? "continues" : istTime(ev.startsAt);
  }
  return istTime(ev.startsAt);
}
