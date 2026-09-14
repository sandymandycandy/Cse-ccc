import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublishedAnnouncements } from "@/lib/queries";
import { istFullDate } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Notices and updates from the CSE Club Council.",
};

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const items = await getPublishedAnnouncements();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Notices</div>
      <h1 style={{ margin: "12px 0 0" }}>Announcements</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Council-wide notices, deadlines and updates.
      </p>

      {items.length === 0 ? (
        <p className="body-text" style={{ marginTop: 28, color: "var(--ink-3)" }}>
          Nothing to announce just yet — check back soon.
        </p>
      ) : (
        <div className="notice-list">
          {items.map((a) => (
            <Link
              key={a.slug}
              href={`/announcements/${a.slug}`}
              // Layout lives in globals.css, not inline: an inline style cannot
              // carry the media query that makes this work on a phone.
              className={`rule notice-row${a.imageUrl ? "" : " no-thumb"}`}
            >
              {a.imageUrl ? (
                <Image
                  src={a.imageUrl}
                  alt=""
                  loading="lazy"
                  width={120}
                  height={120}
                  // 2x the 120px box, so the thumbnail stays sharp on a phone.
                  sizes="(max-width: 599px) 92px, 120px"
                  className="notice-thumb"
                />
              ) : null}
              <div>
                <div className="label" style={{ color: "var(--ink-3)" }}>
                  {istFullDate(a.publishedAt)}
                </div>
                <h2 className="notice-title">{a.title}</h2>
                <p className="body-text" style={{ color: "var(--ink-2)" }}>
                  {a.excerpt}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
