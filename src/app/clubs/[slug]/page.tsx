import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventRow } from "@/components/EventRow";
import { getClubBySlug, getEventsForClub } from "@/lib/queries";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = await getClubBySlug(slug);
  return { title: data?.club.name ?? "Club" };
}

export default async function ClubProfilePage({ params }: Params) {
  const { slug } = await params;
  const data = await getClubBySlug(slug);
  if (!data) notFound();

  const { club, description } = data;
  const events = await getEventsForClub(slug);

  return (
    <>
      <section className="section" style={{ paddingTop: 56 }}>
        <Link href="/clubs" className="label" style={{ color: "var(--forest)" }}>
          ← All clubs
        </Link>
        <div className="eyebrow" style={{ marginTop: 20 }}>
          {club.category}
        </div>
        <h1 style={{ margin: "12px 0 0" }}>{club.name}</h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 620 }}>
          {description ?? club.blurb}
        </p>
      </section>

      <section className="section">
        <div className="sec-head">
          <h2>Upcoming events</h2>
        </div>
        {events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="body-text">
            No upcoming events from {club.shortName} right now — check back soon.
          </p>
        )}
      </section>
    </>
  );
}
