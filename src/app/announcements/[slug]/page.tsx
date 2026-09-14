import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnnouncementBySlug } from "@/lib/queries";
import { renderMarkdown } from "@/lib/markdown";
import { istFullDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAnnouncementBySlug(slug);
  if (!a) return { title: "Announcement" };
  return { title: a.title, description: `Announcement — ${a.title}` };
}

export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = await getAnnouncementBySlug(slug);
  if (!a) notFound();

  return (
    // `has-media` widens the measure and turns on the two-column split; without
    // an image the article stays a plain 680px reading column.
    <article
      className={`section reading${a.imageUrl ? " has-media" : ""}`}
      style={{ paddingTop: 56 }}
    >
      <Link href="/announcements" className="label" style={{ color: "var(--forest)" }}>
        ← Announcements
      </Link>

      <div className="notice-detail">
        {a.imageUrl ? (
          // Announcement images carry no stored dimensions, so 1600x900 is a
          // space-reservation hint only — `height: auto` in the CSS means the real
          // aspect wins once the file arrives.
          //
          // ⚠️ Deliberately NO `max-height` and NO `object-fit: cover`: posters are
          // routinely portrait (the first real one is 1080x1350), and an earlier
          // `maxHeight: 380` + `cover` silently cropped about 55% of such an image
          // away — this page is the one place it must be shown whole. The tall
          // shape is handled by giving it its own column, not by cropping it.
          <div className="notice-media">
            <Image
              src={a.imageUrl}
              alt=""
              width={1600}
              height={900}
              priority
              sizes="(max-width: 899px) 100vw, 360px"
            />
          </div>
        ) : null}

        <div>
          <div className="eyebrow">{istFullDate(a.publishedAt)}</div>
          <h1 style={{ margin: "10px 0 0" }}>{a.title}</h1>
          <div className="prose" style={{ marginTop: 24 }}>
            {renderMarkdown(a.bodyMarkdown)}
          </div>
        </div>
      </div>
    </article>
  );
}
