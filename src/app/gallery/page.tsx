import type { Metadata } from "next";
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
        <div
          style={{
            marginTop: 32,
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {photos.map((p) => (
            <figure key={p.id} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt={p.caption ?? ""}
                loading="lazy"
                style={{ width: "100%", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: 8, display: "block" }}
              />
              {p.caption || p.clubName ? (
                <figcaption style={{ marginTop: 6 }}>
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
