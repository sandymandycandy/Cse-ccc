import type { Metadata } from "next";
import { EventList } from "@/components/EventList";
import { getPastEvents } from "@/lib/queries";

export const metadata: Metadata = { title: "Past events" };

export default async function PastEventsPage() {
  const events = await getPastEvents(100);
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Archive</div>
      <h1 style={{ margin: "12px 0 24px" }}>Past events</h1>
      <EventList events={events} empty="No past events yet." />
    </section>
  );
}
