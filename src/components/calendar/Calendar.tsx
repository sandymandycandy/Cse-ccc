"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarEvent } from "@/lib/types";
import {
  type CalView,
  CAL_VIEWS,
  stepAnchor,
} from "@/lib/calendar-layout";
import { istMonthYear, istShortDay, istWeekdayLong, addDays, dowMon0 } from "@/lib/datetime";
import { MonthView } from "./MonthView";
import { TimeGridView } from "./TimeGridView";
import { AgendaView } from "./AgendaView";
import { DaySheet } from "./DaySheet";

interface ClubChip {
  slug: string;
  shortName: string;
  color: string;
}

const VIEW_LABEL: Record<CalView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

/** The period heading for the current view — what the reader is looking at. */
function periodLabel(view: CalView, anchor: string): string {
  if (view === "month") return istMonthYear(anchor);
  if (view === "day") return istWeekdayLong(anchor) + ", " + istShortDay(anchor);
  if (view === "week") {
    const start = addDays(anchor, -dowMon0(anchor));
    const end = addDays(start, 6);
    return `${istShortDay(start)} – ${istShortDay(end)}`;
  }
  return "Upcoming"; // agenda
}

export function Calendar({
  view,
  anchor,
  today,
  events,
  clubs,
}: {
  view: CalView;
  anchor: string;
  today: string;
  events: CalendarEvent[];
  clubs: ClubChip[];
}) {
  const router = useRouter();
  // null = all clubs; otherwise the explicit subset that's on.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [sheetDay, setSheetDay] = useState<string | null>(null);

  const go = useCallback(
    (nextView: CalView, nextAnchor: string) => {
      router.push(`/calendar?view=${nextView}&d=${nextAnchor}`);
    },
    [router],
  );

  // Keyboard shortcuts (§5.5). Ignored while typing or with modifier keys held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      switch (e.key) {
        case "ArrowLeft":
          go(view, stepAnchor(view, anchor, -1));
          break;
        case "ArrowRight":
          go(view, stepAnchor(view, anchor, 1));
          break;
        case "m":
        case "M":
          go("month", anchor);
          break;
        case "w":
        case "W":
          go("week", anchor);
          break;
        case "d":
        case "D":
          go("day", anchor);
          break;
        case "a":
        case "A":
          go("agenda", anchor);
          break;
        case "t":
        case "T":
          go(view, today);
          break;
        case "Escape":
          setSheetDay(null);
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, anchor, today, go]);

  const filtered = useMemo(
    () => (selected ? events.filter((e) => selected.has(e.clubSlug)) : events),
    [events, selected],
  );

  // §5.5: with all on, tapping one club isolates it; tapping the last one clears.
  function toggleClub(slug: string) {
    setSelected((cur) => {
      if (cur === null) return new Set([slug]);
      const next = new Set(cur);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next.size === 0 ? null : next;
    });
  }

  return (
    <>
      <div className="cal-bar" style={{ marginTop: 12 }}>
        <h1 className="cal-period" aria-live="polite">
          {periodLabel(view, anchor)}
        </h1>

        <div className="stack" style={{ gap: 12 }}>
          <div className="cal-tabs" role="tablist" aria-label="Calendar view">
            {CAL_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                className="cal-tab"
                aria-current={v === view ? "page" : undefined}
                aria-selected={v === view}
                onClick={() => go(v, anchor)}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>

          <div className="cal-nav">
            <button
              type="button"
              className="cal-step"
              aria-label="Previous"
              onClick={() => go(view, stepAnchor(view, anchor, -1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => go(view, today)}
            >
              Today
            </button>
            <button
              type="button"
              className="cal-step"
              aria-label="Next"
              onClick={() => go(view, stepAnchor(view, anchor, 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="cal-filter" role="group" aria-label="Filter by club">
        <button
          type="button"
          className="cal-fchip"
          aria-pressed={selected === null}
          onClick={() => setSelected(null)}
        >
          All clubs
        </button>
        {clubs.map((c) => (
          <button
            key={c.slug}
            type="button"
            className="cal-fchip"
            aria-pressed={selected !== null && selected.has(c.slug)}
            onClick={() => toggleClub(c.slug)}
          >
            <span className="dot" style={{ background: c.color }} aria-hidden />
            {c.shortName}
          </button>
        ))}
      </div>

      {view === "month" ? (
        <MonthView
          anchor={anchor}
          today={today}
          events={filtered}
          onOpenDay={setSheetDay}
        />
      ) : view === "agenda" ? (
        <AgendaView anchor={anchor} today={today} events={filtered} />
      ) : (
        <TimeGridView view={view} anchor={anchor} today={today} events={filtered} />
      )}

      {sheetDay ? (
        <DaySheet
          dayKey={sheetDay}
          events={filtered}
          onClose={() => setSheetDay(null)}
        />
      ) : null}
    </>
  );
}
