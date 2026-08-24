import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Achievements",
  description: "Wins, awards and standout work from the department's clubs.",
};

export default function AchievementsPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Highlights</div>
      <h1 style={{ margin: "12px 0 0" }}>Achievements</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Contest wins, hackathon podiums and the projects worth showing off — a
        running record of what the clubs have pulled off.
      </p>
      <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
        We&rsquo;re gathering the highlights now. In the meantime, event results
        and standings are published per event.
      </p>
      <div className="stack" style={{ marginTop: 24, gap: 12 }}>
        <ButtonLink href="/events">Browse events</ButtonLink>
      </div>
    </section>
  );
}
