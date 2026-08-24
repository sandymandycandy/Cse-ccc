import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos from talks, contests, workshops and club events.",
};

export default function GalleryPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Gallery</div>
      <h1 style={{ margin: "12px 0 0" }}>Gallery</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Photos from talks, contests, workshops and the occasional all-nighter.
      </p>
      <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
        The gallery is being put together — check back soon.
      </p>
    </section>
  );
}
