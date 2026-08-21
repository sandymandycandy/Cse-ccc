"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/types";
import {
  type CalView,
  type PackedSegment,
  packDay,
  spanRole,
  splitDay,
} from "@/lib/calendar-layout";
import {
  addDays,
  dayOfMonth,
  dowMon0,
  istHourLabel,
  istMinutesOfDay,
  istTime,
  istWeekdayShortKey,
} from "@/lib/datetime";
import { chipColor } from "./parts";

// The grid window and scale (§5.3). 6 AM–11 PM, one hour = 48px.
const START_MIN = 6 * 60;
const END_MIN = 23 * 60;
const HOUR_PX = 48;
const CANVAS_PX = ((END_MIN - START_MIN) / 60) * HOUR_PX;
const MIN_BLOCK_PX = 18; // floor short events so the title stays readable

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function blockStyle(seg: PackedSegment): CSSProperties {
  const s = clamp(seg.startMin, START_MIN, END_MIN);
  const e = clamp(seg.endMin, START_MIN, END_MIN);
  const top = ((s - START_MIN) / 60) * HOUR_PX;
  const height = Math.max(((e - s) / 60) * HOUR_PX, MIN_BLOCK_PX);
  return {
    top,
    height,
    left: `calc(${(seg.lane / seg.lanes) * 100}% + 2px)`,
    width: `calc(${(1 / seg.lanes) * 100}% - 4px)`,
    ...chipColor(seg.event),
  };
}

const SPAN_MARK: Record<string, string> = { start: "▶ ", continue: "↳ ", single: "" };

export function TimeGridView({
  view,
  anchor,
  today,
  events,
}: {
  view: CalView;
  anchor: string;
  today: string;
  events: CalendarEvent[];
}) {
  const days =
    view === "day"
      ? [anchor]
      : Array.from({ length: 7 }, (_, i) => addDays(addDays(anchor, -dowMon0(anchor)), i));

  // Live "now" marker — client only, ticks each minute, no hydration mismatch.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMin(istMinutesOfDay(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const perDay = days.map((day) => {
    const { banded, timed } = splitDay(events, day);
    return { day, banded, packed: packDay(timed) };
  });
  const anyBanded = perDay.some((d) => d.banded.length > 0);
  const hours = Array.from(
    { length: (END_MIN - START_MIN) / 60 },
    (_, i) => START_MIN + i * 60,
  );

  const gridVars = {
    ["--cal-days" as string]: String(days.length),
    ["--cal-hour" as string]: `${HOUR_PX}px`,
  } as CSSProperties;

  return (
    <div className="cal-timegrid" style={gridVars}>
      <div className="cal-tg-scroll">
        <div className={"cal-tg-inner" + (view === "day" ? " day" : "")}>
          <div className="cal-tg-head">
            <div className="cal-tg-corner" aria-hidden />
            <div className="cal-tg-daycols">
              {perDay.map(({ day }) => (
                <div
                  key={day}
                  className={"cal-tg-dayhead" + (day === today ? " today" : "")}
                >
                  <div className="dw">{istWeekdayShortKey(day)}</div>
                  <div className="dn">{dayOfMonth(day)}</div>
                </div>
              ))}
            </div>

            {anyBanded ? (
              <>
                <div className="cal-allday-label">All-day</div>
                <div className="cal-allday">
                  {perDay.map(({ day, banded }) => (
                    <div className="cal-allday-cell" key={day}>
                      {banded.map((ev) => (
                        <Link
                          key={ev.id}
                          href={`/events/${ev.id}`}
                          className="cal-allchip"
                          style={chipColor(ev)}
                        >
                          {SPAN_MARK[spanRole(ev, day)]}
                          {ev.title}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="cal-tg-body">
            <div className="cal-tg-gutter" style={{ height: CANVAS_PX }}>
              {hours.map((min) => (
                <div className="hr" key={min}>
                  <span>{istHourLabel(min)}</span>
                </div>
              ))}
            </div>

            <div className="cal-tg-canvas" style={{ height: CANVAS_PX }}>
              {perDay.map(({ day, packed }) => {
                const showNow =
                  day === today &&
                  nowMin !== null &&
                  nowMin >= START_MIN &&
                  nowMin <= END_MIN;
                return (
                  <div
                    key={day}
                    className={"cal-tg-col" + (day === today ? " today" : "")}
                  >
                    {showNow ? (
                      <div
                        className="cal-nowline"
                        style={{ top: ((nowMin! - START_MIN) / 60) * HOUR_PX }}
                        aria-hidden
                      />
                    ) : null}
                    {packed.map((seg) => (
                      <Link
                        key={seg.event.id}
                        href={`/events/${seg.event.id}`}
                        className="cal-block"
                        style={blockStyle(seg)}
                      >
                        <span
                          className="t"
                          style={
                            seg.event.cancelled
                              ? { textDecoration: "line-through" }
                              : undefined
                          }
                        >
                          {seg.event.title}
                        </span>
                        <span className="m">
                          {seg.continuesBefore ? "↳ " : istTime(seg.event.startsAt)}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
