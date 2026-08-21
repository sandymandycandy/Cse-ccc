import type { Metadata } from "next";
import { Calendar } from "@/components/calendar/Calendar";
import { getCalendarEvents, getCalendarClubs } from "@/lib/queries";
import { isValidDayKey, todayKey } from "@/lib/datetime";
import { normalizeView, queryRange } from "@/lib/calendar-layout";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "Every talk, contest, workshop and hackathon across the eleven clubs — month, week, day and agenda views.",
};

type SearchParams = { searchParams: Promise<{ view?: string; d?: string }> };

export default async function CalendarPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const view = normalizeView(sp.view);
  const anchor = sp.d && isValidDayKey(sp.d) ? sp.d : todayKey();

  const { startISO, endISO } = queryRange(view, anchor);
  const [events, clubs] = await Promise.all([
    getCalendarEvents(startISO, endISO),
    getCalendarClubs(),
  ]);

  return (
    <section className="section" style={{ paddingTop: 48 }}>
      <div className="eyebrow">The council, in time</div>
      <Calendar
        view={view}
        anchor={anchor}
        today={todayKey()}
        events={events}
        clubs={clubs}
      />
    </section>
  );
}
