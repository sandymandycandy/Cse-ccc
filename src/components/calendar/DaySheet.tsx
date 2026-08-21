"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CalendarEvent } from "@/lib/types";
import { eventsOn } from "@/lib/calendar-layout";
import { istShortDay, istTimeRange, istWeekdayLong } from "@/lib/datetime";
import { chipColor } from "./parts";

const SEAT_TEXT: Record<string, string> = {
  open: "Seats open",
  fast: "Filling fast",
  full: "Waitlist",
};

function timeLabel(ev: CalendarEvent): string {
  return ev.isAllDay ? "All day" : istTimeRange(ev.startsAt, ev.endsAt);
}

export function DaySheet({
  dayKey,
  events,
  onClose,
}: {
  dayKey: string;
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dayEvents = eventsOn(events, dayKey);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <>
      <div className="cal-sheet-backdrop" onClick={onClose} aria-hidden />
      <aside
        className="cal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Events on ${istWeekdayLong(dayKey)}, ${istShortDay(dayKey)}`}
      >
        <div className="cal-sheet-head">
          <div>
            <div className="label">{istWeekdayLong(dayKey)}</div>
            <div style={{ font: "400 24px var(--serif)", marginTop: 2 }}>
              {istShortDay(dayKey)}
            </div>
          </div>
          <button
            type="button"
            className="cal-sheet-close"
            aria-label="Close"
            onClick={onClose}
            ref={closeRef}
          >
            ✕
          </button>
        </div>

        <div className="cal-sheet-body">
          {dayEvents.length === 0 ? (
            <p className="cal-empty" style={{ padding: "24px 0" }}>
              No events this day.
            </p>
          ) : (
            dayEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="cal-sheet-item"
                style={chipColor(ev)}
              >
                <h4
                  style={
                    ev.cancelled
                      ? { textDecoration: "line-through", color: "var(--ink-3)" }
                      : undefined
                  }
                >
                  {ev.title}
                </h4>
                <div className="body-text" style={{ fontSize: 12 }}>
                  {ev.club} · {ev.venue}
                </div>
                <div className="row">
                  <span>{timeLabel(ev)}</span>
                  <span>{ev.cancelled ? "Cancelled" : SEAT_TEXT[ev.status]}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
