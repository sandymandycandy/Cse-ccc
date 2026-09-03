import { ButtonLink } from "./ui/Button";
import { SeatBadge } from "./ui/Badge";
import { ProgressBar } from "./ui/ProgressBar";
import type { EventSummary } from "@/lib/types";
import { eventCta } from "@/lib/event-cta";

/**
 * The signature event row: 4 columns ≥1100px → 2 columns → stacked card <600px
 * (all handled by the `.evrow` CSS). The club label uses the forest accent, not
 * the club's calendar colour — club colours are calendar-only (BUILD_PLAN §4).
 */
export function EventRow({ event }: { event: EventSummary }) {
  const { title, blurb, club, day, dateLabel, timeLabel, venue } = event;
  const seatsLeft = Math.max(0, event.capacity - event.registered);
  const pct =
    event.capacity > 0 ? (event.registered / event.capacity) * 100 : 0;
  const isFull = event.status === "full";
  const cta = eventCta(event);

  return (
    <article className="evrow">
      <div className="evdate">
        <div className="n">{day}</div>
        <div className="label" style={{ marginTop: 4 }}>
          {dateLabel}
        </div>
      </div>

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
            {club}
          </span>
          {cta.showSeats ? <SeatBadge status={event.status} /> : null}
        </div>
        <h3 style={{ marginTop: 7 }}>{title}</h3>
        <p className="body-text" style={{ marginTop: 5, fontSize: 13 }}>
          {blurb}
        </p>
      </div>

      <div className="evmeta">
        {timeLabel}
        <br />
        {venue}
      </div>

      <div>
        {cta.showSeats ? (
          <>
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
          </>
        ) : null}
        {cta.primary === "results" ? (
          <ButtonLink
            href={`/events/${event.id}/results`}
            variant="primary"
            className="w-full"
            style={{ marginTop: 12, minHeight: 40, fontSize: 13 }}
          >
            View results
          </ButtonLink>
        ) : cta.primary === "ended" ? (
          // A finished event with nothing published: say so rather than offer a
          // Register button that leads to a closed form.
          <div
            className="label"
            style={{
              marginTop: 12,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-3)",
              border: "1px dashed var(--line-3)",
              borderRadius: "var(--r-sm, 6px)",
            }}
          >
            Event ended
          </div>
        ) : (
          <ButtonLink
            href={`/events/${event.id}`}
            variant={isFull ? "ghost" : "primary"}
            className="w-full"
            style={{ marginTop: 12, minHeight: 40, fontSize: 13 }}
          >
            {isFull ? "Join waitlist" : "Register"}
          </ButtonLink>
        )}

        {cta.secondaryResults ? (
          <ButtonLink
            href={`/events/${event.id}/results`}
            variant="ghost"
            className="w-full"
            style={{ marginTop: 8, minHeight: 36, fontSize: 13 }}
          >
            View results
          </ButtonLink>
        ) : null}
      </div>
    </article>
  );
}
