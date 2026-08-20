import { ButtonLink } from "./ui/Button";
import { SeatBadge } from "./ui/Badge";
import { ProgressBar } from "./ui/ProgressBar";
import type { EventSummary } from "@/lib/types";

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
          <SeatBadge status={event.status} />
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
        <ButtonLink
          href={`/events/${event.id}`}
          variant={isFull ? "ghost" : "primary"}
          className="w-full"
          style={{ marginTop: 12, minHeight: 40, fontSize: 13 }}
        >
          {isFull ? "Join waitlist" : "Register"}
        </ButtonLink>
      </div>
    </article>
  );
}
