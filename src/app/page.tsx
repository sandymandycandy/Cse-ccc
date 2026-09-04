import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { EventRow } from "@/components/EventRow";
import { WeekStrip } from "@/components/WeekStrip";
import { ClubCard } from "@/components/ClubCard";
import { UpcomingCarousel } from "@/components/UpcomingCarousel";
import { GalleryStrip } from "@/components/GalleryStrip";
import { FeedbackBanner } from "@/components/FeedbackBanner";
import { getOpenPeriod } from "@/lib/feedback/data";
import { istFullDate } from "@/lib/datetime";
import {
  getUpcomingEvents,
  getClubsWithCounts,
  getAchievements,
  getWeekStrip,
  getPublicGallery,
  getPublishedAnnouncements,
} from "@/lib/queries";

export default async function HomePage() {
  const [events, clubs, achievements, week, gallery, announcements, feedbackPeriod] =
    await Promise.all([
      getUpcomingEvents(6),
      getClubsWithCounts(),
      getAchievements(4),
      getWeekStrip(),
      getPublicGallery(),
      getPublishedAnnouncements(),
      getOpenPeriod(),
    ]);

  const thisWeekCount = week.filter((d) => d.event).length;

  return (
    <>
      {/* ── Hero + rotating events ── */}
      <section className="section" style={{ paddingTop: 64 }}>
        {/* Above the fold on purpose: a feedback window is only open for a
            couple of weeks, so a prompt below the hero would be missed. */}
        {feedbackPeriod ? <FeedbackBanner periodId={feedbackPeriod.id} /> : null}
        <div className="hero-grid">
          <div>
            <div className="eyebrow">Department of Computer Science</div>
            <h1 style={{ margin: "16px 0 0", maxWidth: 620 }}>
              One community.
              <br />
              One{" "}
              <span style={{ fontStyle: "italic", color: "var(--forest)" }}>
                calendar.
              </span>
            </h1>
            <p className="lead" style={{ marginTop: 22, maxWidth: 540 }}>
              Talks, contests, workshops and the occasional 24-hour build —
              everyone, in one place. Register once; your certificate arrives
              after you attend.
            </p>
            <div className="stack" style={{ marginTop: 28 }}>
              <ButtonLink href="/events">See what&rsquo;s on</ButtonLink>
              <ButtonLink href="/clubs" variant="ghost">
                Explore the clubs
              </ButtonLink>
            </div>
            <div
              className="stack"
              style={{
                gap: 44,
                marginTop: 40,
                paddingTop: 24,
                borderTop: "1px solid var(--line)",
              }}
            >
              <Stat value={String(clubs.length)} label="clubs" />
              <Stat value={String(thisWeekCount)} label="this week" />
            </div>
          </div>

          <UpcomingCarousel events={events} />
        </div>
      </section>

      {/* ── This week ── */}
      <section className="section">
        <div className="sec-head">
          <h2>This week</h2>
          <Link href="/calendar" className="label" style={{ color: "var(--forest)" }}>
            Full calendar →
          </Link>
        </div>
        <WeekStrip days={week} />
      </section>

      {/* ── Upcoming events ── */}
      <section className="section">
        <div className="sec-head">
          <h2>Upcoming events</h2>
          <Link href="/events" className="label" style={{ color: "var(--forest)" }}>
            All events →
          </Link>
        </div>
        {events.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.slice(0, 4).map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState>Nothing scheduled yet — check back soon.</EmptyState>
        )}
      </section>

      {/* ── Gallery band ── */}
      <GalleryStrip photos={gallery} />

      {/* ── The clubs ── */}
      <section className="section">
        <div className="sec-head">
          <h2>The clubs</h2>
          <Link href="/clubs" className="label" style={{ color: "var(--forest)" }}>
            All clubs →
          </Link>
        </div>
        <div className="clubs">
          {clubs.map(({ club, eventCount }) => (
            <ClubCard key={club.slug} club={club} eventCount={eventCount} />
          ))}
        </div>
      </section>

      {/* ── Achievements ── */}
      {achievements.length > 0 ? (
        <section className="section">
          <div className="sec-head">
            <h2>Recent wins</h2>
            <Link
              href="/achievements"
              className="label"
              style={{ color: "var(--forest)" }}
            >
              Wall of fame →
            </Link>
          </div>
          <div className="grid2">
            {achievements.map((a) => (
              <article key={a.title} className="card">
                <div className="label" style={{ color: "var(--forest)" }}>
                  {a.club}
                </div>
                <h3 style={{ marginTop: 10, fontSize: 22 }}>{a.title}</h3>
                <p className="body-text" style={{ marginTop: 8 }}>
                  {a.detail}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Announcements ── */}
      {announcements.length > 0 ? (
        <section className="section">
          <div className="sec-head">
            <h2>Announcements</h2>
            <Link
              href="/announcements"
              className="label"
              style={{ color: "var(--forest)" }}
            >
              All notices →
            </Link>
          </div>
          <div className="grid2">
            {announcements.slice(0, 3).map((a) => (
              <Link
                key={a.slug}
                href={`/announcements/${a.slug}`}
                className="card"
                style={{ display: "block", color: "var(--ink)" }}
              >
                <div className="label" style={{ color: "var(--ink-3)" }}>
                  {istFullDate(a.publishedAt)}
                </div>
                <h3 style={{ marginTop: 10, fontSize: 22 }}>{a.title}</h3>
                <p className="body-text" style={{ marginTop: 8 }}>
                  {a.excerpt}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat">{value}</div>
      <div className="label" style={{ marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: "1px dashed var(--line-3)",
        borderRadius: "var(--r-lg)",
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--ink-3)",
        font: "400 14px var(--sans)",
      }}
    >
      {children}
    </div>
  );
}
