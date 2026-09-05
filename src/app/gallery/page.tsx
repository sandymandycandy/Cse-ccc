import type { Metadata } from "next";
import Image from "next/image";
import { getPublicGallery } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos from talks, contests, workshops and club events.",
};

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const photos = await getPublicGallery();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Gallery</div>
      <h1 style={{ margin: "12px 0 0" }}>Gallery</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Photos from talks, contests, workshops and the occasional all-nighter.
      </p>

      {photos.length === 0 ? (
        <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
          The gallery is being put together — check back soon.
        </p>
      ) : (
        <div className="gallery-grid">
          {photos.map((p) => (
            <figure key={p.id}>
              {/* The masonry grid is `columns: 260px`, so a column is ~260px wide
                  and never wider than 300 even on a large screen. `sizes` says so
                  explicitly — without it next/image assumes full viewport width
                  and fetches a needlessly large file for a thumbnail-sized slot.
                  Every row carries real dimensions (backfilled 2026-09-06), which
                  is what reserves the right space and keeps the masonry from
                  reflowing as photos arrive. */}
              <Image
                src={p.imageUrl}
                alt={p.caption ?? ""}
                loading="lazy"
                width={p.width ?? 1600}
                height={p.height ?? 900}
                sizes="(max-width: 600px) 100vw, 300px"
                style={{ width: "100%", height: "auto" }}
              />
              {p.caption || p.clubName ? (
                <figcaption>
                  {p.caption ? (
                    <span className="body-text" style={{ fontSize: 14, color: "var(--ink-2)" }}>
                      {p.caption}
                    </span>
                  ) : null}
                  {p.clubName ? (
                    <span className="label" style={{ display: "block", color: "var(--ink-3)" }}>
                      {p.clubName}
                    </span>
                  ) : null}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
