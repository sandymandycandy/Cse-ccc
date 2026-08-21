"use client";

import Link from "next/link";
import type { CalendarEvent } from "@/lib/types";
import { SeatBadge } from "@/components/ui/Badge";
import { groupByDay } from "@/lib/calendar-layout";
import {
  addDays,
  dayOfMonth,
  istShortDay,
  istTimeRange,
  istWeekdayShortKey,
} from "@/lib/datetime";
import { chipColor } from "./parts";

/** All-day / spanning events read as a range; timed events as a range too. */
function timeLabel(ev: CalendarEvent): string {
  if (ev.isAllDay) return "All day";
  return istTimeRange(ev.startsAt, ev.endsAt);
}

export function AgendaView({
  anchor,
  today,
  events,
}: {
  anchor: string;
  today: string;
  events: CalendarEvent[];
}) {
  const groups = groupByDay(events);

  if (groups.length === 0) {
    return (
      <div className="cal-empty">
        Nothing scheduled between {istShortDay(anchor)} and{" "}
        {istShortDay(addDays(anchor, 60))}.
      </div>
    );
  }

  return (
    <div className="cal-agenda">
      {groups.map(({ day, events: dayEvents }) => (
        <div className="cal-agenda-day" key={day}>
          <div className={"cal-agenda-date" + (day === today ? " today" : "")}>
            <span className="d">{dayOfMonth(day)}</span>
            <span className="w">{istWeekdayShortKey(day)}</span>
          </div>
          <div className="cal-agenda-list">
            {dayEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="cal-arow"
                style={chipColor(ev)}
              >
                <div>
                  <div className="time">{timeLabel(ev)}</div>
                  <div className="meta">{ev.venue}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <h4
                    style={
                      ev.cancelled
                        ? { textDecoration: "line-through", color: "var(--ink-3)" }
                        : undefined
                    }
                  >
                    {ev.title}
                  </h4>
                  <div className="sub">
                    {ev.club}
                    {ev.cancelled ? " · Cancelled" : ""}
                  </div>
                </div>
                {!ev.cancelled ? <SeatBadge status={ev.status} /> : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
