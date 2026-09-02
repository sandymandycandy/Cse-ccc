"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "./ui/Button";
import { Panel } from "./ui/Surface";
import { ProgressBar } from "./ui/ProgressBar";
import type { EventSummary } from "@/lib/types";

const ROTATE_MS = 5000;

/**
 * The hero's right-hand panel: auto-rotates through the next few upcoming
 * events (~5s each), pausing on hover/focus and honouring reduced-motion.
 * Arrows + dots switch manually. Empty list → the "nothing scheduled" card.
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
      className="evc"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Panel aria-roledescription="carousel" aria-label="Upcoming events">
        <div className="evc-head">
          <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".2em" }}>
            {active === 0 ? "Next up" : "Coming up"}
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
  const capped = event.capacity > 0;
  // dateLabel is "Aug · Fri" — month leads the chit, weekday sits beside it.
  const [month, weekday] = event.dateLabel.split(" · ");

  // Seats carry the status: colour + wording replace a separate badge.
  const seatTone = isFull ? "var(--rust)" : event.status === "fast" ? "var(--clay)" : "var(--forest)";
  const seatText = !capped
    ? "Open entry"
    : isFull
      ? "Full — waitlist open"
      : `${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left`;

  return (
    <>
      <div className="evc-meta">
        <div className="evc-when">
          <div className="evc-date" aria-hidden="true">
            <span className="m">{month}</span>
            <span className="d">{event.day}</span>
          </div>
          <div className="evc-clock">
            <span className="k">{weekday}</span>
            <span className="v">{event.timeLabel}</span>
          </div>
          {/* the chit repeats the date visually — screen readers hear it once, in order */}
          <span className="sr-only">{`${weekday} ${event.day} ${month}, ${event.timeLabel}`}</span>
        </div>
        <div className="evc-club">{event.club}</div>
      </div>

      {/* cqi so the title tracks the card, which is a wide hero column on a big
          monitor and a narrow one once the hero stacks */}
      <h3 style={{ marginTop: 20, fontSize: "clamp(27px, 3.4cqi, 40px)", lineHeight: 1.08 }}>
        {event.title}
      </h3>
      {event.blurb ? <p className="body-text evc-blurb">{event.blurb}</p> : null}

      <div className="evc-act">
        <div className="evc-cap">
          <div className="evc-seats">
            <span style={{ color: seatTone }}>{seatText}</span>
            {/* the total only earns its place once seats are actually taken —
                before that it just repeats "seats left" */}
            {capped && event.registered > 0 ? (
              <span className="t">of {event.capacity}</span>
            ) : null}
          </div>
          {capped ? (
            <ProgressBar
              value={pct}
              tone={isFull ? "rust" : "forest"}
              label={`${event.registered} of ${event.capacity} seats filled`}
            />
          ) : null}
        </div>
        <ButtonLink
          href={`/events/${event.id}`}
          variant="accent"
          className="evc-cta"
          style={{ borderRadius: "var(--r-sm)" }}
        >
          {isFull ? "Join the waitlist" : "Register"}
        </ButtonLink>
      </div>
    </>
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
