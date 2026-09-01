"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ButtonLink } from "./ui/Button";
import { Panel } from "./ui/Surface";
import { SeatBadge } from "./ui/Badge";
import { ProgressBar } from "./ui/ProgressBar";
import type { EventSummary } from "@/lib/types";

const ROTATE_MS = 5000;

/**
 * The hero's right-hand panel: auto-rotates through the next few upcoming
 * events (~5s each), pausing on hover/focus and honouring reduced-motion.
 * Arrows + dots switch manually. Empty list → the "nothing scheduled" card.
 * Ports the old static NextEventPanel markup so the visual is unchanged.
 */
export function UpcomingCarousel({ events }: { events: EventSummary[] }) {
  const count = events.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance — skipped for a single event, while paused, or under
  // reduced-motion (the arrows/dots still work in every case).
  useEffect(() => {
    if (count <= 1 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count, paused]);

  if (count === 0) return <NoNextEvent />;

  const active = Math.min(index, count - 1);
  const event = events[active];
  const go = (next: number) => setIndex((next + count) % count);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Panel aria-roledescription="carousel" aria-label="Upcoming events">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            minHeight: 28,
          }}
        >
          <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".2em" }}>
            Next up
          </span>
          {count > 1 ? (
            <div className="hcar-nav">
              <button
                type="button"
                className="hcar-arrow"
                onClick={() => go(active - 1)}
                aria-label="Previous event"
              >
                ‹
              </button>
              <div className="hcar-dots" role="tablist" aria-label="Choose event">
                {events.map((e, i) => (
                  <button
                    key={e.id}
                    type="button"
                    className="hcar-dot"
                    aria-current={i === active}
                    aria-label={`Event ${i + 1} of ${count}: ${e.title}`}
                    onClick={() => go(i)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="hcar-arrow"
                onClick={() => go(active + 1)}
                aria-label="Next event"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>

        <div aria-live="polite" aria-atomic="true">
          <EventBody event={event} />
        </div>
      </Panel>
    </div>
  );
}

function EventBody({ event }: { event: EventSummary }) {
  const seatsLeft = Math.max(0, event.capacity - event.registered);
  const pct = event.capacity > 0 ? (event.registered / event.capacity) * 100 : 0;
  const isFull = event.status === "full";
  const dateShort = `${event.dateLabel.split(" · ")[0]} ${event.day}`;

  return (
    <>
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
        <Row k="When" v={`${dateShort} · ${event.timeLabel}`} />
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
          tone={isFull ? "rust" : "forest"}
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
          {isFull ? "Join waitlist" : "Register"}
        </ButtonLink>
        <SeatBadge status={event.status} />
      </div>
    </>
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

function NoNextEvent() {
  return (
    <Panel>
      <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".2em" }}>
        Next up
      </span>
      <h3 style={{ marginTop: 12, fontSize: 26 }}>Nothing scheduled yet</h3>
      <p className="body-text" style={{ marginTop: 8 }}>
        New events are posted every week — check back soon.
      </p>
      <ButtonLink
        href="/events"
        variant="ghost"
        className="w-full"
        style={{ marginTop: 18, borderRadius: "var(--r-sm)" }}
      >
        See what&rsquo;s on
      </ButtonLink>
    </Panel>
  );
}
