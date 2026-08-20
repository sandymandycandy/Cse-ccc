import { EventRow } from "./EventRow";
import type { EventSummary } from "@/lib/types";

export function EventList({
  events,
  empty = "Nothing scheduled yet — check back soon.",
}: {
  events: EventSummary[];
  empty?: string;
}) {
  if (events.length === 0) {
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
        {empty}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {events.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
