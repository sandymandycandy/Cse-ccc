import { cn } from "@/lib/cn";

export interface WeekDay {
  weekday: string; // "Mon"
  num: string; // "17"
  today?: boolean;
  event?: { time: string; title: string; club: string };
}

/** Horizontal week strip; scroll-snaps on small screens (`.week` / `.day`). */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <div className="week">
      {days.map((d) => (
        <div key={`${d.weekday}-${d.num}`} className={cn("day", d.today && "today")}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span className="label">{d.weekday}</span>
            <span className="num">{d.num}</span>
          </div>
          {d.event ? (
            <div
              className="card"
              style={{
                padding: 11,
                borderRadius: "var(--r-sm)",
                background: "var(--paper)",
              }}
            >
              <div style={{ font: "500 10px var(--mono)", color: "var(--forest)" }}>
                {d.event.time}
              </div>
              <div className="h4" style={{ fontSize: 15, marginTop: 4 }}>
                {d.event.title}
              </div>
              <div
                style={{
                  marginTop: 4,
                  font: "400 10.5px var(--sans)",
                  color: "var(--ink-3)",
                }}
              >
                {d.event.club}
              </div>
            </div>
          ) : (
            <span
              style={{
                marginTop: "auto",
                font: "400 11px var(--sans)",
                color: "var(--ink-4)",
              }}
            >
              Nothing scheduled
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
