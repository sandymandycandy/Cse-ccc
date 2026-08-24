import type { Metadata } from "next";
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
    <article className="section" style={{ paddingTop: 56, maxWidth: 680 }}>
      <Link href="/announcements" className="label" style={{ color: "var(--forest)" }}>
        ← Announcements
      </Link>
      <div className="eyebrow" style={{ marginTop: 20 }}>
        {istFullDate(a.publishedAt)}
      </div>
      <h1 style={{ margin: "10px 0 0" }}>{a.title}</h1>

      {a.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.imageUrl}
          alt=""
          style={{ width: "100%", maxHeight: 380, objectFit: "cover", borderRadius: 8, marginTop: 24 }}
        />
      ) : null}

      <div className="prose" style={{ marginTop: 24 }}>
        {renderMarkdown(a.bodyMarkdown)}
      </div>
    </article>
  );
}
