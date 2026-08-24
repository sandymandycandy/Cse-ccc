import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the CSE Club Council and its clubs.",
};

export default function ContactPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Get in touch</div>
      <h1 style={{ margin: "12px 0 0" }}>Contact</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Questions about an event, joining a club, or the council itself? The
        fastest route is the club running what you&rsquo;re interested in — each
        club&rsquo;s page lists what it does and what&rsquo;s coming up.
      </p>
      <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
        A general contact address is on the way.
      </p>
      <div className="stack" style={{ marginTop: 24, gap: 12 }}>
        <ButtonLink href="/clubs">Find a club</ButtonLink>
      </div>
    </section>
  );
}
