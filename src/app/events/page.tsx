import type { Metadata } from "next";
import Link from "next/link";
import { EventList } from "@/components/EventList";
import { getUpcomingEvents, getPastEvents } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Events",
  description: "Talks, contests, workshops and hackathons from the CSE Club Council.",
};

export default async function EventsPage() {
  const [upcoming, past] = await Promise.all([
    getUpcomingEvents(50),
    getPastEvents(6),
  ]);

  return (
    <>
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="eyebrow">What&rsquo;s on</div>
        <h1 style={{ margin: "12px 0 0" }}>Events</h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
          Everything the eleven clubs are running — register once, and your
          certificate arrives after you attend.
        </p>
      </section>

      <section className="section">
        <div className="sec-head">
          <h2>Upcoming</h2>
          <Link href="/events/upcoming" className="label" style={{ color: "var(--forest)" }}>
            Upcoming only →
          </Link>
        </div>
        <EventList events={upcoming} />
      </section>

      {past.length > 0 ? (
        <section className="section">
          <div className="sec-head">
            <h2>Recently past</h2>
            <Link href="/events/past" className="label" style={{ color: "var(--forest)" }}>
              Full archive →
            </Link>
          </div>
          <EventList events={past} />
        </section>
      ) : null}
    </>
  );
}
