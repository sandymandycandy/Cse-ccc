import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

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
        Questions about an event, joining a club, or the council itself? Drop us
        a message below. For something club-specific, the fastest route is often
        the club itself — each{" "}
        <Link href="/clubs" style={{ color: "var(--forest)" }}>
          club&rsquo;s page
        </Link>{" "}
        lists what it does and what&rsquo;s coming up.
      </p>

      <div style={{ marginTop: 32 }}>
        <ContactForm />
      </div>
    </section>
  );
}
