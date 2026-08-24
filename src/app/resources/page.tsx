import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, links and materials shared by the department's clubs.",
};

export default function ResourcesPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Resources</div>
      <h1 style={{ margin: "12px 0 0" }}>Resources</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Guides, slide decks, starter kits and useful links the clubs share —
        gathered in one place.
      </p>
      <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
        We&rsquo;re collecting these now. Check back soon.
      </p>
    </section>
  );
}
