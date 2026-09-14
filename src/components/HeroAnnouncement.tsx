import Link from "next/link";
import { istFullDate } from "@/lib/datetime";

/**
 * The latest live announcement, shown at the top of the hero's right column.
 *
 * Whether this renders at all is decided by `pickHeroAnnouncement` — this
 * component is presentational and is simply not rendered when there is nothing
 * live. The whole tile is one anchor, so it must not contain another link.
 */
export function HeroAnnouncement({
  slug,
  title,
  publishedAt,
}: {
  slug: string;
  title: string;
  publishedAt: string;
}) {
  return (
    <Link
      href={`/announcements/${slug}`}
      className="card hero-note"
      style={{ display: "block", color: "var(--ink)" }}
    >
      <div className="hero-note-head">
        <span className="label" style={{ color: "var(--forest)" }}>
          Latest
        </span>
        <span className="label">{istFullDate(publishedAt)}</span>
      </div>
      <div className="hero-note-title">
        <span>{title}</span>
        <span className="hero-note-arrow" aria-hidden>
          →
        </span>
      </div>
    </Link>
  );
}
