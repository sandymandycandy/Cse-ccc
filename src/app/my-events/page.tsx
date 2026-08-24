import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "My events",
  description: "The events you've registered for.",
};

export default function MyEventsPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Your registrations</div>
      <h1 style={{ margin: "12px 0 0" }}>My events</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        A personal view of everything you&rsquo;ve signed up for is on the way.
      </p>
      <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
        For now, each registration is confirmed by email, and your check-in QR
        lives in that confirmation. Browse what&rsquo;s open below.
      </p>
      <div className="stack" style={{ marginTop: 24, gap: 12 }}>
        <ButtonLink href="/events/upcoming">Upcoming events</ButtonLink>
      </div>
    </section>
  );
}
