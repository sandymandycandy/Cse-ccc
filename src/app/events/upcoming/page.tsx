import type { Metadata } from "next";
import { EventList } from "@/components/EventList";
import { getUpcomingEvents } from "@/lib/queries";

export const metadata: Metadata = { title: "Upcoming events" };

export default async function UpcomingEventsPage() {
  const events = await getUpcomingEvents(100);
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">What&rsquo;s on</div>
      <h1 style={{ margin: "12px 0 24px" }}>Upcoming events</h1>
      <EventList events={events} />
    </section>
  );
}
