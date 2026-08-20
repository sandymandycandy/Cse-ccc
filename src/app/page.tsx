import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Surface";
import { SeatBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EventRow } from "@/components/EventRow";
import { WeekStrip } from "@/components/WeekStrip";
import { ClubCard } from "@/components/ClubCard";
import { Ticker } from "@/components/Ticker";
import type { EventSummary } from "@/lib/types";
import {
  getUpcomingEvents,
  getClubsWithCounts,
  getAchievements,
  getWeekStrip,
} from "@/lib/queries";

const TICKER_FALLBACK = [
  "Register once — your certificate arrives after you attend",
  "Eleven clubs, one calendar",
  "New events posted every week",
];

export default async function HomePage() {
  const [events, clubs, achievements, week] = await Promise.all([
    getUpcomingEvents(6),
    getClubsWithCounts(),
    getAchievements(4),
    getWeekStrip(),
  ]);

  const nextEvent = events[0];
  const thisWeekCount = week.filter((d) => d.event).length;
  const tickerItems =
    events.length > 0
      ? events.slice(0, 5).map((e) => `${e.title} — ${e.dateLabel.split(" · ")[0]} ${e.day}`)
      : TICKER_FALLBACK;

  return (
    <>
      {/* ── Hero + next event ── */}
      <section className="section" style={{ paddingTop: 64 }}>
        <div className="hero-grid">
          <div>
            <div className="eyebrow">Department of Computer Science</div>
            <h1 style={{ margin: "16px 0 0", maxWidth: 620 }}>
              Eleven clubs.
              <br />
              One{" "}
              <span style={{ fontStyle: "italic", color: "var(--forest)" }}>
                calendar.
              </span>
            </h1>
            <p className="lead" style={{ marginTop: 22, maxWidth: 540 }}>
              Talks, contests, workshops and the occasional 24-hour build —
              every club, in one place. Register once; your certificate arrives
              after you attend.
            </p>
            <div className="stack" style={{ marginTop: 28 }}>
              <ButtonLink href="/events">See what&rsquo;s on</ButtonLink>
              <ButtonLink href="/join" variant="ghost">
                Join a club
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
              <Stat value="5" label="categories" />
            </div>
          </div>

          {nextEvent ? <NextEventPanel event={nextEvent} /> : <NoNextEvent />}
        </div>
      </section>

      {/* ── Ticker ── */}
      <Ticker items={tickerItems} />

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

      {/* ── Recruitment band ── */}
      <section style={{ padding: "40px var(--pad)" }}>
        <div
          style={{
            padding: "34px 40px",
            borderRadius: "var(--r-2xl)",
            background: "var(--forest)",
            color: "#F1F0E7",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 26,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ color: "#F1F0E7" }}>The clubs are recruiting.</h2>
            <p
              style={{
                marginTop: 10,
                maxWidth: 520,
                font: "400 15px/1.6 var(--sans)",
                color: "rgba(241,240,231,.78)",
              }}
            >
              One form, pick up to three clubs. Heads reply within the week.
            </p>
          </div>
          <ButtonLink
            href="/join"
            style={{ background: "#F1F0E7", color: "#22241F", flex: "none" }}
          >
            Apply to join
          </ButtonLink>
        </div>
      </section>
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

function NoNextEvent() {
  return (
    <Panel>
      <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".2em" }}>
        Next event
      </span>
      <h3 style={{ marginTop: 12, fontSize: 26 }}>Nothing scheduled yet</h3>
      <p className="body-text" style={{ marginTop: 8 }}>
        New events are posted every week. Follow a club to hear first.
      </p>
      <ButtonLink
        href="/clubs"
        variant="ghost"
        className="w-full"
        style={{ marginTop: 18, borderRadius: "var(--r-sm)" }}
      >
        Explore the clubs
      </ButtonLink>
    </Panel>
  );
}

function NextEventPanel({ event }: { event: EventSummary }) {
  const seatsLeft = Math.max(0, event.capacity - event.registered);
  const pct = event.capacity > 0 ? (event.registered / event.capacity) * 100 : 0;
  return (
    <Panel>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".2em" }}>
          Next event
        </span>
        <span style={{ font: "500 10.5px var(--mono)", color: "var(--clay)" }}>
          {event.dateLabel.split(" · ")[0]} {event.day}
        </span>
      </div>
      <h3 style={{ marginTop: 12, fontSize: 31 }}>{event.title}</h3>
      {event.blurb ? (
        <p className="body-text" style={{ marginTop: 8 }}>
          {event.blurb}
        </p>
      ) : null}
      <div
        style={{
          marginTop: 18,
          display: "flex",
          flexDirection: "column",
          gap: 9,
          font: "400 13.5px var(--sans)",
        }}
      >
        <Row k="Club" v={event.club} />
        <Row k="Where" v={event.venue} />
        <Row
          k="Seats"
          v={
            event.capacity > 0 ? (
              <span style={{ color: "var(--clay)" }}>{seatsLeft} seats left</span>
            ) : (
              "Open entry"
            )
          }
        />
      </div>
      {event.capacity > 0 ? (
        <ProgressBar
          value={pct}
          tone={event.status === "full" ? "rust" : "forest"}
          className="mt-4"
          label={`${event.registered} of ${event.capacity} seats filled`}
        />
      ) : null}
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <ButtonLink
          href={`/events/${event.id}`}
          variant="accent"
          className="flex-1"
          style={{ borderRadius: "var(--r-sm)" }}
        >
          {event.status === "full" ? "Join waitlist" : "Register"}
        </ButtonLink>
        <SeatBadge status={event.status} />
      </div>
    </Panel>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--ink-3)" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
