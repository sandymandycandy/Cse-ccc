import Link from "next/link";
import type { Club } from "@/lib/types";

/** Club tile for the home + directory grids (design-system `.panel` variant). */
export function ClubCard({
  club,
  eventCount = 0,
}: {
  club: Club;
  eventCount?: number;
}) {
  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="panel"
      style={{ padding: 18, borderRadius: "var(--r-md)", display: "block" }}
    >
      <div className="h4">{club.shortName}</div>
      <div className="body-text" style={{ marginTop: 8, fontSize: 12.5 }}>
        {club.blurb}
      </div>
      <div
        style={{
          marginTop: 13,
          paddingTop: 11,
          borderTop: "1px solid var(--line-2)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span className="label">
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
        <span className="label" style={{ color: "var(--forest)" }}>
          Open →
        </span>
      </div>
    </Link>
  );
}
