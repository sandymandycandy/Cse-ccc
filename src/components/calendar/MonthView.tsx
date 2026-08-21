"use client";

import type { CalendarEvent } from "@/lib/types";
import { buildMonthGrid, eventsOn, isBanded } from "@/lib/calendar-layout";
import { dayOfMonth, istShortDay } from "@/lib/datetime";
import { chipColor, chipTime } from "./parts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3; // show all when ≤3; otherwise 2 chips + "+N more"
const MAX_DOTS = 6;

export function MonthView({
  anchor,
  today,
  events,
  onOpenDay,
}: {
  anchor: string;
  today: string;
  events: CalendarEvent[];
  onOpenDay: (dayKey: string) => void;
}) {
  const weeks = buildMonthGrid(anchor, today);

  return (
    <div className="cal-month" role="grid" aria-label="Month">
      <div className="cal-dow" role="row" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d} role="columnheader">
            {d}
          </span>
        ))}
      </div>
      <div className="cal-weeks">
        {weeks.map((week, wi) => (
          <div className="cal-week" role="row" key={wi}>
            {week.map((cell) => {
              const dayEvents = eventsOn(events, cell.key);
              const shown =
                dayEvents.length <= MAX_CHIPS
                  ? dayEvents
                  : dayEvents.slice(0, MAX_CHIPS - 1);
              const overflow = dayEvents.length - shown.length;

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={cell.key}
                  className={
                    "cal-cell" +
                    (cell.inMonth ? "" : " out") +
                    (cell.isToday ? " today" : "")
                  }
                  aria-label={`${istShortDay(cell.key)}, ${dayEvents.length} ${
                    dayEvents.length === 1 ? "event" : "events"
                  }`}
                  onClick={() => onOpenDay(cell.key)}
                >
                  <div className="cal-cell-head">
                    <span className="cal-cell-num">{dayOfMonth(cell.key)}</span>
                    {dayEvents.length > 0 ? (
                      <span className="cal-count" aria-hidden>
                        {dayEvents.length}
                      </span>
                    ) : null}
                  </div>

                  {/* ≥640px: event chips + honest overflow */}
                  <div className="cal-cell-chips">
                    {shown.map((ev) => (
                      <span
                        key={ev.id}
                        className={
                          "cal-chip" +
                          (isBanded(ev) ? " span" : "") +
                          (ev.cancelled ? " cal-cancelled" : "")
                        }
                        style={chipColor(ev)}
                      >
                        <span className="m">{chipTime(ev, cell.key)}</span>{" "}
                        <span className="t">{ev.title}</span>
                      </span>
                    ))}
                    {overflow > 0 ? (
                      <span className="cal-more">+{overflow} more</span>
                    ) : null}
                  </div>

                  {/* <640px: the grid stops pretending — one dot per event */}
                  {dayEvents.length > 0 ? (
                    <div className="cal-dots" aria-hidden>
                      {dayEvents.slice(0, MAX_DOTS).map((ev) => (
                        <i key={ev.id} style={chipColor(ev)} />
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
