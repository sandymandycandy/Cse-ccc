import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Panel, Note } from "@/components/ui/Surface";
import { SeatBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getEventDetail } from "@/lib/queries";
import { istFullDate, istTimeRange } from "@/lib/datetime";

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
  const event = await getEventDetail(id);
  if (!event) notFound();

  const seatsLeft = Math.max(0, event.capacity - event.registered);
  const pct = event.capacity > 0 ? (event.registered / event.capacity) * 100 : 0;
  const isFull = event.status === "full";

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

          <Button
            variant={isFull ? "ghost" : "accent"}
            className="w-full"
            style={{ marginTop: 18, borderRadius: "var(--r-sm)" }}
            disabled
          >
            {isFull ? "Join waitlist" : "Register"}
          </Button>
          <Note style={{ marginTop: 12 }}>
            Inline registration is the next piece of Phase 1 — the seat, dedup and
            email-confirmation flow lands here shortly.
          </Note>
        </Panel>
      </div>
    </section>
  );
}
