import type { Metadata } from "next";
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
        <div style={{ marginTop: 28, display: "grid", gap: 20, maxWidth: 720 }}>
          {items.map((a) => (
            <Link
              key={a.slug}
              href={`/announcements/${a.slug}`}
              className="rule"
              style={{
                display: "grid",
                gridTemplateColumns: a.imageUrl ? "120px 1fr" : "1fr",
                gap: 16,
                paddingBottom: 20,
                color: "var(--ink)",
                alignItems: "start",
              }}
            >
              {a.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.imageUrl}
                  alt=""
                  width={120}
                  height={80}
                  style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6 }}
                />
              ) : null}
              <div>
                <div className="label" style={{ color: "var(--ink-3)" }}>
                  {istFullDate(a.publishedAt)}
                </div>
                <h2 style={{ font: "400 20px var(--serif)", margin: "4px 0 6px" }}>{a.title}</h2>
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
