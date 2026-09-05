import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { SeatBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RegisterForm } from "@/components/RegisterForm";
import { RegistrationCountdown } from "@/components/RegistrationCountdown";
import { getEventDetail, getPublishedResults } from "@/lib/queries";
import { eventCta } from "@/lib/event-cta";
import {
  istDateLabel,
  istDayNum,
  istFullDate,
  istTime,
  istTimeRange,
  istWeekdayShort,
} from "@/lib/datetime";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventDetail(id);
  return {
    title: event?.title ?? "Event",
    description: event?.blurb || undefined,
  };
}

export default async function EventDetailPage({ params }: Params) {
  const { id } = await params;
  const [event, rounds] = await Promise.all([
    getEventDetail(id),
    getPublishedResults(id),
  ]);
  if (!event) notFound();

  const seatsLeft = Math.max(0, event.capacity - event.registered);
  const pct = event.capacity > 0 ? (event.registered / event.capacity) * 100 : 0;
  const isFull = event.status === "full";
  // Same rule as the event rows, so the detail page can't contradict the list.
  const cta = eventCta(event);
  const phase = event.registrationPhase;
  const month = istDateLabel(event.startsAt).split(" · ")[0];
  // Organisers often paste the same text into both boxes — show it once.
  const description =
    event.description && event.description.trim() !== (event.blurb ?? "").trim()
      ? event.description
      : null;

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="evd">
        <Link href="/events" className="label" style={{ color: "var(--forest)" }}>
          ← All events
        </Link>

        <div className="stack" style={{ gap: 10, marginTop: 18 }}>
          <span
            style={{
              font: "500 10.5px var(--mono)",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--forest)",
            }}
          >
            {event.club}
          </span>
          {cta.showSeats ? <SeatBadge status={event.status} /> : null}
        </div>
        <h1 style={{ margin: "12px 0 0" }}>{event.title}</h1>

        {/* when · where · seats, across the full width — these are the facts you
            check before reading anything else, so they lead. */}
        <div className="evd-strip">
          <div className="evc-date" aria-hidden="true">
            <span className="m">{month}</span>
            <span className="d">{istDayNum(event.startsAt)}</span>
          </div>
          <div className="evd-cell">
            <span className="k">{istWeekdayShort(event.startsAt)}</span>
            <span className="v">
              {event.isAllDay ? "All day" : istTimeRange(event.startsAt, event.endsAt)}
            </span>
            <span className="sr-only">{istFullDate(event.startsAt)}</span>
          </div>
          <div className="evd-rule" />
          <div className="evd-cell">
            <span className="k">Where</span>
            <span className="v">{event.venue}</span>
          </div>
          {cta.showSeats && event.capacity > 0 ? (
            <>
              <div className="evd-rule" />
              <div className="evd-cell grow">
                <span className="k">{isFull ? "Waitlist" : "Seats"}</span>
                <span className="v" style={{ color: isFull ? "var(--rust)" : "var(--forest)" }}>
                  {isFull
                    ? "Full — waitlist open"
                    : event.registered > 0
                      ? `${seatsLeft} left of ${event.capacity}`
                      : `${event.capacity} seats open`}
                </span>
                <ProgressBar
                  value={pct}
                  tone={isFull ? "rust" : "forest"}
                  label={`${event.registered} of ${event.capacity} seats filled`}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="evd-grid">
          {/* main */}
          <div>
            {event.posterUrl ? (
              // The two posters in storage are 762KB and 375KB JPEGs served at
              // full size. `priority` because this is the page's main image and
              // sits above the fold; `height: auto` keeps whatever aspect the
              // poster actually has, since posters are not a fixed shape.
              <Image
                src={event.posterUrl}
                alt={`${event.title} poster`}
                width={1200}
                height={1600}
                priority
                sizes="(max-width: 900px) 100vw, 620px"
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: "var(--r-lg)",
                  display: "block",
                }}
              />
            ) : null}
            {event.blurb ? (
              <p className="lead" style={{ marginTop: event.posterUrl ? 24 : 0, maxWidth: 680 }}>
                {event.blurb}
              </p>
            ) : null}

            {description ? (
              <p className="body-text" style={{ marginTop: 16, maxWidth: 680, fontSize: 15 }}>
                {description}
              </p>
            ) : null}

            {event.rules ? (
              <div style={{ marginTop: 28 }}>
                <div className="label">Rules</div>
                <p className="body-text" style={{ marginTop: 8, maxWidth: 680 }}>
                  {event.rules}
                </p>
              </div>
            ) : null}

            {rounds.length > 0 ? (
              <div style={{ marginTop: 28 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    maxWidth: 680,
                  }}
                >
                  <div className="label">Results</div>
                  <Link
                    href={`/events/${event.id}/results`}
                    className="label"
                    style={{ color: "var(--forest)" }}
                  >
                    View standings →
                  </Link>
                </div>
                <p className="body-text" style={{ marginTop: 8, maxWidth: 680 }}>
                  {rounds.length} round{rounds.length > 1 ? "s" : ""} published.
                </p>
              </div>
            ) : null}
          </div>

          {/* sidebar — registration only; the facts moved to the strip above */}
          <Panel>
            {phase === "before" && event.registrationOpensAt ? (
              <>
                <div className="label" style={{ marginBottom: 12 }}>Register</div>
                <RegistrationCountdown opensAt={event.registrationOpensAt} />
                <p className="body-text" style={{ marginTop: 10, fontSize: 13, color: "var(--ink-2)" }}>
                  Opens {istFullDate(event.registrationOpensAt)} at {istTime(event.registrationOpensAt)} IST.
                </p>
              </>
            ) : phase === "closed" ? (
              <>
                <div className="label" style={{ marginBottom: 12 }}>Register</div>
                <p className="body-text">Registration for this event has closed.</p>
              </>
            ) : (
              <>
                <div className="label" style={{ marginBottom: 12 }}>
                  {isFull ? "Join the waitlist" : "Register"}
                </div>
                <RegisterForm
                  eventId={event.id}
                  schema={event.registrationForm}
                  isFull={isFull}
                  mode={event.selectionMode}
                />
              </>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}
