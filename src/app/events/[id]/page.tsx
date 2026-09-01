import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Surface";
import { SeatBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RegisterForm } from "@/components/RegisterForm";
import { RegistrationCountdown } from "@/components/RegistrationCountdown";
import { getEventDetail, getPublishedResults } from "@/lib/queries";
import { istFullDate, istTime, istTimeRange } from "@/lib/datetime";

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
  const phase = event.registrationPhase;

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <Link href="/events" className="label" style={{ color: "var(--forest)" }}>
        ← All events
      </Link>

      <div className="hero-grid" style={{ marginTop: 20, alignItems: "start" }}>
        {/* main */}
        <div>
          <div className="stack" style={{ gap: 10 }}>
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
            <SeatBadge status={event.status} />
          </div>
          <h1 style={{ margin: "12px 0 0" }}>{event.title}</h1>
          {event.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.posterUrl}
              alt={`${event.title} poster`}
              style={{ width: "100%", maxWidth: 620, borderRadius: 10, marginTop: 20, display: "block" }}
            />
          ) : null}
          {event.blurb ? (
            <p className="lead" style={{ marginTop: 16, maxWidth: 620 }}>
              {event.blurb}
            </p>
          ) : null}

          {event.description ? (
            <p className="body-text" style={{ marginTop: 16, maxWidth: 620, fontSize: 15 }}>
              {event.description}
            </p>
          ) : null}

          {event.rules ? (
            <div style={{ marginTop: 28 }}>
              <div className="label">Rules</div>
              <p className="body-text" style={{ marginTop: 8, maxWidth: 620 }}>
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
                  maxWidth: 620,
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
              <p className="body-text" style={{ marginTop: 8, maxWidth: 620 }}>
                {rounds.length} round{rounds.length > 1 ? "s" : ""} published.
              </p>
            </div>
          ) : null}
        </div>

        {/* sidebar */}
        <Panel>
          <div className="label">When</div>
          <div style={{ marginTop: 6, font: "400 15px var(--sans)", color: "var(--ink)" }}>
            {event.isAllDay ? istFullDate(event.startsAt) : (
              <>
                {istFullDate(event.startsAt)}
                <br />
                <span style={{ color: "var(--ink-2)" }}>
                  {istTimeRange(event.startsAt, event.endsAt)}
                </span>
              </>
            )}
          </div>

          <div className="label" style={{ marginTop: 18 }}>
            Where
          </div>
          <div style={{ marginTop: 6, font: "400 15px var(--sans)" }}>{event.venue}</div>

          {event.capacity > 0 ? (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  font: "500 10.5px var(--mono)",
                  color: "var(--ink-3)",
                }}
              >
                <span>{isFull ? "Waitlist" : `${seatsLeft} seats left`}</span>
                <span>
                  {event.registered}/{event.capacity}
                </span>
              </div>
              <ProgressBar
                value={pct}
                tone={isFull ? "rust" : "forest"}
                className="mt-1.5"
                label={`${event.registered} of ${event.capacity} seats filled`}
              />
            </div>
          ) : null}

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line-2)" }}>
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
          </div>
        </Panel>
      </div>
    </section>
  );
}
