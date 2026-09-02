import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";
import { Note, Panel } from "@/components/ui/Surface";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the CSE Club Council and its clubs.",
};

export default function ContactPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="contact">
        <div className="eyebrow">Get in touch</div>
        <h1 style={{ margin: "12px 0 0" }}>Contact</h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 620 }}>
          Questions about an event, joining a club, or the council itself? Send a
          message below and it lands in the council inbox.
        </p>

        {/* The form is first in the DOM so it leads on a phone; on a desktop the
            grid moves it to the right-hand column. */}
        <div className="contact-grid">
          <div className="contact-form-wrap">
            <Panel>
              <ContactForm />
            </Panel>
          </div>

          <aside className="contact-aside">
            <div className="label">Faster routes</div>

            <div className="contact-route">
              <h3>A specific club</h3>
              <p>
                Each club&rsquo;s page carries what it does, who runs it, and
                what&rsquo;s coming up — usually the quicker answer than waiting on a
                reply.
              </p>
              <Link href="/clubs" style={{ color: "var(--forest)" }}>
                Browse the clubs →
              </Link>
            </div>

            <div className="contact-route">
              <h3>An event</h3>
              <p>
                Date, venue, seats left and the registration form all live on the
                event&rsquo;s own page.
              </p>
              <Link href="/events" style={{ color: "var(--forest)" }}>
                See what&rsquo;s on →
              </Link>
            </div>

            <Note>
              <strong>What happens next.</strong> Your message goes to the council
              inbox and we reply to the email address you give — so it&rsquo;s worth
              double-checking it.
            </Note>
          </aside>
        </div>
      </div>
    </section>
  );
}
