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
    <article className="section" style={{ paddingTop: 56, maxWidth: 680 }}>
      <Link href="/announcements" className="label" style={{ color: "var(--forest)" }}>
        ← Announcements
      </Link>
      <div className="eyebrow" style={{ marginTop: 20 }}>
        {istFullDate(a.publishedAt)}
      </div>
      <h1 style={{ margin: "10px 0 0" }}>{a.title}</h1>

      {a.imageUrl ? (
        // Announcement images carry no stored dimensions, so 1600x900 is a
        // space-reservation hint only — `height: auto` means the real aspect
        // wins once the file arrives. The CSS is unchanged from the raw <img>
        // it replaces, so the rendered result is identical; the gain is that
        // Next now serves a resized AVIF/WebP instead of the full upload.
        <Image
          src={a.imageUrl}
          alt=""
          width={1600}
          height={900}
          priority
          sizes="(max-width: 800px) 100vw, 760px"
          style={{
            width: "100%",
            height: "auto",
            maxHeight: 380,
            objectFit: "cover",
            borderRadius: 8,
            marginTop: 24,
          }}
        />
      ) : null}

      <div className="prose" style={{ marginTop: 24 }}>
        {renderMarkdown(a.bodyMarkdown)}
      </div>
    </article>
  );
}
